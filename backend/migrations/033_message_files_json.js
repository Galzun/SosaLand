// migrations/033_message_files_json.js
// Добавляет поддержку множественных вложений в сообщениях:
//   files_json TEXT — JSON-массив [{fileUrl, fileType, fileName}] дополнительных файлов

const db = require('../db');

async function up() {
  await new Promise((resolve, reject) => {
    db.run(`ALTER TABLE messages ADD COLUMN files_json TEXT`, err => {
      if (err && (err.message.includes('duplicate column') || err.message.includes('already exists'))) resolve();
      else if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = { up };
