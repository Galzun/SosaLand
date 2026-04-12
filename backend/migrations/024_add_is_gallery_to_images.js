// migrations/024_add_is_gallery_to_images.js
// Добавляет колонку is_gallery в таблицу images.
//   is_gallery = 1 (default): файл виден в глобальной галерее (/gallery)
//   is_gallery = 0: файл виден только в профиле пользователя (/player/:username)
// Все существующие записи получают is_gallery = 1 (поведение не меняется).

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.run(
      `ALTER TABLE images ADD COLUMN is_gallery INTEGER DEFAULT 1`,
      (err) => {
        if (err && err.message.includes('duplicate column name')) {
          return resolve(); // уже добавлена — не ошибка
        }
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

module.exports = { up };
