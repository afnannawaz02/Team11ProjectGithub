-- Migration: ensure profiles table has all survey columns
-- Safe to run multiple times (uses IF NOT EXISTS / ALTER OR IGNORE pattern)

-- Add any columns that may be missing from older deployments
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dob               TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marital_status    TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employment_status TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credit_score      TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS us_state          TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city              TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS veteran_status    TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences       TEXT DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at        TEXT NOT NULL DEFAULT (datetime('now'));
