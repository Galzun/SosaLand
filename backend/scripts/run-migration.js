// scripts/run-migration.js
// 1. Применяет schema.sql (CREATE TABLE IF NOT EXISTS — только новые таблицы).
// 2. Запускает numbered migrations из папки migrations/ в порядке номера.
//    Уже применённые миграции пропускаются (таблица schema_migrations).
//
// Bootstrap для существующей БД: при первом запуске (schema_migrations пустая)
// и если таблица users уже существует — помечает миграции 001-031 как применённые
// (они были выполнены вручную до введения трекинга).
//
// Запуск вручную: npm run migrate
// Автозапуск при старте сервера: runMigrations(pool) вызывается из server.js

require('dotenv').config();

const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

// Номер последней миграции, применённой вручную до введения трекинга.
// Всё, что <= этого числа, будет помечено как "уже применено" при первом запуске
// на существующей БД (без перезапуска самих миграций).
const BOOTSTRAP_UP_TO = 31;

async function runMigrations(existingPool) {
  const DATABASE_URL = process.env.DATABASE_URL;
  const pool = existingPool || new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    // --- Шаг 1: schema.sql (CREATE TABLE IF NOT EXISTS) ---
    console.log('Применение schema.sql...');
    const schemaPath = path.join(__dirname, '../schema.sql');
    const schemaSql  = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schemaSql);
    console.log('✓ schema.sql применён.');

    // --- Шаг 2: таблица версий ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        applied_at BIGINT  NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      )
    `);

    // --- Шаг 3: bootstrap для существующей БД ---
    const { rows: countRows } = await client.query('SELECT COUNT(*) FROM schema_migrations');
    const isFirstRun = Number(countRows[0].count) === 0;

    if (isFirstRun) {
      // Проверяем: таблица users уже существует (значит БД старая, без трекинга)?
      const { rows: tableRows } = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
        LIMIT 1
      `);
      if (tableRows.length > 0) {
        console.log(`  Bootstrap: помечаю миграции 001-0${BOOTSTRAP_UP_TO} как применённые...`);
        for (let v = 1; v <= BOOTSTRAP_UP_TO; v++) {
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
            [v]
          );
        }
        console.log(`  ✓ Bootstrap завершён.`);
      }
    }

    // --- Шаг 4: numbered migrations ---
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => /^\d+_.+\.js$/.test(f))
      .sort();

    const { rows: appliedRows } = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(appliedRows.map(r => r.version));

    for (const file of files) {
      const version = parseInt(file.split('_')[0], 10);
      if (applied.has(version)) continue;

      console.log(`  Применяю миграцию ${file}...`);
      try {
        const migration = require(path.join(migrationsDir, file));
        await migration.up();
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
          [version]
        );
        console.log(`  ✓ ${file}`);
      } catch (err) {
        // Если колонка уже существует — помечаем как применённую и продолжаем.
        // Это случается когда миграция была выполнена вручную без записи в трекинг.
        // 42701 = duplicate_column (PostgreSQL error code, locale-independent)
        if (err.code === '42701' || (err.message && (err.message.includes('already exists') || err.message.includes('duplicate column') || err.message.includes('уже существует')))) {
          console.log(`  ↷ ${file} (уже частично применена, пропускаю)`);
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
            [version]
          );
        } else {
          console.error(`  ✗ Ошибка в миграции ${file}:`, err.message);
          throw err;
        }
      }
    }

    console.log('✓ Все миграции применены.');
  } finally {
    client.release();
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
