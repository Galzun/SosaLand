// migrations/037_reset_system_roles.js
// Сбрасывает системные роли admin и editor до user.
// Системные роли теперь не используются в UI — права выдаются через кастомные роли.
// Роль creator остаётся нетронутой (суперадмин, назначается только через консоль).

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
      UPDATE users SET role = 'user' WHERE role IN ('admin', 'editor')
    `);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { up };
