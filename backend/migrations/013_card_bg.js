// migrations/013_card_bg.js
// Добавляет поля card_bg_color и card_bg_alpha в users
// для настройки фона информационной карточки профиля.

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `ALTER TABLE users ADD COLUMN card_bg_color TEXT DEFAULT '#1a1a1a'`,
        (err) => { if (err && !err.message.includes('duplicate')) return reject(err); }
      );
      db.run(
        `ALTER TABLE users ADD COLUMN card_bg_alpha INTEGER DEFAULT 95`,
        (err) => {
          if (err && !err.message.includes('duplicate')) return reject(err);
          resolve();
        }
      );
    });
  });
}

module.exports = { up };
