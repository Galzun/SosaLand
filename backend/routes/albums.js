// routes/albums.js
// Именные пользовательские альбомы. Отличие от group_id в images:
// это тематические коллекции, создаваемые вручную.
//
// GET    /api/albums?userId=X            — список альбомов пользователя
// POST   /api/albums                     — создать альбом { name, isPublic? }
// PUT    /api/albums/:id                 — переименовать / изменить видимость { name?, isPublic? }
// DELETE /api/albums/:id                 — удалить альбом (фото в images НЕ удаляются)
// GET    /api/albums/:id/images          — фото внутри альбома
// POST   /api/albums/:id/images          — добавить фото { imageIds: [] }
// DELETE /api/albums/:id/images/:imageId — удалить медиа из альбома И из images + с диска

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logActivity, markFileDeletedInLogs } = require('../utils/logActivity');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '../uploads');

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

function dbAll(sql, p) { return new Promise((r, e) => db.all(sql, p, (err, rows) => err ? e(err) : r(rows))); }
function dbRun(sql, p)  { return new Promise((r, e) => db.run(sql, p, (err) => err ? e(err) : r())); }
function dbGet(sql, p)  { return new Promise((r, e) => db.get(sql, p, (err, row) => err ? e(err) : r(row))); }

// ---------------------------------------------------------------------------
// GET /api/albums?userId=X
// Владелец видит все альбомы, остальные — только публичные (is_public = 1)
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId обязателен' });

  const whereClause = 'WHERE a.user_id = ?';

  try {
    const rows = await dbAll(`
      SELECT
        a.id, a.name, a.created_at, a.updated_at,
        COUNT(ai.id) AS count,
        (
          SELECT i.image_url FROM album_images ai2
          JOIN images i ON i.id = ai2.image_id
          WHERE ai2.album_id = a.id
          ORDER BY ai2.added_at ASC
          LIMIT 1
        ) AS cover_url,
        (
          SELECT i.file_type FROM album_images ai2
          JOIN images i ON i.id = ai2.image_id
          WHERE ai2.album_id = a.id
          ORDER BY ai2.added_at ASC
          LIMIT 1
        ) AS cover_file_type
      FROM albums a
      LEFT JOIN album_images ai ON ai.album_id = a.id
      ${whereClause}
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `, [userId]);

    res.json(rows.map(a => ({
      id:            a.id,
      name:          a.name,
      count:         Number(a.count) || 0,
      coverUrl:      a.cover_url       || null,
      coverFileType: a.cover_file_type || null,
      createdAt:     Number(a.created_at),
      updatedAt:     a.updated_at ? Number(a.updated_at) : null,
    })));
  } catch (err) {
    console.error('Ошибка получения альбомов:', err.message);
    res.status(500).json({ error: 'Ошибка при получении альбомов' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/albums — создать альбом
// ---------------------------------------------------------------------------
router.post('/', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название альбома обязательно' });
  }
  const id       = uuidv4();
  const now      = Math.floor(Date.now() / 1000);
  const trimName = name.trim().slice(0, 100);

  try {
    await dbRun(
      `INSERT INTO albums (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [id, req.user.id, trimName, now, now]
    );
    res.status(201).json({ id, name: trimName, count: 0, coverUrl: null, createdAt: now, updatedAt: now });
  } catch (err) {
    console.error('Ошибка создания альбома:', err.message);
    res.status(500).json({ error: 'Ошибка при создании альбома' });
  }
});


// ---------------------------------------------------------------------------
// PUT /api/albums/:id — переименовать и/или изменить видимость
// ---------------------------------------------------------------------------
router.put('/:id', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Название альбома обязательно' });
  }
  try {
    const album = await dbGet(`SELECT id, user_id FROM albums WHERE id = ?`, [req.params.id]);
    if (!album) return res.status(404).json({ error: 'Альбом не найден' });
    if (album.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет прав' });
    }
    const now     = Math.floor(Date.now() / 1000);
    const newName = name.trim().slice(0, 100);
    await dbRun(`UPDATE albums SET name = ?, updated_at = ? WHERE id = ?`, [newName, now, req.params.id]);
    res.json({ success: true, name: newName });
  } catch (err) {
    console.error('Ошибка переименования альбома:', err.message);
    res.status(500).json({ error: 'Ошибка при переименовании' });
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/albums/:id — удалить альбом + все его фото физически (с диска и из images)
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const album = await dbGet(`SELECT id, user_id FROM albums WHERE id = ?`, [req.params.id]);
    if (!album) return res.status(404).json({ error: 'Альбом не найден' });
    if (album.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет прав' });
    }

    // Собираем все изображения альбома до удаления
    const images = await dbAll(`
      SELECT i.id, i.image_url, i.file_type, i.file_size
      FROM album_images ai
      JOIN images i ON i.id = ai.image_id
      WHERE ai.album_id = ?
    `, [req.params.id]);

    // Удаляем альбом — CASCADE удалит album_images
    await dbRun(`DELETE FROM albums WHERE id = ?`, [req.params.id]);

    // Физически удаляем все изображения альбома
    if (images.length > 0) {
      const ids = images.map(i => i.id);
      const ph  = ids.map(() => '?').join(', ');
      await dbRun(`DELETE FROM images WHERE id IN (${ph})`, ids);

      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
      for (const img of images) {
        deleteFileFromDisk(img.image_url);
        await markFileDeletedInLogs(img.image_url);
        logActivity({
          userId:     req.user.id,
          username:   req.user.username,
          action:     'file_delete',
          targetType: 'album',
          fileName:   img.image_url?.split('/uploads/')[1] || null,
          fileType:   img.file_type || null,
          fileSize:   img.file_size || null,
          fileCount:  1,
          ip:         clientIp,
          details:    { originalUrl: img.image_url },
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления альбома:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении альбома' });
  }
});


// ---------------------------------------------------------------------------
// GET /api/albums/:id/images — фото внутри альбома
// ---------------------------------------------------------------------------
router.get('/:id/images', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 100, 200);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  try {
    const album = await dbGet(`SELECT id FROM albums WHERE id = ?`, [req.params.id]);
    if (!album) return res.status(404).json({ error: 'Альбом не найден' });

    const rows = await dbAll(`
      SELECT
        i.id, i.image_url, i.file_type, i.file_size, i.is_video, i.title, i.created_at,
        u.id AS author_id, u.username AS author_username, u.minecraft_uuid AS author_mc_uuid
      FROM album_images ai
      JOIN images i ON i.id = ai.image_id
      JOIN users  u ON u.id = i.user_id
      WHERE ai.album_id = ?
      ORDER BY ai.added_at ASC
      LIMIT ? OFFSET ?
    `, [req.params.id, limit, offset]);

    res.json(rows.map(row => ({
      id:        row.id,
      imageUrl:  row.image_url,
      fileUrl:   row.image_url,
      fileType:  row.file_type || (row.is_video ? 'video/mp4' : 'image/jpeg'),
      isVideo:   !!row.is_video,
      title:     row.title || null,
      createdAt: row.created_at,
      author: {
        id:            row.author_id,
        username:      row.author_username,
        minecraftUuid: row.author_mc_uuid || null,
        avatarUrl:     row.author_mc_uuid
          ? `https://crafatar.icehost.xyz/avatars/${row.author_mc_uuid}?size=64&overlay`
          : null,
      },
    })));
  } catch (err) {
    console.error('Ошибка получения фото альбома:', err.message);
    res.status(500).json({ error: 'Ошибка при получении фото' });
  }
});


// ---------------------------------------------------------------------------
// POST /api/albums/:id/images — добавить фото в альбом { imageIds: [] }
// ---------------------------------------------------------------------------
router.post('/:id/images', requireAuth, async (req, res) => {
  const { imageIds } = req.body;
  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    return res.status(400).json({ error: 'imageIds обязателен' });
  }

  try {
    const album = await dbGet(`SELECT id, user_id FROM albums WHERE id = ?`, [req.params.id]);
    if (!album) return res.status(404).json({ error: 'Альбом не найден' });
    if (album.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет прав' });
    }

    const now = Math.floor(Date.now() / 1000);
    for (const imageId of imageIds) {
      const id = uuidv4();
      await dbRun(
        `INSERT INTO album_images (id, album_id, image_id, added_at) VALUES (?, ?, ?, ?) ON CONFLICT (album_id, image_id) DO NOTHING`,
        [id, req.params.id, imageId, now]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка добавления фото в альбом:', err.message);
    res.status(500).json({ error: 'Ошибка при добавлении' });
  }
});


// ---------------------------------------------------------------------------
// DELETE /api/albums/:id/images/:imageId
// Удаляет медиа ВЕЗДЕ: из images (и album_images по CASCADE) + с диска.
// Удаление в других местах (вкладка Фото, глобальная галерея) НЕ трогает альбом.
// ---------------------------------------------------------------------------
router.delete('/:id/images/:imageId', requireAuth, async (req, res) => {
  try {
    const album = await dbGet(`SELECT id, user_id FROM albums WHERE id = ?`, [req.params.id]);
    if (!album) return res.status(404).json({ error: 'Альбом не найден' });
    if (album.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет прав' });
    }

    // Убеждаемся, что медиа действительно находится в этом альбоме
    const link = await dbGet(
      `SELECT id FROM album_images WHERE album_id = ? AND image_id = ?`,
      [req.params.id, req.params.imageId]
    );
    if (!link) return res.status(404).json({ error: 'Медиа не найдено в альбоме' });

    // Получаем данные файла (для удаления с диска и логирования)
    const image = await dbGet(
      `SELECT id, image_url, file_type, file_size FROM images WHERE id = ?`,
      [req.params.imageId]
    );

    // Удаляем из images — CASCADE уберёт album_images автоматически
    if (image) {
      await dbRun(`DELETE FROM images WHERE id = ?`, [req.params.imageId]);
      deleteFileFromDisk(image.image_url);
      await markFileDeletedInLogs(image.image_url);
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
      logActivity({
        userId:     req.user.id,
        username:   req.user.username,
        action:     'file_delete',
        targetType: 'album',
        fileName:   image.image_url?.split('/uploads/')[1] || null,
        fileType:   image.file_type || null,
        fileSize:   image.file_size || null,
        fileCount:  1,
        ip:         clientIp,
        details:    { originalUrl: image.image_url },
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления медиа из альбома:', err.message);
    res.status(500).json({ error: 'Ошибка при удалении' });
  }
});


module.exports = { router };
