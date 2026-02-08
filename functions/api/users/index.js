import { json, errorJson, readJson, getUser } from "../../_lib/http.js";
import { requireDB, dbAll } from "../../_lib/db.js";
import { ensureAuditSchema, ensureTeamUsersSchema } from "../../_lib/schema.js";

const DEFAULT_USERS = ["高神舟", "聂睿", "孙慧智", "于泽通", "耿孝然"];

function normalizeName(v) {
  return String(v || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

async function ensureUsersTable(db) {
  await ensureTeamUsersSchema(db);

  const countRow = await db.prepare("SELECT COUNT(1) AS count FROM team_users").first();
  const count = Number(countRow?.count || 0);
  if (count > 0) return;

  for (const rawName of DEFAULT_USERS) {
    const name = normalizeName(rawName);
    if (!name) continue;
    await db.prepare("INSERT OR IGNORE INTO team_users (id, name) VALUES (?1, ?2)").bind(`usr_${crypto.randomUUID().replaceAll("-", "")}`, name).run();
  }
}

async function loadUserNames(db) {
  const rows = await dbAll(db.prepare("SELECT name FROM team_users ORDER BY created_at ASC, name COLLATE NOCASE ASC"));
  return rows.map((r) => String(r.name || "").trim()).filter(Boolean);
}

export async function onRequest(context) {
  const { request, env } = context;
  const { db, error } = requireDB(env);
  if (error) return error;

  await ensureUsersTable(db);

  if (request.method === "GET") {
    const users = await loadUserNames(db);
    return json({ ok: true, users, meta: { count: users.length, nowISO: new Date().toISOString() } });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await readJson(request);
    } catch (e) {
      return errorJson(400, e.message);
    }

    const name = normalizeName(body?.name);
    if (!name) return errorJson(400, "name is required");

    const id = `usr_${crypto.randomUUID().replaceAll("-", "")}`;
    try {
      await db.prepare("INSERT INTO team_users (id, name) VALUES (?1, ?2)").bind(id, name).run();
    } catch (e) {
      const msg = String(e && e.message ? e.message : e).toLowerCase();
      if (msg.includes("unique")) return errorJson(409, "成员已存在");
      return errorJson(500, "failed to create user");
    }

    try {
      const actor = getUser(request, "系统");
      await ensureAuditSchema(db);
      await db
        .prepare(
          `INSERT INTO audit_logs (id, iso, user, action, target_type, target_id, target, details)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
        )
        .bind(`al_${crypto.randomUUID().replaceAll("-", "")}`, new Date().toISOString(), actor, "create", "system", id, name, "新增团队成员")
        .run();
    } catch {
      // ignore audit failures
    }

    const users = await loadUserNames(db);
    return json({ ok: true, user: name, users, meta: { count: users.length, nowISO: new Date().toISOString() } }, { status: 201 });
  }

  return errorJson(405, "Method not allowed", { allow: ["GET", "POST"] });
}
