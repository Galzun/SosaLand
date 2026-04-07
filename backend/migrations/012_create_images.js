// migrations/012_create_images.js
// Создаёт таблицу images для хранения фотографий пользователей.
//
// Структура:
//   id         — уникальный идентификатор (UUID)
//   user_id    — кто загрузил (ссылка на users.id, ON DELETE CASCADE)
//   image_url  — путь к файлу (/uploads/...) или внешний URL
//   title      — название фото (опционально, NULL по умолчанию)
//   created_at — дата загрузки (unix timestamp)
//
// Индексы по user_id (для вкладки «Фото» профиля) и created_at (для сортировки).

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Основная таблица
      db.run(`
        CREATE TABLE IF NOT EXISTS images (
          id         TEXT    PRIMARY KEY,
          user_id    TEXT    NOT NULL,
          image_url  TEXT    NOT NULL,
          title      TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `, (err) => { if (err) return reject(err); });

      // Индекс для быстрой выборки фото одного пользователя
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_images_user_id ON images(user_id)`,
        (err) => { if (err) return reject(err); }
      );

      // Индекс для сортировки по дате (глобальная лента)
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at)`,
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  });
}

module.exports = { up };
