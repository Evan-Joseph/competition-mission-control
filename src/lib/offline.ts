import type { Competition, CompetitionPatch } from "./types";
import { getString, remove, setString } from "./storage";

// v2 key is kept for backwards compatibility; v3 writes to its own key.
const STORAGE_PATCHES_V2 = "v2:competitionPatches";
const STORAGE_PATCHES_V3 = "v3:competitionPatches";

type PatchMap = Record<string, CompetitionPatch>;

function safeParseMap(raw: string | null): PatchMap {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    return obj as PatchMap;
  } catch {
    return {};
  }
}

function readPatchMap(): PatchMap {
  // Merge v2 + v3 with v3 taking precedence.
  const v3 = safeParseMap(getString(STORAGE_PATCHES_V3, "{}") || "{}");
  const v2 = safeParseMap(getString(STORAGE_PATCHES_V2, "{}") || "{}");
  const merged: PatchMap = { ...v2, ...v3 };

  // One-time migration: if only v2 exists, write into v3 to make future ops consistent.
  if (Object.keys(v3).length === 0 && Object.keys(v2).length > 0) {
    try {
      setString(STORAGE_PATCHES_V3, JSON.stringify(merged));
    } catch {
      // ignore
    }
  }
  return merged;
}

function writePatchMap(map: PatchMap): void {
  const keys = Object.keys(map);
  if (keys.length === 0) {
    remove(STORAGE_PATCHES_V3);
    return;
  }
  setString(STORAGE_PATCHES_V3, JSON.stringify(map));
}

export function applyOfflinePatches(list: Competition[]): Competition[] {
  const patches = readPatchMap();
  if (!patches || Object.keys(patches).length === 0) return list;
  return list.map((c) => (patches[c.id] ? { ...c, ...patches[c.id] } : c));
}

export function upsertOfflinePatch(id: string, patch: CompetitionPatch): void {
  const next: PatchMap = { ...readPatchMap() };
  next[id] = { ...(next[id] || {}), ...patch };
  writePatchMap(next);
}

export function listOfflinePatches(): PatchMap {
  return readPatchMap();
}

export function clearOfflinePatch(id: string): void {
  const next: PatchMap = { ...readPatchMap() };
  if (!next[id]) return;
  delete next[id];
  writePatchMap(next);
}
