// scripts/run-migration.js
// Создаёт все таблицы в PostgreSQL из schema.sql.
// Использование: npm run migrate  (или node scripts/run-migration.js)
//
// Безопасно запускать повторно — все операции используют IF NOT EXISTS.
//
// Также экспортирует runMigrations(pool) для вызова из server.js при старте.

require('dotenv').config();

const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

// Экспортируемая функция — принимает уже существующий pool или создаёт новый.
async function runMigrations(existingPool) {
  const schemaPath = path.join(__dirname, '../schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const DATABASE_URL = process.env.DATABASE_URL;
  const pool = existingPool || new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  console.log('Применение миграций (schema.sql)...');
  const client = await pool.connect();

  try {
    await client.query(sql);
    console.log('✓ Миграции применены успешно.');
  } catch (err) {
    console.error('Ошибка при выполнении миграции:', err.message);
    throw err;
  } finally {
    client.release();
    // Закрываем пул только если создавали его сами (не переданный извне).
    if (!existingPool) await pool.end();
  }
}

module.exports = { runMigrations };

// Запуск напрямую: node scripts/run-migration.js
if (require.main === module) {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('ОШИБКА: переменная DATABASE_URL не задана в .env');
    process.exit(1);
  }
  runMigrations().catch(() => process.exit(1));
}
