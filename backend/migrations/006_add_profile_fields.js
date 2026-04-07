// migrations/006_add_profile_fields.js
// Добавляет поля профиля в таблицу users:
//   cover_url      — ссылка на обложку профиля (баннер)
//   background_url — ссылка на фоновое изображение страницы профиля
//   bio            — описание пользователя (до 500 символов)
//   updated_at     — время последнего обновления профиля (unix timestamp)

const db = require('../db');

/**
 * Добавляет одну колонку в таблицу users.
 * Если колонка уже существует — молча пропускает (идемпотентность миграции).
 *
 * @param {string} column — имя колонки
 * @param {string} type   — тип SQLite (TEXT, INTEGER и т.д.)
 * @returns {Promise<void>}
 */
function addColumn(column, type) {
  return new Promise((resolve, reject) => {
    db.run(
      `ALTER TABLE users ADD COLUMN ${column} ${type}`,
      (err) => {
        if (err) {
          // Ошибка "duplicate column" означает, что миграция уже была применена.
          // Это нормальная ситуация — просто пропускаем.
          if (err.message.includes('duplicate column')) {
            console.log(`  (колонка ${column} уже существует, пропускаем)`);
            return resolve();
          }
          return reject(err);
        }
        console.log(`  + добавлена колонка: ${column} ${type}`);
        resolve();
      }
    );
  });
}

/**
 * up — применяет миграцию (добавляет все новые колонки).
 * Запускается через npm run migrate.
 */
async function up() {
  // Добавляем все четыре поля последовательно.
  // NULL по умолчанию — существующие пользователи не затронуты.
  await addColumn('cover_url', 'TEXT');
  await addColumn('background_url', 'TEXT');
  await addColumn('bio', 'TEXT');
  await addColumn('updated_at', 'INTEGER');
}

module.exports = { up };
