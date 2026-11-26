// SQLite storage (built into Node, no native build step).
// For large scale, move these tables to PostgreSQL + PostGIS; the queries are simple.
import { DatabaseSync } from 'node:sqlite';

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,            -- home | work | favorite
      label TEXT,
      address TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS places_user ON places(user_id);

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      subtype TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      heading REAL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      confirms INTEGER NOT NULL DEFAULT 0,
      denies INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'   -- active | removed
    );
    CREATE INDEX IF NOT EXISTS incidents_geo ON incidents(status, lat, lng);

    CREATE TABLE IF NOT EXISTS incident_comments (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      comment_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS comments_incident ON incident_comments(incident_id);

    CREATE TABLE IF NOT EXISTS incident_votes (
      incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      vote INTEGER NOT NULL,         -- 1 still there, -1 not there
      created_at INTEGER NOT NULL,
      PRIMARY KEY (incident_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS traffic_cells (
      cell TEXT NOT NULL,            -- geohash (~150 m)
      bucket INTEGER NOT NULL,       -- direction of travel in 45° buckets
      avg_speed REAL NOT NULL,       -- km/h
      weight REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (cell, bucket)
    );
  `);
  return db;
}
