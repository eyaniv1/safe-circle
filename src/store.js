const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS circles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS responses (
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, member_id)
    );
  `);

  // Migrations
  try { await pool.query(`ALTER TABLE members ADD COLUMN area TEXT DEFAULT ''`); } catch (e) { /* exists */ }
  try { await pool.query(`ALTER TABLE events ADD COLUMN triggered_areas TEXT DEFAULT ''`); } catch (e) { /* exists */ }
  try { await pool.query(`ALTER TABLE members ADD COLUMN setup_visited BOOLEAN DEFAULT false`); } catch (e) { /* exists */ }
  try { await pool.query(`ALTER TABLE members ADD COLUMN ok_clicked BOOLEAN DEFAULT false`); } catch (e) { /* exists */ }
  try { await pool.query(`ALTER TABLE members ADD COLUMN trouble_clicked BOOLEAN DEFAULT false`); } catch (e) { /* exists */ }

  console.log('Database tables ready');
}

module.exports = { pool, init };
