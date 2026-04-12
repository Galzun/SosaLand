// migrations/026_add_show_in_profile_to_images.js
// Добавляет колонку show_in_profile в таблицу images.
//   show_in_profile = 1 (default): медиа видно на вкладке «Фото» профиля
//   show_in_profile = 0: медиа скрыто с вкладки «Фото» (но остаётся в альбомах и на диске)
// Все существующие записи получают show_in_profile = 1 (поведение не меняется).

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.run(
      `ALTER TABLE images ADD COLUMN show_in_profile INTEGER DEFAULT 1`,
      (err) => {
        if (err && err.message.includes('duplicate column name')) {
          return resolve();
        }
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

module.exports = { up };
