// migrations/039_court_attachments.js
// Добавляет поддержку вложений:
//   court_tickets         — поле attachments (JSON) для доказательств при создании жалобы
//   court_ticket_messages — поля file_url, file_type, file_name, files_json для файлов в чате

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
    await client.query(`ALTER TABLE court_tickets ADD COLUMN IF NOT EXISTS attachments TEXT`);
    await client.query(`ALTER TABLE court_ticket_messages ADD COLUMN IF NOT EXISTS file_url   TEXT`);
    await client.query(`ALTER TABLE court_ticket_messages ADD COLUMN IF NOT EXISTS file_type  TEXT`);
    await client.query(`ALTER TABLE court_ticket_messages ADD COLUMN IF NOT EXISTS file_name  TEXT`);
    await client.query(`ALTER TABLE court_ticket_messages ADD COLUMN IF NOT EXISTS files_json TEXT`);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { up };
