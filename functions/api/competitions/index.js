import { json, errorJson } from "../../_lib/http.js";
import { requireDB, dbAll } from "../../_lib/db.js";
import { parseISODate, daysBetween } from "../../_lib/time.js";

function computeNextDeadline(row, now) {
  const candidates = [
    { key: "registration_end", label: "报名截止", date: parseISODate(row.registration_end) },
    { key: "submission_end", label: "提交截止", date: parseISODate(row.submission_end) },
    { key: "result_end", label: "结果公布", date: parseISODate(row.result_end) },
  ].filter((c) => c.date);

  // Pick next >= now; else last passed.
  const future = candidates.filter((c) => c.date.getTime() >= now.getTime()).sort((a, b) => a.date - b.date);
  if (future.length > 0) {
    const c = future[0];
    return { key: c.key, label: c.label, dateISO: c.date.toISOString().slice(0, 10), daysLeft: daysBetween(now, c.date) };
  }

  const past = candidates.sort((a, b) => b.date - a.date);
  if (past.length > 0) {
    const c = past[0];
    return { key: c.key, label: c.label, dateISO: c.date.toISOString().slice(0, 10), daysLeft: -daysBetween(c.date, now) };
  }
  return null;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const { db, error } = requireDB(env);
  if (error) return error;

  if (request.method !== "GET") {
    return errorJson(405, "Method not allowed", { allow: ["GET"] });
  }

  const q = (url.searchParams.get("q") || "").trim();
  const owner = (url.searchParams.get("owner") || "").trim();
  const state = (url.searchParams.get("state") || "").trim();
  const urgentOnly = url.searchParams.get("urgentOnly") === "1";

  // Basic filtering in SQL; more complex filters can be done client-side.
  const where = [];
  const binds = [];
  if (q) {
    where.push(`c.display_name LIKE ?`);
    binds.push(`%${q}%`);
  }
  if (owner) {
    where.push(`p.owner_member_id = ?`);
    binds.push(owner);
  }
  if (state) {
    where.push(`p.state = ?`);
    binds.push(state);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const stmt = db.prepare(
    `SELECT
       c.*,
       p.state AS progress_state,
       p.state_detail AS progress_state_detail,
       p.award AS progress_award,
       p.owner_member_id AS progress_owner_member_id,
       p.risk_level AS progress_risk_level,
       p.notes AS progress_notes,
       p.updated_at AS progress_updated_at,
       p.updated_by_member_id AS progress_updated_by_member_id
     FROM competitions c
     LEFT JOIN competition_progress p ON p.competition_id = c.id
     ${whereSql}
     ORDER BY c.display_name COLLATE NOCASE ASC`
  );

  const rows = binds.length ? await dbAll(stmt.bind(...binds)) : await dbAll(stmt);

  const now = new Date();
  const competitions = rows.map((r) => {
    const nextDeadline = computeNextDeadline(r, now);
    return { ...r, nextDeadline };
  });

  const urgent = (c) => c.nextDeadline && c.nextDeadline.daysLeft >= 0 && c.nextDeadline.daysLeft <= 7;
  const filtered = urgentOnly ? competitions.filter(urgent) : competitions;

  return json({ ok: true, competitions: filtered, meta: { count: filtered.length, nowISO: now.toISOString() } });
}

