-- Migration 001: verify full schema is up to date
-- D1 SQLite does not support ALTER TABLE ADD COLUMN IF NOT EXISTS
-- Instead, drop and recreate the profiles table with all columns using a safe migration.
-- This migration is idempotent — safe to run multiple times.

-- Step 1: Create a temporary backup of existing profile data
CREATE TABLE IF NOT EXISTS profiles_backup AS SELECT * FROM profiles;

-- Step 2: Drop and recreate profiles with the full schema
DROP TABLE IF EXISTS profiles;

CREATE TABLE profiles (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  goals               TEXT    NOT NULL DEFAULT '[]',
  risk                TEXT    NOT NULL DEFAULT '',
  horizon             TEXT    NOT NULL DEFAULT '',
  annual_income       TEXT    NOT NULL DEFAULT '',
  monthly_savings     TEXT    NOT NULL DEFAULT '',
  emergency_fund      TEXT    NOT NULL DEFAULT '',
  current_investments TEXT    NOT NULL DEFAULT '[]',
  dob                 TEXT    NOT NULL DEFAULT '',
  marital_status      TEXT    NOT NULL DEFAULT '',
  employment_status   TEXT    NOT NULL DEFAULT '',
  credit_score        TEXT    NOT NULL DEFAULT '',
  us_state            TEXT    NOT NULL DEFAULT '',
  city                TEXT    NOT NULL DEFAULT '',
  veteran_status      TEXT    NOT NULL DEFAULT '',
  preferences         TEXT    NOT NULL DEFAULT '[]',
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);

-- Step 3: Restore data from backup (columns in backup map 1:1 to new schema)
INSERT OR IGNORE INTO profiles
  (id, user_id, goals, risk, horizon, annual_income, monthly_savings,
   emergency_fund, current_investments, dob, marital_status, employment_status,
   credit_score, us_state, city, veteran_status, preferences, updated_at)
SELECT
  id,
  user_id,
  COALESCE(goals, '[]'),
  COALESCE(risk, ''),
  COALESCE(horizon, ''),
  COALESCE(annual_income, ''),
  COALESCE(monthly_savings, ''),
  COALESCE(emergency_fund, ''),
  COALESCE(current_investments, '[]'),
  COALESCE(dob, ''),
  COALESCE(marital_status, ''),
  COALESCE(employment_status, ''),
  COALESCE(credit_score, ''),
  COALESCE(us_state, ''),
  COALESCE(city, ''),
  COALESCE(veteran_status, ''),
  COALESCE(preferences, '[]'),
  COALESCE(updated_at, datetime('now'))
FROM profiles_backup;

-- Step 4: Clean up backup table
DROP TABLE IF EXISTS profiles_backup;
