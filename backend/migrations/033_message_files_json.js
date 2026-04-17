// migrations/033_message_files_json.js
// Добавляет поддержку множественных вложений в сообщениях:
//   files_json TEXT — JSON-массив [{fileUrl, fileType, fileName}] дополнительных файлов

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
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS files_json TEXT`);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { up };
