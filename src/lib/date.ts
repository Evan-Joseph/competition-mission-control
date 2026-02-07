export type YMD = string; // YYYY-MM-DD (local date semantics)

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isYMD(s: string): boolean {
  return YMD_RE.test(String(s || ""));
}

export function parseYMD(s?: string | null): Date | null {
  if (!s) return null;
  const m = YMD_RE.exec(String(s).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const d = new Date(y, mm - 1, dd);
  if (Number.isNaN(d.getTime())) return null;
  // Guard against JS Date auto-overflow (e.g. 2026-02-31).
  if (d.getFullYear() !== y || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatYMD(d: Date): YMD {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayYMD(now: Date = new Date()): YMD {
  return formatYMD(now);
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // Monday=0
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(0, 0, 0, 0);
  return e;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function addDaysYMD(ymd: YMD, days: number): YMD | null {
  const d = parseYMD(ymd);
  if (!d) return null;
  return formatYMD(addDays(d, days));
}

export function endOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function formatCNDate(d: Date): string {
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const m = d.getMonth() + 1;
  const day = String(d.getDate()).padStart(2, "0");
  const wd = weekdays[d.getDay()] || "";
  return `${m}月 ${day}日, ${wd}`;
}
