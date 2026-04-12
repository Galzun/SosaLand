// migrations/027_add_edit_count_to_posts.js
// Добавляет поле edit_count в таблицу posts — счётчик количества редактирований.

const db = require('../db');

async function up() {
db.serialize(() => {
  db.run(`ALTER TABLE posts ADD COLUMN edit_count INTEGER DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Ошибка миграции 027:', err.message);
      process.exit(1);
    }
    console.log('✓ Миграция 027: поле edit_count добавлено в posts');
    process.exit(0);
  });
});
}

module.exports = { up };