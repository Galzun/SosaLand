// migrations/025_create_albums.js
// Создаёт таблицы для именных альбомов пользователей:
//   albums       — альбом (id, user_id, name)
//   album_images — связь альбом ↔ фото (junction table)
// Отличие от group_id в images: это пользовательские тематические альбомы,
// а не автоматические группы при пакетной загрузке.

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {

      db.run(`
        CREATE TABLE IF NOT EXISTS albums (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name       TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => { if (err) return reject(err); });

      db.run(`
        CREATE TABLE IF NOT EXISTS album_images (
          id       TEXT PRIMARY KEY,
          album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
          image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
          added_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(album_id, image_id)
        )
      `, (err) => { if (err) return reject(err); });

      db.run(`CREATE INDEX IF NOT EXISTS idx_albums_user_id ON albums(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_album_images_album_id ON album_images(album_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_album_images_image_id ON album_images(image_id)`);

      db.run(`SELECT 1`, (err) => err ? reject(err) : resolve());
    });
  });
}

module.exports = { up };
