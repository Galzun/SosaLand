// migrations/001_create_users.js
// Первая миграция — создаёт таблицу users.
//
// Миграция — это скрипт, который приводит структуру базы данных
// к нужному виду. Запускается один раз через `npm run migrate`.

const db = require('../db');

function up() {
  return new Promise((resolve, reject) => {
    // CREATE TABLE IF NOT EXISTS — создаёт таблицу только если её ещё нет.
    // Это делает миграцию безопасной для повторного запуска.
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        -- UUID в виде текста, например: "550e8400-e29b-41d4-a716-446655440000"
        id              TEXT PRIMARY KEY,

        -- Логин на сайте. UNIQUE запрещает двух пользователей с одинаковым именем.
        username        TEXT UNIQUE NOT NULL,

        -- Пароль. Сейчас храним как есть — на этапе 2 добавим хеширование bcrypt.
        password        TEXT NOT NULL,

        -- UUID игрока из Minecraft (получаем через playerdb.co).
        -- UNIQUE: один Minecraft-аккаунт = один аккаунт на сайте.
        minecraft_uuid  TEXT UNIQUE,

        -- Роль пользователя. DEFAULT 'user' — обычный игрок.
        -- В будущем можно добавить 'admin', 'moderator' и т.д.
        role            TEXT DEFAULT 'user',

        -- Дата создания в формате Unix timestamp (секунды с 1 января 1970).
        -- strftime('%s', 'now') — встроенная функция SQLite для текущего времени.
        created_at      INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    db.run(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

module.exports = { up };
