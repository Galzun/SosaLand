// migrations/022_create_news.js
// Создаёт таблицу news для хранения новостей сервера.
// Также добавляет колонку news_id в таблицу comments для комментариев к новостям.

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Таблица новостей
      db.run(`
        CREATE TABLE IF NOT EXISTS news (
          id               TEXT PRIMARY KEY,
          author_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title            TEXT NOT NULL,
          slug             TEXT UNIQUE,
          preview_image_url TEXT,
          content          TEXT NOT NULL DEFAULT '',
          content_delta    TEXT,
          is_published     INTEGER DEFAULT 1,
          published_at     INTEGER,
          updated_at       INTEGER,
          edited_count     INTEGER DEFAULT 0,
          views            INTEGER DEFAULT 0,
          created_at       INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => {
        if (err && !err.message.includes('already exists')) return reject(err);
        console.log('  → таблица news создана');
      });

      db.run(
        `CREATE INDEX IF NOT EXISTS idx_news_slug         ON news(slug)`,
        (err) => { if (err) return reject(err); }
      );
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at)`,
        (err) => { if (err) return reject(err); }
      );

      // Добавляем news_id в comments (для комментариев к новостям)
      db.run(
        `ALTER TABLE comments ADD COLUMN news_id TEXT REFERENCES news(id) ON DELETE CASCADE`,
        (err) => {
          if (err && !err.message.includes('duplicate column')) return reject(err);
          console.log('  → comments.news_id добавлена');
        }
      );

      db.run(
        `CREATE INDEX IF NOT EXISTS idx_comments_news_id ON comments(news_id)`,
        (err) => { if (err) return reject(err); }
      );

      db.run(`SELECT 1`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

module.exports = { up };
