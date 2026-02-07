import { json, errorJson, readJson } from "../../_lib/http.js";
import { requireDB } from "../../_lib/db.js";

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isYMD(s) {
  return YMD_RE.test(String(s || "").trim());
}

function normalizeYMD(v, { allowNull }) {
  if (v === undefined) return undefined;
  if (v === null) return allowNull ? null : undefined;
  const s = String(v || "").trim();
  if (!s) return allowNull ? null : "";
  const ymd = s.includes("T") ? s.slice(0, 10) : s;
  return ymd;
}

function normalizeBool(v) {
  if (v === undefined) return undefined;
  return Boolean(v);
}

function parseJsonArray(raw, fallback = []) {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function normalizeTeamMembers(v) {
  if (v === undefined) return undefined;
  if (v === null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = String(v || "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeLinks(v) {
  if (v === undefined) return undefined;
  if (v === null) return [];
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const x of v) {
    if (typeof x === "string") {
      const url = x.trim();
      if (url) out.push({ title: "", url });
      continue;
    }
    if (x && typeof x === "object") {
      const title = String(x.title || "");
      const url = String(x.url || "").trim();
      if (url) out.push({ title, url });
      continue;
    }
  }
  return out;
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
  const { request, env, params } = context;
  const { db, error } = requireDB(env);
  if (error) return error;

  const id = params.id;
  if (!id) return errorJson(400, "competition id is required");

  if (request.method === "GET") {
    const row = await db
      .prepare(
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
         WHERE id = ?1`
      )
      .bind(id)
      .first();

    if (!row) return errorJson(404, "competition not found");
    return json({ ok: true, competition: rowToCompetition(row) });
  }

  if (request.method === "PATCH") {
    let body;
    try {
      body = await readJson(request);
    } catch (e) {
      return errorJson(400, e.message);
    }

    const patch = body && typeof body === "object" ? body.patch : null;
    if (!patch || typeof patch !== "object") return errorJson(400, "patch is required");

    const current = await db
      .prepare(
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
           links
         FROM competitions
         WHERE id = ?1`
      )
      .bind(id)
      .first();

    if (!current) return errorJson(404, "competition not found");

    const nextReg = normalizeYMD(patch.registration_deadline_at, { allowNull: false });
    const nextSub = normalizeYMD(patch.submission_deadline_at, { allowNull: true });
    const nextRes = normalizeYMD(patch.result_deadline_at, { allowNull: true });
    const nextIncluded = normalizeBool(patch.included_in_plan);
    const nextRegistered = normalizeBool(patch.registered);
    const nextStatus = patch.status_text !== undefined ? String(patch.status_text || "") : undefined;
    const nextTeam = normalizeTeamMembers(patch.team_members);
    const nextLinks = normalizeLinks(patch.links);

    const finalReg = nextReg !== undefined ? nextReg : current.registration_deadline_at;
    const finalSub = nextSub !== undefined ? nextSub : current.submission_deadline_at;
    const finalRes = nextRes !== undefined ? nextRes : current.result_deadline_at;
    const finalIncluded = nextIncluded !== undefined ? nextIncluded : Boolean(current.included_in_plan);
    const finalRegistered = nextRegistered !== undefined ? nextRegistered : Boolean(current.registered);
    const finalStatus = nextStatus !== undefined ? nextStatus : current.status_text || "";
    const finalTeam = nextTeam !== undefined ? nextTeam : parseJsonArray(current.team_members, []);
    const finalLinks = nextLinks !== undefined ? nextLinks : parseJsonArray(current.links, []);

    if (!String(finalReg || "").trim()) return errorJson(400, "registration_deadline_at is required");
    if (!isYMD(finalReg)) return errorJson(400, "registration_deadline_at must be YYYY-MM-DD");
    if (finalSub && !isYMD(finalSub)) return errorJson(400, "submission_deadline_at must be YYYY-MM-DD or null");
    if (finalRes && !isYMD(finalRes)) return errorJson(400, "result_deadline_at must be YYYY-MM-DD or null");

    await db
      .prepare(
        `UPDATE competitions
         SET registration_deadline_at = ?2,
             submission_deadline_at = ?3,
             result_deadline_at = ?4,
             included_in_plan = ?5,
             registered = ?6,
             status_text = ?7,
             team_members = ?8,
             links = ?9,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1`
      )
      .bind(
        id,
        finalReg,
        finalSub || null,
        finalRes || null,
        finalIncluded ? 1 : 0,
        finalRegistered ? 1 : 0,
        finalStatus,
        JSON.stringify(finalTeam),
        JSON.stringify(finalLinks)
      )
      .run();

    const updated = await db
      .prepare(
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
         WHERE id = ?1`
      )
      .bind(id)
      .first();

    return json({ ok: true, competition: rowToCompetition(updated) });
  }

  return errorJson(405, "Method not allowed", { allow: ["GET", "PATCH"] });
}

