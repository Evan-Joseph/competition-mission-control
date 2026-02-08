import { json, errorJson, readJson, getUser } from "../../_lib/http.js";
import { requireDB } from "../../_lib/db.js";
import { ensureAuditSchema, ensureWhiteboardsSchema } from "../../_lib/schema.js";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeParseJsonArray(raw, fallback = []) {
  if (!raw) return fallback;
  try {
    const data = JSON.parse(String(raw));
    return Array.isArray(data) ? data : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];

  for (const x of items.slice(0, 500)) {
    if (!x || typeof x !== "object") continue;
    const id = String(x.id || "").trim();
    if (!id || id.length > 80) continue;
    const type = x.type;
    if (type !== "note" && type !== "image" && type !== "text") continue;

    const xx = Number(x.x);
    const yy = Number(x.y);
    if (!Number.isFinite(xx) || !Number.isFinite(yy)) continue;

    const content = typeof x.content === "string" ? x.content : String(x.content ?? "");
    const color = typeof x.color === "string" && x.color.length <= 32 ? x.color : undefined;
    const rotation = Number.isFinite(Number(x.rotation)) ? clamp(Number(x.rotation), -360, 360) : undefined;
    const author = typeof x.author === "string" && x.author.length <= 60 ? x.author : undefined;
    const updated_at = Number.isFinite(Number(x.updated_at)) ? clamp(Number(x.updated_at), 0, 10_000_000_000_000) : undefined;
    const deleted = typeof x.deleted === "boolean" ? x.deleted : undefined;

    out.push({
      id,
      type,
      x: clamp(xx, -200_000, 200_000),
      y: clamp(yy, -200_000, 200_000),
      content: content.slice(0, 10_000),
      color,
      rotation,
      author,
      updated_at,
      deleted,
    });
  }

  return out;
}

function makeEtag(id, version) {
  return `W/\"wb:${encodeURIComponent(id)}:v${Number(version) || 0}\"`;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const { db, error } = requireDB(env);
  if (error) return error;

  const id = params.id;
  if (!id) return errorJson(400, "whiteboard id is required");

  try {
    await ensureWhiteboardsSchema(db);
    if (request.method === "PUT" || request.method === "PATCH") {
      await ensureAuditSchema(db);
    }
  } catch (e) {
    return errorJson(500, "failed to initialize schema", { detail: String(e && e.message ? e.message : e) });
  }

  if (request.method === "GET") {
    try {
      const row = await db.prepare("SELECT competition_id, items_json, version, updated_at FROM whiteboards WHERE competition_id = ?1").bind(id).first();
      const version = row ? Number(row.version) || 0 : 0;
      const etag = makeEtag(id, version);

      const inm = request.headers.get("if-none-match");
      if (inm && inm === etag) {
        return new Response(null, { status: 304, headers: { etag } });
      }

      const items = row ? sanitizeItems(safeParseJsonArray(row.items_json, [])) : [];
      return json({ ok: true, whiteboard: { competition_id: id, items, version, updated_at: row?.updated_at || null } }, { headers: { etag } });
    } catch (e) {
      return errorJson(500, "failed to load whiteboard", { detail: String(e && e.message ? e.message : e) });
    }
  }

  if (request.method === "PUT" || request.method === "PATCH") {
    let body;
    try {
      body = await readJson(request);
    } catch (e) {
      return errorJson(400, e.message);
    }

    const baseVersion = Number(body?.baseVersion);
    if (!Number.isFinite(baseVersion) || baseVersion < 0) return errorJson(400, "baseVersion must be a non-negative number");

    const nextItems = sanitizeItems(body?.items);

    const current = await db.prepare("SELECT competition_id, items_json, version FROM whiteboards WHERE competition_id = ?1").bind(id).first();
    const curVersion = current ? Number(current.version) || 0 : 0;

    if (baseVersion !== curVersion) {
      const curItems = current ? sanitizeItems(safeParseJsonArray(current.items_json, [])) : [];
      return errorJson(409, "Version conflict", { current: { competition_id: id, items: curItems, version: curVersion } });
    }

    const nextVersion = curVersion + 1;
    const nowISO = new Date().toISOString();
    const itemsJson = JSON.stringify(nextItems);

    await db
      .prepare(
        `INSERT INTO whiteboards (competition_id, items_json, version, updated_at)\n         VALUES (?1, ?2, ?3, ?4)\n         ON CONFLICT(competition_id) DO UPDATE SET\n           items_json = excluded.items_json,\n           version = excluded.version,\n           updated_at = excluded.updated_at`
      )
      .bind(id, itemsJson, nextVersion, nowISO)
      .run();

    try {
      const actor = getUser(request);
      await db
        .prepare(
          `INSERT INTO audit_logs (id, iso, user, action, target_type, target_id, target, details)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
        )
        .bind(
          `al_${crypto.randomUUID().replaceAll("-", "")}`,
          nowISO,
          actor,
          "update",
          "competition",
          id,
          id,
          `更新画板：${nextItems.filter((x) => !x.deleted).length} 项`
        )
        .run();
    } catch {
      // ignore audit logging failures
    }

    const etag = makeEtag(id, nextVersion);
    return json({ ok: true, whiteboard: { competition_id: id, items: nextItems, version: nextVersion, updated_at: nowISO } }, { headers: { etag } });
  }

  return errorJson(405, "Method not allowed", { allow: ["GET", "PUT", "PATCH"] });
}
