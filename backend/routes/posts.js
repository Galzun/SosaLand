// routes/posts.js
// Эндпоинты для постов, лайков и вложений к постам.
//
// Маршруты (монтируется под /api/posts):
//   POST   /               — создать пост (только авторизованным)
//   GET    /               — лента всех постов (доступна всем)
//   DELETE /:id            — удалить пост + файлы с диска (только автор)
//   POST   /:id/like       — поставить / убрать лайк (только авторизованным)

const express = require('express');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');
const { postCommentsRouter } = require('./comments');

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
function insertAttachments(postId, attachments, cb) {
  if (!attachments || !attachments.length) return cb(null);

  const now = Math.floor(Date.now() / 1000);

  db.serialize(() => {
    attachments.forEach((att, i) => {
      db.run(
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
    });

    // Финальный SELECT подтверждает завершение всех INSERT
    db.run(`SELECT 1`, (err) => cb(err));
  });
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
function fetchPosts(whereClause, whereParams, currentUserId, limit, offset) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT
        p.id,
        p.content,
        p.image_url        AS imageUrl,
        p.has_attachments  AS hasAttachments,
        p.likes_count      AS likesCount,
        p.created_at       AS createdAt,
        p.updated_at       AS updatedAt,
        u.id               AS authorId,
        u.username         AS authorUsername,
        u.minecraft_uuid   AS authorMinecraftUuid,
        CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END AS liked,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentsCount,

        /* Вложения поста из post_attachments, отсортированные по order_index */
        (SELECT json_group_array(json_object(
          'id',         pa.id,
          'fileUrl',    pa.file_url,
          'fileType',   pa.file_type,
          'fileName',   pa.file_name,
          'orderIndex', pa.order_index
        ))
        FROM (
          SELECT * FROM post_attachments
          WHERE post_id = p.id
          ORDER BY order_index ASC
        ) pa) AS attachmentsJson,

        /* Последний комментарий — для превью под постом */
        (SELECT json_object(
          'id', lc.id,
          'content', lc.content,
          'imageUrl', lc.image_url,
          'createdAt', lc.created_at,
          'authorUsername', lu.username,
          'authorMinecraftUuid', lu.minecraft_uuid
         )
         FROM comments lc
         JOIN users lu ON lu.id = lc.user_id
         WHERE lc.post_id = p.id
         ORDER BY lc.created_at DESC
         LIMIT 1
        ) AS lastCommentJson

      FROM posts p
      JOIN  users u ON u.id = p.user_id
      LEFT JOIN likes l ON l.post_id = p.id AND l.user_id = ?
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const params = [currentUserId || null, ...whereParams, limit, offset];

    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);

      const posts = rows.map(row => {
        // Парсим вложения из JSON-строки SQLite
        let attachments = [];
        if (row.attachmentsJson) {
          try {
            const parsed = JSON.parse(row.attachmentsJson);
            // json_group_array возвращает null если нет строк — фильтруем
            attachments = Array.isArray(parsed)
              ? parsed.filter(a => a && a.fileUrl)
              : [];
          } catch (_) { /* ignore */ }
        }

        // Парсим последний комментарий
        let lastComment = null;
        if (row.lastCommentJson) {
          try {
            const lc = JSON.parse(row.lastCommentJson);
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
          } catch (_) { /* ignore */ }
        }

        return {
          id:             row.id,
          content:        row.content,
          imageUrl:       row.imageUrl    || null,  // legacy — для обратной совместимости
          hasAttachments: row.hasAttachments === 1,
          attachments,                              // новый формат
          likesCount:     row.likesCount    || 0,
          commentsCount:  row.commentsCount || 0,
          createdAt:      row.createdAt,
          updatedAt:      row.updatedAt     || null,
          liked:          row.liked === 1,
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

      resolve(posts);
    });
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
router.post('/', requireAuth, (req, res) => {
  const { content, imageUrl, attachments } = req.body;

  // Валидация текста
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Текст поста не может быть пустым' });
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

  // Сохраняем legacyImageUrl в posts.image_url только для старого формата
  db.run(
    `INSERT INTO posts (id, user_id, content, image_url, has_attachments, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [postId, userId, cleanContent, legacyImageUrl, hasAttachments, now],
    function (err) {
      if (err) {
        console.error('Ошибка создания поста:', err.message);
        return res.status(500).json({ error: 'Ошибка при создании поста' });
      }

      // Вставляем вложения и возвращаем пост
      insertAttachments(postId, attachmentsToSave, (err) => {
        if (err) {
          console.error('Ошибка вставки вложений:', err.message);
          // Пост уже создан — возвращаем без вложений, не падаем
        }

        db.get(
          `SELECT username, minecraft_uuid FROM users WHERE id = ?`,
          [userId],
          (err, user) => {
            const author = {
              id:            userId,
              username:      user?.username      || req.user.username,
              minecraftUuid: user?.minecraft_uuid || null,
              avatarUrl:     user?.minecraft_uuid
                ? `https://crafatar.icehost.xyz/avatars/${user.minecraft_uuid}?size=64&overlay`
                : null,
            };

            // Формируем attachments для ответа — порядок такой же, как сохранили
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
              createdAt:      now,
              updatedAt:      null,
              lastComment:    null,
              author,
            });
          }
        );
      });
    }
  );
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
// DELETE /api/posts/:id — удалить пост.
//
// Только автор может удалить свой пост.
// При удалении: физически удаляем все связанные файлы с диска.
// Лайки, комментарии и post_attachments удаляются через ON DELETE CASCADE.
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, (req, res) => {
  const { id }  = req.params;
  const userId  = req.user.id;

  // Ищем пост и проверяем авторство
  db.get(
    `SELECT id, user_id, image_url FROM posts WHERE id = ?`,
    [id],
    (err, post) => {
      if (err) {
        console.error('Ошибка поиска поста:', err.message);
        return res.status(500).json({ error: 'Ошибка при удалении поста' });
      }
      if (!post) {
        return res.status(404).json({ error: 'Пост не найден' });
      }
      if (post.user_id !== userId) {
        return res.status(403).json({ error: 'Нельзя удалить чужой пост' });
      }

      // Собираем URL всех вложений ДО удаления (CASCADE уничтожит их вместе с постом)
      db.all(
        `SELECT file_url FROM post_attachments WHERE post_id = ?`,
        [id],
        (err, attachments) => {
          if (err) {
            console.error('Ошибка получения вложений для удаления:', err.message);
            // Продолжаем удаление поста даже если не смогли получить список файлов
          }

          // Удаляем пост — CASCADE удалит post_attachments, likes, comments
          db.run(`DELETE FROM posts WHERE id = ?`, [id], (err) => {
            if (err) {
              console.error('Ошибка удаления поста:', err.message);
              return res.status(500).json({ error: 'Ошибка при удалении поста' });
            }

            // Физически удаляем файлы с диска (неблокирующий вызов)
            const urlsToDelete = new Set();
            if (attachments) {
              attachments.forEach(a => { if (a.file_url) urlsToDelete.add(a.file_url); });
            }
            // Legacy image_url тоже удаляем (если не вошёл в post_attachments)
            if (post.image_url) urlsToDelete.add(post.image_url);

            deleteFilesFromDisk([...urlsToDelete]);

            res.json({ success: true, id });
          });
        }
      );
    }
  );
});


// ---------------------------------------------------------------------------
// POST /api/posts/:id/like — toggle лайк (поставить / убрать).
// ---------------------------------------------------------------------------
router.post('/:id/like', requireAuth, (req, res) => {
  const { id }  = req.params;
  const userId  = req.user.id;

  db.get(`SELECT id FROM posts WHERE id = ?`, [id], (err, post) => {
    if (err) {
      console.error('Ошибка поиска поста при лайке:', err.message);
      return res.status(500).json({ error: 'Ошибка при обработке лайка' });
    }
    if (!post) {
      return res.status(404).json({ error: 'Пост не найден' });
    }

    db.get(
      `SELECT id FROM likes WHERE user_id = ? AND post_id = ?`,
      [userId, id],
      (err, existingLike) => {
        if (err) {
          console.error('Ошибка проверки лайка:', err.message);
          return res.status(500).json({ error: 'Ошибка при обработке лайка' });
        }

        if (existingLike) {
          // Убираем лайк
          db.serialize(() => {
            db.run(`DELETE FROM likes WHERE id = ?`, [existingLike.id]);
            db.run(
              `UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?`,
              [id],
              (err) => {
                if (err) return res.status(500).json({ error: 'Ошибка при обработке лайка' });
                db.get(`SELECT likes_count FROM posts WHERE id = ?`, [id], (err, row) => {
                  if (err || !row) return res.status(500).json({ error: 'Ошибка получения данных' });
                  res.json({ liked: false, likesCount: row.likes_count });
                });
              }
            );
          });
        } else {
          // Ставим лайк
          const likeId = uuidv4();
          const now    = Math.floor(Date.now() / 1000);

          db.serialize(() => {
            db.run(
              `INSERT INTO likes (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)`,
              [likeId, userId, id, now]
            );
            db.run(
              `UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?`,
              [id],
              (err) => {
                if (err) return res.status(500).json({ error: 'Ошибка при обработке лайка' });
                db.get(`SELECT likes_count FROM posts WHERE id = ?`, [id], (err, row) => {
                  if (err || !row) return res.status(500).json({ error: 'Ошибка получения данных' });
                  res.json({ liked: true, likesCount: row.likes_count });
                });
              }
            );
          });
        }
      }
    );
  });
});


// Монтируем роутер комментариев к постам
router.use('/:postId/comments', postCommentsRouter);


module.exports = { router, fetchPosts, optionalAuth };
