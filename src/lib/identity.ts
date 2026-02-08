import { getString, setString } from "./storage";

const STORAGE_MEMBERS = "v3:identity:members";
const STORAGE_CURRENT = "v3:identity:current";
const IDENTITY_CHANGED_EVENT = "mmc:identity-changed";

export const DEFAULT_MEMBERS = ["高神舟", "聂睿", "孙慧智", "于泽通", "耿孝然"] as const;

function normalizeName(v: string): string {
  return String(v || "").trim().replace(/\s+/g, " ").slice(0, 32);
}

function unique(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const name = normalizeName(raw);
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function readMembersRaw(): string[] {
  try {
    const raw = getString(STORAGE_MEMBERS, "[]") || "[]";
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((x) => String(x || ""));
  } catch {
    return [];
  }
}

function writeMembersRaw(members: string[]) {
  setString(STORAGE_MEMBERS, JSON.stringify(unique(members)));
}

function notifyIdentityChanged() {
  try {
    window.dispatchEvent(new Event(IDENTITY_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

export function listIdentityMembers(): string[] {
  const merged = unique([...DEFAULT_MEMBERS, ...readMembersRaw()]);
  if (!merged.length) return [...DEFAULT_MEMBERS];
  return merged;
}

export function getCurrentIdentityUser(): string {
  const cur = normalizeName(getString(STORAGE_CURRENT, DEFAULT_MEMBERS[0]) || "");
  if (cur) return cur;
  const fallback = DEFAULT_MEMBERS[0];
  setString(STORAGE_CURRENT, fallback);
  return fallback;
}

export function addIdentityMember(name: string): { ok: boolean; reason?: string; members: string[]; currentUser: string } {
  const v = normalizeName(name);
  if (!v) return { ok: false, reason: "姓名不能为空", members: listIdentityMembers(), currentUser: getCurrentIdentityUser() };

  const members = listIdentityMembers();
  if (members.includes(v)) return { ok: false, reason: "成员已存在", members, currentUser: getCurrentIdentityUser() };

  const next = unique([...members, v]);
  writeMembersRaw(next);
  notifyIdentityChanged();
  return { ok: true, members: next, currentUser: getCurrentIdentityUser() };
}

export function setCurrentIdentityUser(name: string): { ok: boolean; reason?: string; currentUser: string } {
  const v = normalizeName(name);
  if (!v) {
    return { ok: false, reason: "姓名不能为空", currentUser: getCurrentIdentityUser() };
  }
  setString(STORAGE_CURRENT, v);
  notifyIdentityChanged();
  return { ok: true, currentUser: v };
}

export function subscribeIdentityChanged(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(IDENTITY_CHANGED_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(IDENTITY_CHANGED_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
