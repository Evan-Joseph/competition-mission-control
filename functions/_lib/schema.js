async function run(db, sql) {
  await db.prepare(sql).run();
}

export async function ensureCompetitionsSchema(db) {
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS competitions (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       registration_deadline_at TEXT NOT NULL,
       submission_deadline_at TEXT,
       result_deadline_at TEXT,
       included_in_plan INTEGER NOT NULL DEFAULT 0,
       registered INTEGER NOT NULL DEFAULT 0,
       status_text TEXT NOT NULL DEFAULT '',
       team_members TEXT NOT NULL DEFAULT '[]',
       links TEXT NOT NULL DEFAULT '[]',
       created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
       updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     )`
  );

  await run(db, "CREATE INDEX IF NOT EXISTS idx_competitions_registration_deadline ON competitions(registration_deadline_at)");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_competitions_submission_deadline ON competitions(submission_deadline_at)");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_competitions_result_deadline ON competitions(result_deadline_at)");
}

export async function ensureWhiteboardsSchema(db) {
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS whiteboards (
       competition_id TEXT PRIMARY KEY,
       items_json TEXT NOT NULL DEFAULT '[]',
       version INTEGER NOT NULL DEFAULT 0,
       updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
       created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     )`
  );

  await run(db, "CREATE INDEX IF NOT EXISTS idx_whiteboards_updated_at ON whiteboards(updated_at)");
}

export async function ensureAuditSchema(db) {
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS audit_logs (
       id TEXT PRIMARY KEY,
       iso TEXT NOT NULL,
       user TEXT NOT NULL,
       action TEXT NOT NULL,
       target_type TEXT NOT NULL,
       target_id TEXT,
       target TEXT NOT NULL,
       details TEXT NOT NULL,
       created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     )`
  );

  await run(db, "CREATE INDEX IF NOT EXISTS idx_audit_logs_iso ON audit_logs(iso)");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id)");
}

export async function ensureTeamUsersSchema(db) {
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS team_users (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL UNIQUE COLLATE NOCASE,
       created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     )`
  );

  await run(db, "CREATE INDEX IF NOT EXISTS idx_team_users_created_at ON team_users(created_at)");
}
