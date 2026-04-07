// routes/players.js
// Маршруты для работы с историей игроков.
//
// GET  /api/players       — вернуть всех игроков из БД (публично)
// POST /api/players/sync  — добавить/обновить батч онлайн-игроков (публично)
//
// Оба эндпоинта публичные: данные об игроках не чувствительные,
// и фронтенд опрашивает их без авторизации.

const express = require('express');
const db      = require('../db');

const router = express.Router();


// ---------------------------------------------------------------------------
// GET /api/players — получить всех известных игроков из базы данных
// ---------------------------------------------------------------------------
// Возвращает: массив { uuid, name, firstSeen, lastSeen }
// Сортировка: сначала те, кто был онлайн позже всего.
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  db.all(
    `SELECT uuid, name, first_seen, last_seen
     FROM players
     ORDER BY last_seen DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('Ошибка при получении игроков:', err.message);
        return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
      }

      // Преобразуем snake_case → camelCase для JS/React.
      const players = rows.map(r => ({
        uuid:      r.uuid,
        name:      r.name,
        firstSeen: r.first_seen,
        lastSeen:  r.last_seen,
      }));

      res.json(players);
    }
  );
});


// ---------------------------------------------------------------------------
// POST /api/players/sync — синхронизировать батч онлайн-игроков
// ---------------------------------------------------------------------------
// Принимает: [{ uuid, name }, ...]
// Для каждого игрока:
//   — если уже есть в БД → обновляем name и last_seen
//   — если нового игрока нет → вставляем с first_seen = now
//
// INSERT OR REPLACE полностью заменяет строку, сбрасывая first_seen.
// Поэтому используем INSERT ... ON CONFLICT DO UPDATE — сохраняет first_seen.
// ---------------------------------------------------------------------------
router.post('/sync', (req, res) => {
  const players = req.body;

  // Валидируем: ожидаем массив
  if (!Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ error: 'Ожидается непустой массив игроков' });
  }

  // Проверяем каждый элемент: нужны uuid и name.
  for (const p of players) {
    if (!p.uuid || !p.name) {
      return res.status(400).json({ error: 'Каждый игрок должен иметь поля uuid и name' });
    }
  }

  const now = Math.floor(Date.now() / 1000); // unix timestamp в секундах

  // Выполняем все upsert'ы в одной транзакции — быстрее и атомарно.
  // serialize() гарантирует последовательное выполнение запросов в sqlite3.
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    let hasError = false;

    const stmt = db.prepare(`
      INSERT INTO players (uuid, name, first_seen, last_seen)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        name      = excluded.name,
        last_seen = excluded.last_seen
    `);

    players.forEach(p => {
      if (hasError) return;
      stmt.run([p.uuid, p.name, now, now], (err) => {
        if (err) {
          hasError = true;
          console.error('Ошибка при сохранении игрока:', err.message);
        }
      });
    });

    stmt.finalize((err) => {
      if (err || hasError) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: 'Ошибка при сохранении игроков' });
      }
      db.run('COMMIT', (commitErr) => {
        if (commitErr) {
          return res.status(500).json({ error: 'Ошибка при сохранении игроков' });
        }
        res.json({ success: true, synced: players.length });
      });
    });
  });
});


module.exports = router;
