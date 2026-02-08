import { getString, setString } from "./storage";

export type ThemePref = "system" | "light" | "dark";

const STORAGE_THEME = "theme";

export function readThemePref(): ThemePref {
  // V3 is dark-first: treat missing pref as "dark" to avoid a light flash.
  const v = String(getString(STORAGE_THEME, "dark") || "dark");
  if (v === "light" || v === "dark" || v === "system") return v;
  return "dark";
}

function systemPrefersDark(): boolean {
  try {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch {
    return false;
  }
}

export function resolvedIsDark(pref: ThemePref): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  return systemPrefersDark();
}

export function applyThemePref(pref: ThemePref): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolvedIsDark(pref));
  root.dataset.theme = pref;
}

export function setThemePref(pref: ThemePref): void {
  setString(STORAGE_THEME, pref);
  applyThemePref(pref);
}

export function toggleThemePref(cur: ThemePref): ThemePref {
  if (cur === "system") return resolvedIsDark(cur) ? "light" : "dark";
  return cur === "dark" ? "light" : "dark";
}
