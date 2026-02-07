async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      "accept": "application/json",
    },
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.toLowerCase().includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = isJson ? (data?.error?.message || `HTTP ${res.status}`) : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function getMembers() {
  const data = await apiFetch("/api/members");
  return data.members || [];
}

export async function createMember(payload) {
  const data = await apiFetch("/api/members", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.member;
}

export async function updateMember(id, payload) {
  const data = await apiFetch(`/api/members/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data.member;
}

export async function getCompetitions(params = {}) {
  const url = new URL("/api/competitions", window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const data = await apiFetch(url.pathname + url.search);
  return data.competitions || [];
}

export async function getCompetition(id) {
  const data = await apiFetch(`/api/competitions/${encodeURIComponent(id)}`);
  return data;
}

export async function updateProgress(competitionId, payload, actorMemberId) {
  const data = await apiFetch(`/api/competitions/${encodeURIComponent(competitionId)}/progress`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-actor-member-id": actorMemberId,
    },
    body: JSON.stringify(payload),
  });
  return data.progress;
}

export async function aiAsk(message, opts = {}) {
  const data = await apiFetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, useWebSearch: Boolean(opts.useWebSearch) }),
  });
  return data.reply;
}
