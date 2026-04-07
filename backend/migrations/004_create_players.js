// migrations/004_create_players.js
// Четвёртая миграция — создаёт таблицу players.
//
// Зачем: хранить историю всех игроков сервера в БД,
// чтобы данные не терялись при перезагрузке страницы.
// Бэкенд получает актуальный список онлайна и обновляет last_seen.

const db = require('../db');

function up() {
  return new Promise((resolve, reject) => {
    const sql = `
      CREATE TABLE IF NOT EXISTS players (
        -- UUID из Minecraft (уникальный идентификатор игрока).
        -- PRIMARY KEY — гарантирует что один игрок = одна строка.
        uuid        TEXT PRIMARY KEY,

        -- Ник игрока (может меняться, обновляем при каждом онлайне).
        name        TEXT NOT NULL,

        -- Когда игрок был замечен впервые (unix timestamp, секунды).
        first_seen  INTEGER DEFAULT (strftime('%s', 'now')),

        -- Когда игрок был онлайн последний раз.
        last_seen   INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = { up };
