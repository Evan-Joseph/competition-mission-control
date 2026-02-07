import type { AIReply, Competition, CompetitionPatch } from "./types";

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
  // Treat non-JSON success responses as failures so callers can fall back to seed data.
  if (res.ok && !isJson) {
    throw new Error("Expected JSON response");
  }

  if (!res.ok) {
    const msg = isJson ? data?.error?.message || `HTTP ${res.status}` : `HTTP ${res.status}`;
    throw new Error(msg);
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
    headers: { "content-type": "application/json" },
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, useWebSearch: Boolean(opts.useWebSearch), includeMissed: Boolean(opts.includeMissed), todayISO: opts.todayISO }),
  });
  return data.reply;
}
