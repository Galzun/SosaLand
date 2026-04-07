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
const { requireAuth, isAdmin } = require('../middleware/auth');
const { newsCommentsRouter } = require('./comments');

const router = express.Router();

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
    const row = await new Promise((res, rej) =>
      db.get(
        `SELECT id FROM news WHERE slug = ?${excludeId ? ' AND id != ?' : ''}`,
        excludeId ? [candidate, excludeId] : [candidate],
        (err, r) => err ? rej(err) : res(r)
      )
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
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Только изображения'));
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
    isPublished:     row.is_published === 1,
    publishedAt:     row.published_at,
    updatedAt:       row.updated_at || null,
    editedCount:     row.edited_count || 0,
    views:           row.views || 0,
    createdAt:       row.created_at,
    commentsCount:   row.comments_count || 0,
  };
  if (full) {
    obj.content      = row.content || '';
    obj.contentDelta = row.content_delta || null;
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
    const rows = await new Promise((resolve, reject) =>
      db.all(
        `SELECT
           n.id, n.title, n.slug, n.preview_image_url, n.is_published,
           n.published_at, n.updated_at, n.edited_count, n.views, n.created_at,
           (SELECT COUNT(*) FROM comments c WHERE c.news_id = n.id) AS comments_count
         FROM news n
         WHERE n.is_published = 1
         ORDER BY n.published_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset],
        (err, rows) => err ? reject(err) : resolve(rows)
      )
    );

    res.json(rows.map(r => formatNews(r, false)));
  } catch (err) {
    console.error('Ошибка получения новостей:', err.message);
    res.status(500).json({ error: 'Ошибка при получении новостей' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/news/:slug — одна новость (полный контент)
// ---------------------------------------------------------------------------
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    const row = await new Promise((resolve, reject) =>
      db.get(
        `SELECT
           n.*,
           u.id AS author_id, u.username AS author_username,
           u.minecraft_uuid AS author_minecraft_uuid,
           (SELECT COUNT(*) FROM comments c WHERE c.news_id = n.id) AS comments_count
         FROM news n
         JOIN users u ON u.id = n.author_id
         WHERE n.slug = ? AND n.is_published = 1`,
        [slug],
        (err, row) => err ? reject(err) : resolve(row)
      )
    );

    if (!row) return res.status(404).json({ error: 'Новость не найдена' });

    // Инкрементируем просмотры
    db.run(`UPDATE news SET views = views + 1 WHERE id = ?`, [row.id]);

    res.json(formatNews(row, true));
  } catch (err) {
    console.error('Ошибка получения новости:', err.message);
    res.status(500).json({ error: 'Ошибка при получении новости' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/news — создать новость (только admin)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, isAdmin, async (req, res) => {
  const { title, preview_image_url, content, content_delta } = req.body;

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

    await new Promise((resolve, reject) =>
      db.run(
        `INSERT INTO news (id, author_id, title, slug, preview_image_url, content, content_delta,
                           is_published, published_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, req.user.id, title.trim(), slug, preview_image_url || null,
         content || '', content_delta || null, now, now],
        (err) => err ? reject(err) : resolve()
      )
    );

    const row = await new Promise((resolve, reject) =>
      db.get(
        `SELECT n.*, u.id AS author_id, u.username AS author_username,
                u.minecraft_uuid AS author_minecraft_uuid,
                0 AS comments_count
         FROM news n JOIN users u ON u.id = n.author_id
         WHERE n.id = ?`,
        [id],
        (err, r) => err ? reject(err) : resolve(r)
      )
    );

    res.status(201).json(formatNews(row, true));
  } catch (err) {
    console.error('Ошибка создания новости:', err.message);
    res.status(500).json({ error: 'Ошибка при создании новости' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/news/:slug — обновить новость (только admin)
// ---------------------------------------------------------------------------
router.put('/:slug', requireAuth, isAdmin, async (req, res) => {
  const { slug } = req.params;
  const { title, preview_image_url, content, content_delta } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Заголовок обязателен' });
  }
  if (title.trim().length > 200) {
    return res.status(400).json({ error: 'Заголовок не может превышать 200 символов' });
  }

  try {
    const existing = await new Promise((resolve, reject) =>
      db.get(`SELECT id, title FROM news WHERE slug = ?`, [slug],
        (err, r) => err ? reject(err) : resolve(r))
    );
    if (!existing) return res.status(404).json({ error: 'Новость не найдена' });

    // Обновляем slug только если изменился заголовок
    let newSlug = slug;
    if (existing.title !== title.trim()) {
      const base = slugify(title.trim());
      newSlug = await uniqueSlug(base, existing.id);
    }

    const now = Math.floor(Date.now() / 1000);

    await new Promise((resolve, reject) =>
      db.run(
        `UPDATE news
         SET title = ?, slug = ?, preview_image_url = ?, content = ?,
             content_delta = ?, updated_at = ?, edited_count = edited_count + 1
         WHERE id = ?`,
        [title.trim(), newSlug, preview_image_url || null,
         content || '', content_delta || null, now, existing.id],
        (err) => err ? reject(err) : resolve()
      )
    );

    const row = await new Promise((resolve, reject) =>
      db.get(
        `SELECT n.*, u.id AS author_id, u.username AS author_username,
                u.minecraft_uuid AS author_minecraft_uuid,
                (SELECT COUNT(*) FROM comments c WHERE c.news_id = n.id) AS comments_count
         FROM news n JOIN users u ON u.id = n.author_id
         WHERE n.id = ?`,
        [existing.id],
        (err, r) => err ? reject(err) : resolve(r)
      )
    );

    res.json(formatNews(row, true));
  } catch (err) {
    console.error('Ошибка обновления новости:', err.message);
    res.status(500).json({ error: 'Ошибка при обновлении новости' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/news/:slug — удалить новость (только admin)
// ---------------------------------------------------------------------------
router.delete('/:slug', requireAuth, isAdmin, async (req, res) => {
  const { slug } = req.params;

  try {
    const row = await new Promise((resolve, reject) =>
      db.get(`SELECT id FROM news WHERE slug = ?`, [slug],
        (err, r) => err ? reject(err) : resolve(r))
    );
    if (!row) return res.status(404).json({ error: 'Новость не найдена' });

    await new Promise((resolve, reject) =>
      db.run(`DELETE FROM news WHERE id = ?`, [row.id],
        (err) => err ? reject(err) : resolve())
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления новости:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении новости' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/news/upload-image — загрузить изображение для редактора (только admin)
// ---------------------------------------------------------------------------
router.post('/upload-image', requireAuth, isAdmin, (req, res) => {
  uploadMiddleware(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });
});

// ---------------------------------------------------------------------------
// Комментарии к новостям
// ---------------------------------------------------------------------------
router.use('/:newsId/comments', newsCommentsRouter);

module.exports = { router };
