// routes/reactions.js
// Реакции эмодзи на посты, новости, события и комментарии.
//
// GET  /api/reactions?targetType=X&targetId=Y  — список реакций с счётчиками
// POST /api/reactions/toggle                   — поставить/убрать реакцию

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_EMOJIS = new Set(['❤️', '😊', '😂', '😍', '😭', '🤯', '👎', '💩', '🤡']);

// ---------------------------------------------------------------------------
// optionalAuth — опциональная авторизация (для поля userReacted)
// ---------------------------------------------------------------------------
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next();
  const token = authHeader.split(' ')[1];
  if (!token) return next();
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch {}
  next();
}


// ---------------------------------------------------------------------------
// GET /api/reactions?targetType=X&targetId=Y
//
// Возвращает реакции для указанного объекта.
// Ответ: { reactions: [{emoji, count, userReacted}] }
// ---------------------------------------------------------------------------
router.get('/', optionalAuth, async (req, res) => {
  const { targetType, targetId } = req.query;
  if (!targetType || !targetId) {
    return res.status(400).json({ error: 'targetType и targetId обязательны' });
  }

  try {
    const rows = await db.all(
      `SELECT emoji, COUNT(*) AS cnt
       FROM reactions
       WHERE target_type = ? AND target_id = ?
       GROUP BY emoji`,
      [targetType, targetId]
    );

    let userSet = new Set();
    if (req.user) {
      const userRows = await db.all(
        `SELECT emoji FROM reactions
         WHERE target_type = ? AND target_id = ? AND user_id = ?`,
        [targetType, targetId, req.user.id]
      );
      userSet = new Set(userRows.map(r => r.emoji));
    }

    const reactions = rows.map(r => ({
      emoji:       r.emoji,
      count:       Number(r.cnt),
      userReacted: userSet.has(r.emoji),
    }));

    res.json({ reactions });
  } catch (err) {
    console.error('Ошибка получения реакций:', err.message);
    res.status(500).json({ error: 'Ошибка при получении реакций' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/reactions/toggle
//
// Тело: { emoji, targetType, targetId }
// Ставит реакцию если её нет, убирает если есть.
// Ответ: { added: bool }
// ---------------------------------------------------------------------------
router.post('/toggle', requireAuth, async (req, res) => {
  const { emoji, targetType, targetId } = req.body;

  if (!emoji || !targetType || !targetId) {
    return res.status(400).json({ error: 'emoji, targetType и targetId обязательны' });
  }
  if (!ALLOWED_EMOJIS.has(emoji)) {
    return res.status(400).json({ error: 'Недопустимый эмодзи' });
  }

  const userId = req.user.id;

  try {
    const existing = await db.get(
      `SELECT id FROM reactions
       WHERE user_id = ? AND emoji = ? AND target_type = ? AND target_id = ?`,
      [userId, emoji, targetType, targetId]
    );

    if (existing) {
      await db.run(`DELETE FROM reactions WHERE id = ?`, [existing.id]);
      res.json({ added: false });
    } else {
      const now = Math.floor(Date.now() / 1000);
      await db.run(
        `INSERT INTO reactions (id, user_id, emoji, target_type, target_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, emoji, targetType, targetId, now]
      );
      res.json({ added: true });
    }
  } catch (err) {
    console.error('Ошибка реакции:', err.message);
    res.status(500).json({ error: 'Ошибка при обработке реакции' });
  }
});


module.exports = { router };
