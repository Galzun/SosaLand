// migrations/035_custom_roles.js
// Создаёт таблицы custom_roles и user_custom_roles для системы кастомных ролей.
// custom_roles   — хранит роли с цветом и JSON-массивом прав (permissions)
// user_custom_roles — связь many-to-many: пользователь ↔ роль

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
      CREATE TABLE IF NOT EXISTS custom_roles (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT '#4aff9e',
        permissions TEXT NOT NULL DEFAULT '[]',
        created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at  INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
        updated_at  INTEGER
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_custom_roles (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id    TEXT NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
        granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        granted_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
        UNIQUE(user_id, role_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_custom_roles_user_id
        ON user_custom_roles(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_custom_roles_role_id
        ON user_custom_roles(role_id)
    `);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { up };
