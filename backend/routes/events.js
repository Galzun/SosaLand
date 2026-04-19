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
const { v4: uuidv4 } = require('uuid');
const { uploadFile, generateFilename } = require('../utils/storage');
const db      = require('../db');
const { requireAuth, isAdminOrPerm, isEditorOrPerm, ROLE_LEVEL } = require('../middleware/auth');
const { eventCommentsRouter } = require('./comments');
const { logActivity } = require('../utils/logActivity');
const avatarUrl = require('../utils/avatarUrl');

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
// Multer для загрузки изображений в редактор (memoryStorage → S3/диск)
// ---------------------------------------------------------------------------
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 },
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
    startTimeApproximate:     Number(row.start_time_approximate) === 1,
    endTime:                  row.end_time ? Number(row.end_time) : null,
    status:                   row.status || 'scheduled',
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
      minecraftName: row.author_minecraft_name || null,
      minecraftUuid: row.author_minecraft_uuid || null,
      avatarUrl: avatarUrl(row.author_minecraft_uuid, row.author_username),
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
         e.start_time, e.start_time_approximate, e.end_time, e.status, e.published_at, e.updated_at,
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
         e.start_time, e.start_time_approximate, e.end_time, e.status, e.published_at, e.updated_at,
         e.edited_count, e.views, e.created_at,
         e.content_main, e.content_results,
         u.id AS author_id, u.username AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid,
         (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS author_minecraft_name,
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
// POST /api/events — создать событие (любой авторизованный)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, async (req, res) => {
  const { title, preview_image_url, preview_image_results_url, content_main, content_results, start_time, start_time_approximate, end_time, status } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Заголовок обязателен' });
  }
  if (title.trim().length > 200) {
    return res.status(400).json({ error: 'Заголовок не может превышать 200 символов' });
  }
  if (!start_time || typeof start_time !== 'number') {
    return res.status(400).json({ error: 'Дата начала обязательна' });
  }

  const VALID_STATUSES = ['scheduled', 'in_progress', 'completed'];
  const eventStatus = VALID_STATUSES.includes(status) ? status : 'scheduled';
  const isApproximate = start_time_approximate ? 1 : 0;

  try {
    const base = slugify(title.trim());
    const slug = await uniqueSlug(base);
    const id   = uuidv4();
    const now  = Math.floor(Date.now() / 1000);

    await db.run(
      `INSERT INTO events (id, author_id, title, slug, preview_image_url, preview_image_results_url,
                           content_main, content_results,
                           start_time, start_time_approximate, end_time, status, is_published, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, req.user.id, title.trim(), slug, preview_image_url || null, preview_image_results_url || null,
       content_main || '', content_results || null,
       start_time, isApproximate, end_time || null, eventStatus, now, now],
    );

    const row = await db.get(
      `SELECT
         e.id, e.title, e.slug, e.preview_image_url, e.preview_image_results_url, e.is_published,
         e.start_time, e.start_time_approximate, e.end_time, e.status, e.published_at, e.updated_at,
         e.edited_count, e.views, e.created_at,
         e.content_main, e.content_results,
         u.id AS author_id, u.username AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid,
         (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS author_minecraft_name,
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
// PUT /api/events/:slug — обновить событие (автор или editor и выше)
// ---------------------------------------------------------------------------
router.put('/:slug', requireAuth, async (req, res) => {
  const { slug } = req.params;
  const { title, preview_image_url, preview_image_results_url, content_main, content_results, start_time, start_time_approximate, end_time, status } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Заголовок обязателен' });
  }
  if (title.trim().length > 200) {
    return res.status(400).json({ error: 'Заголовок не может превышать 200 символов' });
  }
  if (!start_time || typeof start_time !== 'number') {
    return res.status(400).json({ error: 'Дата начала обязательна' });
  }

  const VALID_STATUSES = ['scheduled', 'in_progress', 'completed'];
  const eventStatus = VALID_STATUSES.includes(status) ? status : null;
  const isApproximate = start_time_approximate ? 1 : 0;

  try {
    const existing = await db.get(`SELECT id, title, author_id, status FROM events WHERE slug = ?`, [slug]);
    if (!existing) return res.status(404).json({ error: 'Событие не найдено' });

    const callerLevel = ROLE_LEVEL[req.user.role] ?? 1;
    const canEditAny  = callerLevel >= ROLE_LEVEL.editor || req.user.customPermissions?.has('manage_events');
    const isAuthor    = existing.author_id === req.user.id;
    if (!isAuthor && !canEditAny) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    let newSlug = slug;
    if (existing.title !== title.trim()) {
      const base = slugify(title.trim());
      newSlug = await uniqueSlug(base, existing.id);
    }

    const now = Math.floor(Date.now() / 1000);

    await db.run(
      `UPDATE events
       SET title = ?, slug = ?, preview_image_url = ?, preview_image_results_url = ?,
           content_main = ?, content_results = ?, start_time = ?, start_time_approximate = ?, end_time = ?,
           status = COALESCE(?, status),
           updated_at = ?, edited_count = edited_count + 1
       WHERE id = ?`,
      [title.trim(), newSlug, preview_image_url || null, preview_image_results_url || null,
       content_main || '', content_results || null,
       start_time, isApproximate, end_time || null, eventStatus, now, existing.id],
    );

    const row = await db.get(
      `SELECT
         e.id, e.title, e.slug, e.preview_image_url, e.preview_image_results_url, e.is_published,
         e.start_time, e.start_time_approximate, e.end_time, e.status, e.published_at, e.updated_at,
         e.edited_count, e.views, e.created_at,
         e.content_main, e.content_results,
         u.id AS author_id, u.username AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid,
         (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS author_minecraft_name,
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
// DELETE /api/events/:slug — удалить событие (автор или admin+/manage_events)
// ---------------------------------------------------------------------------
router.delete('/:slug', requireAuth, async (req, res) => {
  const { slug } = req.params;

  try {
    const row = await db.get(
      `SELECT id, title, author_id FROM events WHERE slug = ?`, [slug]
    );
    if (!row) return res.status(404).json({ error: 'Событие не найдено' });

    const callerLevel = ROLE_LEVEL[req.user.role] ?? 1;
    const canDeleteAny = callerLevel >= ROLE_LEVEL.admin || req.user.customPermissions?.has('manage_events');
    const isAuthor     = row.author_id === req.user.id;
    if (!isAuthor && !canDeleteAny) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

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
// POST /api/events/upload-image — загрузить изображение для редактора (любой авторизованный)
// ---------------------------------------------------------------------------
router.post('/upload-image', requireAuth, (req, res) => {
  uploadMiddleware(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    try {
      const filename = generateFilename(req.file.originalname);
      const url = await uploadFile(req.file.buffer, filename, req.file.mimetype);
      res.json({ url, fileType: req.file.mimetype });
    } catch (uploadErr) {
      console.error('[events/upload-image]', uploadErr.message);
      res.status(500).json({ error: 'Ошибка при сохранении файла' });
    }
  });
});

// ---------------------------------------------------------------------------
// Комментарии к событиям
// ---------------------------------------------------------------------------
router.use('/:eventId/comments', eventCommentsRouter);

module.exports = { router };
