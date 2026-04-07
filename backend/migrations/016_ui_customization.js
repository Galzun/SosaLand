// migrations/016_ui_customization.js
// Добавляет поля кастомизации UI-элементов профиля в таблицу users.
// Каждый элемент: цвет (hex), непрозрачность 0-100, размытие 0-20px.
//
// Элементы:
//   card_bg_blur          — блюр шапки профиля (существующий card_bg + blur)
//   post_card_*           — карточки постов
//   tabs_*                — блок вкладок
//   post_form_*           — форма создания поста
//   content_*             — область контента (под вкладками)
//   content_wrapper_*     — блок с аватаркой и информацией

const db = require('../db');

const columns = [
  `ALTER TABLE users ADD COLUMN card_bg_blur              INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN post_card_bg_color        TEXT    DEFAULT '#1a1a1a'`,
  `ALTER TABLE users ADD COLUMN post_card_bg_alpha        INTEGER DEFAULT 95`,
  `ALTER TABLE users ADD COLUMN post_card_blur            INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN tabs_bg_color             TEXT    DEFAULT '#1a1a1a'`,
  `ALTER TABLE users ADD COLUMN tabs_bg_alpha             INTEGER DEFAULT 85`,
  `ALTER TABLE users ADD COLUMN tabs_blur                 INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN post_form_bg_color        TEXT    DEFAULT '#141420'`,
  `ALTER TABLE users ADD COLUMN post_form_bg_alpha        INTEGER DEFAULT 100`,
  `ALTER TABLE users ADD COLUMN post_form_blur            INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN content_bg_color          TEXT    DEFAULT '#0a0a1a'`,
  `ALTER TABLE users ADD COLUMN content_bg_alpha          INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN content_blur              INTEGER DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN content_wrapper_bg_color  TEXT    DEFAULT '#1a1a1a'`,
  `ALTER TABLE users ADD COLUMN content_wrapper_bg_alpha  INTEGER DEFAULT 95`,
  `ALTER TABLE users ADD COLUMN content_wrapper_blur      INTEGER DEFAULT 0`,
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
