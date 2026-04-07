// migrations/002_rename_password_to_hash.js
// Вторая миграция — переименовывает колонку password → password_hash.
//
// Зачем: пароли больше не хранятся в открытом виде.
// Bcrypt возвращает строку-хеш (например: "$2b$10$..."), и мы называем
// колонку password_hash, чтобы явно обозначить её назначение.
//
// SQLite поддерживает RENAME COLUMN начиная с версии 3.25.0 (2018).
// Пакет sqlite3 для Node.js использует SQLite 3.46+, поэтому всё ок.

const db = require('../db');

function up() {
  return new Promise((resolve, reject) => {
    // ALTER TABLE ... RENAME COLUMN — безопасно переименовывает колонку.
    // Данные не затрагиваются, индексы и ограничения сохраняются.
    const sql = `ALTER TABLE users RENAME COLUMN password TO password_hash`;

    db.run(sql, (err) => {
      if (err) {
        // Если колонка уже называется password_hash — миграция уже была применена.
        // Это позволяет безопасно запустить migrate повторно.
        if (err.message.includes('no such column') || err.message.includes('duplicate column')) {
          console.log('  (миграция 002 уже была применена, пропускаем)');
          return resolve();
        }
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

module.exports = { up };
