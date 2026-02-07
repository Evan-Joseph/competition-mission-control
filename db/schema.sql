-- D1 (SQLite) schema for Competition Mission Control

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_emoji TEXT,
  avatar_color TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  source_tag TEXT,
  type_tags_json TEXT NOT NULL DEFAULT '[]',
  offline_defense TEXT,
  schedule_basis_year TEXT,
  evidence_links_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT,

  registration_start TEXT,
  registration_end TEXT,
  submission_start TEXT,
  submission_end TEXT,
  result_start TEXT,
  result_end TEXT,

  registration_text TEXT,
  submission_text TEXT,
  result_text TEXT,

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS competition_progress (
  competition_id TEXT PRIMARY KEY REFERENCES competitions(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  state_detail TEXT,
  award TEXT,
  owner_member_id TEXT REFERENCES members(id),
  risk_level INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TEXT NOT NULL,
  updated_by_member_id TEXT REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS progress_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id TEXT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  actor_member_id TEXT REFERENCES members(id),
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_progress_events_competition_id_created_at
  ON progress_events(competition_id, created_at DESC);

