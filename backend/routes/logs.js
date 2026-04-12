// routes/logs.js
// Логи активности — только для администраторов и создателя.
//
// GET /api/logs              — список логов с фильтрацией и пагинацией
// GET /api/logs/stats        — статистика загрузок по пользователям
// GET /api/logs/users?q=...  — автодополнение ников для поиска

const express = require('express');
const db      = require('../db');
const { requireAuth, isAdmin } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (!bytes) return '0 Б';
  if (bytes < 1024)             return `${bytes} Б`;
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

const ACTION_LABEL = {
  file_upload:    'Загрузка файла',
  post_create:    'Создание поста',
  post_delete:    'Удаление поста',
  image_add:      'Фото в галерею',
  comment_create: 'Комментарий',
};

// ---------------------------------------------------------------------------
// GET /api/logs/users?q=... — поиск ников по подстроке (для автодополнения)
// ---------------------------------------------------------------------------
router.get('/users', requireAuth, isAdmin, async (req, res) => {
  const q     = (req.query.q || '').trim().toLowerCase();
  const limit = Math.min(parseInt(req.query.limit) || 10, 30);

  try {
    let rows;
    if (q) {
      rows = await db.all(`
        SELECT DISTINCT username
        FROM activity_logs
        WHERE LOWER(username) LIKE ?
        ORDER BY username
        LIMIT ?
      `, [`%${q}%`, limit]);
    } else {
      rows = await db.all(`
        SELECT DISTINCT username
        FROM activity_logs
        ORDER BY username
        LIMIT ?
      `, [limit]);
    }
    res.json(rows.map(r => r.username));
  } catch (err) {
    console.error('Ошибка поиска ников:', err.message);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/logs/stats — топ пользователей по объёму загрузок
// ---------------------------------------------------------------------------
router.get('/stats', requireAuth, isAdmin, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT
        user_id,
        username,
        SUM(CASE WHEN action = 'file_upload' THEN 1 ELSE 0 END)                       AS total_files,
        SUM(CASE WHEN action = 'file_upload' THEN COALESCE(file_size, 0) ELSE 0 END)  AS total_size,
        MAX(created_at)                                                                 AS last_action_at
      FROM activity_logs
      WHERE action = 'file_upload'
      GROUP BY user_id, username
      ORDER BY total_size DESC
      LIMIT 50
    `, []);

    const totals = await db.get(`
      SELECT
        COUNT(*)                                                                       AS total_actions,
        SUM(CASE WHEN action = 'file_upload' THEN 1 ELSE 0 END)                      AS total_files,
        SUM(CASE WHEN action = 'file_upload' THEN COALESCE(file_size, 0) ELSE 0 END) AS total_size
      FROM activity_logs
    `, []);

    res.json({
      topUploaders: rows.map(r => ({
        userId:       r.user_id,
        username:     r.username,
        totalFiles:   Number(r.total_files)   || 0,
        totalSize:    Number(r.total_size)     || 0,
        totalSizeFmt: formatBytes(Number(r.total_size) || 0),
        lastActionAt: r.last_action_at,
      })),
      totals: {
        totalActions: Number(totals?.total_actions) || 0,
        totalFiles:   Number(totals?.total_files)   || 0,
        totalSize:    Number(totals?.total_size)     || 0,
        totalSizeFmt: formatBytes(Number(totals?.total_size) || 0),
      },
    });
  } catch (err) {
    console.error('Ошибка получения статистики логов:', err.message);
    res.status(500).json({ error: 'Ошибка при получении статистики' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/logs — список логов с фильтрацией и пагинацией
//
// ВАЖНО: в главном запросе таблица activity_logs имеет алиас `al`,
// а таблица users — `u`. Оба содержат колонку `username`, поэтому
// все WHERE-условия в главном запросе должны использовать `al.username`.
// В запросе подсчёта JOIN отсутствует — там используем `username` без алиаса.
//
// Query-параметры:
//   action   — фильтр по типу действия
//   username — фильтр по нику (подстрока, регистронезависимо)
//   userId   — фильтр по конкретному userId
//   limit    — количество записей (default 50, max 200)
//   offset   — смещение (default 0)
// ---------------------------------------------------------------------------
router.get('/', requireAuth, isAdmin, async (req, res) => {
  const limit    = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset   = Math.max(parseInt(req.query.offset) || 0,  0);
  const action   = req.query.action   || null;
  const username = req.query.username || null;
  const userId   = req.query.userId   || null;

  // Два отдельных WHERE-построителя:
  //   mainWhere — для основного запроса с JOIN (нужен префикс al.)
  //   cntWhere  — для COUNT-запроса без JOIN (без префикса)
  const mainWhere = [];
  const cntWhere  = [];
  const params    = [];   // параметры общие для обоих запросов

  if (action) {
    mainWhere.push('al.action = ?');
    cntWhere.push('action = ?');
    params.push(action);
  }
  if (userId) {
    mainWhere.push('al.user_id = ?');
    cntWhere.push('user_id = ?');
    params.push(userId);
  }
  if (username) {
    mainWhere.push('LOWER(al.username) LIKE ?');
    cntWhere.push('LOWER(username) LIKE ?');
    params.push(`%${username.toLowerCase()}%`);
  }

  const mainWhereClause = mainWhere.length > 0 ? `WHERE ${mainWhere.join(' AND ')}` : '';
  const cntWhereClause  = cntWhere.length  > 0 ? `WHERE ${cntWhere.join(' AND ')}`  : '';

  try {
    const [rows, countRow] = await Promise.all([
      db.all(`
        SELECT
          al.id,
          al.user_id,
          al.username,
          al.action,
          al.target_type,
          al.target_id,
          al.file_name,
          al.file_type,
          al.file_size,
          al.file_count,
          al.ip,
          al.details,
          al.created_at,
          u.minecraft_uuid
        FROM activity_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ${mainWhereClause}
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]),

      db.get(`
        SELECT COUNT(*) AS cnt
        FROM activity_logs
        ${cntWhereClause}
      `, params),
    ]);

    const total = Number(countRow?.cnt) || 0;

    const logs = rows.map(r => ({
      id:           r.id,
      userId:       r.user_id,
      username:     r.username,
      minecraftUuid: r.minecraft_uuid || null,
      avatarUrl:    r.minecraft_uuid
        ? `https://crafatar.icehost.xyz/avatars/${r.minecraft_uuid}?size=64&overlay`
        : null,
      action:       r.action,
      actionLabel:  ACTION_LABEL[r.action] || r.action,
      targetType:   r.target_type,
      targetId:     r.target_id,
      fileName:     r.file_name,
      fileType:     r.file_type,
      fileSize:     r.file_size,
      fileSizeFmt:  formatBytes(r.file_size),
      fileCount:    r.file_count,
      ip:           r.ip,
      details:      r.details
        ? (() => { try { return JSON.parse(r.details); } catch { return null; } })()
        : null,
      createdAt:    r.created_at,
    }));

    res.json({ logs, total, limit, offset });
  } catch (err) {
    console.error('Ошибка получения логов:', err.message);
    res.status(500).json({ error: 'Ошибка при получении логов' });
  }
});


module.exports = { router };
