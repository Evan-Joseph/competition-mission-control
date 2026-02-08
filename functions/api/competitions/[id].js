import { json, errorJson, readJson, getUser } from "../../_lib/http.js";
import { requireDB } from "../../_lib/db.js";
import { ensureAuditSchema, ensureCompetitionsSchema } from "../../_lib/schema.js";

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isYMD(s) {
  return YMD_RE.test(String(s || "").trim());
}

function isValidYMD(s) {
  const m = YMD_RE.exec(String(s || "").trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return false;
  if (mo < 1 || mo > 12) return false;
  const daysInMonth = new Date(y, mo, 0).getDate();
  if (d < 1 || d > daysInMonth) return false;
  return true;
}

function ymdTime(s) {
  const m = YMD_RE.exec(String(s || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getTime();
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
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v || "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
  if (s === "false" || s === "0" || s === "no" || s === "n") return false;
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

function normalizeLinksForCompare(v) {
  const arr = normalizeLinks(v);
  // Stable ordering for diff: url asc then title.
  return arr.slice().sort((a, b) => String(a.url || "").localeCompare(String(b.url || "")) || String(a.title || "").localeCompare(String(b.title || "")));
}

function normalizeTeamForCompare(v) {
  const arr = normalizeTeamMembers(v) || [];
  return arr.slice();
}

function summarizeChangedKeys(keys) {
  if (!keys.length) return "无变更";
  const map = {
    registration_deadline_at: "报名截止",
    submission_deadline_at: "提交截止",
    result_deadline_at: "结果公布",
    included_in_plan: "纳入规划",
    registered: "已报名",
    status_text: "状态备注",
    team_members: "队员名单",
    links: "相关链接",
  };
  return "更新了：" + keys.map((k) => map[k] || k).join("、");
}

function diffCompetition(current, next) {
  const changed = [];
  if (String(current.registration_deadline_at || "") !== String(next.registration_deadline_at || "")) changed.push("registration_deadline_at");
  if (String(current.submission_deadline_at || "") !== String(next.submission_deadline_at || "")) changed.push("submission_deadline_at");
  if (String(current.result_deadline_at || "") !== String(next.result_deadline_at || "")) changed.push("result_deadline_at");
  if (Boolean(current.included_in_plan) !== Boolean(next.included_in_plan)) changed.push("included_in_plan");
  if (Boolean(current.registered) !== Boolean(next.registered)) changed.push("registered");
  if (String(current.status_text || "") !== String(next.status_text || "")) changed.push("status_text");

  const curTeam = normalizeTeamForCompare(parseJsonArray(current.team_members, []));
  const nextTeam = normalizeTeamForCompare(next.team_members);
  if (JSON.stringify(curTeam) !== JSON.stringify(nextTeam)) changed.push("team_members");

  const curLinks = normalizeLinksForCompare(parseJsonArray(current.links, []));
  const nextLinks = normalizeLinksForCompare(next.links);
  if (JSON.stringify(curLinks) !== JSON.stringify(nextLinks)) changed.push("links");

  return changed;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const { db, error } = requireDB(env);
  if (error) return error;

  const id = params.id;
  if (!id) return errorJson(400, "competition id is required");

  try {
    await ensureCompetitionsSchema(db);
    if (request.method === "PATCH") {
      await ensureAuditSchema(db);
    }
  } catch (e) {
    return errorJson(500, "failed to initialize schema", { detail: String(e && e.message ? e.message : e) });
  }

  if (request.method === "GET") {
    try {
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
    } catch (e) {
      return errorJson(500, "failed to load competition", { detail: String(e && e.message ? e.message : e) });
    }
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
    if (!isValidYMD(finalReg)) return errorJson(400, "registration_deadline_at is not a real calendar date");
    if (finalSub && !isYMD(finalSub)) return errorJson(400, "submission_deadline_at must be YYYY-MM-DD or null");
    if (finalSub && !isValidYMD(finalSub)) return errorJson(400, "submission_deadline_at is not a real calendar date");
    if (finalRes && !isYMD(finalRes)) return errorJson(400, "result_deadline_at must be YYYY-MM-DD or null");
    if (finalRes && !isValidYMD(finalRes)) return errorJson(400, "result_deadline_at is not a real calendar date");

    const regT = ymdTime(finalReg);
    const subT = finalSub ? ymdTime(finalSub) : null;
    const resT = finalRes ? ymdTime(finalRes) : null;
    if (regT === null) return errorJson(400, "registration_deadline_at is invalid");
    if (subT !== null && subT < regT) return errorJson(400, "submission_deadline_at must be on/after registration_deadline_at");
    if (resT !== null && resT < regT) return errorJson(400, "result_deadline_at must be on/after registration_deadline_at");
    if (subT !== null && resT !== null && resT < subT) return errorJson(400, "result_deadline_at must be on/after submission_deadline_at");

    const changedKeys = diffCompetition(current, {
      registration_deadline_at: finalReg,
      submission_deadline_at: finalSub || null,
      result_deadline_at: finalRes || null,
      included_in_plan: finalIncluded,
      registered: finalRegistered,
      status_text: finalStatus,
      team_members: finalTeam,
      links: finalLinks,
    });

    try {
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
    } catch (e) {
      return errorJson(500, "failed to update competition", { detail: String(e && e.message ? e.message : e) });
    }

    if (changedKeys.length) {
      try {
        const user = getUser(request);
        const id2 = "al_" + crypto.randomUUID().replaceAll("-", "");
        const iso = new Date().toISOString();
        const details = summarizeChangedKeys(changedKeys);
        await db
          .prepare(
            `INSERT INTO audit_logs (id, iso, user, action, target_type, target_id, target, details)\n             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
          )
          .bind(id2, iso, user, "update", "competition", id, String(current.name || id), details)
          .run();
      } catch {
        // ignore audit logging failures (schema not migrated, etc.)
      }
    }

    try {
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
    } catch (e) {
      return errorJson(500, "failed to load updated competition", { detail: String(e && e.message ? e.message : e) });
    }
  }

  return errorJson(405, "Method not allowed", { allow: ["GET", "PATCH"] });
}
