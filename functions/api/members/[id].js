import { json, errorJson, readJson } from "../../_lib/http.js";
import { requireDB } from "../../_lib/db.js";

export async function onRequest(context) {
  const { request, env, params } = context;
  const { db, error } = requireDB(env);
  if (error) return error;

  const memberId = params.id;
  if (!memberId) return errorJson(400, "member id is required");

  if (request.method === "GET") {
    const member = await db
      .prepare(
        `SELECT id, name, avatar_emoji, avatar_color, created_at, updated_at
         FROM members
         WHERE id = ?1`
      )
      .bind(memberId)
      .first();
    if (!member) return errorJson(404, "member not found");
    return json({ ok: true, member });
  }

  if (request.method === "PATCH") {
    let body;
    try {
      body = await readJson(request);
    } catch (e) {
      return errorJson(400, e.message);
    }

    const name = body.name !== undefined ? String(body.name || "").trim() : undefined;
    if (name !== undefined) {
      if (!name) return errorJson(400, "name cannot be empty");
      if (name.length > 24) return errorJson(400, "name too long (max 24)");
    }

    const avatarEmoji = body.avatarEmoji !== undefined ? (body.avatarEmoji ? String(body.avatarEmoji).trim() : null) : undefined;
    const avatarColor = body.avatarColor !== undefined ? (body.avatarColor ? String(body.avatarColor).trim() : null) : undefined;

    const current = await db
      .prepare(`SELECT id, name, avatar_emoji, avatar_color FROM members WHERE id = ?1`)
      .bind(memberId)
      .first();
    if (!current) return errorJson(404, "member not found");

    const nextName = name !== undefined ? name : current.name;
    const nextEmoji = avatarEmoji !== undefined ? avatarEmoji : current.avatar_emoji;
    const nextColor = avatarColor !== undefined ? avatarColor : current.avatar_color;

    await db
      .prepare(
        `UPDATE members
         SET name = ?2,
             avatar_emoji = ?3,
             avatar_color = ?4,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?1`
      )
      .bind(memberId, nextName, nextEmoji, nextColor)
      .run();

    const member = await db
      .prepare(
        `SELECT id, name, avatar_emoji, avatar_color, created_at, updated_at
         FROM members
         WHERE id = ?1`
      )
      .bind(memberId)
      .first();

    return json({ ok: true, member });
  }

  return errorJson(405, "Method not allowed", { allow: ["GET", "PATCH"] });
}

