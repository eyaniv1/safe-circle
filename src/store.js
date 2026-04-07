const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'safe-circle.db');
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS circles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    circleId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (circleId) REFERENCES circles(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    circleId TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    endedAt TEXT,
    FOREIGN KEY (circleId) REFERENCES circles(id)
  );

  CREATE TABLE IF NOT EXISTS responses (
    eventId TEXT NOT NULL,
    memberId TEXT NOT NULL,
    status TEXT NOT NULL,
    time TEXT NOT NULL,
    PRIMARY KEY (eventId, memberId),
    FOREIGN KEY (eventId) REFERENCES events(id),
    FOREIGN KEY (memberId) REFERENCES members(id)
  );
`);

// Migrate: add email/phone columns if missing (for existing DBs)
try {
  sqlite.exec(`ALTER TABLE members ADD COLUMN email TEXT DEFAULT ''`);
} catch (e) { /* column already exists */ }
try {
  sqlite.exec(`ALTER TABLE members ADD COLUMN phone TEXT DEFAULT ''`);
} catch (e) { /* column already exists */ }

// --- Prepared statements ---

const stmts = {
  // Circles
  getCircles: sqlite.prepare('SELECT * FROM circles ORDER BY createdAt'),
  getCircle: sqlite.prepare('SELECT * FROM circles WHERE id = ?'),
  insertCircle: sqlite.prepare('INSERT INTO circles (id, name, createdAt) VALUES (?, ?, ?)'),
  deleteCircle: sqlite.prepare('DELETE FROM circles WHERE id = ?'),

  // Members
  getMembers: sqlite.prepare('SELECT * FROM members WHERE circleId = ? ORDER BY createdAt'),
  getMember: sqlite.prepare('SELECT * FROM members WHERE id = ?'),
  insertMember: sqlite.prepare('INSERT INTO members (id, name, email, phone, circleId, createdAt) VALUES (?, ?, ?, ?, ?, ?)'),
  updateMember: sqlite.prepare('UPDATE members SET name = ?, email = ?, phone = ? WHERE id = ?'),
  deleteMember: sqlite.prepare('DELETE FROM members WHERE id = ?'),
  deleteMembersByCircle: sqlite.prepare('DELETE FROM members WHERE circleId = ?'),

  // Events
  getEvents: sqlite.prepare('SELECT * FROM events WHERE circleId = ? ORDER BY createdAt DESC'),
  getEvent: sqlite.prepare('SELECT * FROM events WHERE id = ?'),
  getActiveEvent: sqlite.prepare('SELECT * FROM events WHERE circleId = ? AND active = 1 LIMIT 1'),
  insertEvent: sqlite.prepare('INSERT INTO events (id, circleId, active, createdAt) VALUES (?, ?, 1, ?)'),
  endEvent: sqlite.prepare('UPDATE events SET active = 0, endedAt = ? WHERE id = ?'),
  endActiveEvents: sqlite.prepare('UPDATE events SET active = 0, endedAt = ? WHERE circleId = ? AND active = 1'),

  // Responses
  upsertResponse: sqlite.prepare('INSERT OR REPLACE INTO responses (eventId, memberId, status, time) VALUES (?, ?, ?, ?)'),
  getResponses: sqlite.prepare('SELECT * FROM responses WHERE eventId = ?'),
  deleteResponsesByEvent: sqlite.prepare('DELETE FROM responses WHERE eventId = ?'),
  deleteResponsesByMember: sqlite.prepare('DELETE FROM responses WHERE memberId = ?'),
  deleteResponsesByCircleEvents: sqlite.prepare(`
    DELETE FROM responses WHERE eventId IN (SELECT id FROM events WHERE circleId = ?)
  `),
  deleteEventsByCircle: sqlite.prepare('DELETE FROM events WHERE circleId = ?'),
};

module.exports = { sqlite, stmts };
