const PREFIX = "mmc:";

export function getString(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function setString(key, value) {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    // ignore
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

