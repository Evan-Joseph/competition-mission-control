import type { Competition, CompetitionPatch } from "./types";
import { getString, remove, setString } from "./storage";

const STORAGE_PATCHES = "v2:competitionPatches";

type PatchMap = Record<string, CompetitionPatch>;

function readPatchMap(): PatchMap {
  try {
    const raw = getString(STORAGE_PATCHES, "{}") || "{}";
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    return obj as PatchMap;
  } catch {
    return {};
  }
}

function writePatchMap(map: PatchMap): void {
  const keys = Object.keys(map);
  if (keys.length === 0) {
    remove(STORAGE_PATCHES);
    return;
  }
  setString(STORAGE_PATCHES, JSON.stringify(map));
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

