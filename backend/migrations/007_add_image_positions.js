// migrations/007_add_image_positions.js
// Добавляет поля позиционирования и масштаба изображений профиля в таблицу users:
//   cover_pos_x  INTEGER — горизонтальная позиция обложки (0-100, дефолт 50)
//   cover_pos_y  INTEGER — вертикальная позиция обложки (0-100, дефолт 50)
//   cover_scale  INTEGER — масштаб обложки в % (100-200, дефолт 100)
//   bg_pos_x     INTEGER — горизонтальная позиция фона (0-100, дефолт 50)
//   bg_pos_y     INTEGER — вертикальная позиция фона (0-100, дефолт 50)
//   bg_scale     INTEGER — масштаб фона в % (100-200, дефолт 100)
//
// В CSS: background-position: {x}% {y}%;  background-size: cover или {scale}%

const db = require('../db');

function addColumn(column, type, defaultVal) {
  return new Promise((resolve, reject) => {
    const sql = defaultVal !== undefined
      ? `ALTER TABLE users ADD COLUMN ${column} ${type} DEFAULT ${defaultVal}`
      : `ALTER TABLE users ADD COLUMN ${column} ${type}`;

    db.run(sql, (err) => {
      if (err) {
        if (err.message.includes('duplicate column')) {
          console.log(`  (колонка ${column} уже существует, пропускаем)`);
          return resolve();
        }
        return reject(err);
      }
      console.log(`  + добавлена колонка: ${column} ${type}`);
      resolve();
    });
  });
}

async function up() {
  await addColumn('cover_pos_x', 'INTEGER', 50);
  await addColumn('cover_pos_y', 'INTEGER', 50);
  await addColumn('cover_scale',  'INTEGER', 100);
  await addColumn('bg_pos_x',    'INTEGER', 50);
  await addColumn('bg_pos_y',    'INTEGER', 50);
  await addColumn('bg_scale',    'INTEGER', 100);
}

module.exports = { up };
