// migrations/030_add_is_banned_to_players.js
// Добавляет поле is_banned в таблицу players.
// Это позволяет банить Minecraft-игроков даже без аккаунта на сайте.

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.run(`ALTER TABLE players ADD COLUMN is_banned INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column')) reject(err);
      else resolve();
    });
  });
}

module.exports = { up };
