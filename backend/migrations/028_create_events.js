// migrations/028_create_events.js
// Создаёт таблицу events для хранения событий сервера.
// Также добавляет колонку event_id в таблицу comments для комментариев к событиям.

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Таблица событий
      db.run(`
        CREATE TABLE IF NOT EXISTS events (
          id                TEXT PRIMARY KEY,
          author_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title             TEXT NOT NULL,
          slug              TEXT UNIQUE,
          preview_image_url TEXT,
          content_main      TEXT NOT NULL DEFAULT '',
          content_results   TEXT,
          start_time        INTEGER NOT NULL,
          end_time          INTEGER,
          is_published      INTEGER DEFAULT 1,
          published_at      INTEGER NOT NULL,
          updated_at        INTEGER,
          edited_count      INTEGER DEFAULT 0,
          views             INTEGER DEFAULT 0,
          created_at        INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => {
        if (err && !err.message.includes('already exists')) return reject(err);
        console.log('  → таблица events создана');
      });

      db.run(
        `CREATE INDEX IF NOT EXISTS idx_events_slug         ON events(slug)`,
        (err) => { if (err) return reject(err); }
      );
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_events_published_at ON events(published_at)`,
        (err) => { if (err) return reject(err); }
      );
      db.run(
        `CREATE INDEX IF NOT EXISTS idx_events_start_time   ON events(start_time)`,
        (err) => { if (err) return reject(err); }
      );

      // Добавляем event_id в comments (для комментариев к событиям)
      db.run(
        `ALTER TABLE comments ADD COLUMN event_id TEXT REFERENCES events(id) ON DELETE CASCADE`,
        (err) => {
          if (err && !err.message.includes('duplicate column')) return reject(err);
          console.log('  → comments.event_id добавлена');
        }
      );

      db.run(
        `CREATE INDEX IF NOT EXISTS idx_comments_event_id ON comments(event_id)`,
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
