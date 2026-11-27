// Database: libSQL (SQLite-compatible).
// - Production: a free Turso database   DATABASE_URL=libsql://<db>.turso.io + DATABASE_AUTH_TOKEN
// - Local development: a file           DATABASE_URL=file:./eloo.db (default)
// - Tests: in memory                    DATABASE_URL=:memory:
import { createClient } from '@libsql/client';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE,
    is_guest INTEGER NOT NULL DEFAULT 1,
    name TEXT,
    avatar TEXT,
    lang TEXT NOT NULL DEFAULT 'ar',
    points INTEGER NOT NULL DEFAULT 0,
    trust REAL NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otps (
    phone TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS places (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT,
    address TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS places_user ON places(user_id);

  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    subtype TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    heading REAL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    confirms INTEGER NOT NULL DEFAULT 0,
    denies INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE INDEX IF NOT EXISTS incidents_geo ON incidents(status, lat, lng);

  CREATE TABLE IF NOT EXISTS incident_comments (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    comment_key TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS comments_incident ON incident_comments(incident_id);

  CREATE TABLE IF NOT EXISTS incident_votes (
    incident_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (incident_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS traffic_cells (
    cell TEXT NOT NULL,
    bucket INTEGER NOT NULL,
    avg_speed REAL NOT NULL,
    weight REAL NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (cell, bucket)
  );
`;

const plain = (row) => (row ? { ...row } : undefined);

/** Opens the database and makes sure the tables exist. All methods are async. */
export async function openDb(url = 'file:./eloo.db', authToken) {
  const client = createClient({ url: url === ':memory:' ? ':memory:' : url, authToken: authToken || undefined });
  await client.executeMultiple(SCHEMA);
  return {
    get: async (sql, ...args) => plain((await client.execute({ sql, args })).rows[0]),
    all: async (sql, ...args) => (await client.execute({ sql, args })).rows.map(plain),
    run: async (sql, ...args) => ({ changes: (await client.execute({ sql, args })).rowsAffected }),
    close: () => client.close(),
  };
}
