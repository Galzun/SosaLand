// migrations/005_add_contact_to_tickets.js
// Добавляет колонку contact в таблицу tickets.
// contact — способ связи с пользователем (Discord, Telegram, VK и т.д.)
// Поле необязательное (NULL), поэтому добавляется без NOT NULL.

const db = require('../db');

function up() {
  return new Promise((resolve, reject) => {
    db.run(
      `ALTER TABLE tickets ADD COLUMN contact TEXT`,
      (err) => {
        if (err) {
          // Если колонка уже существует — миграция уже была применена, пропускаем.
          if (err.message.includes('duplicate column')) {
            console.log('  (миграция 005 уже была применена, пропускаем)');
            return resolve();
          }
          return reject(err);
        }
        resolve();
      }
    );
  });
}

module.exports = { up };
