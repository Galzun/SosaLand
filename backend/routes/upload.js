// routes/upload.js
// Маршрут загрузки файлов.
//
//   POST /api/upload — загрузить один или несколько файлов
//
// Поддерживаемые поля формы:
//   "image"   — одно изображение (jpg, png, gif, webp): галерея, обложка профиля
//   "file"    — один любой файл: вложение в сообщениях
//   "files[]" — несколько любых файлов: вложения в постах и галерее
//
// Файлы сохраняются в S3 (если настроен) или в backend/uploads/ (локально).
// Ограничение: не более 1 ГБ на файл; не более 1 ГБ на пользователя в час.

const express  = require('express');
const multer   = require('multer');
const { requireAuth }    = require('../middleware/auth');
const { logActivity }    = require('../utils/logActivity');
const { uploadFile, generateFilename, deleteFile } = require('../utils/storage');

const router = express.Router();

// ---------------------------------------------------------------------------
// Rate-limiting: 1 ГБ в час на пользователя (in-memory)
// ---------------------------------------------------------------------------
const HOURLY_LIMIT = 1024 * 1024 * 1024; // 1 ГБ
const HOUR_MS      = 60 * 60 * 1000;

const uploadUsage = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of uploadUsage) {
    if (now >= entry.resetAt) uploadUsage.delete(id);
  }
}, HOUR_MS);

function checkHourlyLimit(userId, addBytes) {
  const now = Date.now();
  let entry = uploadUsage.get(userId);
  if (!entry || now >= entry.resetAt) {
    entry = { used: 0, resetAt: now + HOUR_MS };
    uploadUsage.set(userId, entry);
  }
  const remaining = HOURLY_LIMIT - entry.used;
  if (addBytes > remaining) {
    return { allowed: false, used: entry.used, remaining };
  }
  entry.used += addBytes;
  return { allowed: true, used: entry.used, remaining: remaining - addBytes };
}

// Декодируем имя файла: браузер отправляет UTF-8, multer читает как Latin-1
function decodeFileName(name) {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 ГБ на файл
const MAX_FILES     = 200;

// MIME-типы, разрешённые для поля "image"
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
]);

// Файлы хранятся в памяти (buffer), потом отправляются в S3 или на диск
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'file' || file.fieldname === 'files[]') {
    cb(null, true);
  } else if (file.fieldname === 'image') {
    if (IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только изображения: jpg, png, gif, webp'), false);
    }
  } else {
    cb(new Error('Неизвестное поле файла'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });


// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------
router.post('/', requireAuth, (req, res) => {
  upload.fields([
    { name: 'image',   maxCount: 1        },
    { name: 'file',    maxCount: 1        },
    { name: 'files[]', maxCount: MAX_FILES },
  ])(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ error: 'Файл слишком большой. Максимум 1 ГБ' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: `Можно загрузить не более ${MAX_FILES} файлов за раз` });
      return res.status(400).json({ error: `Ошибка загрузки: ${err.message}` });
    }
    if (err) return res.status(400).json({ error: err.message });

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;

    // --- Многофайловый режим (files[]) ---
    const multiFiles = req.files?.['files[]'];
    if (multiFiles && multiFiles.length > 0) {
      const totalSize = multiFiles.reduce((s, f) => s + f.size, 0);
      const limitCheck = checkHourlyLimit(req.user.id, totalSize);
      if (!limitCheck.allowed) {
        const remainingMb = (limitCheck.remaining / (1024 * 1024)).toFixed(0);
        return res.status(429).json({
          error: `Превышен лимит загрузок 1 ГБ в час. Осталось: ${remainingMb} МБ. Попробуйте позже.`,
        });
      }

      try {
        const result = [];
        for (const file of multiFiles) {
          const filename = generateFilename(file.originalname);
          const fileUrl  = await uploadFile(file.buffer, filename, file.mimetype);
          const fileName = decodeFileName(file.originalname);

          result.push({
            url:      fileUrl,
            fileUrl,
            fileType: file.mimetype,
            fileName,
            size:     file.size,
          });

          logActivity({
            userId:     req.user.id,
            username:   req.user.username,
            action:     'file_upload',
            targetType: req.body?.context || 'post',
            targetId:   fileUrl,
            fileName,
            fileType:   file.mimetype,
            fileSize:   file.size,
            fileCount:  1,
            ip:         clientIp,
          });
        }
        return res.json({ files: result });
      } catch (uploadErr) {
        console.error('[upload] Ошибка сохранения файлов:', uploadErr.message);
        return res.status(500).json({ error: 'Ошибка при сохранении файлов' });
      }
    }

    // --- Одиночный файл (image или file) ---
    const single = req.files?.image?.[0] || req.files?.file?.[0];
    if (!single) {
      return res.status(400).json({
        error: 'Файл не передан. Используйте поле "image", "file" или "files[]"',
      });
    }

    const limitCheck = checkHourlyLimit(req.user.id, single.size);
    if (!limitCheck.allowed) {
      const remainingMb = (limitCheck.remaining / (1024 * 1024)).toFixed(0);
      return res.status(429).json({
        error: `Превышен лимит загрузок 1 ГБ в час. Осталось: ${remainingMb} МБ. Попробуйте позже.`,
      });
    }

    try {
      const filename = generateFilename(single.originalname);
      const fileUrl  = await uploadFile(single.buffer, filename, single.mimetype);
      const fileType = single.mimetype;
      const fileName = decodeFileName(single.originalname);

      const singleContext = req.files?.image ? 'cover' : 'message';
      logActivity({
        userId:     req.user.id,
        username:   req.user.username,
        action:     'file_upload',
        targetType: req.body?.context || singleContext,
        targetId:   fileUrl,
        fileName,
        fileType,
        fileSize:   single.size,
        fileCount:  1,
        ip:         clientIp,
      });

      res.json({
        url:  fileUrl, // обратная совместимость
        fileUrl,
        fileType,
        fileName,
        size: single.size,
      });
    } catch (uploadErr) {
      console.error('[upload] Ошибка сохранения файла:', uploadErr.message);
      res.status(500).json({ error: 'Ошибка при сохранении файла' });
    }
  });
});


module.exports = router;
