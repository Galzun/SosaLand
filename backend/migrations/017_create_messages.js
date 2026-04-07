// migrations/017_create_messages.js
// Создаёт таблицы для системы личных сообщений:
//   conversations — диалоги между двумя пользователями
//   messages      — отдельные сообщения внутри диалога

const db = require('../db');

async function up() {
  return new Promise((resolve, reject) => {
    // Выполняем два CREATE TABLE последовательно через serialize,
    // чтобы messages создавалась после conversations (зависимость по FK).
    db.serialize(() => {
      // --- Таблица conversations ---
      // Хранит диалоги: каждая строка — уникальная пара пользователей.
      // participant1 и participant2 — упорядочены (меньший UUID идёт первым)
      // для соблюдения UNIQUE-ограничения независимо от порядка запроса.
      db.run(`
        CREATE TABLE IF NOT EXISTS conversations (
          id                TEXT PRIMARY KEY,
          participant1      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          participant2      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          last_message      TEXT,
          last_message_time INTEGER,
          created_at        INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(participant1, participant2)
        )
      `, (err) => {
        if (err) return reject(err);
        console.log('  → conversations создана');
      });

      // Индексы для быстрого поиска диалогов по участнику
      db.run(`CREATE INDEX IF NOT EXISTS idx_conv_p1 ON conversations(participant1)`, (err) => {
        if (err) return reject(err);
      });
      db.run(`CREATE INDEX IF NOT EXISTS idx_conv_p2 ON conversations(participant2)`, (err) => {
        if (err) return reject(err);
      });

      // --- Таблица messages ---
      // Хранит отдельные сообщения. Привязаны к диалогу и отправителю.
      // Поддерживает текст и вложения (файлы, изображения).
      db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id              TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content         TEXT NOT NULL,
          file_url        TEXT,
          file_type       TEXT,
          file_name       TEXT,
          is_read         INTEGER DEFAULT 0,
          read_at         INTEGER,
          created_at      INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `, (err) => {
        if (err) return reject(err);
        console.log('  → messages создана');
      });

      // Индексы для быстрой выборки сообщений диалога и по отправителю
      db.run(`CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id)`, (err) => {
        if (err) return reject(err);
      });

      db.run(`CREATE INDEX IF NOT EXISTS idx_msg_sender ON messages(sender_id)`, (err) => {
        if (err) return reject(err);
      });

      // Пустая операция, которая гарантирует выполнение после всех предыдущих
      db.run(`SELECT 1`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

module.exports = { up };
