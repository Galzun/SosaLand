// migrations/010_create_posts.js
// Создаёт таблицу posts для хранения публикаций пользователей.
//
// Структура:
//   id          — уникальный идентификатор поста (UUID)
//   user_id     — ссылка на автора (users.id), CASCADE DELETE удалит посты при удалении юзера
//   content     — текст поста (до 5000 символов)
//   image_url   — опциональная картинка к посту
//   likes_count — денормализованный счётчик лайков для быстрых запросов без JOIN
//   created_at  — unix timestamp, проставляется автоматически при вставке
//   updated_at  — обновляется вручную при редактировании поста

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS posts (
        id          TEXT    PRIMARY KEY,
        user_id     TEXT    NOT NULL,
        content     TEXT    NOT NULL,
        image_url   TEXT,
        likes_count INTEGER DEFAULT 0,
        created_at  INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at  INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = { up };
