// routes/comments.js
// Система комментариев: к постам, фото, профилям и новостям.
//
// Экспортирует пять роутеров:
//   postCommentsRouter    — GET/POST /:postId/comments         (монтируется в posts.js)
//   imageCommentsRouter   — GET/POST /:imageId/comments        (монтируется в images.js)
//   profileCommentsRouter — GET/POST /:userId/profile-comments (монтируется в users.js)
//   newsCommentsRouter    — GET/POST /:newsId/comments         (монтируется в news.js)
//   commentsDeleteRouter  — DELETE /:id                        (монтируется в server.js под /api/comments)
//
// Формат комментария в ответе:
//   { id, content, imageUrl, createdAt, author: { id, username, minecraftUuid, avatarUrl } }

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, ROLE_LEVEL } = require('../middleware/auth');
const avatarUrl = require('../utils/avatarUrl');

const LIMIT = 20;

// ---------------------------------------------------------------------------
// formatComment — преобразует строку БД в camelCase-объект комментария.
// ---------------------------------------------------------------------------
function formatComment(row) {
  return {
    id:        row.id,
    content:   row.content,
    imageUrl:  row.image_url || null,
    createdAt: row.created_at,
    author: {
      id:            row.author_id,
      username:      row.author_username,
      minecraftName: row.author_minecraft_name || null,
      minecraftUuid: row.author_minecraft_uuid || null,
      avatarUrl: avatarUrl(row.author_minecraft_uuid, row.author_username),
    },
  };
}

// ---------------------------------------------------------------------------
// fetchComments — получить список комментариев с JOIN на users.
// ---------------------------------------------------------------------------
function fetchComments(whereField, whereValue, limit, offset) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT
         c.id,
         c.content,
         c.image_url,
         c.created_at,
         u.id             AS author_id,
         u.username       AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid,
         (SELECT p.name FROM players p WHERE p.uuid = u.minecraft_uuid LIMIT 1) AS author_minecraft_name
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.${whereField} = ?
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [whereValue, limit, offset],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows.map(formatComment));
      }
    );
  });
}

// ---------------------------------------------------------------------------
// createComment — вставить новый комментарий в БД.
// field — 'post_id', 'image_id' или 'profile_user_id'
// ---------------------------------------------------------------------------
function createComment(userId, field, value, content, imageUrl) {
  return new Promise((resolve, reject) => {
    const id  = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    db.run(
      `INSERT INTO comments (id, user_id, ${field}, content, image_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, value, content || '', imageUrl || null, now],
      (err) => {
        if (err) return reject(err);
        resolve(id);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// getCommentWithAuthor — получить только что созданный комментарий с JOIN.
// ---------------------------------------------------------------------------
function getCommentWithAuthor(commentId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT
         c.id, c.content, c.image_url, c.created_at,
         u.id AS author_id, u.username AS author_username,
         u.minecraft_uuid AS author_minecraft_uuid
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      [commentId],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        resolve(formatComment(row));
      }
    );
  });
}

// ---------------------------------------------------------------------------
// validateComment — проверяет текст и imageUrl.
// Хотя бы одно из двух должно быть заполнено.
// ---------------------------------------------------------------------------
function validateComment(content, imageUrl) {
  const hasText  = content  && typeof content  === 'string' && content.trim().length > 0;
  const hasImage = imageUrl && typeof imageUrl === 'string' && imageUrl.trim().length > 0;

  if (!hasText && !hasImage) {
    return 'Комментарий не может быть пустым';
  }
  if (hasText && content.trim().length > 1000) {
    return 'Комментарий не может превышать 1000 символов';
  }
  return null;
}

// ===========================================================================
// POST COMMENTS ROUTER
// ===========================================================================
const postCommentsRouter = express.Router({ mergeParams: true });

postCommentsRouter.get('/', async (req, res) => {
  const { postId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit)  || LIMIT, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  try {
    const post = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM posts WHERE id = ?`, [postId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!post) return res.status(404).json({ error: 'Пост не найден' });

    const comments = await fetchComments('post_id', postId, limit, offset);
    res.json(comments);
  } catch (err) {
    console.error('Ошибка получения комментариев к посту:', err.message);
    res.status(500).json({ error: 'Ошибка при получении комментариев' });
  }
});

postCommentsRouter.post('/', requireAuth, async (req, res) => {
  const { postId } = req.params;
  const { content, imageUrl } = req.body;

  const validationError = validateComment(content, imageUrl);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const post = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM posts WHERE id = ?`, [postId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!post) return res.status(404).json({ error: 'Пост не найден' });

    const commentId = await createComment(req.user.id, 'post_id', postId, content, imageUrl);
    const comment   = await getCommentWithAuthor(commentId);
    res.status(201).json(comment);
  } catch (err) {
    console.error('Ошибка добавления комментария к посту:', err.message);
    res.status(500).json({ error: 'Ошибка при добавлении комментария' });
  }
});


// ===========================================================================
// IMAGE COMMENTS ROUTER
// ===========================================================================
const imageCommentsRouter = express.Router({ mergeParams: true });

imageCommentsRouter.get('/', async (req, res) => {
  const { imageId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit)  || LIMIT, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  try {
    const image = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM images WHERE id = ?`, [imageId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!image) return res.status(404).json({ error: 'Фото не найдено' });

    const comments = await fetchComments('image_id', imageId, limit, offset);
    res.json(comments);
  } catch (err) {
    console.error('Ошибка получения комментариев к фото:', err.message);
    res.status(500).json({ error: 'Ошибка при получении комментариев' });
  }
});

imageCommentsRouter.post('/', requireAuth, async (req, res) => {
  const { imageId } = req.params;
  const { content, imageUrl } = req.body;

  const validationError = validateComment(content, imageUrl);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const image = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM images WHERE id = ?`, [imageId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!image) return res.status(404).json({ error: 'Фото не найдено' });

    const commentId = await createComment(req.user.id, 'image_id', imageId, content, imageUrl);
    const comment   = await getCommentWithAuthor(commentId);
    res.status(201).json(comment);
  } catch (err) {
    console.error('Ошибка добавления комментария к фото:', err.message);
    res.status(500).json({ error: 'Ошибка при добавлении комментария' });
  }
});


// ===========================================================================
// PROFILE COMMENTS ROUTER
// ===========================================================================
const profileCommentsRouter = express.Router({ mergeParams: true });

profileCommentsRouter.get('/', async (req, res) => {
  const { userId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit)  || LIMIT, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  // paged=1 — вернуть { comments, total } вместо массива
  const paged  = req.query.paged === '1';

  try {
    const user = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const [comments, countRow] = await Promise.all([
      fetchComments('profile_user_id', userId, limit, offset),
      paged
        ? db.get(`SELECT COUNT(*) AS cnt FROM comments WHERE profile_user_id = ?`, [userId])
        : Promise.resolve(null),
    ]);

    if (paged) {
      res.json({ comments, total: Number(countRow?.cnt) || 0 });
    } else {
      res.json(comments);
    }
  } catch (err) {
    console.error('Ошибка получения комментариев к профилю:', err.message);
    res.status(500).json({ error: 'Ошибка при получении комментариев' });
  }
});

profileCommentsRouter.post('/', requireAuth, async (req, res) => {
  const { userId } = req.params;
  const { content, imageUrl } = req.body;

  const validationError = validateComment(content, imageUrl);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const user = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM users WHERE id = ?`, [userId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const commentId = await createComment(req.user.id, 'profile_user_id', userId, content, imageUrl);
    const comment   = await getCommentWithAuthor(commentId);
    res.status(201).json(comment);
  } catch (err) {
    console.error('Ошибка добавления комментария к профилю:', err.message);
    res.status(500).json({ error: 'Ошибка при добавлении комментария' });
  }
});


// ===========================================================================
// COMMENTS DELETE ROUTER
// ===========================================================================
const commentsDeleteRouter = express.Router();

commentsDeleteRouter.delete('/:id', requireAuth, async (req, res) => {
  const { id }   = req.params;
  const userId   = req.user.id;
  const userRole = req.user.role;

  try {
    const comment = await new Promise((resolve, reject) => {
      db.get(`SELECT id, user_id FROM comments WHERE id = ?`, [id], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    if (!comment) return res.status(404).json({ error: 'Комментарий не найден' });

    const callerLevel = ROLE_LEVEL[userRole] ?? 0;
    const canDeleteAny = callerLevel >= ROLE_LEVEL.admin || req.user.customPermissions?.has('moderate_content');
    if (comment.user_id !== userId && !canDeleteAny) {
      return res.status(403).json({ error: 'Нет прав для удаления этого комментария' });
    }

    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM comments WHERE id = ?`, [id], (err) => {
        if (err) reject(err); else resolve();
      });
    });

    res.json({ success: true, id });
  } catch (err) {
    console.error('Ошибка удаления комментария:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении комментария' });
  }
});


// ===========================================================================
// NEWS COMMENTS ROUTER
// ===========================================================================
const newsCommentsRouter = express.Router({ mergeParams: true });

newsCommentsRouter.get('/', async (req, res) => {
  const { newsId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit)  || LIMIT, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  try {
    const news = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM news WHERE id = ?`, [newsId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!news) return res.status(404).json({ error: 'Новость не найдена' });

    const comments = await fetchComments('news_id', newsId, limit, offset);
    res.json(comments);
  } catch (err) {
    console.error('Ошибка получения комментариев к новости:', err.message);
    res.status(500).json({ error: 'Ошибка при получении комментариев' });
  }
});

newsCommentsRouter.post('/', requireAuth, async (req, res) => {
  const { newsId } = req.params;
  const { content, imageUrl } = req.body;

  const validationError = validateComment(content, imageUrl);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const news = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM news WHERE id = ?`, [newsId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!news) return res.status(404).json({ error: 'Новость не найдена' });

    const commentId = await createComment(req.user.id, 'news_id', newsId, content, imageUrl);
    const comment   = await getCommentWithAuthor(commentId);
    res.status(201).json(comment);
  } catch (err) {
    console.error('Ошибка добавления комментария к новости:', err.message);
    res.status(500).json({ error: 'Ошибка при добавлении комментария' });
  }
});


// ===========================================================================
// EVENT COMMENTS ROUTER
// ===========================================================================
const eventCommentsRouter = express.Router({ mergeParams: true });

eventCommentsRouter.get('/', async (req, res) => {
  const { eventId } = req.params;
  const limit  = Math.min(parseInt(req.query.limit)  || LIMIT, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  try {
    const event = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM events WHERE id = ?`, [eventId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!event) return res.status(404).json({ error: 'Событие не найдено' });

    const comments = await fetchComments('event_id', eventId, limit, offset);
    res.json(comments);
  } catch (err) {
    console.error('Ошибка получения комментариев к событию:', err.message);
    res.status(500).json({ error: 'Ошибка при получении комментариев' });
  }
});

eventCommentsRouter.post('/', requireAuth, async (req, res) => {
  const { eventId } = req.params;
  const { content, imageUrl } = req.body;

  const validationError = validateComment(content, imageUrl);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const event = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM events WHERE id = ?`, [eventId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!event) return res.status(404).json({ error: 'Событие не найдено' });

    const commentId = await createComment(req.user.id, 'event_id', eventId, content, imageUrl);
    const comment   = await getCommentWithAuthor(commentId);
    res.status(201).json(comment);
  } catch (err) {
    console.error('Ошибка добавления комментария к событию:', err.message);
    res.status(500).json({ error: 'Ошибка при добавлении комментария' });
  }
});


module.exports = {
  postCommentsRouter,
  imageCommentsRouter,
  profileCommentsRouter,
  newsCommentsRouter,
  eventCommentsRouter,
  commentsDeleteRouter,
};
