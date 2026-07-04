-- D1 (SQLite) schema for the auth system.
-- Applied via `wrangler d1 execute RESONANCE_D1 --file=src/db/schema.d1.sql`.
-- This file is idempotent — all CREATE statements use IF NOT EXISTS.

PRAGMA foreign_keys = ON;

-- ── verification_codes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_codes (
  phone      TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_created_at
  ON verification_codes (created_at);

-- ── code_requests (rate-limiting audit trail) ───────────────────────────
CREATE TABLE IF NOT EXISTS code_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  phone      TEXT NOT NULL,
  ip         TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_code_requests_phone_time
  ON code_requests (phone, created_at);
CREATE INDEX IF NOT EXISTS idx_code_requests_ip_time
  ON code_requests (ip, created_at);

-- ── users ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id    TEXT PRIMARY KEY,
  phone_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_phone_hash
  ON users (phone_hash);

-- ── user_voices ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_voices (
  user_id    TEXT NOT NULL,
  voice_id   TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, voice_id),
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_voices_user_id
  ON user_voices (user_id);
CREATE INDEX IF NOT EXISTS idx_user_voices_created_at
  ON user_voices (created_at);
