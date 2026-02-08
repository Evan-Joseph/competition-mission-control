import { json, errorJson } from "../../_lib/http.js";
import { requireDB, dbAll } from "../../_lib/db.js";

function clampInt(v, { min, max, fallback }) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export async function onRequest(context) {
  const { request, env } = context;
  const { db, error } = requireDB(env);
  if (error) return error;

  if (request.method !== "GET") {
    return errorJson(405, "Method not allowed", { allow: ["GET"] });
  }

  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get("limit"), { min: 1, max: 500, fallback: 200 });
  const targetType = (url.searchParams.get("target_type") || "").trim() || null;
  const targetId = (url.searchParams.get("target_id") || "").trim() || null;

  const where = [];
  const args = [];
  if (targetType) {
    where.push("target_type = ?1");
    args.push(targetType);
  }
  if (targetId) {
    where.push(`target_id = ?${args.length + 1}`);
    args.push(targetId);
  }

  const sql =
    "SELECT id, iso, user, action, target_type, target_id, target, details " +
    "FROM audit_logs " +
    (where.length ? `WHERE ${where.join(" AND ")} ` : "") +
    "ORDER BY iso DESC " +
    `LIMIT ${limit}`;

  const stmt = db.prepare(sql);
  const rows = args.length ? await dbAll(stmt.bind(...args)) : await dbAll(stmt);

  const logs = rows.map((r) => ({
    id: r.id,
    iso: r.iso,
    user: r.user,
    action: r.action,
    target_type: r.target_type,
    target_id: r.target_id || null,
    target: r.target,
    details: r.details,
  }));

  return json({ ok: true, logs, meta: { count: logs.length, nowISO: new Date().toISOString() } });
}

