// migrations/038_court_system.js
// Создаёт таблицы для системы «Суд»:
//   court_tickets         — жалобы игроков
//   court_ticket_messages — чат внутри тикета
//   court_cases           — судебные заседания (суды как события)

const { Pool } = require('pg');
require('dotenv').config();

async function up() {
  const DATABASE_URL = process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    // Жалобы (тикеты суда)
    await client.query(`
      CREATE TABLE IF NOT EXISTS court_tickets (
        id                   TEXT PRIMARY KEY,
        created_by           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        accused_name         TEXT NOT NULL,
        title                TEXT NOT NULL,
        description          TEXT NOT NULL,
        status               TEXT NOT NULL DEFAULT 'pending',
        reviewer_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
        review_started_at    INTEGER,
        closed_at            INTEGER,
        closed_by            TEXT REFERENCES users(id) ON DELETE SET NULL,
        rejection_reason     TEXT,
        created_at           INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
        updated_at           INTEGER
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_court_tickets_created_by ON court_tickets(created_by)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_court_tickets_status ON court_tickets(status)
    `);

    // Сообщения чата в тикете
    await client.query(`
      CREATE TABLE IF NOT EXISTS court_ticket_messages (
        id         TEXT PRIMARY KEY,
        ticket_id  TEXT NOT NULL REFERENCES court_tickets(id) ON DELETE CASCADE,
        sender_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
        content    TEXT NOT NULL,
        is_system  INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_court_ticket_messages_ticket_id
        ON court_ticket_messages(ticket_id)
    `);

    // Судебные заседания (суды как события)
    await client.query(`
      CREATE TABLE IF NOT EXISTS court_cases (
        id          TEXT PRIMARY KEY,
        ticket_id   TEXT REFERENCES court_tickets(id) ON DELETE SET NULL,
        title       TEXT NOT NULL,
        description TEXT,
        verdict     TEXT,
        hearing_at  INTEGER,
        created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status      TEXT NOT NULL DEFAULT 'scheduled',
        created_at  INTEGER DEFAULT (EXTRACT(EPOCH FROM NOW())::INTEGER),
        updated_at  INTEGER
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_court_cases_ticket_id ON court_cases(ticket_id)
    `);
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { up };
