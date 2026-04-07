// routes/tickets.js
// Маршруты для системы тикетов регистрации.
//
// Публичные (без авторизации):
//   POST /api/tickets — создать заявку на регистрацию
//
// Только для администраторов:
//   GET  /api/admin/tickets           — список pending-тикетов
//   POST /api/admin/tickets/:id/approve — одобрить заявку → создать пользователя
//   POST /api/admin/tickets/:id/reject  — отклонить заявку

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { requireAuth, isAdmin } = require('../middleware/auth');

const router = express.Router();

const BCRYPT_ROUNDS  = 10;
const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';


// ---------------------------------------------------------------------------
// POST /api/tickets — создать заявку на регистрацию
// ---------------------------------------------------------------------------
// Доступно всем, авторизация не нужна.
// Принимает: { minecraftUuid, minecraftName, username, password }
// Возвращает: { success: true, ticketId }
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const { minecraftUuid, minecraftName, username, password, contact } = req.body;

  // Проверяем обязательные поля
  if (!minecraftUuid || !minecraftName || !username || !password) {
    return res.status(400).json({
      error: 'Поля minecraftUuid, minecraftName, username и password обязательны',
    });
  }

  if (username.trim().length < 3) {
    return res.status(400).json({ error: 'Логин должен быть не короче 3 символов' });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    return res.status(400).json({ error: 'Логин: только латинские буквы, цифры и _' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
  }

  try {
    // Проверяем, что пользователь с таким логином или UUID ещё не зарегистрирован.
    // Нужно проверить обе таблицы: users (активные) и tickets (ожидающие).
    const existingUser = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM users WHERE username = ? OR minecraft_uuid = ? LIMIT 1`,
        [username.trim(), minecraftUuid],
        (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'Пользователь с таким логином или Minecraft-аккаунтом уже зарегистрирован',
      });
    }

    // Проверяем, нет ли уже pending-тикета от этого игрока.
    // Не даём спамить заявками.
    const existingTicket = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM tickets WHERE (username = ? OR minecraft_uuid = ?) AND status = 'pending' LIMIT 1`,
        [username.trim(), minecraftUuid],
        (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });

    if (existingTicket) {
      return res.status(409).json({
        error: 'Заявка с таким логином или Minecraft-аккаунтом уже ожидает рассмотрения',
      });
    }

    // Хешируем пароль — в БД никогда не хранится открытый пароль.
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const ticketId = uuidv4();

    // Сохраняем тикет в базу данных.
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO tickets (id, minecraft_uuid, minecraft_name, username, password_hash, contact)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ticketId, minecraftUuid, minecraftName, username.trim(), passwordHash, contact?.trim() || null],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });

    res.status(201).json({ success: true, ticketId });

  } catch (err) {
    console.error('Ошибка при создании тикета:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/admin/tickets — список всех pending-тикетов
// ---------------------------------------------------------------------------
// Только для администраторов. Требует JWT + role === 'admin'.
// Возвращает: массив объектов тикета (без password_hash)
// ---------------------------------------------------------------------------
router.get('/admin', requireAuth, isAdmin, async (req, res) => {
  try {
    const tickets = await new Promise((resolve, reject) => {
      db.all(
        // Выбираем все ожидающие тикеты, сортируем по дате (старые первыми).
        // password_hash намеренно исключён — не нужен фронтенду.
        `SELECT id, minecraft_uuid, minecraft_name, username, contact, status, created_at
         FROM tickets
         WHERE status = 'pending'
         ORDER BY created_at ASC`,
        [],
        (err, rows) => { if (err) reject(err); else resolve(rows); }
      );
    });

    // Преобразуем поля из snake_case (SQLite) в camelCase (JavaScript/React).
    const result = tickets.map(t => ({
      id:            t.id,
      minecraftUuid: t.minecraft_uuid,
      minecraftName: t.minecraft_name,
      username:      t.username,
      contact:       t.contact,
      status:        t.status,
      createdAt:     t.created_at,
    }));

    res.json(result);

  } catch (err) {
    console.error('Ошибка при получении тикетов:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/admin/tickets/:id/approve — одобрить заявку
// ---------------------------------------------------------------------------
// Только для администраторов.
// Создаёт пользователя в таблице users, меняет статус тикета на 'approved'.
// Возвращает: { success: true }
// ---------------------------------------------------------------------------
router.post('/admin/:id/approve', requireAuth, isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Получаем тикет по ID, убеждаемся что он существует и ещё pending.
    const ticket = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, minecraft_uuid, minecraft_name, username, password_hash, status
         FROM tickets WHERE id = ?`,
        [id],
        (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Тикет не найден' });
    }
    if (ticket.status !== 'pending') {
      return res.status(409).json({ error: `Тикет уже обработан (статус: ${ticket.status})` });
    }

    // Проверяем, что пользователь ещё не создан (на случай дублирующего запроса).
    const existingUser = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id FROM users WHERE username = ? OR minecraft_uuid = ? LIMIT 1`,
        [ticket.username, ticket.minecraft_uuid],
        (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'Пользователь с таким логином или Minecraft-аккаунтом уже существует',
      });
    }

    const userId = uuidv4();
    const now    = Math.floor(Date.now() / 1000); // unix timestamp в секундах

    // Выполняем две операции как транзакцию:
    //   1. Создаём пользователя в таблице users
    //   2. Обновляем статус тикета
    // serialize() гарантирует последовательное выполнение запросов.
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run(
          `INSERT INTO users (id, username, password_hash, minecraft_uuid, role)
           VALUES (?, ?, ?, ?, 'user')`,
          [userId, ticket.username, ticket.password_hash, ticket.minecraft_uuid],
          (err) => { if (err) { db.run('ROLLBACK'); return reject(err); } }
        );

        db.run(
          `UPDATE tickets
           SET status = 'approved', approved_by = ?, approved_at = ?
           WHERE id = ?`,
          [req.user.id, now, id],
          (err) => {
            if (err) { db.run('ROLLBACK'); return reject(err); }
            db.run('COMMIT', (commitErr) => {
              if (commitErr) reject(commitErr);
              else resolve();
            });
          }
        );
      });
    });

    res.json({ success: true });

  } catch (err) {
    // Дублирующий username или minecraft_uuid — обрабатываем отдельно.
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Пользователь с таким логином или UUID уже существует' });
    }
    console.error('Ошибка при одобрении тикета:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/admin/tickets/:id/reject — отклонить заявку
// ---------------------------------------------------------------------------
// Только для администраторов.
// Принимает: { rejectionReason } (необязательно)
// Возвращает: { success: true }
// ---------------------------------------------------------------------------
router.post('/admin/:id/reject', requireAuth, isAdmin, async (req, res) => {
  const { id }               = req.params;
  const { rejectionReason }  = req.body; // необязательное поле

  try {
    // Проверяем, что тикет существует и ещё pending.
    const ticket = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, status FROM tickets WHERE id = ?`,
        [id],
        (err, row) => { if (err) reject(err); else resolve(row); }
      );
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Тикет не найден' });
    }
    if (ticket.status !== 'pending') {
      return res.status(409).json({ error: `Тикет уже обработан (статус: ${ticket.status})` });
    }

    const now = Math.floor(Date.now() / 1000);

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE tickets
         SET status = 'rejected', approved_by = ?, approved_at = ?, rejection_reason = ?
         WHERE id = ?`,
        [req.user.id, now, rejectionReason || null, id],
        (err) => { if (err) reject(err); else resolve(); }
      );
    });

    res.json({ success: true });

  } catch (err) {
    console.error('Ошибка при отклонении тикета:', err.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});


module.exports = router;
