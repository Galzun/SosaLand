// routes/events.js
// Эндпоинты для событий сервера.
//
// Маршруты (монтируются под /api/events):
//   GET    /                      — список событий (сортировка по start_time DESC)
//   GET    /:slug                 — одно событие по slug
//   POST   /                      — создать событие (только admin)
//   PUT    /:slug                 — обновить событие (только admin)
//   DELETE /:slug                 — удалить событие (только admin)
//   POST   /upload-image          — загрузить изображение для редактора (только admin)
//   GET    /:eventId/comments     — комментарии к событию
//   POST   /:eventId/comments     — добавить комментарий к событию

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { requireAuth, isAdmin, isEditor } = require('../middleware/auth');
const { eventCommentsRouter } = require('./comments');
const { logActivity } = require('../utils/logActivity');

const router = express.Router();

// ---------------------------------------------------------------------------
// In-memory просмотры: один пользователь — один просмотр в 24 часа (по IP)
// ---------------------------------------------------------------------------
const viewedIPs = new Map();

setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, ts] of viewedIPs.entries()) {
    if (ts < cutoff) viewedIPs.delete(key);
  }
}, 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Slugify — транслитерация + очистка для URL-идентификатора
// ---------------------------------------------------------------------------
const TRANSLIT_MAP = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh',
  'з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o',
  'п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts',
  'ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
};

function slugify(text) {
  return text
    .toLowerCase()
    .split('')
    .map(c => TRANSLIT_MAP[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100) || 'event';
}

async function uniqueSlug(base, excludeId = null) {
  let candidate = base;
  let i = 2;
  while (true) {
    const row = await db.get(
      `SELECT id FROM events WHERE slug = ?${excludeId ? ' AND id != ?' : ''}`,
      excludeId ? [candidate, excludeId] : [candidate],
    );
    if (!row) return candidate;
    candidate = `${base}-${i++}`;
  }
}

// ---------------------------------------------------------------------------
// Multer для загрузки изображений в редактор
// ---------------------------------------------------------------------------
const UPLOADS_DIR = path.join(__dirname, '../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
      return cb(new Error('Только изображения и видео'));
    }
    cb(null, true);
  },
}).single('image');

// ---------------------------------------------------------------------------
// formatEvent — строка БД → camelCase-объект
// ---------------------------------------------------------------------------
function formatEvent(row, full = false) {
  const obj = {
    id:                       row.id,
    title:                    row.title,
    slug:                     row.slug,
    previewImageUrl:          row.preview_image_url || null,
    previewImageResultsUrl:   row.preview_image_results_url || null,
    startTime:                Number(row.start_time),
    endTime:                  row.end_time ? Number(row.end_time) : null,
    isPublished:     Number(row.is_published) === 1,
    publishedAt:     row.published_at ? Number(row.published_at) : null,
    updatedAt:       row.updated_at   ? Number(row.updated_at)   : null,
    editedCount:     Number(row.edited_count) || 0,
    views:           Number(row.views)         || 0,
    createdAt:       Number(row.created_at),
    commentsCount:   Number(row.comments_count) || 0,
  };
  if (full) {
    obj.contentMain    = row.content_main || '';
    obj.contentResults = row.content_results || null;
    obj.author = {
      id:            row.author_id,
      username:      row.author_username,
      minecraftUuid: row.author_minecraft_uuid || null,
      avatarUrl: row.author_minecraft_uuid
        ? `https://crafatar.icehost.xyz/avatars/${row.author_minecraft_uuid}?size=64&overlay`
        : null,
    };
  }
  return obj;
}

// ---------------------------------------------------------------------------
// GET /api/events — список опубликованных событий (сортировка по start_time DESC)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);

  try {
    const rows = await db.all(
      `SELECT
         e.id, e.title, e.slug, e.preview_image_url, e.preview_image_results_url, e.is_published,
         e.start_time, e.end_time, e.published_at, e.updated_at,
         e.edited_count, e.views, e.created_at,
         (SELECT COUNT(*) FROM comments c WHERE c.event_id = e.id) AS comments_count
       FROM events e
       WHERE e.is_published = 1
       ORDER BY e.start_time DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    res.json(rows.map(r => formatEvent(r, false)));
  } catch (err) {
    console.error('Ошибка получения событий:', err);
    res.status(500).json({ error: 'Ошибка при получении событий' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug — одно событие (полный контент)
// ---------------------------------------------------------------------------
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    const row = await db.get(
      `SELECT
         e.id, e.title, e.slug, e.preview_image_url, e.preview_image_results_url, e.is_published,
         e.start_time, e.end_time, e.published_at, e.updated_at,
         e.edited_count, e.views, e.created_at,
         e.content_main, e.content_results,
         u.id AS author_id, u.username AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid,
         (SELECT COUNT(*) FROM comments c WHERE c.event_id = e.id) AS comments_count
       FROM events e
       JOIN users u ON u.id = e.author_id
       WHERE e.slug = ? AND e.is_published = 1`,
      [slug],
    );

    if (!row) return res.status(404).json({ error: 'Событие не найдено' });

    // Инкрементируем просмотры — не чаще раза в 24 часа с одного IP
    const ip      = req.ip || req.socket?.remoteAddress || 'unknown';
    const viewKey = `${row.id}:${ip}`;
    const lastTs  = viewedIPs.get(viewKey);
    if (!lastTs || Date.now() - lastTs > 24 * 60 * 60 * 1000) {
      viewedIPs.set(viewKey, Date.now());
      db.run(`UPDATE events SET views = views + 1 WHERE id = ?`, [row.id]);
    }

    res.json(formatEvent(row, true));
  } catch (err) {
    console.error('Ошибка получения события:', err);
    res.status(500).json({ error: 'Ошибка при получении события' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/events — создать событие (editor и выше)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, isEditor, async (req, res) => {
  const { title, preview_image_url, preview_image_results_url, content_main, content_results, start_time, end_time } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Заголовок обязателен' });
  }
  if (title.trim().length > 200) {
    return res.status(400).json({ error: 'Заголовок не может превышать 200 символов' });
  }
  if (!start_time || typeof start_time !== 'number') {
    return res.status(400).json({ error: 'Дата начала обязательна' });
  }

  try {
    const base = slugify(title.trim());
    const slug = await uniqueSlug(base);
    const id   = uuidv4();
    const now  = Math.floor(Date.now() / 1000);

    await db.run(
      `INSERT INTO events (id, author_id, title, slug, preview_image_url, preview_image_results_url,
                           content_main, content_results,
                           start_time, end_time, is_published, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, req.user.id, title.trim(), slug, preview_image_url || null, preview_image_results_url || null,
       content_main || '', content_results || null,
       start_time, end_time || null, now, now],
    );

    const row = await db.get(
      `SELECT
         e.id, e.title, e.slug, e.preview_image_url, e.preview_image_results_url, e.is_published,
         e.start_time, e.end_time, e.published_at, e.updated_at,
         e.edited_count, e.views, e.created_at,
         e.content_main, e.content_results,
         u.id AS author_id, u.username AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid,
         0 AS comments_count
       FROM events e JOIN users u ON u.id = e.author_id
       WHERE e.id = ?`,
      [id],
    );

    res.status(201).json(formatEvent(row, true));

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    logActivity({
      userId:     req.user.id,
      username:   req.user.username,
      action:     'event_create',
      targetType: 'event',
      targetId:   slug,
      ip:         clientIp,
      details:    { preview: title.trim().slice(0, 80) },
    });
  } catch (err) {
    console.error('Ошибка создания события:', err);
    res.status(500).json({ error: 'Ошибка при создании события' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/events/:slug — обновить событие (editor и выше)
// ---------------------------------------------------------------------------
router.put('/:slug', requireAuth, isEditor, async (req, res) => {
  const { slug } = req.params;
  const { title, preview_image_url, preview_image_results_url, content_main, content_results, start_time, end_time } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Заголовок обязателен' });
  }
  if (title.trim().length > 200) {
    return res.status(400).json({ error: 'Заголовок не может превышать 200 символов' });
  }
  if (!start_time || typeof start_time !== 'number') {
    return res.status(400).json({ error: 'Дата начала обязательна' });
  }

  try {
    const existing = await db.get(`SELECT id, title FROM events WHERE slug = ?`, [slug]);
    if (!existing) return res.status(404).json({ error: 'Событие не найдено' });

    let newSlug = slug;
    if (existing.title !== title.trim()) {
      const base = slugify(title.trim());
      newSlug = await uniqueSlug(base, existing.id);
    }

    const now = Math.floor(Date.now() / 1000);

    await db.run(
      `UPDATE events
       SET title = ?, slug = ?, preview_image_url = ?, preview_image_results_url = ?,
           content_main = ?, content_results = ?, start_time = ?, end_time = ?,
           updated_at = ?, edited_count = edited_count + 1
       WHERE id = ?`,
      [title.trim(), newSlug, preview_image_url || null, preview_image_results_url || null,
       content_main || '', content_results || null,
       start_time, end_time || null, now, existing.id],
    );

    const row = await db.get(
      `SELECT
         e.id, e.title, e.slug, e.preview_image_url, e.preview_image_results_url, e.is_published,
         e.start_time, e.end_time, e.published_at, e.updated_at,
         e.edited_count, e.views, e.created_at,
         e.content_main, e.content_results,
         u.id AS author_id, u.username AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid,
         (SELECT COUNT(*) FROM comments c WHERE c.event_id = e.id) AS comments_count
       FROM events e JOIN users u ON u.id = e.author_id
       WHERE e.id = ?`,
      [existing.id],
    );

    res.json(formatEvent(row, true));

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    logActivity({
      userId:     req.user.id,
      username:   req.user.username,
      action:     'event_update',
      targetType: 'event',
      targetId:   newSlug,
      ip:         clientIp,
      details:    { preview: title.trim().slice(0, 80) },
    });
  } catch (err) {
    console.error('Ошибка обновления события:', err);
    res.status(500).json({ error: 'Ошибка при обновлении события' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug — удалить событие (только admin)
// ---------------------------------------------------------------------------
router.delete('/:slug', requireAuth, isAdmin, async (req, res) => {
  const { slug } = req.params;

  try {
    const row = await db.get(
      `SELECT id, title FROM events WHERE slug = ?`, [slug]
    );
    if (!row) return res.status(404).json({ error: 'Событие не найдено' });

    await db.run(`DELETE FROM events WHERE id = ?`, [row.id]);

    res.json({ success: true });

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    logActivity({
      userId:     req.user.id,
      username:   req.user.username,
      action:     'event_delete',
      targetType: 'event',
      targetId:   slug,
      ip:         clientIp,
      details:    { preview: row.title?.slice(0, 80) },
    });
  } catch (err) {
    console.error('Ошибка удаления события:', err);
    res.status(500).json({ error: 'Ошибка при удалении события' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/events/upload-image — загрузить изображение для редактора (editor и выше)
// ---------------------------------------------------------------------------
router.post('/upload-image', requireAuth, isEditor, (req, res) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const url = `/uploads/${req.file.filename}`;
    res.json({ url, fileType: req.file.mimetype });
  });
});

// ---------------------------------------------------------------------------
// Комментарии к событиям
// ---------------------------------------------------------------------------
router.use('/:eventId/comments', eventCommentsRouter);

module.exports = { router };
