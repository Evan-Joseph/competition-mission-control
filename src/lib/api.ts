import type { AIReply, AuditLogEntry, Competition, CompetitionPatch, WhiteboardDoc, WhiteboardItem } from "./types";
import { getCurrentIdentityUser } from "./identity";

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      accept: "application/json",
    },
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.toLowerCase().includes("application/json");
  const data: any = isJson ? await res.json() : await res.text();

  // When running under Vite dev (no Pages Functions), "/api/*" might return HTML.
  // Treat non-JSON success responses as failures so callers can surface backend connection errors.
  if (res.ok && !isJson) {
    throw new Error("Expected JSON response");
  }

  if (!res.ok) {
    const msg = isJson ? data?.error?.message || `HTTP ${res.status}` : `HTTP ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data as T;
}

export async function listCompetitions(): Promise<Competition[]> {
  const data = await apiFetch<{ ok: true; competitions: Competition[] }>("/api/competitions");
  return data.competitions || [];
}

export async function patchCompetition(id: string, patch: CompetitionPatch): Promise<Competition> {
  const data = await apiFetch<{ ok: true; competition: Competition }>(`/api/competitions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-mmc-user": getCurrentIdentityUser() },
    body: JSON.stringify({ patch }),
  });
  return data.competition;
}

export async function aiAsk(
  message: string,
  opts: { useWebSearch: boolean; includeMissed: boolean; todayISO: string }
): Promise<AIReply> {
  const data = await apiFetch<{ ok: true; reply: AIReply }>("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmc-user": getCurrentIdentityUser() },
    body: JSON.stringify({ message, useWebSearch: Boolean(opts.useWebSearch), includeMissed: Boolean(opts.includeMissed), todayISO: opts.todayISO }),
  });
  return data.reply;
}

export async function listAuditLogs(opts?: { target_type?: "competition" | "system"; target_id?: string; limit?: number }): Promise<AuditLogEntry[]> {
  const sp = new URLSearchParams();
  if (opts?.target_type) sp.set("target_type", opts.target_type);
  if (opts?.target_id) sp.set("target_id", opts.target_id);
  if (opts?.limit) sp.set("limit", String(opts.limit));
  const qs = sp.toString();
  const data = await apiFetch<{ ok: true; logs: AuditLogEntry[] }>(`/api/audit${qs ? `?${qs}` : ""}`);
  return data.logs || [];
}

export async function listUsers(): Promise<string[]> {
  const data = await apiFetch<{ ok: true; users: string[] }>("/api/users");
  return data.users || [];
}

export async function createUser(name: string): Promise<string> {
  const data = await apiFetch<{ ok: true; user: string }>("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmc-user": getCurrentIdentityUser() },
    body: JSON.stringify({ name }),
  });
  return String(data.user || "").trim();
}

export async function getWhiteboard(competitionId: string): Promise<WhiteboardDoc> {
  const data = await apiFetch<{ ok: true; whiteboard: WhiteboardDoc }>(`/api/whiteboards/${encodeURIComponent(competitionId)}`);
  return data.whiteboard;
}

export async function putWhiteboard(competitionId: string, body: { items: WhiteboardItem[]; baseVersion: number }): Promise<WhiteboardDoc> {
  const data = await apiFetch<{ ok: true; whiteboard: WhiteboardDoc }>(`/api/whiteboards/${encodeURIComponent(competitionId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-mmc-user": getCurrentIdentityUser() },
    body: JSON.stringify(body),
  });
  return data.whiteboard;
}
