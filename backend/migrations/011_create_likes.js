// migrations/011_create_likes.js
// Создаёт таблицу likes для хранения лайков к постам.
//
// Структура:
//   id         — уникальный идентификатор лайка (UUID)
//   user_id    — кто поставил лайк (ссылка на users.id)
//   post_id    — какому посту (ссылка на posts.id)
//   created_at — дата лайка (unix timestamp)
//
// Ограничение UNIQUE(user_id, post_id) гарантирует, что
// один пользователь может лайкнуть один пост только один раз.
// ON DELETE CASCADE удаляет лайки при удалении пользователя или поста.

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS likes (
        id         TEXT    PRIMARY KEY,
        user_id    TEXT    NOT NULL,
        post_id    TEXT    NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(user_id, post_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = { up };
