import { json, errorJson } from "../../_lib/http.js";
import { requireDB, dbFirst, dbAll } from "../../_lib/db.js";

export async function onRequest(context) {
  const { request, env, params } = context;
  const { db, error } = requireDB(env);
  if (error) return error;

  const compId = params.id;
  if (!compId) return errorJson(400, "competition id is required");

  if (request.method !== "GET") {
    return errorJson(405, "Method not allowed", { allow: ["GET"] });
  }

  const competition = await dbFirst(
    db
      .prepare(
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
         WHERE c.id = ?1`
      )
      .bind(compId)
  );

  if (!competition) return errorJson(404, "competition not found");

  const events = await dbAll(
    db
      .prepare(
        `SELECT id, competition_id, actor_member_id, type, payload_json, created_at
         FROM progress_events
         WHERE competition_id = ?1
         ORDER BY created_at DESC
         LIMIT 50`
      )
      .bind(compId)
  );

  return json({ ok: true, competition, events });
}

