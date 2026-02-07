import { json, errorJson, readJson } from "../../_lib/http.js";
import { requireDB, dbAll } from "../../_lib/db.js";

export async function onRequest(context) {
  const { request, env } = context;

  const { db, error } = requireDB(env);
  if (error) return error;

  if (request.method === "GET") {
    const rows = await dbAll(
      db
        .prepare(
          `SELECT id, name, avatar_emoji, avatar_color, created_at, updated_at
           FROM members
           ORDER BY created_at ASC`
        )
    );
    return json({ ok: true, members: rows });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await readJson(request);
    } catch (e) {
      return errorJson(400, e.message);
    }

    const name = String(body.name || "").trim();
    if (!name) return errorJson(400, "name is required");
    if (name.length > 24) return errorJson(400, "name too long (max 24)");

    const avatarEmoji = body.avatarEmoji ? String(body.avatarEmoji).trim() : null;
    const avatarColor = body.avatarColor ? String(body.avatarColor).trim() : null;

    const id = "member_" + crypto.randomUUID().replaceAll("-", "");
    await db
      .prepare(
        `INSERT INTO members (id, name, avatar_emoji, avatar_color, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
      )
      .bind(id, name, avatarEmoji, avatarColor)
      .run();

    const member = await db
      .prepare(
        `SELECT id, name, avatar_emoji, avatar_color, created_at, updated_at
         FROM members
         WHERE id = ?1`
      )
      .bind(id)
      .first();

    return json({ ok: true, member }, { status: 201 });
  }

  return errorJson(405, "Method not allowed", { allow: ["GET", "POST"] });
}
