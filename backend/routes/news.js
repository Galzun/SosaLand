// routes/news.js
// Эндпоинты для новостей сервера.
//
// Маршруты (монтируются под /api/news):
//   GET    /                      — список новостей (пагинация)
//   GET    /:slug                 — одна новость по slug
//   POST   /                      — создать новость (только admin)
//   PUT    /:slug                 — обновить новость (только admin)
//   DELETE /:slug                 — удалить новость (только admin)
//   POST   /upload-image          — загрузить изображение для редактора (только admin)
//   GET    /:newsId/comments      — комментарии к новости
//   POST   /:newsId/comments      — добавить комментарий к новости

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { requireAuth, isAdmin, isEditor } = require('../middleware/auth');
const { newsCommentsRouter } = require('./comments');
const { logActivity } = require('../utils/logActivity');

const router = express.Router();

// ---------------------------------------------------------------------------
// Хелперы для работы с опросами
// ---------------------------------------------------------------------------

// Извлекает все poll ID из HTML-контента новости.
// Обрабатывает оба формата: [POLL:uuid] и div.rte-poll-marker[data-poll-id]
function extractPollIds(content) {
  const ids = new Set();
  const textRe = /\[POLL:([0-9a-f-]{36})\]/gi;
  const divRe  = /data-poll-id="([0-9a-f-]{36})"/gi;
  let m;
  while ((m = textRe.exec(content)) !== null) ids.add(m[1]);
  while ((m = divRe.exec(content))  !== null) ids.add(m[1]);
  return ids;
}

// Удаляет опросы этой новости, которые больше не упоминаются в контенте.
async function deleteOrphanedPolls(newsId, newContent) {
  const existingPolls = await db.all(`SELECT id FROM polls WHERE news_id = ?`, [newsId]);
  if (!existingPolls.length) return;

  const keptIds = extractPollIds(newContent);

  for (const poll of existingPolls) {
    if (!keptIds.has(poll.id)) {
      await db.run(`DELETE FROM polls WHERE id = ?`, [poll.id]);
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory просмотры: один пользователь — один просмотр в 24 часа (по IP)
// ---------------------------------------------------------------------------
const viewedIPs = new Map(); // ключ: `${newsId}:${ip}`, значение: timestamp

// Чистим устаревшие записи раз в час
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
    .substring(0, 100) || 'news';
}

// Гарантирует уникальность slug: если занят — добавляет суффикс -2, -3, ...
async function uniqueSlug(base, excludeId = null) {
  let candidate = base;
  let i = 2;
  while (true) {
    const row = await db.get(
      `SELECT id FROM news WHERE slug = ?${excludeId ? ' AND id != ?' : ''}`,
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
// formatNews — строка БД → camelCase-объект
// ---------------------------------------------------------------------------
function formatNews(row, full = false) {
  const obj = {
    id:              row.id,
    title:           row.title,
    slug:            row.slug,
    previewImageUrl: row.preview_image_url || null,
    isPublished:     Number(row.is_published) === 1,
    publishedAt:     row.published_at ? Number(row.published_at) : null,
    updatedAt:       row.updated_at   ? Number(row.updated_at)   : null,
    editedCount:     Number(row.edited_count) || 0,
    views:           Number(row.views)         || 0,
    createdAt:       Number(row.created_at),
    commentsCount:   Number(row.comments_count) || 0,
  };
  if (full) {
    obj.content = row.content || '';
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
// GET /api/news — список опубликованных новостей (пагинация)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);

  try {
    const rows = await db.all(
      `SELECT
         n.id, n.title, n.slug, n.preview_image_url, n.is_published,
         n.published_at, n.updated_at, n.edited_count, n.views, n.created_at,
         (SELECT COUNT(*) FROM comments c WHERE c.news_id = n.id) AS comments_count
       FROM news n
       WHERE n.is_published = 1
       ORDER BY n.published_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    res.json(rows.map(r => formatNews(r, false)));
  } catch (err) {
    console.error('Ошибка получения новостей:', err);
    res.status(500).json({ error: 'Ошибка при получении новостей' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/news/:slug — одна новость (полный контент)
// ---------------------------------------------------------------------------
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    const row = await db.get(
      `SELECT
         n.id, n.title, n.slug, n.preview_image_url, n.is_published,
         n.published_at, n.updated_at, n.edited_count, n.views, n.created_at,
         n.content,
         u.id AS author_id, u.username AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid,
         (SELECT COUNT(*) FROM comments c WHERE c.news_id = n.id) AS comments_count
       FROM news n
       JOIN users u ON u.id = n.author_id
       WHERE n.slug = ? AND n.is_published = 1`,
      [slug],
    );

    if (!row) return res.status(404).json({ error: 'Новость не найдена' });

    // Инкрементируем просмотры — не чаще раза в 24 часа с одного IP
    const ip      = req.ip || req.socket?.remoteAddress || 'unknown';
    const viewKey = `${row.id}:${ip}`;
    const lastTs  = viewedIPs.get(viewKey);
    if (!lastTs || Date.now() - lastTs > 24 * 60 * 60 * 1000) {
      viewedIPs.set(viewKey, Date.now());
      db.run(`UPDATE news SET views = views + 1 WHERE id = ?`, [row.id]);
    }

    res.json(formatNews(row, true));
  } catch (err) {
    console.error('Ошибка получения новости:', err);
    res.status(500).json({ error: 'Ошибка при получении новости' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/news — создать новость (editor и выше)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, isEditor, async (req, res) => {
  const { title, preview_image_url, content } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Заголовок обязателен' });
  }
  if (title.trim().length > 200) {
    return res.status(400).json({ error: 'Заголовок не может превышать 200 символов' });
  }

  try {
    const base = slugify(title.trim());
    const slug = await uniqueSlug(base);
    const id   = uuidv4();
    const now  = Math.floor(Date.now() / 1000);

    await db.run(
      `INSERT INTO news (id, author_id, title, slug, preview_image_url, content,
                         is_published, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, req.user.id, title.trim(), slug, preview_image_url || null,
       content || '', now, now],
    );

    const row = await db.get(
      `SELECT
         n.id, n.title, n.slug, n.preview_image_url, n.is_published,
         n.published_at, n.updated_at, n.edited_count, n.views, n.created_at,
         n.content,
         u.id AS author_id, u.username AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid,
         0 AS comments_count
       FROM news n JOIN users u ON u.id = n.author_id
       WHERE n.id = ?`,
      [id],
    );

    res.status(201).json(formatNews(row, true));

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    logActivity({
      userId:     req.user.id,
      username:   req.user.username,
      action:     'news_create',
      targetType: 'news',
      targetId:   slug,
      ip:         clientIp,
      details:    { preview: title.trim().slice(0, 80) },
    });
  } catch (err) {
    console.error('Ошибка создания новости:', err);
    res.status(500).json({ error: 'Ошибка при создании новости' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/news/:slug — обновить новость (editor и выше)
// ---------------------------------------------------------------------------
router.put('/:slug', requireAuth, isEditor, async (req, res) => {
  const { slug } = req.params;
  const { title, preview_image_url, content } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Заголовок обязателен' });
  }
  if (title.trim().length > 200) {
    return res.status(400).json({ error: 'Заголовок не может превышать 200 символов' });
  }

  try {
    const existing = await db.get(`SELECT id, title FROM news WHERE slug = ?`, [slug]);
    if (!existing) return res.status(404).json({ error: 'Новость не найдена' });

    // Обновляем slug только если изменился заголовок
    let newSlug = slug;
    if (existing.title !== title.trim()) {
      const base = slugify(title.trim());
      newSlug = await uniqueSlug(base, existing.id);
    }

    const now = Math.floor(Date.now() / 1000);

    await db.run(
      `UPDATE news
       SET title = ?, slug = ?, preview_image_url = ?, content = ?,
           updated_at = ?, edited_count = edited_count + 1
       WHERE id = ?`,
      [title.trim(), newSlug, preview_image_url || null, content || '', now, existing.id],
    );

    // Удаляем опросы которые были удалены из контента новости.
    // CASCADE автоматически удалит poll_options и poll_votes.
    await deleteOrphanedPolls(existing.id, content || '');

    const row = await db.get(
      `SELECT
         n.id, n.title, n.slug, n.preview_image_url, n.is_published,
         n.published_at, n.updated_at, n.edited_count, n.views, n.created_at,
         n.content,
         u.id AS author_id, u.username AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid,
         (SELECT COUNT(*) FROM comments c WHERE c.news_id = n.id) AS comments_count
       FROM news n JOIN users u ON u.id = n.author_id
       WHERE n.id = ?`,
      [existing.id],
    );

    res.json(formatNews(row, true));

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    logActivity({
      userId:     req.user.id,
      username:   req.user.username,
      action:     'news_update',
      targetType: 'news',
      targetId:   newSlug,
      ip:         clientIp,
      details:    { preview: title.trim().slice(0, 80) },
    });
  } catch (err) {
    console.error('Ошибка обновления новости:', err);
    res.status(500).json({ error: 'Ошибка при обновлении новости' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/news/:slug — удалить новость (только admin)
// ---------------------------------------------------------------------------
router.delete('/:slug', requireAuth, isAdmin, async (req, res) => {
  const { slug } = req.params;

  try {
    const row = await db.get(
      `SELECT id, title, slug FROM news WHERE slug = ?`, [slug]
    );
    if (!row) return res.status(404).json({ error: 'Новость не найдена' });

    await db.run(`DELETE FROM news WHERE id = ?`, [row.id]);

    res.json({ success: true });

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    logActivity({
      userId:     req.user.id,
      username:   req.user.username,
      action:     'news_delete',
      targetType: 'news',
      targetId:   slug,
      ip:         clientIp,
      details:    { preview: row.title?.slice(0, 80) },
    });
  } catch (err) {
    console.error('Ошибка удаления новости:', err);
    res.status(500).json({ error: 'Ошибка при удалении новости' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/news/upload-image — загрузить изображение для редактора (editor и выше)
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
// Комментарии к новостям
// ---------------------------------------------------------------------------
router.use('/:newsId/comments', newsCommentsRouter);

module.exports = { router };
