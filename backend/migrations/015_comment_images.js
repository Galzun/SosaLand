// migrations/015_comment_images.js
// Добавляет поле image_url в таблицу comments — для прикрепления фото к комментарию.

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.run(
      `ALTER TABLE comments ADD COLUMN image_url TEXT`,
      (err) => {
        // Игнорируем ошибку "duplicate column" — миграция уже применена
        if (err && !err.message.includes('duplicate column')) return reject(err);
        resolve();
      }
    );
  });
}

module.exports = { up };
