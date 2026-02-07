import type { Competition, Member } from "./types";

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

  if (!res.ok) {
    const msg = isJson ? data?.error?.message || `HTTP ${res.status}` : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data as T;
}

export async function getMembers(): Promise<Member[]> {
  const data = await apiFetch<{ ok: true; members: Member[] }>("/api/members");
  return data.members || [];
}

export async function createMember(payload: { name: string; avatarEmoji?: string | null; avatarColor?: string | null }): Promise<Member> {
  const data = await apiFetch<{ ok: true; member: Member }>("/api/members", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.member;
}

export async function updateMember(
  id: string,
  payload: { name: string; avatarEmoji?: string | null; avatarColor?: string | null }
): Promise<Member> {
  const data = await apiFetch<{ ok: true; member: Member }>(`/api/members/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.member;
}

export async function getCompetitions(): Promise<Competition[]> {
  const data = await apiFetch<{ ok: true; competitions: Competition[] }>("/api/competitions");
  return data.competitions || [];
}

export async function updateProgress(
  competitionId: string,
  payload: {
    state: string;
    ownerMemberId?: string | null;
    stateDetail?: string | null;
    award?: string | null;
    notes?: string | null;
    riskLevel?: number;
  },
  actorMemberId: string
): Promise<any> {
  const data = await apiFetch<{ ok: true; progress: any }>(`/api/competitions/${encodeURIComponent(competitionId)}/progress`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-actor-member-id": actorMemberId,
    },
    body: JSON.stringify(payload),
  });
  return data.progress;
}

export async function aiAsk(message: string, opts: { useWebSearch: boolean }): Promise<{ content: string }> {
  const data = await apiFetch<{ ok: true; reply: { content: string } }>("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, useWebSearch: Boolean(opts.useWebSearch) }),
  });
  return data.reply;
}

