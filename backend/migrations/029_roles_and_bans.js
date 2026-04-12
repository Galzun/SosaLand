// migrations/029_roles_and_bans.js
// Добавляет систему банов и расширяет иерархию ролей.
// Роли: 'user' | 'editor' | 'admin' | 'creator'
// Новые поля: is_banned, ban_reason, banned_by, banned_at в users.

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column')) { reject(err); return; }
      });
      db.run(`ALTER TABLE users ADD COLUMN ban_reason TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) { reject(err); return; }
      });
      db.run(`ALTER TABLE users ADD COLUMN banned_by TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) { reject(err); return; }
      });
      db.run(`ALTER TABLE users ADD COLUMN banned_at INTEGER`, (err) => {
        if (err && !err.message.includes('duplicate column')) { reject(err); return; }
        resolve();
      });
    });
  });
}

module.exports = { up };
