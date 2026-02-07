import { errorJson } from "./http.js";

export function getDB(env) {
  const db = env && env.DB;
  return db || null;
}

export function requireDB(env) {
  const db = getDB(env);
  if (!db) {
    return { db: null, error: errorJson(500, "DB binding (D1) is not configured. Bind env.DB as a D1 database.") };
  }
  return { db, error: null };
}

export async function dbAll(stmt) {
  const res = await stmt.all();
  return res.results || [];
}

export async function dbFirst(stmt) {
  const res = await stmt.all();
  const rows = res.results || [];
  return rows[0] || null;
}

