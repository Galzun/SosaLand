// migrations/021_add_group_id.js
// Добавляет group_id в таблицу images для группировки файлов, загруженных вместе.
// Файлы одного батча получают одинаковый group_id.
// Одиночные загрузки: group_id = NULL.

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `ALTER TABLE images ADD COLUMN group_id TEXT`,
        (err) => {
          if (err && !err.message.includes('duplicate column')) return reject(err);
          console.log('  → images.group_id добавлена');
        }
      );

      db.run(
        `CREATE INDEX IF NOT EXISTS idx_images_group_id ON images(group_id)`,
        (err) => { if (err) return reject(err); }
      );

      db.run(`SELECT 1`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

module.exports = { up };
