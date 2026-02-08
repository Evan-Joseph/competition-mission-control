import { getString, remove, setString } from "../lib/storage";
import type { AuditAction, AuditLogEntry, CompetitionPatch } from "../lib/types";

export type { AuditAction, AuditLogEntry } from "../lib/types";

const STORAGE_KEY = "v3:auditLogs";
const MAX_LOGS = 500;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatLocalTimestamp(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function readLogs(): AuditLogEntry[] {
  try {
    const raw = getString(STORAGE_KEY, "[]") || "[]";
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(Boolean) as AuditLogEntry[];
  } catch {
    return [];
  }
}

function writeLogs(list: AuditLogEntry[]) {
  if (!list.length) {
    remove(STORAGE_KEY);
    return;
  }
  setString(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_LOGS)));
}

export function listAuditLogs(): AuditLogEntry[] {
  const logs = readLogs();
  return logs.sort((a, b) => String(b.iso || "").localeCompare(String(a.iso || "")));
}

export function listAuditLogsForCompetition(competitionId: string): AuditLogEntry[] {
  return listAuditLogs().filter((l) => l.target_type === "competition" && l.target_id === competitionId);
}

export function appendAuditLog(entry: Omit<AuditLogEntry, "id" | "iso" | "timestamp"> & { iso?: string; timestamp?: string }) {
  const now = new Date();
  const iso = entry.iso || now.toISOString();
  const timestamp = entry.timestamp || formatLocalTimestamp(now);
  const id = `al_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const next: AuditLogEntry = {
    id,
    iso,
    timestamp,
    user: entry.user,
    action: entry.action,
    target_type: entry.target_type,
    target_id: entry.target_id,
    target: entry.target,
    details: entry.details,
  };

  const cur = readLogs();
  writeLogs([next, ...cur]);
  return next;
}

export function summarizePatch(patch: CompetitionPatch): string {
  const keys = Object.keys(patch || {});
  if (!keys.length) return "无变更";

  const map: Record<string, string> = {
    registration_deadline_at: "报名截止",
    submission_deadline_at: "提交截止",
    result_deadline_at: "结果公布",
    included_in_plan: "纳入规划",
    registered: "已报名",
    status_text: "状态备注",
    team_members: "队员名单",
    links: "相关链接",
  };

  const labels = keys.map((k) => map[k] || k);
  return `更新了：${labels.join("、")}`;
}
