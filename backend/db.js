// db.js — модуль подключения к базе данных SQLite.
// Экспортирует один объект `db`, который используется во всех других файлах.

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Путь до файла базы данных.
// __dirname — папка, где находится этот файл (т.е. backend/).
// При первом запуске файл database.sqlite будет создан автоматически.
const DB_PATH = path.join(__dirname, 'database.sqlite');

// Открываем (или создаём) файл базы данных.
// OPEN_READWRITE | OPEN_CREATE означает:
//   - если файл есть — открываем для чтения и записи
//   - если файла нет  — создаём новый
const db = new sqlite3.Database(
  DB_PATH,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error('Ошибка подключения к базе данных:', err.message);
      process.exit(1); // завершаем процесс, без БД сервер бесполезен
    }
    console.log(`База данных подключена: ${DB_PATH}`);
  }
);

// Включаем поддержку внешних ключей (в SQLite она отключена по умолчанию).
// Это нужно для связей между таблицами (например, users → tickets).
db.run('PRAGMA foreign_keys = ON');

module.exports = db;
