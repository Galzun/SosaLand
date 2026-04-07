// migrations/003_create_tickets.js
// Третья миграция — создаёт таблицу tickets для заявок на регистрацию.
//
// Система тикетов:
//   1. Игрок заполняет форму регистрации → тикет создаётся со статусом 'pending'
//   2. Администратор просматривает тикеты и одобряет/отклоняет
//   3. При одобрении — автоматически создаётся пользователь в таблице users

const db = require('../db');

function up() {
  return new Promise((resolve, reject) => {
    // CREATE TABLE IF NOT EXISTS — безопасно, можно запускать повторно.
    const sql = `
      CREATE TABLE IF NOT EXISTS tickets (
        -- UUID тикета, генерируется через uuid() в JS-коде
        id               TEXT PRIMARY KEY,

        -- UUID и ник игрока в Minecraft (получаем через playerdb.co на фронтенде)
        minecraft_uuid   TEXT NOT NULL,
        minecraft_name   TEXT NOT NULL,

        -- Желаемые данные для входа на сайт
        username         TEXT NOT NULL,

        -- Пароль уже хешированный (bcrypt) — бэкенд хеширует до сохранения в таблицу
        password_hash    TEXT NOT NULL,

        -- Статус заявки: pending / approved / rejected
        -- CHECK ограничивает значения только допустимыми строками
        status           TEXT DEFAULT 'pending'
                         CHECK(status IN ('pending', 'approved', 'rejected')),

        -- Дата создания тикета (unix timestamp)
        created_at       INTEGER DEFAULT (strftime('%s', 'now')),

        -- Кто и когда одобрил/отклонил заявку (NULL пока не обработан)
        approved_by      TEXT REFERENCES users(id),
        approved_at      INTEGER,

        -- Причина отклонения (заполняется при reject, может быть NULL)
        rejection_reason TEXT
      )
    `;

    db.run(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

module.exports = { up };
