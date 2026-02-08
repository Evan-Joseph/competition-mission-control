import type { Competition, CompetitionEvent, CompetitionEventType } from "../lib/types";
import { endOfMonth, endOfWeek, parseYMD, type YMD } from "../lib/date";

export function isMissedRegistration(c: Competition, todayISO: YMD): boolean {
  if (c.registered) return false;
  const reg = parseYMD(c.registration_deadline_at);
  const today = parseYMD(todayISO);
  if (!reg || !today) return false;
  return reg.getTime() < today.getTime();
}

export function eventTypeLabel(t: CompetitionEventType): string {
  if (t === "registration_deadline") return "报名截止";
  if (t === "submission_deadline") return "提交截止";
  return "结果公布";
}

export function eventTypeOrder(t: CompetitionEventType): number {
  if (t === "registration_deadline") return 0;
  if (t === "submission_deadline") return 1;
  return 2;
}

export function buildCompetitionEvents(competitions: Competition[], opts: { showResult: boolean }): CompetitionEvent[] {
  const out: CompetitionEvent[] = [];
  for (const c of competitions) {
    out.push({ event_id: `${c.id}:registration_deadline`, competition_id: c.id, type: "registration_deadline", date: c.registration_deadline_at });
    if (c.submission_deadline_at) out.push({ event_id: `${c.id}:submission_deadline`, competition_id: c.id, type: "submission_deadline", date: c.submission_deadline_at });
    if (opts.showResult && c.result_deadline_at) out.push({ event_id: `${c.id}:result_deadline`, competition_id: c.id, type: "result_deadline", date: c.result_deadline_at });
  }
  return out;
}

export type EventGroupKey = "overdue" | "today" | "this_week" | "this_month" | "later";

export function groupKeyForDate(dateISO: YMD, todayISO: YMD): EventGroupKey {
  const d = parseYMD(dateISO);
  const today = parseYMD(todayISO);
  if (!d || !today) return "later";

  const dt = d.getTime();
  const tt = today.getTime();
  if (dt < tt) return "overdue";
  if (dt === tt) return "today";

  const weekEnd = endOfWeek(today);
  if (dt <= weekEnd.getTime()) return "this_week";

  const monthEnd = endOfMonth(today);
  if (dt <= monthEnd.getTime()) return "this_month";

  return "later";
}

export function groupTitle(key: EventGroupKey): string {
  if (key === "overdue") return "已逾期";
  if (key === "today") return "今天";
  if (key === "this_week") return "本周";
  if (key === "this_month") return "本月";
  return "更晚";
}
