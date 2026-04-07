// migrations/008_add_image_extras.js
// Добавляет в таблицу users поля для поворота, заливки и размытия изображений профиля.
//   cover_rotation  — угол поворота обложки (0–359, дефолт 0)
//   cover_fill_color — цвет заливки фона обложки (hex, NULL = нет заливки)
//   cover_blur      — размытие обложки в пикселях (0–20, дефолт 0)
//   bg_rotation     — угол поворота фона страницы (0–359, дефолт 0)
//   bg_fill_color   — цвет заливки фона страницы (hex, NULL = нет заливки)
//   bg_blur         — размытие фона страницы в пикселях (0–20, дефолт 0)

const db = require('../db');

async function up() {
  const addColumn = (col, type, defaultVal) => new Promise((resolve, reject) => {
    const sql = defaultVal !== undefined
      ? `ALTER TABLE users ADD COLUMN ${col} ${type} DEFAULT ${defaultVal}`
      : `ALTER TABLE users ADD COLUMN ${col} ${type}`;
    db.run(sql, err => {
      if (err && err.message.includes('duplicate column')) resolve(); // идемпотентно
      else if (err) reject(err);
      else resolve();
    });
  });

  await addColumn('cover_rotation',   'INTEGER', 0);
  await addColumn('cover_fill_color', 'TEXT');        // NULL по умолчанию
  await addColumn('cover_blur',       'INTEGER', 0);
  await addColumn('bg_rotation',      'INTEGER', 0);
  await addColumn('bg_fill_color',    'TEXT');        // NULL по умолчанию
  await addColumn('bg_blur',          'INTEGER', 0);
}

module.exports = { up };
