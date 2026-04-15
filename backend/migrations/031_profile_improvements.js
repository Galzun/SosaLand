// migrations/031_profile_improvements.js
// Добавляет поля для расширенной кастомизации профиля:
//   cover_edge_h, cover_edge_v — раздельная плавность краёв обложки (горизонтальная/вертикальная)
//   bg_edge_h, bg_edge_v       — раздельная плавность краёв фона
//   cover_container_width      — ширина шапки профиля в % (40–100, дефолт 100)
//   content_wrapper_font_weight — жирность текста в шапке профиля (100–900, дефолт 400)
//   post_card_font_weight       — жирность текста в карточках (100–900, дефолт 400)

const db = require('../db');

async function up() {
  const addColumn = (col, type, def) => new Promise((resolve, reject) => {
    db.run(`ALTER TABLE users ADD COLUMN ${col} ${type} DEFAULT ${def}`, err => {
      if (err && err.message.includes('duplicate column')) resolve();
      else if (err && err.message.includes('already exists')) resolve();
      else if (err) reject(err);
      else resolve();
    });
  });

  await addColumn('cover_edge_h',                'INTEGER', 0);
  await addColumn('cover_edge_v',                'INTEGER', 0);
  await addColumn('bg_edge_h',                   'INTEGER', 0);
  await addColumn('bg_edge_v',                   'INTEGER', 0);
  await addColumn('cover_container_width',       'INTEGER', 100);
  await addColumn('content_wrapper_font_weight', 'INTEGER', 400);
  await addColumn('post_card_font_weight',       'INTEGER', 400);
}

module.exports = { up };
