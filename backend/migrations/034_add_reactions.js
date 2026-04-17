// migrations/034_add_reactions.js
// Создаёт таблицу reactions для реакций на посты, новости, события и комментарии.
// Один пользователь может поставить каждый эмодзи по одному разу на один объект.

const { Pool } = require('pg');
require('dotenv').config();

async function up() {
  const DATABASE_URL = process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS reactions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji       TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        created_at  INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
        UNIQUE(user_id, emoji, target_type, target_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reactions_target
        ON reactions(target_type, target_id)
    `);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { up };
