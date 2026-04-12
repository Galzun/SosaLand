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
// Файлы сохраняются в backend/uploads/, доступны по /uploads/<имя>
// Максимальный размер: 50 МБ на файл

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/logActivity');

const router = express.Router();

// Декодируем имя файла: браузер отправляет UTF-8, но multer читает как Latin-1
function decodeFileName(name) {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

const UPLOADS_DIR   = path.join(__dirname, '../uploads');
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 ГБ на файл
const MAX_FILES     = 200;              // максимум файлов за один запрос

// Создаём папку uploads, если её нет
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('Создана папка uploads/');
}

// MIME-типы, разрешённые для поля "image"
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
]);

// multer.diskStorage — куда и под каким именем сохранять файлы
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),

  // filename: timestamp_random.ext — гарантирует уникальность
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random    = Math.floor(Math.random() * 1_000_000);
    const ext       = path.extname(file.originalname).toLowerCase();
    cb(null, `${timestamp}_${random}${ext}`);
  },
});

// fileFilter: ограничиваем по типу в зависимости от поля
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'file' || file.fieldname === 'files[]') {
    // Вложения в сообщениях и постах — любой тип
    cb(null, true);
  } else if (file.fieldname === 'image') {
    // Галерея и обложки — только изображения
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
// Загружает файл(ы) и возвращает информацию о них.
//
// Одиночный файл (поле "image" или "file"):
//   Ответ: { url, fileUrl, fileType, fileName }
//
// Несколько файлов (поле "files[]"):
//   Ответ: { files: [ { url, fileUrl, fileType, fileName }, ... ] }
//
// url — алиас fileUrl для обратной совместимости
// ---------------------------------------------------------------------------
router.post('/', requireAuth, (req, res) => {
  upload.fields([
    { name: 'image',   maxCount: 1        },
    { name: 'file',    maxCount: 1        },
    { name: 'files[]', maxCount: MAX_FILES },
  ])(req, res, (err) => {
    // Ошибки multer
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Файл слишком большой. Максимум 1 ГБ' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: `Можно загрузить не более ${MAX_FILES} файлов за раз` });
      }
      return res.status(400).json({ error: `Ошибка загрузки: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    // --- Многофайловый режим (files[]) ---
    const multiFiles = req.files?.['files[]'];
    if (multiFiles && multiFiles.length > 0) {
      const result = multiFiles.map(file => ({
        url:      `/uploads/${file.filename}`, // обратная совместимость
        fileUrl:  `/uploads/${file.filename}`,
        fileType: file.mimetype,
        fileName: decodeFileName(file.originalname),
        size:     file.size,
      }));

      // Логируем каждый файл отдельно для детального трекинга
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
      for (const file of multiFiles) {
        logActivity({
          userId:     req.user.id,
          username:   req.user.username,
          action:     'file_upload',
          targetType: req.body?.context || 'post',
          fileName:   decodeFileName(file.originalname),
          fileType:   file.mimetype,
          fileSize:   file.size,
          fileCount:  1,
          ip:         clientIp,
        });
      }

      return res.json({ files: result });
    }

    // --- Одиночный файл (image или file) ---
    const single = req.files?.image?.[0] || req.files?.file?.[0];
    if (!single) {
      return res.status(400).json({
        error: 'Файл не передан. Используйте поле "image", "file" или "files[]"',
      });
    }

    const fileUrl  = `/uploads/${single.filename}`;
    const fileType = single.mimetype;
    const fileName = decodeFileName(single.originalname);

    // Определяем контекст: image-поле → обложка/галерея, file-поле → сообщение
    const singleContext = req.files?.image ? 'cover' : 'message';
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    logActivity({
      userId:     req.user.id,
      username:   req.user.username,
      action:     'file_upload',
      targetType: req.body?.context || singleContext,
      fileName,
      fileType,
      fileSize:   single.size,
      fileCount:  1,
      ip:         clientIp,
    });

    res.json({
      url:      fileUrl, // обратная совместимость (ImageUpload, EditProfile используют data.url)
      fileUrl,
      fileType,
      fileName,
      size: single.size,
    });
  });
});


module.exports = router;
