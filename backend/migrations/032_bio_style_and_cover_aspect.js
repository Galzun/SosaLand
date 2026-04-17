// migrations/032_bio_style_and_cover_aspect.js
// Добавляет поля стиля статуса профиля и соотношения сторон обложки:
//   bio_color         TEXT         — цвет текста статуса
//   bio_font_size     INTEGER 14   — размер шрифта статуса (10–32 px)
//   bio_font_weight   INTEGER 400  — жирность статуса (100–900)
//   cover_aspect_w    INTEGER 4    — числитель соотношения сторон обложки
//   cover_aspect_h    INTEGER 1    — знаменатель соотношения сторон обложки

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
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio_color TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio_font_size INTEGER DEFAULT 14`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio_font_weight INTEGER DEFAULT 400`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_aspect_w INTEGER DEFAULT 4`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_aspect_h INTEGER DEFAULT 1`);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { up };
