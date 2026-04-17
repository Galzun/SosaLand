// routes/images.js
// Галерея: фото и видео, сгруппированные в альбомы.
//
// Альбом = группа файлов с одинаковым group_id.
// Одиночный файл: group_id = NULL → альбом из 1 элемента.
//
// GET    /api/images                   — глобальная лента альбомов (все пользователи)
// POST   /api/images                   — добавить медиа (возвращает альбом)
// DELETE /api/images/:id               — физически удалить одно медиа + с диска
// DELETE /api/images/group/:groupId    — физически удалить всю группу (пак) + с диска
// DELETE /api/images/album/:groupId    — скрыть пак из галереи (is_gallery=0, файлы остаются)

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, ROLE_LEVEL } = require('../middleware/auth');
const { imageCommentsRouter } = require('./comments');
const { logActivity, markFileDeletedInLogs } = require('../utils/logActivity');
const { deleteFileAsync } = require('../utils/storage');

const router = express.Router();

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

function deleteFileFromDisk(fileUrl) {
  deleteFileAsync(fileUrl);
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
    count:         Number(stub.item_count)    || 0,
    createdAt:     Number(stub.created_at),
    commentsCount: Number(stub.comments_count) || 0,
    author: {
      id:            stub.author_id,
      username:      stub.author_username,
      minecraftUuid: stub.author_minecraft_uuid || null,
      avatarUrl: stub.author_minecraft_uuid
        ? `https://crafatar.icehost.xyz/avatars/${stub.author_minecraft_uuid}?size=64&overlay`
        : null,
    },
    items: items.map(row => ({
      id:                  row.id,
      imageUrl:            row.image_url,
      fileUrl:             row.image_url,
      fileType:            row.file_type || (row.is_video ? 'video/mp4' : 'image/jpeg'),
      fileSize:            row.file_size  || null,
      isVideo:             !!row.is_video,
      title:               row.title     || null,
      createdAt:           row.created_at,
      albumName:           row.named_album_name  || null,
      albumOwnerUsername:  row.named_album_owner  || null,
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
      COUNT(DISTINCT i.id)        AS item_count,
      COUNT(DISTINCT c.id)        AS comments_count,
      u.id             AS author_id,
      u.username       AS author_username,
      u.minecraft_uuid AS author_minecraft_uuid
    FROM images i
    JOIN users u ON u.id = i.user_id
    LEFT JOIN comments c ON c.image_id = i.id
    ${whereClause}
    GROUP BY COALESCE(i.group_id, i.id), u.id, u.username, u.minecraft_uuid
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
      i.id, i.image_url, i.file_type, i.file_size, i.is_video, i.title, i.created_at,
      (SELECT a.name FROM album_images ai JOIN albums a ON a.id = ai.album_id WHERE ai.image_id = i.id LIMIT 1) AS named_album_name,
      (SELECT u.username FROM album_images ai JOIN albums a ON a.id = ai.album_id JOIN users u ON u.id = a.user_id WHERE ai.image_id = i.id LIMIT 1) AS named_album_owner
    FROM images i
    WHERE COALESCE(i.group_id, i.id) IN (${placeholders})
    ORDER BY i.created_at ASC, i.id ASC
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
    const albums = await getAlbums('WHERE i.is_gallery = 1', [], limit, offset);
    res.json(albums);
  } catch (err) {
    console.error('Ошибка получения галереи:', err.message);
    res.status(500).json({ error: 'Ошибка при получении галереи' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/images/item/:id — получить одно фото по ID (для прямой ссылки /gallery?image=id).
// Возвращает объект изображения с данными автора и group_id для навигации.
// ---------------------------------------------------------------------------
router.get('/item/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const row = await dbGet(`
      SELECT
        i.id, i.image_url, i.file_type, i.file_size, i.is_video, i.title,
        i.group_id, i.created_at, i.is_gallery,
        u.id AS author_id, u.username AS author_username, u.minecraft_uuid AS author_minecraft_uuid
      FROM images i
      JOIN users u ON u.id = i.user_id
      WHERE i.id = ?
    `, [id]);

    if (!row) return res.status(404).json({ error: 'Фото не найдено' });

    res.json({
      id:                  row.id,
      imageUrl:            row.image_url,
      fileUrl:             row.image_url,
      fileType:            row.file_type || (row.is_video ? 'video/mp4' : 'image/jpeg'),
      fileSize:            row.file_size || null,
      isVideo:             !!row.is_video,
      title:               row.title    || null,
      groupId:             row.group_id || null,
      isGallery:           !!row.is_gallery,
      createdAt:           row.created_at,
      author: {
        id:            row.author_id,
        username:      row.author_username,
        minecraftUuid: row.author_minecraft_uuid || null,
        avatarUrl: row.author_minecraft_uuid
          ? `https://crafatar.icehost.xyz/avatars/${row.author_minecraft_uuid}?size=64&overlay`
          : null,
      },
    });
  } catch (err) {
    console.error('Ошибка получения фото:', err.message);
    res.status(500).json({ error: 'Ошибка при получении фото' });
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
    const { files, title, isGallery, showInProfile } = req.body;
    const galleryFlag = isGallery !== false ? 1 : 0;
    const profileFlag = showInProfile !== false ? 1 : 0;

    if (files.length === 0) return res.status(400).json({ error: 'Массив files пустой' });

    const batchTitle = title ? String(title).trim().slice(0, 200) : null;
    const groupId    = files.length > 1 ? uuidv4() : null; // group_id только для батча
    const createdIds = [];

    try {
      for (const f of files) {
        if (!f.fileUrl || typeof f.fileUrl !== 'string') continue;

        const id         = uuidv4();
        const fileUrl    = f.fileUrl.trim();
        const fileType   = f.fileType || 'application/octet-stream';
        const fileSize   = f.size     || null;
        const isVideo    = fileType.startsWith('video/') ? 1 : 0;
        // Пользовательская подпись имеет приоритет; если не задана — сохраняем оригинальное имя файла
        const cleanTitle = batchTitle || (f.fileName ? String(f.fileName).trim().slice(0, 200) : null);

        await dbRun(
          `INSERT INTO images
             (id, user_id, image_url, file_type, file_size, is_video, group_id, title, is_gallery, show_in_profile, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, userId, fileUrl, fileType, fileSize, isVideo, groupId, cleanTitle, galleryFlag, profileFlag, now]
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
  const { imageUrl, title, isGallery: isGallery1 } = req.body;
  const galleryFlag1 = isGallery1 !== false ? 1 : 0;

  if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
    return res.status(400).json({ error: 'Поле imageUrl обязательно' });
  }

  const id         = uuidv4();
  const cleanUrl   = imageUrl.trim();
  const cleanTitle = title ? String(title).trim().slice(0, 200) : null;

  try {
    await dbRun(
      `INSERT INTO images (id, user_id, image_url, title, is_gallery, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, cleanUrl, cleanTitle, galleryFlag1, now]
    );

    const albums = await getAlbums(`WHERE i.id = ?`, [id], 1, 0);
    res.status(201).json(albums[0] || { albumId: id, items: [], count: 0 });
  } catch (err) {
    console.error('Ошибка добавления фото:', err.message);
    res.status(500).json({ error: 'Ошибка при добавлении фото' });
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/images/group/:groupId — удалить пак из вкладки «Фото» профиля.
//
// Иерархия: профиль > галерея. Для каждого файла:
//   — если в именном альбоме → show_in_profile=0, is_gallery=0 (диск не трогать)
//   — иначе → физически удалить из БД + с диска
// ---------------------------------------------------------------------------
router.delete('/group/:groupId', requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const userId      = req.user.id;
  const userRole    = req.user.role;

  try {
    const images = await dbAll(
      `SELECT id, user_id, image_url, file_type, file_size FROM images WHERE COALESCE(group_id, id) = ?`,
      [groupId]
    );

    if (images.length === 0) return res.status(404).json({ error: 'Медиа не найдено' });

    if (images[0].user_id !== userId && ROLE_LEVEL[userRole] < ROLE_LEVEL.admin) {
      return res.status(403).json({ error: 'Нет прав для удаления' });
    }

    const ids          = images.map(img => img.id);
    const placeholders = ids.map(() => '?').join(', ');

    const albumLinked    = await dbAll(
      `SELECT DISTINCT image_id FROM album_images WHERE image_id IN (${placeholders})`, ids
    );
    const albumLinkedSet = new Set(albumLinked.map(r => r.image_id));

    const softIds      = ids.filter(id =>  albumLinkedSet.has(id));
    const physicalImgs = images.filter(img => !albumLinkedSet.has(img.id));

    // Скрыть из профиля и галереи (файл остаётся в альбоме и на диске)
    if (softIds.length > 0) {
      const softPh = softIds.map(() => '?').join(', ');
      await dbRun(`UPDATE images SET show_in_profile = 0, is_gallery = 0 WHERE id IN (${softPh})`, softIds);
    }

    // Физически удалить
    if (physicalImgs.length > 0) {
      const physPh = physicalImgs.map(() => '?').join(', ');
      await dbRun(`DELETE FROM images WHERE id IN (${physPh})`, physicalImgs.map(i => i.id));
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
      for (const img of physicalImgs) {
        deleteFileFromDisk(img.image_url);
        await markFileDeletedInLogs(img.image_url);
        logActivity({
          userId,
          username:   req.user.username,
          action:     'file_delete',
          targetType: 'profile',
          fileName:   img.image_url?.split('/uploads/')[1] || null,
          fileType:   img.file_type || null,
          fileSize:   img.file_size || null,
          fileCount:  1,
          ip:         clientIp,
          details:    { originalUrl: img.image_url },
        });
      }
    }

    res.json({ success: true, hidden: softIds.length, deleted: physicalImgs.length });
  } catch (err) {
    console.error('Ошибка удаления группы медиа:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении' });
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/images/album/:groupId — скрыть пак из глобальной галереи (is_gallery=0).
// Медиа остаётся в профиле и именных альбомах — только скрывается из ленты галереи.
// ---------------------------------------------------------------------------
router.delete('/album/:groupId', requireAuth, async (req, res) => {
  const { groupId } = req.params;
  const userId      = req.user.id;
  const userRole    = req.user.role;

  try {
    const images = await dbAll(
      `SELECT id, user_id FROM images WHERE COALESCE(group_id, id) = ?`,
      [groupId]
    );

    if (images.length === 0) return res.status(404).json({ error: 'Альбом не найден' });

    if (images[0].user_id !== userId && ROLE_LEVEL[userRole] < ROLE_LEVEL.admin) {
      return res.status(403).json({ error: 'Нет прав для удаления' });
    }

    const ids          = images.map(img => img.id);
    const placeholders = ids.map(() => '?').join(', ');
    await dbRun(`UPDATE images SET is_gallery = 0 WHERE id IN (${placeholders})`, ids);

    res.json({ success: true, hidden: ids.length });
  } catch (err) {
    console.error('Ошибка скрытия из галереи:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении' });
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/images/:id — удалить одно медиа из профиля (иерархия: профиль > галерея).
//
// Если файл привязан к именному альбому → скрыть из профиля И галереи (файл остаётся
// в альбоме и на диске). Иначе → физически удалить из БД + с диска.
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req, res) => {
  const { id }   = req.params;
  const userId   = req.user.id;
  const userRole = req.user.role;

  try {
    const image = await dbGet(
      `SELECT id, user_id, image_url, file_type, file_size FROM images WHERE id = ?`, [id]
    );

    if (!image) return res.status(404).json({ error: 'Медиа не найдено' });

    if (image.user_id !== userId && ROLE_LEVEL[userRole] < ROLE_LEVEL.admin) {
      return res.status(403).json({ error: 'Нет прав для удаления' });
    }

    const albumLink = await dbGet(
      `SELECT id FROM album_images WHERE image_id = ?`, [id]
    );

    if (albumLink) {
      // Файл в альбоме — скрыть из профиля и галереи, диск не трогать
      await dbRun(`UPDATE images SET show_in_profile = 0, is_gallery = 0 WHERE id = ?`, [id]);
    } else {
      // Нет в альбоме — физически удалить
      await dbRun(`DELETE FROM images WHERE id = ?`, [id]);
      deleteFileFromDisk(image.image_url);
      await markFileDeletedInLogs(image.image_url);
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
      logActivity({
        userId,
        username:   req.user.username,
        action:     'file_delete',
        targetType: 'profile',
        fileName:   image.image_url?.split('/uploads/')[1] || null,
        fileType:   image.file_type || null,
        fileSize:   image.file_size || null,
        fileCount:  1,
        ip:         clientIp,
        details:    { originalUrl: image.image_url },
      });
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error('Ошибка удаления медиа:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении' });
  }
});


// Комментарии к отдельному изображению
router.use('/:imageId/comments', imageCommentsRouter);


module.exports = { router, getAlbums };
