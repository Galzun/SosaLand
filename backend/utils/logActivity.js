// utils/logActivity.js
// Хелпер для записи событий в activity_logs.
//
// Намеренно не бросает ошибку — сбой логирования не должен ломать основной запрос.
// Используется во всех роутерах, где нужно отслеживать активность.

const { v4: uuidv4 } = require('uuid');
const db = require('../db');

/**
 * logActivity — записать событие в лог активности.
 *
 * @param {object} opts
 * @param {string}  opts.userId     — ID пользователя (из req.user.id)
 * @param {string}  opts.username   — ник пользователя
 * @param {string}  opts.action     — тип действия:
 *                                    'file_upload' | 'post_create' | 'post_delete' |
 *                                    'image_add' | 'comment_create'
 * @param {string}  [opts.targetType] — тип цели: 'post' | 'gallery' | 'message' | 'cover' | 'news' | 'event'
 * @param {string}  [opts.targetId]   — ID связанного объекта
 * @param {string}  [opts.fileName]   — оригинальное имя файла
 * @param {string}  [opts.fileType]   — MIME-тип файла
 * @param {number}  [opts.fileSize]   — размер файла в байтах
 * @param {number}  [opts.fileCount]  — кол-во файлов в батче (по умолчанию 1)
 * @param {string}  [opts.ip]         — IP-адрес клиента
 * @param {object}  [opts.details]    — доп. данные (будет сохранено как JSON-строка)
 */
async function logActivity({
  userId,
  username,
  action,
  targetType = null,
  targetId   = null,
  fileName   = null,
  fileType   = null,
  fileSize   = null,
  fileCount  = 1,
  ip         = null,
  details    = null,
}) {
  try {
    await db.run(
      `INSERT INTO activity_logs
         (id, user_id, username, action, target_type, target_id,
          file_name, file_type, file_size, file_count, ip, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        userId   || null,
        username || 'unknown',
        action,
        targetType,
        targetId,
        fileName,
        fileType,
        fileSize  !== undefined ? fileSize  : null,
        fileCount !== undefined ? fileCount : 1,
        ip,
        details ? JSON.stringify(details) : null,
        Math.floor(Date.now() / 1000),
      ]
    );
  } catch (err) {
    // Логируем ошибку, но не ломаем основной запрос
    console.error('[logActivity] Ошибка записи лога:', err.message);
  }
}

module.exports = { logActivity };
