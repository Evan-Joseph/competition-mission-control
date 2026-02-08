import { json, errorJson } from "../../_lib/http.js";
import { requireDB, dbAll } from "../../_lib/db.js";
import { ensureCompetitionsSchema } from "../../_lib/schema.js";

function parseJsonArray(raw, fallback = []) {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function rowToCompetition(r) {
  return {
    id: r.id,
    name: r.name,
    registration_deadline_at: r.registration_deadline_at,
    submission_deadline_at: r.submission_deadline_at || null,
    result_deadline_at: r.result_deadline_at || null,
    included_in_plan: Boolean(r.included_in_plan),
    registered: Boolean(r.registered),
    status_text: r.status_text || "",
    team_members: parseJsonArray(r.team_members, []).map((x) => String(x)).filter(Boolean),
    links: parseJsonArray(r.links, [])
      .map((x) => {
        if (typeof x === "string") return { title: "", url: x };
        if (x && typeof x === "object") return { title: String(x.title || ""), url: String(x.url || "") };
        return null;
      })
      .filter((x) => x && x.url),
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const { db, error } = requireDB(env);
  if (error) return error;

  if (request.method !== "GET") {
    return errorJson(405, "Method not allowed", { allow: ["GET"] });
  }

  try {
    await ensureCompetitionsSchema(db);

    const rows = await dbAll(
      db.prepare(
        `SELECT
           id,
           name,
           registration_deadline_at,
           submission_deadline_at,
           result_deadline_at,
           included_in_plan,
           registered,
           status_text,
           team_members,
           links,
           created_at,
           updated_at
         FROM competitions
         ORDER BY registration_deadline_at ASC, name COLLATE NOCASE ASC`
      )
    );

    const competitions = rows.map(rowToCompetition);
    return json({ ok: true, competitions, meta: { count: competitions.length, nowISO: new Date().toISOString() } });
  } catch (e) {
    return errorJson(500, "failed to load competitions", { detail: String(e && e.message ? e.message : e) });
  }
}
