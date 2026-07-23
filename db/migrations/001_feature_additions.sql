-- Candyland Bank — D1 Migration 001
-- Adds: goals, notifications, stock_alerts, txn_category_overrides, budget_plans
-- Apply with: npx wrangler d1 execute candyland-db --file=db/migrations/001_feature_additions.sql

-- ── Goals ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id                  TEXT    PRIMARY KEY,          -- UUID
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT    NOT NULL,
  target_amount       REAL    NOT NULL,
  current_amount      REAL    NOT NULL DEFAULT 0,
  monthly_contribution REAL   NOT NULL DEFAULT 0,
  target_date         TEXT,                         -- ISO date YYYY-MM-DD, nullable = open-ended
  category            TEXT    NOT NULL DEFAULT 'general', -- retirement|home|education|wealth|emergency|other
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

-- ── Goal milestones ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goal_milestones (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id    TEXT    NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  pct        INTEGER NOT NULL,                      -- e.g. 25, 50, 75, 100
  reached_at TEXT                                   -- NULL until hit
);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT    PRIMARY KEY,                   -- UUID
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL,                      -- unusual_spend|crypto_exposure|goal_milestone|portfolio_drift|alert_triggered
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_user    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread  ON notifications(user_id, read);

-- ── Stock price alerts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_alerts (
  id         TEXT    PRIMARY KEY,                   -- UUID
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker     TEXT    NOT NULL,
  direction  TEXT    NOT NULL CHECK (direction IN ('above', 'below')),
  threshold  REAL    NOT NULL,
  triggered  INTEGER NOT NULL DEFAULT 0,
  triggered_at TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_user    ON stock_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active  ON stock_alerts(triggered);

-- ── Transaction category overrides ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS txn_category_overrides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  txn_id      TEXT    NOT NULL,                     -- Plaid transaction_id or synthetic id
  category    TEXT    NOT NULL,
  recurring   INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, txn_id)
);

CREATE INDEX IF NOT EXISTS idx_txn_overrides_user ON txn_category_overrides(user_id);

-- ── Budget plans (category targets) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT    NOT NULL,
  planned     REAL    NOT NULL DEFAULT 0,
  month       TEXT    NOT NULL,                     -- YYYY-MM
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, category, month)
);

CREATE INDEX IF NOT EXISTS idx_budget_plans_user ON budget_plans(user_id, month);

-- ── Feature flags (per-user overrides — global flags live in env vars) ─────────
CREATE TABLE IF NOT EXISTS feature_flags (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag     TEXT    NOT NULL,
  enabled  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, flag)
);
