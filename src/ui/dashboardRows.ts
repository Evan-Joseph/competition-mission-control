import type { Competition, Member } from "../lib/types";
import { parseISODate } from "../lib/date";
import { STATE_LABEL } from "../lib/compute";

export type GroupBy = "none" | "source" | "result" | "urgency" | "deadline" | "owner" | "state";
export type SortBy = "next" | "name" | "result";

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isMissedRegistration(c: Competition, now: Date): boolean {
  const regEnd = String(c.registration_end || "").trim();
  if (!regEnd) return false;
  const today = localISODate(now);
  if (regEnd >= today) return false;

  const st = String(c.progress_state || "").trim();
  if (!st) return true;
  return st === "not_started" || st === "registering";
}

function displayName(c: Competition): string {
  return String(c.display_name || c.name || "");
}

function compareName(a: Competition, b: Competition): number {
  return displayName(a).localeCompare(displayName(b), "zh-Hans-CN-u-co-pinyin");
}

function compareNextDeadline(a: Competition, b: Competition): number {
  const da = a.nextDeadline;
  const db = b.nextDeadline;
  const ha = Boolean(da && typeof da.daysLeft === "number");
  const hb = Boolean(db && typeof db.daysLeft === "number");
  const ca = !ha ? 2 : (da!.daysLeft >= 0 ? 0 : 1);
  const cb = !hb ? 2 : (db!.daysLeft >= 0 ? 0 : 1);
  if (ca !== cb) return ca - cb;
  if (ca === 0) return da!.daysLeft - db!.daysLeft;
  if (ca === 1) return db!.daysLeft - da!.daysLeft; // -1 before -10
  return compareName(a, b);
}

function compareResultEnd(a: Competition, b: Competition): number {
  const ra = parseISODate(a.result_end || undefined);
  const rb = parseISODate(b.result_end || undefined);
  const ha = Boolean(ra);
  const hb = Boolean(rb);
  if (ha !== hb) return ha ? -1 : 1;
  if (ra && rb) return ra.getTime() - rb.getTime();
  return compareName(a, b);
}

function sortCompetitions(list: Competition[], sortBy: SortBy): Competition[] {
  const copy = [...list];
  if (sortBy === "name") return copy.sort(compareName);
  if (sortBy === "result") return copy.sort(compareResultEnd);
  return copy.sort(compareNextDeadline);
}

type Bucket = { key: string; title: string };

function resultBucket(comp: Competition, now: Date): Bucket {
  const d = parseISODate(comp.result_end || undefined);
  if (!d) return { key: "result:unknown", title: "未公布/未知" };

  const y = now.getFullYear();
  const aug1 = parseISODate(`${y}-08-01`)!;
  const sep1 = parseISODate(`${y}-09-01`)!;
  const oct1 = parseISODate(`${y}-10-01`)!;
  const nextYear1 = parseISODate(`${y + 1}-01-01`)!;

  if (d < aug1) return { key: "result:before_aug", title: "8月前公布" };
  if (d < sep1) return { key: "result:aug", title: "8月公布（=9月前）" };
  if (d < oct1) return { key: "result:sep", title: "9月公布" };
  if (d < nextYear1) return { key: "result:after_sep", title: "10月及以后公布" };
  return { key: "result:next_year", title: "跨年公布" };
}

function urgencyBucket(comp: Competition): Bucket {
  const dl = comp.nextDeadline?.daysLeft;
  if (typeof dl !== "number") return { key: "urgency:unknown", title: "未知" };
  if (dl < 0) return { key: "urgency:past", title: "已过期/已结束" };
  if (dl <= 3) return { key: "urgency:d3", title: "紧急（<=3天）" };
  if (dl <= 7) return { key: "urgency:d7", title: "临近（<=7天）" };
  if (dl <= 14) return { key: "urgency:d14", title: "两周内（<=14天）" };
  return { key: "urgency:future", title: "更远（>14天）" };
}

function deadlineBucket(comp: Competition): Bucket {
  const dl = comp.nextDeadline?.daysLeft;
  if (typeof dl !== "number") return { key: "deadline:unknown", title: "未知" };
  if (dl < 0) return { key: "deadline:overdue", title: "已逾期" };
  if (dl === 0) return { key: "deadline:today", title: "今天" };
  if (dl === 1) return { key: "deadline:tomorrow", title: "明天" };
  if (dl <= 7) return { key: "deadline:next7", title: "7天内" };
  if (dl <= 30) return { key: "deadline:next30", title: "30天内" };
  return { key: "deadline:later", title: "更远（>30天）" };
}

type Group = { key: string; title: string; competitions: Competition[]; stats: { count: number; urgent3: number; urgent7: number; overdue: number } };

function groupCompetitions(list: Competition[], groupBy: GroupBy, members: Member[]): Group[] {
  const now = new Date();
  const groups = new Map<string, { key: string; title: string; competitions: Competition[] }>();
  const add = (key: string, title: string, comp: Competition) => {
    if (!groups.has(key)) groups.set(key, { key, title, competitions: [] });
    groups.get(key)!.competitions.push(comp);
  };

  if (groupBy === "source") {
    for (const c of list) {
      const tag = String(c.source_tag || "").trim();
      add(`source:${tag || "unknown"}`, tag || "未标注", c);
    }
  } else if (groupBy === "result") {
    for (const c of list) {
      const b = resultBucket(c, now);
      add(b.key, b.title, c);
    }
  } else if (groupBy === "urgency") {
    for (const c of list) {
      const b = urgencyBucket(c);
      add(b.key, b.title, c);
    }
  } else if (groupBy === "deadline") {
    for (const c of list) {
      const b = deadlineBucket(c);
      add(b.key, b.title, c);
    }
  } else if (groupBy === "owner") {
    for (const c of list) {
      const ownerId = String(c.progress_owner_member_id || "").trim();
      if (!ownerId) add("owner:unassigned", "未分配", c);
      else add(`owner:${ownerId}`, members.find((m) => m.id === ownerId)?.name || ownerId, c);
    }
  } else if (groupBy === "state") {
    for (const c of list) {
      if (isMissedRegistration(c, now)) {
        add("state:missed", "已错过", c);
        continue;
      }
      const st = String(c.progress_state || "").trim();
      if (!st) add("state:unmaintained", "未维护", c);
      else add(`state:${st}`, STATE_LABEL[st] || st, c);
    }
  } else {
    for (const c of list) add("all", "全部", c);
  }

  const orderIndex = (key: string) => {
    if (groupBy === "source") {
      const tag = key.slice("source:".length);
      const order = ["两者都有", "计科院重点支持", "教育部名录"];
      const idx = order.indexOf(tag);
      return idx === -1 ? 99 : idx;
    }
    if (groupBy === "result") {
      const order = ["result:before_aug", "result:aug", "result:sep", "result:after_sep", "result:next_year", "result:unknown"];
      const idx = order.indexOf(key);
      return idx === -1 ? 99 : idx;
    }
    if (groupBy === "urgency") {
      const order = ["urgency:d3", "urgency:d7", "urgency:d14", "urgency:future", "urgency:past", "urgency:unknown"];
      const idx = order.indexOf(key);
      return idx === -1 ? 99 : idx;
    }
    if (groupBy === "deadline") {
      const order = [
        "deadline:overdue",
        "deadline:today",
        "deadline:tomorrow",
        "deadline:next7",
        "deadline:next30",
        "deadline:later",
        "deadline:unknown",
      ];
      const idx = order.indexOf(key);
      return idx === -1 ? 99 : idx;
    }
    if (groupBy === "owner") {
      if (key === "owner:unassigned") return -1;
      const id = key.slice("owner:".length);
      const idx = members.findIndex((m) => m.id === id);
      return idx === -1 ? 99 : idx;
    }
    if (groupBy === "state") {
      const order = [
        "state:missed",
        "state:unmaintained",
        "state:registering",
        "state:registered",
        "state:incubating",
        "state:submitted",
        "state:competing",
        "state:waiting_result",
        "state:finished",
        "state:not_started",
      ];
      const idx = order.indexOf(key);
      return idx === -1 ? 99 : idx;
    }
    return 0;
  };

  return Array.from(groups.values())
    .map((g) => {
      const comps = g.competitions;
      const urgent7 = comps.filter((c) => typeof c.nextDeadline?.daysLeft === "number" && c.nextDeadline!.daysLeft >= 0 && c.nextDeadline!.daysLeft <= 7).length;
      const urgent3 = comps.filter((c) => typeof c.nextDeadline?.daysLeft === "number" && c.nextDeadline!.daysLeft >= 0 && c.nextDeadline!.daysLeft <= 3).length;
      const overdue = comps.filter((c) => typeof c.nextDeadline?.daysLeft === "number" && c.nextDeadline!.daysLeft < 0).length;
      return { ...g, stats: { count: comps.length, urgent3, urgent7, overdue } };
    })
    .sort((a, b) => orderIndex(a.key) - orderIndex(b.key) || a.title.localeCompare(b.title, "zh-Hans-CN-u-co-pinyin"));
}

export type RowVm =
  | { type: "group"; key: string; title: string; stats: Group["stats"] }
  | { type: "competition"; comp: Competition };

export function buildRows(args: {
  competitions: Competition[];
  groupBy: GroupBy;
  sortBy: SortBy;
  collapsed: Set<string>;
  members: Member[];
}): { rows: RowVm[]; groupKeys: string[] } {
  const { competitions, groupBy, sortBy, collapsed, members } = args;

  if (groupBy === "none") {
    const comps = sortCompetitions(competitions, sortBy);
    return { rows: comps.map((c) => ({ type: "competition", comp: c })), groupKeys: [] };
  }

  const groups = groupCompetitions(competitions, groupBy, members).map((g) => ({
    ...g,
    competitions: sortCompetitions(g.competitions, sortBy),
  }));

  const rows: RowVm[] = [];
  const keys: string[] = [];
  for (const g of groups) {
    keys.push(g.key);
    rows.push({ type: "group", key: g.key, title: g.title, stats: g.stats });
    if (collapsed.has(g.key)) continue;
    for (const c of g.competitions) rows.push({ type: "competition", comp: c });
  }

  return { rows, groupKeys: keys };
}
