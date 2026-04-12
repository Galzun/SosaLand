// migrations/023_create_polls.js
// Создаёт таблицы для системы опросов:
//   polls        — сам опрос (вопрос, настройки)
//   poll_options — варианты ответа
//   poll_votes   — голоса пользователей

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {

      // ── Таблица опросов ──────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS polls (
          id               TEXT PRIMARY KEY,
          news_id          TEXT REFERENCES news(id) ON DELETE CASCADE,
          post_id          TEXT REFERENCES posts(id) ON DELETE CASCADE,
          question         TEXT NOT NULL,
          description      TEXT,
          is_anonymous     INTEGER DEFAULT 0,
          allow_multiple   INTEGER DEFAULT 0,
          allow_add_options INTEGER DEFAULT 0,
          allow_change_vote INTEGER DEFAULT 0,
          shuffle_options  INTEGER DEFAULT 0,
          total_votes      INTEGER DEFAULT 0,
          ends_at          INTEGER,
          created_at       INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => {
        if (err && !err.message.includes('already exists')) return reject(err);
        console.log('  → таблица polls создана');
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_polls_news_id ON polls(news_id)`,
        (err) => { if (err && !err.message.includes('already exists')) return reject(err); });
      db.run(`CREATE INDEX IF NOT EXISTS idx_polls_post_id ON polls(post_id)`,
        (err) => { if (err && !err.message.includes('already exists')) return reject(err); });

      // ── Таблица вариантов ────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS poll_options (
          id          TEXT PRIMARY KEY,
          poll_id     TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
          option_text TEXT NOT NULL,
          votes_count INTEGER DEFAULT 0,
          order_index INTEGER DEFAULT 0,
          created_at  INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => {
        if (err && !err.message.includes('already exists')) return reject(err);
        console.log('  → таблица poll_options создана');
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_poll_options_poll_id ON poll_options(poll_id)`,
        (err) => { if (err && !err.message.includes('already exists')) return reject(err); });

      // ── Таблица голосов ──────────────────────────────────────────────────────
      db.run(`
        CREATE TABLE IF NOT EXISTS poll_votes (
          id         TEXT PRIMARY KEY,
          poll_id    TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
          option_id  TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => {
        if (err && !err.message.includes('already exists')) return reject(err);
        console.log('  → таблица poll_votes создана');
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id  ON poll_votes(poll_id)`,
        (err) => { if (err && !err.message.includes('already exists')) return reject(err); });
      db.run(`CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id  ON poll_votes(user_id)`,
        (err) => { if (err && !err.message.includes('already exists')) return reject(err); });
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_votes_unique ON poll_votes(poll_id, option_id, user_id)`,
        (err) => { if (err && !err.message.includes('already exists')) return reject(err); });

      // Финальный SELECT — убеждаемся, что все предыдущие операции завершены
      db.run(`SELECT 1`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

module.exports = { up };
