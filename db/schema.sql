-- D1 (SQLite) schema for Competition Planning Board (v2)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,

  -- Dates are stored as YYYY-MM-DD strings (day-level milestones).
  registration_deadline_at TEXT NOT NULL,
  submission_deadline_at TEXT,
  result_deadline_at TEXT,

  included_in_plan INTEGER NOT NULL DEFAULT 0,
  registered INTEGER NOT NULL DEFAULT 0,

  status_text TEXT NOT NULL DEFAULT '',
  team_members TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  links TEXT NOT NULL DEFAULT '[]', -- JSON array of {title,url}

  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_competitions_registration_deadline
  ON competitions(registration_deadline_at);

CREATE INDEX IF NOT EXISTS idx_competitions_submission_deadline
  ON competitions(submission_deadline_at);

CREATE INDEX IF NOT EXISTS idx_competitions_result_deadline
  ON competitions(result_deadline_at);

