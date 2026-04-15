// migrations/032_bio_style_and_cover_aspect.js
// Добавляет поля стиля статуса профиля и соотношения сторон обложки:
//   bio_color         TEXT         — цвет текста статуса
//   bio_font_size     INTEGER 14   — размер шрифта статуса (10–32 px)
//   bio_font_weight   INTEGER 400  — жирность статуса (100–900)
//   cover_aspect_w    INTEGER 4    — числитель соотношения сторон обложки
//   cover_aspect_h    INTEGER 1    — знаменатель соотношения сторон обложки

const db = require('../db');

async function up() {
  const addInt = (col, def) => new Promise((resolve, reject) => {
    db.run(`ALTER TABLE users ADD COLUMN ${col} INTEGER DEFAULT ${def}`, err => {
      if (err && (err.message.includes('duplicate column') || err.message.includes('already exists'))) resolve();
      else if (err) reject(err);
      else resolve();
    });
  });

  const addText = (col) => new Promise((resolve, reject) => {
    db.run(`ALTER TABLE users ADD COLUMN ${col} TEXT`, err => {
      if (err && (err.message.includes('duplicate column') || err.message.includes('already exists'))) resolve();
      else if (err) reject(err);
      else resolve();
    });
  });

  await addText('bio_color');
  await addInt('bio_font_size',   14);
  await addInt('bio_font_weight', 400);
  await addInt('cover_aspect_w',  4);
  await addInt('cover_aspect_h',  1);
}

module.exports = { up };
