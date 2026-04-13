// db.js — подключение к PostgreSQL.
// Экспортирует объект `db` с API, совместимым с прежним SQLite-кодом:
//   db.run(sql, params, callback?)  — INSERT / UPDATE / DELETE
//   db.get(sql, params, callback?)  — SELECT одной строки
//   db.all(sql, params, callback?)  — SELECT всех строк
//   db.serialize(fn)               — заглушка (PostgreSQL не нуждается в очереди)
//   db.pool                        — сам pg.Pool (для миграций и транзакций)
//
// Плейсхолдеры: `?` автоматически заменяются на `$1`, `$2`, ...
// Это позволяет не менять SQL в роутах.

const { Pool } = require('pg');

// Читаем строку подключения из .env:
//   DATABASE_URL=postgres://user:password@host:5432/dbname
if (!process.env.DATABASE_URL) {
  console.error('ОШИБКА: переменная DATABASE_URL не задана в .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SSL нужен только для облачных баз (TimeWeb, Heroku и т.п.).
  // Локально (localhost) SSL не нужен.
  ssl: process.env.DATABASE_URL.includes('localhost') ||
       process.env.DATABASE_URL.includes('127.0.0.1') ||
       process.env.DATABASE_URL.includes('192.168.')
    ? false
    : { rejectUnauthorized: false },
});

pool.on('connect', () => {
  console.log('PostgreSQL подключён');
});

pool.on('error', (err) => {
  console.error('Ошибка пула PostgreSQL:', err.message);
});

// ---------------------------------------------------------------------------
// convertPlaceholders — заменяет SQLite-плейсхолдеры `?` на `$1`, `$2`, ...
// ---------------------------------------------------------------------------
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ---------------------------------------------------------------------------
// Внутренний хелпер: нормализует params (может прийти функция вместо массива)
// ---------------------------------------------------------------------------
function normalizeArgs(params, callback) {
  if (typeof params === 'function') {
    return { params: [], callback: params };
  }
  return { params: Array.isArray(params) ? params : [], callback };
}

// ---------------------------------------------------------------------------
// db.run — выполнить INSERT / UPDATE / DELETE.
// Если callback не передан — возвращает Promise.
// ---------------------------------------------------------------------------
function run(sql, params, callback) {
  const norm = normalizeArgs(params, callback);
  const converted = convertPlaceholders(sql);

  const promise = pool.query(converted, norm.params)
    .then(() => undefined)
    .catch(err => { throw err; });

  if (norm.callback) {
    promise.then(() => norm.callback(null)).catch(err => norm.callback(err));
  } else {
    return promise;
  }
}

// ---------------------------------------------------------------------------
// db.get — вернуть одну строку (или undefined).
// Если callback не передан — возвращает Promise.
// ---------------------------------------------------------------------------
function get(sql, params, callback) {
  const norm = normalizeArgs(params, callback);
  const converted = convertPlaceholders(sql);

  const promise = pool.query(converted, norm.params)
    .then(result => result.rows[0])
    .catch(err => { throw err; });

  if (norm.callback) {
    promise.then(row => norm.callback(null, row)).catch(err => norm.callback(err));
  } else {
    return promise;
  }
}

// ---------------------------------------------------------------------------
// db.all — вернуть все строки.
// Если callback не передан — возвращает Promise.
// ---------------------------------------------------------------------------
function all(sql, params, callback) {
  const norm = normalizeArgs(params, callback);
  const converted = convertPlaceholders(sql);

  const promise = pool.query(converted, norm.params)
    .then(result => result.rows)
    .catch(err => { throw err; });

  if (norm.callback) {
    promise.then(rows => norm.callback(null, rows)).catch(err => norm.callback(err));
  } else {
    return promise;
  }
}

// ---------------------------------------------------------------------------
// db.serialize — в SQLite гарантирует последовательное выполнение команд.
// В PostgreSQL каждый pool.query уже независим, поэтому просто вызываем fn().
// Код, использующий db.serialize + db.run без callback, должен быть переписан
// на async/await (см. posts.js и players.js).
// ---------------------------------------------------------------------------
function serialize(fn) {
  fn();
}

// ---------------------------------------------------------------------------
// db.transaction — хелпер для явных транзакций (используется в players.js).
// Принимает async-функцию, которой передаётся клиент.
// ---------------------------------------------------------------------------
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// db.clientQuery — выполнить запрос в рамках клиента (для транзакций).
// Автоматически конвертирует плейсхолдеры.
// ---------------------------------------------------------------------------
function clientQuery(client, sql, params = []) {
  return client.query(convertPlaceholders(sql), params);
}

const db = {
  run,
  get,
  all,
  serialize,
  transaction,
  clientQuery,
  pool,
};

module.exports = db;
