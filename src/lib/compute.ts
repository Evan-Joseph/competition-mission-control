import type { Competition } from "./types";
import { addDays, daysBetweenCeil, parseISODate, startOfWeek } from "./date";

export const STATE_LABEL: Record<string, string> = {
  not_started: "未开始",
  registering: "报名中",
  registered: "已报名",
  incubating: "孵化中",
  submitted: "已提交",
  competing: "比赛中",
  waiting_result: "等待结果",
  finished: "完工/获奖",
};

export function computeAutoPhase(comp: Competition, now: Date): string {
  const rs = parseISODate(comp.registration_start);
  const re = parseISODate(comp.registration_end);
  const ss = parseISODate(comp.submission_start);
  const se = parseISODate(comp.submission_end);
  const re2 = parseISODate(comp.result_end);

  if (rs && re && now >= rs && now <= re) return "报名中";
  if (ss && se && now >= ss && now <= se) return "提交中";
  if (re2 && se && now >= se && now <= re2) return "等待结果";
  return "未维护";
}

export function computeNextDeadline(comp: Competition, now: Date): Competition["nextDeadline"] {
  const candidates = [
    { key: "registration_end" as const, label: "报名截止", date: parseISODate(comp.registration_end) },
    { key: "submission_end" as const, label: "提交截止", date: parseISODate(comp.submission_end) },
    { key: "result_end" as const, label: "结果公布", date: parseISODate(comp.result_end) },
  ].filter((c) => c.date);

  const future = candidates.filter((c) => c.date!.getTime() >= now.getTime()).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  if (future.length > 0) {
    const c = future[0];
    return { key: c.key, label: c.label, dateISO: c.date!.toISOString().slice(0, 10), daysLeft: daysBetweenCeil(now, c.date!) };
  }

  const past = candidates.sort((a, b) => b.date!.getTime() - a.date!.getTime());
  if (past.length > 0) {
    const c = past[0];
    return { key: c.key, label: c.label, dateISO: c.date!.toISOString().slice(0, 10), daysLeft: -daysBetweenCeil(c.date!, now) };
  }

  return null;
}

export function ensureNextDeadlines(list: Competition[]): Competition[] {
  const now = new Date();
  return list.map((c) => (c.nextDeadline ? c : { ...c, nextDeadline: computeNextDeadline(c, now) }));
}

export type UrgencyTone = { dot: string; text: string; badge: "" | "紧急" | "临近" };

export function urgencyTone(daysLeft: number | null | undefined): UrgencyTone {
  if (daysLeft === null || daysLeft === undefined) return { dot: "bg-slate-400", text: "text-slate-400", badge: "" };
  if (daysLeft <= 3) return { dot: "bg-danger", text: "text-danger", badge: "紧急" };
  if (daysLeft <= 7) return { dot: "bg-warning", text: "text-warning", badge: "临近" };
  return { dot: "bg-success", text: "text-slate-400", badge: "" };
}

export type TimelineState = { start: Date; days: number; columnWidth: number };

export function defaultTimeline(): TimelineState {
  return { start: startOfWeek(new Date()), days: 84, columnWidth: 100 };
}

export function timelineRangeLabel(tl: TimelineState): string {
  const start = tl.start;
  const end = addDays(start, tl.days - 1);
  const sY = start.getFullYear();
  const eY = end.getFullYear();
  const sM = start.getMonth() + 1;
  const eM = end.getMonth() + 1;
  if (sY === eY) return `${sY}年 ${sM}月 - ${eM}月`;
  return `${sY}年${sM}月 - ${eY}年${eM}月`;
}

