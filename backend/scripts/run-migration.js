// scripts/run-migration.js
// Создаёт все таблицы в PostgreSQL из schema.sql.
// Использование: npm run migrate  (или node scripts/run-migration.js)
//
// Безопасно запускать повторно — все операции используют IF NOT EXISTS.

require('dotenv').config();

const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ОШИБКА: переменная DATABASE_URL не задана в .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false },
});

async function runMigrations() {
  const schemaPath = path.join(__dirname, '../schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Подключение к PostgreSQL...');
  const client = await pool.connect();

  try {
    console.log('Создание таблиц...\n');
    await client.query(sql);
    console.log('✓ Все таблицы созданы успешно.');
  } catch (err) {
    console.error('Ошибка при выполнении миграции:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
