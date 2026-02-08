export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "no-store");
  }
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

export function text(data, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/plain; charset=utf-8");
  }
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "no-store");
  }
  return new Response(data, { ...init, headers });
}

export function errorJson(status, message, extra = {}) {
  return json({ ok: false, error: { message, ...extra } }, { status });
}

export async function readJson(request) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    throw new Error("Expected application/json request body");
  }
  return await request.json();
}

/**
 * Get the user name from x-mmc-user header.
 * The frontend URL-encodes the user name to handle Unicode characters,
 * so we decode it here.
 * @param {Request} request - The incoming request
 * @param {string} [fallback="本地用户"] - Fallback value if header is missing
 * @returns {string} The decoded user name
 */
export function getUser(request, fallback = "本地用户") {
  const raw = request.headers.get("x-mmc-user") || "";
  if (!raw.trim()) return fallback;
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    // If decode fails, return raw value (backwards compatibility)
    return raw.trim() || fallback;
  }
}
