// migrations/020_add_video_fields.js
// Добавляет поля медиа-метаданных в таблицу images для поддержки видео.
//
// Новые колонки:
//   file_type  — MIME-тип файла (image/jpeg, video/mp4 и т.д.)
//   file_size  — размер файла в байтах
//   duration   — длительность в секундах (для видео)
//   width      — ширина в пикселях
//   height     — высота в пикселях
//   is_video   — 0/1, флаг видео для удобной фильтрации
//
// image_url уже nullable (TEXT без NOT NULL) — без изменений.

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const columns = [
        `ALTER TABLE images ADD COLUMN file_type  TEXT`,
        `ALTER TABLE images ADD COLUMN file_size  INTEGER`,
        `ALTER TABLE images ADD COLUMN duration   INTEGER`,
        `ALTER TABLE images ADD COLUMN width      INTEGER`,
        `ALTER TABLE images ADD COLUMN height     INTEGER`,
        `ALTER TABLE images ADD COLUMN is_video   INTEGER DEFAULT 0`,
      ];

      columns.forEach(sql => {
        db.run(sql, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            return reject(err);
          }
        });
      });

      // Индекс для фильтрации по типу медиа
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_images_is_video ON images(is_video)`,
        (err) => { if (err) return reject(err); }
      );

      // Проставляем is_video = 1 для уже существующих видео (если вдруг были)
      db.run(
        `UPDATE images SET is_video = 0 WHERE is_video IS NULL`,
        (err) => { if (err) return reject(err); }
      );

      db.run(`SELECT 1`, (err) => {
        if (err) return reject(err);
        console.log('  → поля видео-метаданных добавлены в images');
        resolve();
      });
    });
  });
}

module.exports = { up };
