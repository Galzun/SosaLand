// utils/storage.js
// Абстракция хранилища файлов.
//
// Если заданы S3_BUCKET + S3_ACCESS_KEY + S3_SECRET_KEY → файлы идут в S3 (TimeWeb Object Storage).
// Иначе → локальный диск backend/uploads/ (для локальной разработки).
//
// Экспорт:
//   uploadFile(buffer, filename, mimetype) → Promise<string>  — возвращает публичный URL
//   deleteFile(fileUrl)                    → Promise<void>    — удаляет по URL
//   generateFilename(originalname)         → string           — уникальное имя файла
//   USE_S3                                 → bool
//   S3_PUBLIC_URL                          → string

const path = require('path');
const fs   = require('fs');

const USE_S3 = !!(
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY &&
  process.env.S3_SECRET_KEY
);

// S3-клиент инициализируется лениво, только если USE_S3 = true
let s3Client  = null;
let S3_BUCKET = null;
let S3_PUBLIC_URL = '';

if (USE_S3) {
  const { S3Client } = require('@aws-sdk/client-s3');

  S3_BUCKET = process.env.S3_BUCKET;
  const endpoint  = process.env.S3_ENDPOINT  || 'https://s3.timeweb.cloud';
  const region    = process.env.S3_REGION    || 'ru-1';

  // Публичный базовый URL для файлов (без слэша в конце).
  // По умолчанию TimeWeb раздаёт по схеме: https://<bucket>.s3.timeweb.cloud
  S3_PUBLIC_URL = (
    process.env.S3_PUBLIC_URL || `https://${S3_BUCKET}.s3.timeweb.cloud`
  ).replace(/\/$/, '');

  s3Client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId:     process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
    // forcePathStyle нужен для non-AWS S3 (TimeWeb, MinIO и т.д.)
    forcePathStyle: true,
  });

  console.log(`[storage] S3 хранилище: ${S3_PUBLIC_URL}`);
} else {
  console.log('[storage] Локальный диск (S3 не настроен)');
}

const UPLOADS_DIR = path.join(__dirname, '../uploads');

// ---------------------------------------------------------------------------
// generateFilename — уникальное имя: {timestamp}_{random}.{ext}
// ---------------------------------------------------------------------------
function generateFilename(originalname) {
  const timestamp = Date.now();
  const random    = Math.floor(Math.random() * 1_000_000);
  const ext       = path.extname(originalname || '').toLowerCase();
  return `${timestamp}_${random}${ext}`;
}

// ---------------------------------------------------------------------------
// uploadFile — загрузить файл и вернуть публичный URL
// @param {Buffer} buffer
// @param {string} filename  — уже сгенерированное имя файла
// @param {string} mimetype  — MIME-тип
// @returns {Promise<string>}
// ---------------------------------------------------------------------------
async function uploadFile(buffer, filename, mimetype) {
  if (USE_S3) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await s3Client.send(new PutObjectCommand({
      Bucket:      S3_BUCKET,
      Key:         filename,
      Body:        buffer,
      ContentType: mimetype,
      ACL:         'public-read',
    }));
    return `${S3_PUBLIC_URL}/${filename}`;
  }

  // Локальный диск
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}

// ---------------------------------------------------------------------------
// deleteFile — удалить файл по его публичному URL
// Работает и с S3 URL, и с legacy /uploads/ URL (локальный диск).
// Не бросает исключений — логирует ошибку и продолжает.
// ---------------------------------------------------------------------------
async function deleteFile(fileUrl) {
  if (!fileUrl) return;

  if (USE_S3 && fileUrl.startsWith(S3_PUBLIC_URL)) {
    // Извлекаем ключ из полного URL
    const key = fileUrl.slice(S3_PUBLIC_URL.length).replace(/^\//, '');
    if (!key) return;
    try {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    } catch (err) {
      console.error('[storage.deleteFile] S3 ошибка:', err.message);
    }
    return;
  }

  if (fileUrl.startsWith('/uploads/')) {
    // Legacy: локальный файл
    const filename = fileUrl.slice('/uploads/'.length);
    if (!filename || filename.includes('/') || filename.includes('\\')) return;
    fs.unlink(path.join(UPLOADS_DIR, filename), (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error('[storage.deleteFile] Ошибка удаления:', filename, err.message);
      }
    });
  }
}

// Синхронная обёртка для мест где await недоступен (fire-and-forget)
function deleteFileAsync(fileUrl) {
  deleteFile(fileUrl).catch(err => {
    console.error('[storage.deleteFileAsync]', err.message);
  });
}

module.exports = {
  uploadFile,
  deleteFile,
  deleteFileAsync,
  generateFilename,
  USE_S3,
  get S3_PUBLIC_URL() { return S3_PUBLIC_URL; },
};
