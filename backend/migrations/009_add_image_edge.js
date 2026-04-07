// migrations/009_add_image_edge.js
// Добавляет плавность краёв изображения (feathering через CSS mask).
//   cover_edge — размытие краёв обложки (0–100, дефолт 0)
//   bg_edge    — размытие краёв фона     (0–100, дефолт 0)

const db = require('../db');

async function up() {
  const addColumn = (col) => new Promise((resolve, reject) => {
    db.run(`ALTER TABLE users ADD COLUMN ${col} INTEGER DEFAULT 0`, err => {
      if (err && err.message.includes('duplicate column')) resolve();
      else if (err) reject(err);
      else resolve();
    });
  });

  await addColumn('cover_edge');
  await addColumn('bg_edge');
}

module.exports = { up };
