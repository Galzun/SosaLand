// routes/images.js
// Галерея: фото и видео, сгруппированные в альбомы.
//
// Альбом = группа файлов с одинаковым group_id.
// Одиночный файл: group_id = NULL → альбом из 1 элемента.
//
// GET  /api/images                   — глобальная лента альбомов (все пользователи)
// POST /api/images                   — добавить медиа (возвращает альбом)
// DELETE /api/images/:id             — удалить один файл + с диска
// DELETE /api/images/album/:groupId  — удалить весь альбом (все файлы + с диска)

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { imageCommentsRouter } = require('./comments');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '../uploads');

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function deleteFileFromDisk(fileUrl) {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
  const filename = fileUrl.split('/uploads/')[1];
  if (!filename) return;
  fs.unlink(path.join(UPLOADS_DIR, filename), (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Ошибка удаления файла:', filename, err.message);
    }
  });
}

function dbAll(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbRun(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function dbGet(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

// ---------------------------------------------------------------------------
// formatAlbum — строит объект альбома из строк БД.
// stub  — строка с агрегатами (album_id, item_count, created_at, author_*)
// items — строки с индивидуальными файлами этого альбома
// ---------------------------------------------------------------------------
function formatAlbum(stub, items) {
  return {
    albumId:       stub.album_id,
    count:         stub.item_count,
    createdAt:     stub.created_at,
    commentsCount: stub.comments_count || 0,
    author: {
      id:            stub.author_id,
      username:      stub.author_username,
      minecraftUuid: stub.author_minecraft_uuid || null,
      avatarUrl: stub.author_minecraft_uuid
        ? `https://crafatar.icehost.xyz/avatars/${stub.author_minecraft_uuid}?size=64&overlay`
        : null,
    },
    items: items.map(row => ({
      id:        row.id,
      imageUrl:  row.image_url,
      fileUrl:   row.image_url,
      fileType:  row.file_type || (row.is_video ? 'video/mp4' : 'image/jpeg'),
      fileSize:  row.file_size  || null,
      isVideo:   !!row.is_video,
      title:     row.title     || null,
      createdAt: row.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// getAlbums — общая функция пагинированной выборки альбомов.
// whereClause / whereParams — фильтрация (например, WHERE i.user_id = ?)
// ---------------------------------------------------------------------------
async function getAlbums(whereClause, whereParams, limit, offset) {
  // Шаг 1: получаем страницу групп (album_id, мета) — LIMIT по группам
  const stubs = await dbAll(`
    SELECT
      COALESCE(i.group_id, i.id)  AS album_id,
      MIN(i.created_at)           AS created_at,
      COUNT(*)                    AS item_count,
      (
        SELECT COUNT(*) FROM comments c
        JOIN images img2 ON c.image_id = img2.id
        WHERE COALESCE(img2.group_id, img2.id) = COALESCE(i.group_id, i.id)
      ) AS comments_count,
      u.id             AS author_id,
      u.username       AS author_username,
      u.minecraft_uuid AS author_minecraft_uuid
    FROM images i
    JOIN users u ON u.id = i.user_id
    ${whereClause}
    GROUP BY COALESCE(i.group_id, i.id)
    ORDER BY MIN(i.created_at) DESC
    LIMIT ? OFFSET ?
  `, [...whereParams, limit, offset]);

  if (!stubs.length) return [];

  // Шаг 2: получаем все файлы для найденных альбомов
  const albumIds    = stubs.map(s => s.album_id);
  const placeholders = albumIds.map(() => '?').join(', ');

  const rows = await dbAll(`
    SELECT
      COALESCE(i.group_id, i.id) AS album_id,
      i.id, i.image_url, i.file_type, i.file_size, i.is_video, i.title, i.created_at
    FROM images i
    WHERE COALESCE(i.group_id, i.id) IN (${placeholders})
    ORDER BY i.rowid ASC
  `, albumIds);

  // Группируем файлы по album_id
  const byAlbum = {};
  for (const row of rows) {
    if (!byAlbum[row.album_id]) byAlbum[row.album_id] = [];
    byAlbum[row.album_id].push(row);
  }

  return stubs.map(stub => formatAlbum(stub, byAlbum[stub.album_id] || []));
}


// ---------------------------------------------------------------------------
// GET /api/images — глобальная лента альбомов всех пользователей.
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 30, 60);
  const offset = Math.max(parseInt(req.query.offset) || 0,  0);

  try {
    const albums = await getAlbums('', [], limit, offset);
    res.json(albums);
  } catch (err) {
    console.error('Ошибка получения галереи:', err.message);
    res.status(500).json({ error: 'Ошибка при получении галереи' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/images — добавить медиа в галерею.
//
// Формат 1 (старый, один файл):
//   { imageUrl: string, title?: string }
//
// Формат 2 (новый, пакетный):
//   { files: [{fileUrl, fileType, fileName?, size?}], title?: string }
//
// Возвращает объект альбома.
// ---------------------------------------------------------------------------
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const now    = Math.floor(Date.now() / 1000);

  // ---------- Формат 2: массив файлов (пакетный) ----------
  if (Array.isArray(req.body.files)) {
    const { files, title } = req.body;

    if (files.length === 0) return res.status(400).json({ error: 'Массив files пустой' });
    if (files.length > 10)  return res.status(400).json({ error: 'Максимум 10 файлов за раз' });

    const cleanTitle = title ? String(title).trim().slice(0, 200) : null;
    const groupId    = files.length > 1 ? uuidv4() : null; // group_id только для батча
    const createdIds = [];

    try {
      for (const f of files) {
        if (!f.fileUrl || typeof f.fileUrl !== 'string') continue;

        const id       = uuidv4();
        const fileUrl  = f.fileUrl.trim();
        const fileType = f.fileType || 'application/octet-stream';
        const fileSize = f.size     || null;
        const isVideo  = fileType.startsWith('video/') ? 1 : 0;

        await dbRun(
          `INSERT INTO images
             (id, user_id, image_url, file_type, file_size, is_video, group_id, title, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, userId, fileUrl, fileType, fileSize, isVideo, groupId, cleanTitle, now]
        );
        createdIds.push(id);
      }

      if (createdIds.length === 0) return res.status(400).json({ error: 'Нет корректных файлов' });

      // Получаем созданный альбом
      const albumKey = groupId || createdIds[0];
      const albums   = await getAlbums(
        `WHERE COALESCE(i.group_id, i.id) = ?`,
        [albumKey],
        1,
        0
      );

      res.status(201).json(albums[0] || { albumId: albumKey, items: [], count: 0 });
    } catch (err) {
      console.error('Ошибка пакетного добавления:', err.message);
      res.status(500).json({ error: 'Ошибка при добавлении медиа' });
    }
    return;
  }

  // ---------- Формат 1: один imageUrl (совместимость) ----------
  const { imageUrl, title } = req.body;

  if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
    return res.status(400).json({ error: 'Поле imageUrl обязательно' });
  }

  const id         = uuidv4();
  const cleanUrl   = imageUrl.trim();
  const cleanTitle = title ? String(title).trim().slice(0, 200) : null;

  try {
    await dbRun(
      `INSERT INTO images (id, user_id, image_url, title, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, userId, cleanUrl, cleanTitle, now]
    );

    const albums = await getAlbums(`WHERE i.id = ?`, [id], 1, 0);
    res.status(201).json(albums[0] || { albumId: id, items: [], count: 0 });
  } catch (err) {
    console.error('Ошибка добавления фото:', err.message);
    res.status(500).json({ error: 'Ошибка при добавлении фото' });
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/images/album/:groupId — удалить весь альбом.
// groupId может быть реальным group_id (многофайловый батч)
// или image.id (одиночный файл без group_id).
// ---------------------------------------------------------------------------
router.delete('/album/:groupId', requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const userId      = req.user.id;
  const userRole    = req.user.role;

  try {
    // Находим все файлы альбома
    const images = await dbAll(
      `SELECT id, user_id, image_url
       FROM images
       WHERE COALESCE(group_id, id) = ?`,
      [groupId]
    );

    if (images.length === 0) return res.status(404).json({ error: 'Альбом не найден' });

    // Проверяем права (достаточно проверить первый файл — они все одного владельца)
    if (images[0].user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'Нет прав для удаления' });
    }

    const ids          = images.map(img => img.id);
    const placeholders = ids.map(() => '?').join(', ');

    await dbRun(`DELETE FROM images WHERE id IN (${placeholders})`, ids);

    // Удаляем файлы с диска
    images.forEach(img => deleteFileFromDisk(img.image_url));

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Ошибка удаления альбома:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении альбома' });
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/images/:id — удалить один файл из базы и с диска.
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id }   = req.params;
  const userId   = req.user.id;
  const userRole = req.user.role;

  try {
    const image = await dbGet(
      `SELECT id, user_id, image_url FROM images WHERE id = ?`, [id]
    );

    if (!image) return res.status(404).json({ error: 'Медиа не найдено' });

    if (image.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'Нет прав для удаления' });
    }

    await dbRun(`DELETE FROM images WHERE id = ?`, [id]);
    deleteFileFromDisk(image.image_url);

    res.json({ success: true, id });
  } catch (err) {
    console.error('Ошибка удаления медиа:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении' });
  }
});


// Комментарии к отдельному изображению
router.use('/:imageId/comments', imageCommentsRouter);


module.exports = { router, getAlbums };
