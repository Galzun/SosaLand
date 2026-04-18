// migrations/036_role_priority.js
// Добавляет колонку priority в custom_roles для управления порядком отображения.
// Меньший номер = выше в иерархии. При создании назначается max+1.

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
      ALTER TABLE custom_roles
        ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0
    `);

    // Устанавливаем начальные приоритеты по порядку создания
    await client.query(`
      UPDATE custom_roles cr
      SET priority = sub.rn
      FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
        FROM custom_roles
      ) sub
      WHERE cr.id = sub.id
    `);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { up };
