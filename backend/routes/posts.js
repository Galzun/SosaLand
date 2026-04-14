// routes/posts.js
// Эндпоинты для постов, лайков и вложений к постам.
//
// Маршруты (монтируется под /api/posts):
//   POST   /               — создать пост (только авторизованным)
//   GET    /               — лента всех постов (доступна всем)
//   PUT    /:id            — редактировать пост (только автор)
//   DELETE /:id            — удалить пост + файлы с диска (только автор)
//   POST   /:id/like       — поставить / убрать лайк (только авторизованным)

const express = require('express');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { requireAuth, ROLE_LEVEL } = require('../middleware/auth');
const { postCommentsRouter } = require('./comments');
const { logActivity, markFileDeletedInLogs } = require('../utils/logActivity');

const router = express.Router();

// Папка с загруженными файлами — нужна для физического удаления при удалении поста
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// ---------------------------------------------------------------------------
// optionalAuth — middleware для опциональной авторизации.
// Если заголовок Authorization присутствует и токен валиден — добавляет req.user.
// Если токена нет или он невалиден — пропускает запрос без ошибки.
// ---------------------------------------------------------------------------
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return next();

  const token = authHeader.split(' ')[1];
  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // Невалидный токен — просто игнорируем
  }
  next();
}

// ---------------------------------------------------------------------------
// guessType — определяет MIME-тип по расширению URL (для legacy image_url).
// ---------------------------------------------------------------------------
function guessType(url) {
  const ext = (url || '').split('?')[0].split('.').pop()?.toLowerCase() || '';
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
    pdf: 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// insertAttachments — вставляет массив вложений в post_attachments.
//
// postId      — ID поста
// attachments — массив { fileUrl, fileType?, fileName? }
// cb(err)     — колбэк по завершению
// ---------------------------------------------------------------------------
async function insertAttachments(postId, attachments) {
  if (!attachments || !attachments.length) return;

  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    await db.run(
      `INSERT INTO post_attachments
         (id, post_id, file_url, file_type, file_name, order_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        postId,
        att.fileUrl,
        att.fileType  || guessType(att.fileUrl),
        att.fileName  || null,
        att.orderIndex !== undefined ? att.orderIndex : i,
        now,
      ]
    );
  }
}

// ---------------------------------------------------------------------------
// deleteFilesFromDisk — физически удаляет файлы из backend/uploads/.
// Вызывается после удаления поста из БД (неблокирующий).
//
// urls — массив строк вида "/uploads/filename.ext"
// ---------------------------------------------------------------------------
function deleteFilesFromDisk(urls) {
  urls.forEach(url => {
    if (!url || !url.startsWith('/uploads/')) return;

    const fileName = url.replace(/^\/uploads\//, '');
    // Защита от path traversal — имя файла не должно содержать слеши
    if (fileName.includes('/') || fileName.includes('\\')) return;

    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.warn('Не удалось удалить файл:', filePath, err.message);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// fetchPosts — вспомогательная функция для получения списка постов с JOIN.
//
// whereClause — строка вида "WHERE p.user_id = ?" (или пустая "")
// whereParams — массив параметров для whereClause
// currentUserId — ID текущего пользователя (для поля liked), может быть null
// limit, offset — пагинация
//
// Возвращает Promise<Array> с постами в camelCase формате.
// Каждый пост содержит поле attachments — массив вложений из post_attachments.
// ---------------------------------------------------------------------------
async function fetchPosts(whereClause, whereParams, currentUserId, limit, offset) {
  // PostgreSQL: json_agg + json_build_object вместо SQLite json_group_array + json_object.
  // Псевдонимы в кавычках — иначе PostgreSQL приводит их к нижнему регистру.
  const sql = `
    SELECT
      p.id,
      p.content,
      p.image_url        AS "imageUrl",
      p.has_attachments  AS "hasAttachments",
      p.likes_count      AS "likesCount",
      p.created_at       AS "createdAt",
      p.updated_at       AS "updatedAt",
      COALESCE(p.edit_count, 0) AS "editCount",
      u.id               AS "authorId",
      u.username         AS "authorUsername",
      u.minecraft_uuid   AS "authorMinecraftUuid",
      CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END AS liked,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id)::INTEGER AS "commentsCount",

      /* Вложения — PostgreSQL возвращает уже готовый массив объектов */
      COALESCE(
        (SELECT json_agg(json_build_object(
          'id',         pa.id,
          'fileUrl',    pa.file_url,
          'fileType',   pa.file_type,
          'fileName',   pa.file_name,
          'orderIndex', pa.order_index
        ) ORDER BY pa.order_index ASC)
        FROM post_attachments pa WHERE pa.post_id = p.id),
        '[]'::json
      ) AS "attachmentsJson",

      /* ID опроса */
      (SELECT id FROM polls WHERE post_id = p.id LIMIT 1) AS "pollId",

      /* Последний комментарий — PostgreSQL возвращает готовый объект */
      (SELECT json_build_object(
        'id',                 lc.id,
        'content',            lc.content,
        'imageUrl',           lc.image_url,
        'createdAt',          lc.created_at,
        'authorUsername',     lu.username,
        'authorMinecraftUuid', lu.minecraft_uuid
       )
       FROM comments lc
       JOIN users lu ON lu.id = lc.user_id
       WHERE lc.post_id = p.id
       ORDER BY lc.created_at DESC
       LIMIT 1
      ) AS "lastCommentJson"

    FROM posts p
    JOIN  users u ON u.id = p.user_id
    LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = ?
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const params = [currentUserId || null, ...whereParams, limit, offset];
  const rows = await db.all(sql, params);

  return rows.map(row => {
    // PostgreSQL уже вернул массив объектов — не нужен JSON.parse
    const attachments = Array.isArray(row.attachmentsJson)
      ? row.attachmentsJson.filter(a => a && a.fileUrl)
      : [];

    // Последний комментарий — уже объект (или null)
    let lastComment = null;
    if (row.lastCommentJson) {
      const lc = row.lastCommentJson;
      lastComment = {
        id:        lc.id,
        content:   lc.content   || '',
        imageUrl:  lc.imageUrl  || null,
        createdAt: lc.createdAt,
        author: {
          username:      lc.authorUsername,
          minecraftUuid: lc.authorMinecraftUuid || null,
          avatarUrl:     lc.authorMinecraftUuid
            ? `https://crafatar.icehost.xyz/avatars/${lc.authorMinecraftUuid}?size=64&overlay`
            : null,
        },
      };
    }

    return {
      id:             row.id,
      content:        row.content,
      imageUrl:       row.imageUrl    || null,
      hasAttachments: row.hasAttachments === 1,
      attachments,
      likesCount:     row.likesCount    || 0,
      commentsCount:  row.commentsCount || 0,
      createdAt:      row.createdAt,
      updatedAt:      row.updatedAt     || null,
      editCount:      row.editCount     || 0,
      liked:          row.liked === 1,
      pollId:         row.pollId || null,
      lastComment,
      author: {
        id:            row.authorId,
        username:      row.authorUsername,
        minecraftUuid: row.authorMinecraftUuid || null,
        avatarUrl:     row.authorMinecraftUuid
          ? `https://crafatar.icehost.xyz/avatars/${row.authorMinecraftUuid}?size=64&overlay`
          : null,
      },
    };
  });
}


// ---------------------------------------------------------------------------
// POST /api/posts — создать новый пост.
//
// Тело запроса (JSON):
//   { content: string, attachments?: Array<{fileUrl, fileType, fileName}>, imageUrl?: string }
//
// attachments — массив уже загруженных файлов (через /api/upload)
// imageUrl    — legacy-формат: одно изображение (обратная совместимость)
//
// Ответ: созданный пост с полем attachments
// ---------------------------------------------------------------------------
router.post('/', requireAuth, async (req, res) => {
  const { content, imageUrl, attachments } = req.body;

  // Валидация текста
  if (content === undefined || content === null || typeof content !== 'string') {
    return res.status(400).json({ error: 'Поле content обязательно' });
  }
  if (content.length > 5000) {
    return res.status(400).json({ error: 'Текст поста не может превышать 5000 символов' });
  }

  const postId       = uuidv4();
  const now          = Math.floor(Date.now() / 1000);
  const userId       = req.user.id;
  const cleanContent = content.trim();

  // Определяем вложения для сохранения
  // Приоритет: новый формат (attachments) > legacy (imageUrl)
  let attachmentsToSave = [];
  let legacyImageUrl    = null;

  if (Array.isArray(attachments) && attachments.length > 0) {
    // Новый формат: массив вложений
    attachmentsToSave = attachments.filter(a => a && a.fileUrl);
  } else if (imageUrl) {
    // Legacy-формат: одно изображение → тоже сохраняем в post_attachments
    legacyImageUrl    = imageUrl;
    attachmentsToSave = [{
      fileUrl:  imageUrl,
      fileType: guessType(imageUrl),
      fileName: imageUrl.split('/').pop() || null,
    }];
  }

  const hasAttachments = attachmentsToSave.length > 0 ? 1 : 0;

  try {
    await db.run(
      `INSERT INTO posts (id, user_id, content, image_url, has_attachments, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [postId, userId, cleanContent, legacyImageUrl, hasAttachments, now]
    );

    try {
      await insertAttachments(postId, attachmentsToSave);
    } catch (attErr) {
      console.error('Ошибка вставки вложений:', attErr.message);
      // Пост уже создан — не падаем
    }

    const user = await db.get(
      `SELECT username, minecraft_uuid FROM users WHERE id = ?`, [userId]
    );

    const author = {
      id:            userId,
      username:      user?.username       || req.user.username,
      minecraftUuid: user?.minecraft_uuid || null,
      avatarUrl:     user?.minecraft_uuid
        ? `https://crafatar.icehost.xyz/avatars/${user.minecraft_uuid}?size=64&overlay`
        : null,
    };

    const responseAttachments = attachmentsToSave.map((att, i) => ({
      fileUrl:    att.fileUrl,
      fileType:   att.fileType   || guessType(att.fileUrl),
      fileName:   att.fileName   || null,
      orderIndex: i,
    }));

    res.status(201).json({
      id:             postId,
      content:        cleanContent,
      imageUrl:       legacyImageUrl,
      hasAttachments: hasAttachments === 1,
      attachments:    responseAttachments,
      likesCount:     0,
      commentsCount:  0,
      liked:          false,
      pollId:         null,
      createdAt:      now,
      updatedAt:      null,
      editCount:      0,
      lastComment:    null,
      author,
    });

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    logActivity({
      userId:     userId,
      username:   author.username,
      action:     'post_create',
      targetType: 'post',
      targetId:   postId,
      fileCount:  attachmentsToSave.length,
      ip:         clientIp,
      details:    { preview: cleanContent.slice(0, 80) },
    });
  } catch (err) {
    console.error('Ошибка создания поста:', err.message);
    res.status(500).json({ error: 'Ошибка при создании поста' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/posts — лента постов всех пользователей.
// Query-параметры: limit (default 20, max 50), offset (default 0)
// Авторизация опциональна: если авторизован — поле liked актуально.
// ---------------------------------------------------------------------------
router.get('/', optionalAuth, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 20, 50);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);

  try {
    const posts = await fetchPosts('', [], req.user?.id, limit, offset);
    res.json(posts);
  } catch (err) {
    console.error('Ошибка получения ленты:', err.message);
    res.status(500).json({ error: 'Ошибка при получении постов' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/posts/:id — получить один пост по ID (для прямой ссылки /post/:id).
// ---------------------------------------------------------------------------
router.get('/:id', optionalAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const posts = await fetchPosts('WHERE p.id = ?', [id], req.user?.id, 1, 0);
    if (!posts.length) return res.status(404).json({ error: 'Пост не найден' });
    res.json(posts[0]);
  } catch (err) {
    console.error('Ошибка получения поста:', err.message);
    res.status(500).json({ error: 'Ошибка при получении поста' });
  }
});


// ---------------------------------------------------------------------------
// PUT /api/posts/:id — редактировать пост.
//
// Тело запроса (JSON):
//   { content: string, attachments?: Array<{fileUrl, fileType, fileName}> }
//
// attachments — полный итоговый список вложений (уже загруженных).
//   Вложения, которые были у поста но отсутствуют в новом списке, удаляются с диска.
//   Новые вложения (не существовавшие) — вставляются.
//
// Ответ: обновлённый пост
// ---------------------------------------------------------------------------
router.put('/:id', requireAuth, async (req, res) => {
  const { id }     = req.params;
  const { content, attachments } = req.body;
  const userId     = req.user.id;

  if (content === undefined || content === null || typeof content !== 'string') {
    return res.status(400).json({ error: 'Поле content обязательно' });
  }
  if (content.length > 5000) {
    return res.status(400).json({ error: 'Текст поста не может превышать 5000 символов' });
  }

  try {
    const post = await db.get(`SELECT id, user_id FROM posts WHERE id = ?`, [id]);
    if (!post) return res.status(404).json({ error: 'Пост не найден' });
    if (post.user_id !== userId) return res.status(403).json({ error: 'Нельзя редактировать чужой пост' });

    const now          = Math.floor(Date.now() / 1000);
    const cleanContent = content.trim();

    const newAttachments = Array.isArray(attachments)
      ? attachments.filter(a => a && a.fileUrl)
      : [];
    const hasAttachments = newAttachments.length > 0 ? 1 : 0;

    const oldAtts = await db.all(`SELECT file_url FROM post_attachments WHERE post_id = ?`, [id]);
    const newUrls = new Set(newAttachments.map(a => a.fileUrl));
    const toDelete = (oldAtts || []).map(a => a.file_url).filter(u => u && !newUrls.has(u));

    // Обновляем пост
    await db.run(
      `UPDATE posts
       SET content = ?, has_attachments = ?, updated_at = ?, edit_count = COALESCE(edit_count, 0) + 1
       WHERE id = ?`,
      [cleanContent, hasAttachments, now, id]
    );

    // Заменяем вложения
    await db.run(`DELETE FROM post_attachments WHERE post_id = ?`, [id]);
    await insertAttachments(id, newAttachments);

    // Удаляем с диска вложения, которые убрали из поста
    deleteFilesFromDisk(toDelete);
    for (const url of toDelete) await markFileDeletedInLogs(url);

    const posts = await fetchPosts(`WHERE p.id = ?`, [id], userId, 1, 0);
    if (!posts.length) return res.status(404).json({ error: 'Пост не найден после обновления' });
    res.json(posts[0]);
  } catch (err) {
    console.error('Ошибка редактирования поста:', err.message);
    res.status(500).json({ error: 'Ошибка при редактировании поста' });
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/posts/:id — удалить пост.
//
// Только автор может удалить свой пост.
// При удалении: физически удаляем все связанные файлы с диска.
// Лайки, комментарии и post_attachments удаляются через ON DELETE CASCADE.
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id }  = req.params;
  const userId  = req.user.id;

  try {
    const post = await db.get(`SELECT id, user_id, image_url FROM posts WHERE id = ?`, [id]);
    if (!post) return res.status(404).json({ error: 'Пост не найден' });
    const callerLevel = ROLE_LEVEL[req.user.role] ?? 0;
    if (post.user_id !== userId && callerLevel < ROLE_LEVEL.admin) {
      return res.status(403).json({ error: 'Нельзя удалить чужой пост' });
    }

    // Собираем URL вложений ДО удаления
    let attachments = [];
    try {
      attachments = await db.all(`SELECT file_url FROM post_attachments WHERE post_id = ?`, [id]);
    } catch (_) { /* продолжаем даже без списка */ }

    // Удаляем пост — CASCADE удалит post_attachments, likes, comments
    await db.run(`DELETE FROM posts WHERE id = ?`, [id]);

    const urlsToDelete = new Set();
    attachments.forEach(a => { if (a.file_url) urlsToDelete.add(a.file_url); });
    if (post.image_url) urlsToDelete.add(post.image_url);
    deleteFilesFromDisk([...urlsToDelete]);
    for (const url of urlsToDelete) await markFileDeletedInLogs(url);

    res.json({ success: true, id });

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    logActivity({
      userId:   req.user.id,
      username: req.user.username,
      action:   'post_delete',
      targetType: 'post',
      targetId: id,
      ip:       clientIp,
    });
  } catch (err) {
    console.error('Ошибка удаления поста:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении поста' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/posts/:id/like — toggle лайк (поставить / убрать).
// ---------------------------------------------------------------------------
router.post('/:id/like', requireAuth, async (req, res) => {
  const { id }  = req.params;
  const userId  = req.user.id;

  try {
    const post = await db.get(`SELECT id FROM posts WHERE id = ?`, [id]);
    if (!post) return res.status(404).json({ error: 'Пост не найден' });

    const existingLike = await db.get(
      `SELECT id FROM likes WHERE user_id = ? AND post_id = ?`, [userId, id]
    );

    if (existingLike) {
      // Убираем лайк
      await db.run(`DELETE FROM likes WHERE id = ?`, [existingLike.id]);
      await db.run(
        `UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = ?`, [id]
      );
    } else {
      // Ставим лайк
      const now = Math.floor(Date.now() / 1000);
      await db.run(
        `INSERT INTO likes (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)`,
        [uuidv4(), userId, id, now]
      );
      await db.run(`UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?`, [id]);
    }

    const updated = await db.get(`SELECT likes_count FROM posts WHERE id = ?`, [id]);
    res.json({ liked: !existingLike, likesCount: updated.likes_count });
  } catch (err) {
    console.error('Ошибка лайка:', err.message);
    res.status(500).json({ error: 'Ошибка при обработке лайка' });
  }
});


// Монтируем роутер комментариев к постам
router.use('/:postId/comments', postCommentsRouter);


module.exports = { router, fetchPosts, optionalAuth };
