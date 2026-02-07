import { json, errorJson, readJson } from "../../../_lib/http.js";
import { requireDB } from "../../../_lib/db.js";

const ALLOWED_STATES = new Set([
  "not_started",
  "registering",
  "registered",
  "incubating",
  "submitted",
  "competing",
  "waiting_result",
  "finished",
]);

export async function onRequest(context) {
  const { request, env, params } = context;
  const { db, error } = requireDB(env);
  if (error) return error;

  const compId = params.id;
  if (!compId) return errorJson(400, "competition id is required");

  if (request.method !== "PUT" && request.method !== "PATCH") {
    return errorJson(405, "Method not allowed", { allow: ["PUT", "PATCH"] });
  }

  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return errorJson(400, e.message);
  }

  const actorMemberId = request.headers.get("x-actor-member-id") || body.actorMemberId || null;
  if (!actorMemberId) return errorJson(400, "actorMemberId is required (send header x-actor-member-id)");

  const state = String(body.state || "").trim();
  if (!state || !ALLOWED_STATES.has(state)) {
    return errorJson(400, `invalid state. allowed: ${Array.from(ALLOWED_STATES).join(", ")}`);
  }

  const stateDetail = body.stateDetail !== undefined ? (body.stateDetail ? String(body.stateDetail).trim() : null) : null;
  const award = body.award !== undefined ? (body.award ? String(body.award).trim() : null) : null;
  const ownerMemberId = body.ownerMemberId !== undefined ? (body.ownerMemberId ? String(body.ownerMemberId).trim() : null) : null;
  const riskLevel = body.riskLevel !== undefined ? Number(body.riskLevel) : 0;
  const notes = body.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : null;

  await db
    .prepare(
      `INSERT INTO competition_progress (
         competition_id, state, state_detail, award, owner_member_id, risk_level, notes, updated_at, updated_by_member_id
       ) VALUES (
         ?1, ?2, ?3, ?4, ?5, ?6, ?7, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?8
       )
       ON CONFLICT(competition_id) DO UPDATE SET
         state = excluded.state,
         state_detail = excluded.state_detail,
         award = excluded.award,
         owner_member_id = excluded.owner_member_id,
         risk_level = excluded.risk_level,
         notes = excluded.notes,
         updated_at = excluded.updated_at,
         updated_by_member_id = excluded.updated_by_member_id`
    )
    .bind(compId, state, stateDetail, award, ownerMemberId, riskLevel, notes, actorMemberId)
    .run();

  await db
    .prepare(
      `INSERT INTO progress_events (competition_id, actor_member_id, type, payload_json)
       VALUES (?1, ?2, 'progress_update', ?3)`
    )
    .bind(
      compId,
      actorMemberId,
      JSON.stringify({ state, stateDetail, award, ownerMemberId, riskLevel, notes }, null, 0)
    )
    .run();

  const progress = await db
    .prepare(
      `SELECT competition_id, state, state_detail, award, owner_member_id, risk_level, notes, updated_at, updated_by_member_id
       FROM competition_progress
       WHERE competition_id = ?1`
    )
    .bind(compId)
    .first();

  return json({ ok: true, progress });
}

