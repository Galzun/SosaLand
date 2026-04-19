// routes/players.js
// Маршруты для работы с историей игроков.
//
// GET  /api/players                      — вернуть всех игроков из БД (публично)
// POST /api/players/sync                 — добавить/обновить батч онлайн-игроков (публично)
// POST /api/players/ban-by-name/:name    — забанить любого игрока по нику (admin+)
// POST /api/players/unban-by-name/:name  — разбанить любого игрока по нику (admin+)
//
// Устаревшие UUID-эндпоинты оставлены для совместимости, но фронт их не использует.

const express = require('express');
const db      = require('../db');
const { requireAuth, ROLE_LEVEL } = require('../middleware/auth');

const router = express.Router();


// ---------------------------------------------------------------------------
// GET /api/players — получить всех известных игроков из базы данных
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT p.uuid, p.name, p.first_seen, p.last_seen, p.is_banned, p.ban_reason,
              u.role AS user_role,
              (
                SELECT json_agg(json_build_object('id', cr.id, 'name', cr.name, 'color', cr.color)
                                ORDER BY cr.priority ASC)
                FROM user_custom_roles ucr
                JOIN custom_roles cr ON cr.id = ucr.role_id
                WHERE ucr.user_id = u.id
              ) AS custom_roles_json
       FROM players p
       LEFT JOIN users u ON u.minecraft_uuid = p.uuid
       ORDER BY p.last_seen DESC`
    );

    const players = rows.map(r => ({
      uuid:        r.uuid,
      name:        r.name,
      firstSeen:   r.first_seen,
      lastSeen:    r.last_seen,
      isBanned:    !!r.is_banned,
      banReason:   r.ban_reason || null,
      role:        r.user_role || null,
      customRoles: r.custom_roles_json || [],
    }));

    res.json(players);
  } catch (err) {
    console.error('Ошибка при получении игроков:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/players/sync — синхронизировать батч онлайн-игроков
// ---------------------------------------------------------------------------
router.post('/sync', async (req, res) => {
  const players = req.body;

  if (!Array.isArray(players) || players.length === 0) {
    return res.status(400).json({ error: 'Ожидается непустой массив игроков' });
  }

  for (const p of players) {
    if (!p.uuid || !p.name) {
      return res.status(400).json({ error: 'Каждый игрок должен иметь поля uuid и name' });
    }
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    await db.transaction(async (client) => {
      for (const p of players) {
        await db.clientQuery(
          client,
          `INSERT INTO players (uuid, name, first_seen, last_seen)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(uuid) DO UPDATE SET
             name      = EXCLUDED.name,
             last_seen = EXCLUDED.last_seen`,
          [p.uuid, p.name, now, now]
        );
      }
    });

    res.json({ success: true, synced: players.length });
  } catch (err) {
    console.error('Ошибка при сохранении игроков:', err.message);
    res.status(500).json({ error: 'Ошибка при сохранении игроков' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/players/ban-by-name/:name — универсальный бан по нику.
//
// Работает для ЛЮБОГО игрока — и лицензионного (с UUID), и пиратского.
// Логика:
//   1. Ищем игрока по имени в таблице players
//   2. Если найден с настоящим UUID → банит в players + в users (если есть аккаунт)
//   3. Если найден как offline: или не найден → создаёт/обновляет offline-запись
//
// Тело запроса: { reason?: string }
// Доступ: admin+
// ---------------------------------------------------------------------------
router.post('/ban-by-name/:name', requireAuth, async (req, res) => {
  const { name }   = req.params;
  const { reason } = req.body || {};

  const callerLevel = ROLE_LEVEL[req.user.role] ?? 0;
  const canBan = callerLevel >= ROLE_LEVEL.admin || req.user.customPermissions?.has('ban_users');
  if (!canBan) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  const banReason = (typeof reason === 'string' && reason.trim()) ? reason.trim() : null;
  const now = Math.floor(Date.now() / 1000);

  try {
    // Ищем существующую запись по имени (case-insensitive)
    const existing = await new Promise((resolve, reject) => {
      db.get(
        'SELECT uuid FROM players WHERE LOWER(name) = LOWER(?)',
        [name],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });

    if (existing && !existing.uuid.startsWith('offline:')) {
      // Лицензионный игрок — обновляем существующую запись по UUID
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE players SET is_banned = 1, ban_reason = ? WHERE uuid = ?',
          [banReason, existing.uuid],
          (err) => (err ? reject(err) : resolve())
        );
      });

      // Если есть аккаунт на сайте с более низкой ролью — банит и его
      const userRecord = await new Promise((resolve, reject) => {
        db.get(
          'SELECT id, role FROM users WHERE minecraft_uuid = ?',
          [existing.uuid],
          (err, row) => (err ? reject(err) : resolve(row))
        );
      });

      if (userRecord) {
        const targetLevel = ROLE_LEVEL[userRecord.role] ?? 0;
        if (targetLevel < callerLevel && userRecord.id !== req.user.id) {
          await new Promise((resolve, reject) => {
            db.run(
              'UPDATE users SET is_banned = 1, ban_reason = ?, banned_by = ?, banned_at = ? WHERE id = ?',
              [banReason, req.user.id, now, userRecord.id],
              (err) => (err ? reject(err) : resolve())
            );
          });
        }
      }
    } else {
      // Пиратский игрок или не найден — создаём/обновляем offline-запись
      const syntheticUuid = `offline:${name.toLowerCase()}`;
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO players (uuid, name, first_seen, last_seen, is_banned, ban_reason)
           VALUES (?, ?, ?, ?, 1, ?)
           ON CONFLICT(uuid) DO UPDATE SET
             is_banned  = 1,
             name       = excluded.name,
             ban_reason = excluded.ban_reason`,
          [syntheticUuid, name, now, now, banReason],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка при бане игрока:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/players/unban-by-name/:name — универсальный разбан по нику.
// Доступ: admin+
// ---------------------------------------------------------------------------
router.post('/unban-by-name/:name', requireAuth, async (req, res) => {
  const { name } = req.params;

  const callerLevel = ROLE_LEVEL[req.user.role] ?? 0;
  const canBan = callerLevel >= ROLE_LEVEL.admin || req.user.customPermissions?.has('ban_users');
  if (!canBan) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  try {
    const existing = await new Promise((resolve, reject) => {
      db.get(
        'SELECT uuid FROM players WHERE LOWER(name) = LOWER(?)',
        [name],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });

    if (existing && !existing.uuid.startsWith('offline:')) {
      // Лицензионный игрок
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE players SET is_banned = 0, ban_reason = NULL WHERE uuid = ?',
          [existing.uuid],
          (err) => (err ? reject(err) : resolve())
        );
      });
      // Разбаниваем и аккаунт на сайте
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET is_banned = 0, ban_reason = NULL, banned_by = NULL, banned_at = NULL WHERE minecraft_uuid = ?',
          [existing.uuid],
          (err) => (err ? reject(err) : resolve())
        );
      });
    } else {
      // Пиратский игрок
      const syntheticUuid = `offline:${name.toLowerCase()}`;
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE players SET is_banned = 0, ban_reason = NULL WHERE uuid = ?',
          [syntheticUuid],
          (err) => (err ? reject(err) : resolve())
        );
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка при разбане игрока:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// Устаревшие UUID-эндпоинты (оставлены для совместимости)
// ---------------------------------------------------------------------------

router.post('/:uuid/ban', requireAuth, async (req, res) => {
  const { uuid } = req.params;
  const { reason } = req.body || {};

  const callerLevel = ROLE_LEVEL[req.user.role] ?? 0;
  const canBan = callerLevel >= ROLE_LEVEL.admin || req.user.customPermissions?.has('ban_users');
  if (!canBan) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  const banReason = (typeof reason === 'string' && reason.trim()) ? reason.trim() : null;
  const now = Math.floor(Date.now() / 1000);

  try {
    const player = await new Promise((resolve, reject) => {
      db.get('SELECT uuid FROM players WHERE uuid = ?', [uuid], (err, row) => (err ? reject(err) : resolve(row)));
    });
    if (!player) return res.status(404).json({ error: 'Игрок не найден' });

    await new Promise((resolve, reject) => {
      db.run('UPDATE players SET is_banned = 1, ban_reason = ? WHERE uuid = ?', [banReason, uuid], (err) => (err ? reject(err) : resolve()));
    });

    const userRecord = await new Promise((resolve, reject) => {
      db.get('SELECT id, role FROM users WHERE minecraft_uuid = ?', [uuid], (err, row) => (err ? reject(err) : resolve(row)));
    });
    if (userRecord) {
      const targetLevel = ROLE_LEVEL[userRecord.role] ?? 0;
      if (targetLevel < callerLevel && userRecord.id !== req.user.id) {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE users SET is_banned = 1, ban_reason = ?, banned_by = ?, banned_at = ? WHERE id = ?',
            [banReason, req.user.id, now, userRecord.id],
            (err) => (err ? reject(err) : resolve())
          );
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка при бане игрока:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


router.post('/:uuid/unban', requireAuth, async (req, res) => {
  const { uuid } = req.params;

  const callerLevel = ROLE_LEVEL[req.user.role] ?? 0;
  const canBan = callerLevel >= ROLE_LEVEL.admin || req.user.customPermissions?.has('ban_users');
  if (!canBan) {
    return res.status(403).json({ error: 'Недостаточно прав' });
  }

  try {
    await new Promise((resolve, reject) => {
      db.run('UPDATE players SET is_banned = 0, ban_reason = NULL WHERE uuid = ?', [uuid], (err) => (err ? reject(err) : resolve()));
    });
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET is_banned = 0, ban_reason = NULL, banned_by = NULL, banned_at = NULL WHERE minecraft_uuid = ?',
        [uuid],
        (err) => (err ? reject(err) : resolve())
      );
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка при разбане игрока:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


module.exports = router;
