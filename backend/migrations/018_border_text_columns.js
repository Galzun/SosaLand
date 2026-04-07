// migrations/018_border_text_columns.js
// Добавляет поля кастомизации рамок, цвета текста и акцентного цвета для UI-групп профиля.
//
// Группы:
//   content_wrapper_* — Шапка профиля (header card)
//   content_*         — Область контента
//   post_card_*       — Карточки и вкладки (объединённая группа: tabs + postForm + postCard + comments)

const db = require('../db');

const columns = [
  // Шапка профиля (content_wrapper_*)
  `ALTER TABLE users ADD COLUMN content_wrapper_border_color  TEXT`,
  `ALTER TABLE users ADD COLUMN content_wrapper_border_width  INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN content_wrapper_border_radius INTEGER DEFAULT 12`,
  `ALTER TABLE users ADD COLUMN content_wrapper_text_color    TEXT`,
  `ALTER TABLE users ADD COLUMN content_wrapper_accent_color  TEXT`,
  // Область контента (content_*)
  `ALTER TABLE users ADD COLUMN content_border_color  TEXT`,
  `ALTER TABLE users ADD COLUMN content_border_width  INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN content_border_radius INTEGER DEFAULT 10`,
  `ALTER TABLE users ADD COLUMN content_text_color    TEXT`,
  // Карточки и вкладки (post_card_*) — объединённая группа
  `ALTER TABLE users ADD COLUMN post_card_border_color  TEXT`,
  `ALTER TABLE users ADD COLUMN post_card_border_width  INTEGER DEFAULT 1`,
  `ALTER TABLE users ADD COLUMN post_card_border_radius INTEGER DEFAULT 12`,
  `ALTER TABLE users ADD COLUMN post_card_text_color    TEXT`,
  `ALTER TABLE users ADD COLUMN post_card_accent_color  TEXT`,
];

async function up() {
  return new Promise((resolve, reject) => {
    let pending = columns.length;
    let failed  = false;

    columns.forEach(sql => {
      db.run(sql, (err) => {
        if (failed) return;
        if (err && !err.message.includes('duplicate column')) {
          failed = true;
          return reject(err);
        }
        if (--pending === 0) resolve();
      });
    });
  });
}

module.exports = { up };
