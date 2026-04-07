// migrations/019_post_attachments.js
// Создаёт таблицу вложений к постам (post_attachments).
// Добавляет флаг has_attachments в таблицу posts.
// Мигрирует существующие posts.image_url в post_attachments.
//
// Структура post_attachments:
//   id          — UUID
//   post_id     — ссылка на posts.id (CASCADE DELETE)
//   file_url    — путь к файлу (/uploads/...)
//   file_type   — MIME-тип (image/png, video/mp4, audio/mpeg и т.д.)
//   file_name   — оригинальное имя файла
//   file_size   — размер в байтах
//   duration    — длительность в секундах (для видео и аудио)
//   width       — ширина в пикселях (для изображений и видео)
//   height      — высота в пикселях
//   order_index — порядок отображения (0 = первое)
//   created_at  — unix timestamp

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Создаём таблицу post_attachments
      db.run(`
        CREATE TABLE IF NOT EXISTS post_attachments (
          id          TEXT PRIMARY KEY,
          post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          file_url    TEXT NOT NULL,
          file_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
          file_name   TEXT,
          file_size   INTEGER,
          duration    INTEGER,
          width       INTEGER,
          height      INTEGER,
          order_index INTEGER DEFAULT 0,
          created_at  INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => {
        if (err && !err.message.includes('already exists')) return reject(err);
        console.log('  → post_attachments создана');
      });

      // Индекс для быстрого поиска вложений по посту
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_post_att ON post_attachments(post_id)`,
        (err) => { if (err) return reject(err); }
      );

      // 2. Добавляем флаг has_attachments в posts (денормализация)
      db.run(
        `ALTER TABLE posts ADD COLUMN has_attachments INTEGER DEFAULT 0`,
        (err) => {
          if (err && !err.message.includes('duplicate column')) return reject(err);
          console.log('  → posts.has_attachments добавлена');
        }
      );

      // 3. Ждём завершения DDL, затем мигрируем данные
      db.run(`SELECT 1`, (err) => {
        if (err) return reject(err);
        migrateExisting(resolve, reject);
      });
    });
  });
}

// Определяет MIME-тип по расширению URL (для legacy image_url без известного MIME).
function guessType(url) {
  const ext = (url || '').split('?')[0].split('.').pop()?.toLowerCase() || '';
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
    pdf: 'application/pdf', doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip: 'application/zip', rar: 'application/x-rar-compressed',
  };
  return map[ext] || 'application/octet-stream';
}

// Переносит существующие posts.image_url в таблицу post_attachments.
// Запускается один раз при миграции — повторные запуски безопасны (INSERT OR IGNORE).
function migrateExisting(resolve, reject) {
  const { v4: uuidv4 } = require('uuid');

  // Берём только посты с image_url, которые ещё не помечены как has_attachments
  db.all(
    `SELECT id, image_url
     FROM posts
     WHERE image_url IS NOT NULL
       AND image_url != ''
       AND (has_attachments IS NULL OR has_attachments = 0)`,
    [],
    (err, rows) => {
      if (err) return reject(err);

      if (!rows.length) {
        console.log('  → нет постов для миграции image_url');
        return resolve();
      }

      console.log(`  → мигрируем ${rows.length} постов с image_url...`);

      // db.serialize гарантирует последовательное выполнение INSERT/UPDATE
      db.serialize(() => {
        rows.forEach(row => {
          const attId    = uuidv4();
          const fileName = (row.image_url || '').split('/').pop() || '';
          const fileType = guessType(row.image_url);

          // INSERT OR IGNORE — безопасен при повторном запуске миграции
          db.run(
            `INSERT OR IGNORE INTO post_attachments
               (id, post_id, file_url, file_type, file_name, order_index)
             VALUES (?, ?, ?, ?, ?, 0)`,
            [attId, row.id, row.image_url, fileType, fileName]
          );

          db.run(
            `UPDATE posts SET has_attachments = 1 WHERE id = ?`,
            [row.id]
          );
        });

        // Финальный SELECT подтверждает завершение всех предыдущих запросов
        db.run(`SELECT 1`, (err) => {
          if (err) return reject(err);
          console.log(`  → миграция image_url завершена`);
          resolve();
        });
      });
    }
  );
}

module.exports = { up };
