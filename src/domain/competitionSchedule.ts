import type { Competition } from "../lib/types";
import { parseYMD, type YMD } from "../lib/date";
import { isMissedRegistration } from "./competitionEvents";

export type DueKind = "reg" | "sub" | "res";
export type Due = { kind: DueKind; iso: YMD; time: number; label: string };

function toValidYMD(s: string | null): YMD | null {
  if (!s) return null;
  const raw = String(s).trim();
  if (!raw) return null;
  const ymd = (raw.includes("T") ? raw.slice(0, 10) : raw) as YMD;
  return parseYMD(ymd) ? ymd : null;
}

export function invalidCompetitionReason(c: Competition): string | null {
  const regISO = toValidYMD(c.registration_deadline_at);
  if (!regISO) return "报名截止日期无效";

  const subISO = c.submission_deadline_at ? toValidYMD(c.submission_deadline_at) : null;
  if (c.submission_deadline_at && !subISO) return "提交截止日期无效";

  const resISO = c.result_deadline_at ? toValidYMD(c.result_deadline_at) : null;
  if (c.result_deadline_at && !resISO) return "结果公布日期无效";

  const regT = parseYMD(regISO)!.getTime();
  const subT = subISO ? parseYMD(subISO)!.getTime() : null;
  const resT = resISO ? parseYMD(resISO)!.getTime() : null;

  if (subT !== null && subT < regT) return "提交截止早于报名截止";
  if (resT !== null && resT < regT) return "结果公布早于报名截止";
  if (subT !== null && resT !== null && resT < subT) return "结果公布早于提交截止";

  return null;
}

export function buildCompetitionDues(c: Competition): Due[] {
  const out: Due[] = [];

  const regISO = toValidYMD(c.registration_deadline_at);
  if (regISO) out.push({ kind: "reg", iso: regISO, time: parseYMD(regISO)!.getTime(), label: "报名截止" });

  const subISO = toValidYMD(c.submission_deadline_at);
  if (subISO) out.push({ kind: "sub", iso: subISO, time: parseYMD(subISO)!.getTime(), label: "提交截止" });

  const resISO = toValidYMD(c.result_deadline_at);
  if (resISO) out.push({ kind: "res", iso: resISO, time: parseYMD(resISO)!.getTime(), label: "结果公布" });

  out.sort((a, b) => a.time - b.time);
  return out;
}

export function isCompetitionEnded(c: Competition, todayISO: YMD): boolean {
  const today = parseYMD(todayISO);
  if (!today) return false;

  // "Ended" means the last meaningful milestone has passed.
  // Registration deadline alone should not mark a registered competition as ended,
  // otherwise "报名截止后备赛/提交未知" would be misclassified as ended.
  const terminalISO = toValidYMD(c.result_deadline_at) || toValidYMD(c.submission_deadline_at);
  if (!terminalISO) return false;

  const terminal = parseYMD(terminalISO);
  if (!terminal) return false;
  return terminal.getTime() < today.getTime();
}

export function nextCompetitionDue(c: Competition, todayISO: YMD): Due | null {
  const invalid = invalidCompetitionReason(c);
  if (invalid) return null;

  const dues = buildCompetitionDues(c);
  if (!dues.length) return null;

  const today = parseYMD(todayISO);
  const todayTime = today ? today.getTime() : null;

  const missed = isMissedRegistration(c, todayISO);
  if (missed) return dues.find((d) => d.kind === "reg") || dues[0]!;

  // No stable "today": fall back to the earliest known milestone.
  if (todayTime === null) return dues[0]!;

  const future = dues.filter((d) => d.time >= todayTime);
  if (!future.length) {
    // Registered competitions might be ongoing even if all known milestones are in the past.
    // Return null to let the UI surface it as "no upcoming milestone".
    return null;
  }

  if (c.registered) {
    // Prefer submission/result once registered.
    const subOrRes = future.find((d) => d.kind === "sub" || d.kind === "res");
    return subOrRes || future[0]!;
  }

  // Not registered: registration is the key action.
  return dues.find((d) => d.kind === "reg") || future[0]!;
}
