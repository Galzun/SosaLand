// migrations/040_events_status.js
// Добавляет поле status в таблицу events (scheduled/in_progress/completed)

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
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled'`);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { up };
