const PREFIX = "mmc:";

export function getString(key: string, fallback: string | null = null): string | null {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function setString(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, String(value));
  } catch {
    // ignore
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

