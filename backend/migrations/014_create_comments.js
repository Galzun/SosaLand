// migrations/014_create_comments.js
// Создаёт таблицу comments для системы комментариев.
//
// Один комментарий относится ровно к одному объекту: посту, фото или профилю.
// Ровно одно из полей post_id / image_id / profile_user_id заполнено, остальные NULL.
//
// Структура:
//   id               — UUID, первичный ключ
//   user_id          — автор комментария → users.id ON DELETE CASCADE
//   post_id          — ссылка на пост (NULL для фото/профиля) → posts.id ON DELETE CASCADE
//   image_id         — ссылка на фото (NULL для поста/профиля) → images.id ON DELETE CASCADE
//   profile_user_id  — профиль пользователя (NULL для поста/фото) → users.id ON DELETE CASCADE
//   content          — текст комментария (до 1000 символов)
//   created_at       — unix timestamp (авто)

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Основная таблица
      db.run(`
        CREATE TABLE IF NOT EXISTS comments (
          id               TEXT    PRIMARY KEY,
          user_id          TEXT    NOT NULL,
          post_id          TEXT,
          image_id         TEXT,
          profile_user_id  TEXT,
          content          TEXT    NOT NULL,
          created_at       INTEGER DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (user_id)         REFERENCES users(id)   ON DELETE CASCADE,
          FOREIGN KEY (post_id)         REFERENCES posts(id)   ON DELETE CASCADE,
          FOREIGN KEY (image_id)        REFERENCES images(id)  ON DELETE CASCADE,
          FOREIGN KEY (profile_user_id) REFERENCES users(id)   ON DELETE CASCADE
        )
      `, (err) => { if (err) return reject(err); });

      // Индекс для быстрой выборки комментариев к посту
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id)`,
        (err) => { if (err) return reject(err); }
      );

      // Индекс для быстрой выборки комментариев к фото
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_comments_image_id ON comments(image_id)`,
        (err) => { if (err) return reject(err); }
      );

      // Индекс для быстрой выборки комментариев к профилю
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_comments_profile_user_id ON comments(profile_user_id)`,
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  });
}

module.exports = { up };
