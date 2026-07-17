-- Candyland Bank — D1 schema
-- Apply with: npx wrangler d1 execute candyland-db --file=db/schema.sql

-- Users / accounts
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  email         TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Investor profiles (one per user)
CREATE TABLE IF NOT EXISTS profiles (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  goals              TEXT,   -- JSON array
  risk               TEXT,
  horizon            TEXT,
  annual_income      TEXT,
  monthly_savings    TEXT,
  emergency_fund     TEXT,
  current_investments TEXT,  -- JSON array
  dob                TEXT,
  marital_status     TEXT,
  employment_status  TEXT,
  credit_score       TEXT,
  us_state           TEXT,
  city               TEXT,
  veteran_status     TEXT,
  preferences        TEXT,   -- JSON array
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id         TEXT    PRIMARY KEY,   -- UUID
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL DEFAULT 'New chat',
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT    NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender     TEXT    NOT NULL CHECK (sender IN ('user', 'bot', 'system')),
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user    ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user         ON profiles(user_id);

-- Plaid access tokens (one per user, overwritten on re-link)
CREATE TABLE IF NOT EXISTS plaid_tokens (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token   TEXT NOT NULL,
  item_id        TEXT NOT NULL,
  institution    TEXT NOT NULL DEFAULT '',
  connected_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Coinbase OAuth tokens (one per user)
CREATE TABLE IF NOT EXISTS coinbase_tokens (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token   TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  connected_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
