import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { aiAsk, listCompetitions, patchCompetition } from "../lib/api";
import { applyOfflinePatches, upsertOfflinePatch } from "../lib/offline";
import type { AIAction, AIReply, Competition, CompetitionEvent, CompetitionEventType, CompetitionPatch } from "../lib/types";
import { addDays, endOfMonth, endOfWeek, formatCNDate, formatYMD, isYMD, parseYMD, startOfWeek, todayYMD, type YMD } from "../lib/date";
import ThemeToggle from "./ThemeToggle";

const VIEW_PARAM = "view";
const OPEN_PARAM = "open";
const CAL_PARAM = "cal"; // month|week
const CAL_DATE_PARAM = "d"; // anchor YYYY-MM-DD

type View = "list" | "calendar";
type CalendarMode = "month" | "week";
type BoardFilters = { onlyPlanned: boolean; onlyRegistered: boolean; showResult: boolean; showMissed: boolean };

type LoadResult = { competitions: Competition[]; source: "api" | "seed" };

async function loadSeedCompetitions(): Promise<Competition[]> {
  const r = await fetch("/data/competitions.seed.json", { headers: { accept: "application/json" } });
  if (!r.ok) return [];
  const j = await r.json();
  if (!Array.isArray(j)) return [];
  // Trust seed shape; runtime coercion happens elsewhere.
  return j as Competition[];
}

async function loadCompetitionsWithFallback(): Promise<LoadResult> {
  try {
    const competitions = await listCompetitions();
    return { competitions, source: "api" };
  } catch {
    const competitions = await loadSeedCompetitions();
    return { competitions, source: "seed" };
  }
}

function localISODate(d: Date): YMD {
  return formatYMD(d);
}

function isMissedRegistration(c: Competition, todayISO: YMD): boolean {
  return c.registration_deadline_at < todayISO && !c.registered;
}

function eventTypeLabel(t: CompetitionEventType): string {
  if (t === "registration_deadline") return "报名截止";
  if (t === "submission_deadline") return "提交截止";
  return "结果公布";
}

function eventTypeOrder(t: CompetitionEventType): number {
  if (t === "registration_deadline") return 0;
  if (t === "submission_deadline") return 1;
  return 2;
}

function buildEvents(competitions: Competition[], opts: { showResult: boolean }): CompetitionEvent[] {
  const out: CompetitionEvent[] = [];
  for (const c of competitions) {
    out.push({ event_id: `${c.id}:registration_deadline`, competition_id: c.id, type: "registration_deadline", date: c.registration_deadline_at });
    if (c.submission_deadline_at) out.push({ event_id: `${c.id}:submission_deadline`, competition_id: c.id, type: "submission_deadline", date: c.submission_deadline_at });
    if (opts.showResult && c.result_deadline_at) out.push({ event_id: `${c.id}:result_deadline`, competition_id: c.id, type: "result_deadline", date: c.result_deadline_at });
  }
  return out;
}

function groupKeyForDate(dateISO: YMD, todayISO: YMD): "overdue" | "today" | "this_week" | "this_month" | "later" {
  if (dateISO < todayISO) return "overdue";
  if (dateISO === todayISO) return "today";

  const today = parseYMD(todayISO) || new Date();
  const weekEnd = localISODate(endOfWeek(today));
  if (dateISO <= weekEnd) return "this_week";

  const monthEnd = localISODate(endOfMonth(today));
  if (dateISO <= monthEnd) return "this_month";

  return "later";
}

function groupTitle(key: ReturnType<typeof groupKeyForDate>): string {
  if (key === "overdue") return "已逾期";
  if (key === "today") return "今天";
  if (key === "this_week") return "本周";
  if (key === "this_month") return "本月";
  return "更晚";
}

function clampText(s: string, max = 160): string {
  const x = String(s || "");
  if (x.length <= max) return x;
  return x.slice(0, max) + "…";
}

function normalizePatch(patch: CompetitionPatch): CompetitionPatch {
  const out: CompetitionPatch = { ...patch };
  if (out.registration_deadline_at !== undefined) out.registration_deadline_at = String(out.registration_deadline_at || "").trim();
  if (out.submission_deadline_at !== undefined) out.submission_deadline_at = out.submission_deadline_at ? String(out.submission_deadline_at).trim() : null;
  if (out.result_deadline_at !== undefined) out.result_deadline_at = out.result_deadline_at ? String(out.result_deadline_at).trim() : null;
  if (out.status_text !== undefined) out.status_text = String(out.status_text || "");
  if (out.team_members !== undefined) {
    out.team_members = Array.isArray(out.team_members) ? out.team_members.map((x) => String(x).trim()).filter(Boolean) : [];
  }
  if (out.links !== undefined) {
    const raw = Array.isArray(out.links) ? out.links : [];
    out.links = raw
      .map((x: any) => ({ title: String(x?.title || ""), url: String(x?.url || "").trim() }))
      .filter((x) => x.url);
  }
  return out;
}

function validateCompetitionDraft(draft: Competition): string | null {
  const reg = String(draft.registration_deadline_at || "").trim();
  if (!reg) return "报名截止为必填";
  if (!isYMD(reg)) return "报名截止日期格式应为 YYYY-MM-DD";
  const sub = draft.submission_deadline_at;
  if (sub && !isYMD(sub)) return "作品提交日期格式应为 YYYY-MM-DD";
  const res = draft.result_deadline_at;
  if (res && !isYMD(res)) return "结果公布日期格式应为 YYYY-MM-DD";
  return null;
}

function parseHostname(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function useStableNowTick(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function Header(props: {
  view: View;
  calendarMode: CalendarMode;
  onViewChange: (v: View) => void;
  onCalendarModeChange: (m: CalendarMode) => void;
  query: string;
  onQueryChange: (v: string) => void;
  onToggleFilters: () => void;
  onToggleAI: () => void;
}) {
  const dateLabel = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `星历日期 ${y}年${m}月${day}日`;
  }, []);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-darker flex items-center justify-between px-4 sm:px-6 shrink-0 z-20 relative">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-3 text-primary min-w-0">
          <span className="material-symbols-outlined text-3xl">dashboard</span>
          <div className="flex flex-col min-w-0">
            <h1 className="text-xl font-bold tracking-tight leading-none text-slate-900 dark:text-white font-display truncate">竞赛规划看板</h1>
            <span className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 font-mono tracking-widest mt-0.5 truncate">
              {dateLabel}
            </span>
          </div>
        </div>

        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 shrink-0">
          <button
            className={[
              "flex items-center justify-center px-3 py-1 rounded text-xs font-medium transition-colors",
              props.view === "list"
                ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
            ].join(" ")}
            type="button"
            onClick={() => props.onViewChange("list")}
          >
            <span className="material-symbols-outlined text-[16px] sm:mr-1">format_list_bulleted</span>
            <span className="hidden sm:inline">列表</span>
          </button>
          <button
            className={[
              "flex items-center justify-center px-3 py-1 rounded text-xs font-medium transition-colors",
              props.view === "calendar"
                ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
            ].join(" ")}
            type="button"
            onClick={() => props.onViewChange("calendar")}
          >
            <span className="material-symbols-outlined text-[16px] sm:mr-1">calendar_month</span>
            <span className="hidden sm:inline">日历</span>
          </button>
        </div>

        {props.view === "calendar" ? (
          <div className="hidden lg:flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button
              className={[
                "px-3 py-1 rounded text-xs font-medium transition-colors",
                props.calendarMode === "month"
                  ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
              ].join(" ")}
              type="button"
              onClick={() => props.onCalendarModeChange("month")}
            >
              月
            </button>
            <button
              className={[
                "px-3 py-1 rounded text-xs font-medium transition-colors",
                props.calendarMode === "week"
                  ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
              ].join(" ")}
              type="button"
              onClick={() => props.onCalendarModeChange("week")}
            >
              周
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden lg:flex w-64 items-center gap-2 rounded-lg bg-slate-100 dark:bg-surface-dark px-3 py-1.5 border border-transparent focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
          <span className="material-symbols-outlined text-slate-400 text-[20px]">search</span>
          <input
            id="board-search"
            className="flex-1 min-w-0 bg-transparent border-none p-0 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-0"
            placeholder="搜索竞赛、事件..."
            type="text"
            value={props.query}
            onChange={(e) => props.onQueryChange(e.target.value)}
          />
          <div className="flex items-center gap-0.5 text-[10px] text-slate-400 border border-slate-300 dark:border-slate-600 rounded px-1 shrink-0">
            <span>⌘</span>
            <span>K</span>
          </div>
        </div>

        <button
          className="h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-surface-dark text-slate-500 dark:text-slate-400 transition-colors"
          type="button"
          title="筛选"
          onClick={props.onToggleFilters}
        >
          <span className="material-symbols-outlined text-[20px]">filter_list</span>
        </button>
        <button
          className="h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-surface-dark text-slate-500 dark:text-slate-400 transition-colors"
          type="button"
          title="AI 助手"
          onClick={props.onToggleAI}
        >
          <span className="material-symbols-outlined text-[20px]">colors_spark</span>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}

function FiltersPanel(props: {
  open: boolean;
  onClose: () => void;
  filters: BoardFilters;
  onChange: (next: Partial<BoardFilters>) => void;
  upcoming: { key: string; title: string; dateISO: YMD }[];
  onJumpToDate: (dateISO: YMD) => void;
}) {
  if (!props.open) return null;

  function ToggleRow(p: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <label className="flex items-center justify-between cursor-pointer select-none gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{p.label}</span>
        <span className="relative inline-flex items-center shrink-0">
          <input type="checkbox" className="sr-only peer" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
          <span className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-700 peer-checked:bg-primary transition-colors ring-1 ring-slate-300 dark:ring-slate-600 peer-focus:ring-2 peer-focus:ring-primary/40"></span>
          <span className="absolute left-1 top-1 size-4 rounded-full bg-white dark:bg-slate-200 transition-transform peer-checked:translate-x-4 shadow"></span>
        </span>
      </label>
    );
  }

  return (
    <div className="fixed inset-0 z-30 md:static md:inset-auto md:z-auto md:w-72 md:shrink-0 md:h-full">
      <button className="absolute inset-0 bg-black/30 md:hidden" type="button" aria-label="Close" onClick={props.onClose}></button>
      <aside className="absolute right-0 inset-y-0 w-[min(90vw,22rem)] md:static md:inset-auto md:w-full md:h-full bg-white dark:bg-[#161f2c] border-l border-slate-200 dark:border-[#243347] flex flex-col shadow-xl">
        <div className="p-5 border-b border-slate-200 dark:border-[#243347]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">筛选面板</h3>
            <button className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors" type="button" onClick={props.onClose}>
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">管理显示的竞赛状态</p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="space-y-4">
            <ToggleRow label="仅显示已规划" checked={props.filters.onlyPlanned} onChange={(v) => props.onChange({ onlyPlanned: v })} />
            <ToggleRow label="仅显示已报名" checked={props.filters.onlyRegistered} onChange={(v) => props.onChange({ onlyRegistered: v })} />
            <ToggleRow label="显示结果公布" checked={props.filters.showResult} onChange={(v) => props.onChange({ showResult: v })} />
            <ToggleRow label="显示已错过" checked={props.filters.showMissed} onChange={(v) => props.onChange({ showMissed: v })} />
          </div>

          <div className="border-t border-slate-200 dark:border-[#243347] pt-4">
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">即将到期</h4>
            <div className="space-y-2">
              {props.upcoming.length ? (
                props.upcoming.map((u) => (
                  <button
                    key={u.key}
                    type="button"
                    className="w-full text-left flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#243347] transition-colors"
                    onClick={() => props.onJumpToDate(u.dateISO)}
                  >
                    <div className="mt-1 size-2 rounded-full bg-primary"></div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{u.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{u.dateISO}</p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">暂无</p>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Drawer(props: {
  competition: Competition;
  onClose: () => void;
  onSave: (patch: CompetitionPatch) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Competition>(() => props.competition);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [memberInput, setMemberInput] = useState("");

  useEffect(() => setDraft(props.competition), [props.competition]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const save = async () => {
    const msg = validateCompetitionDraft(draft);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const patch: CompetitionPatch = normalizePatch({
        registration_deadline_at: draft.registration_deadline_at,
        submission_deadline_at: draft.submission_deadline_at,
        result_deadline_at: draft.result_deadline_at,
        included_in_plan: draft.included_in_plan,
        registered: draft.registered,
        status_text: draft.status_text,
        team_members: draft.team_members,
        links: draft.links,
      });
      await props.onSave(patch);
      props.onClose();
    } catch (e) {
      setError(String(e && typeof e === "object" && "message" in e ? (e as any).message : e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 md:static md:inset-auto md:z-auto md:w-[30rem] md:shrink-0 md:h-full">
      <button className="absolute inset-0 bg-black/30 md:hidden" type="button" aria-label="Close" onClick={props.onClose}></button>
      <aside className="absolute right-0 inset-y-0 w-[min(96vw,30rem)] md:static md:inset-auto md:w-full md:h-full bg-white dark:bg-[#111822] border-l border-slate-200 dark:border-[#243347] flex flex-col shadow-xl">
        <div className="flex items-start justify-between p-6 border-b border-slate-100 dark:border-border-dark">
          <div className="flex-1 pr-4 min-w-0">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight truncate">{draft.name}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{draft.id}</p>
          </div>
          <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" type="button" onClick={props.onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              className={[
                "p-4 rounded-xl border flex flex-col gap-2 relative overflow-hidden text-left",
                draft.included_in_plan
                  ? "border-primary/20 bg-primary/5 dark:bg-primary/10"
                  : "border-slate-200 dark:border-border-dark bg-white dark:bg-[#151e2a] opacity-80 hover:opacity-100",
              ].join(" ")}
              onClick={() => setDraft((d) => ({ ...d, included_in_plan: !d.included_in_plan }))}
            >
              <div className="flex justify-between items-start z-10">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">纳入规划</span>
                <span className="material-symbols-outlined text-slate-400">event_note</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 z-10">{draft.included_in_plan ? "已加入计划" : "未纳入计划"}</p>
            </button>

            <button
              type="button"
              className={[
                "p-4 rounded-xl border flex flex-col gap-2 relative overflow-hidden text-left",
                draft.registered ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/10" : "border-slate-200 dark:border-border-dark bg-white dark:bg-[#151e2a] opacity-80 hover:opacity-100",
              ].join(" ")}
              onClick={() => setDraft((d) => ({ ...d, registered: !d.registered }))}
            >
              <div className="flex justify-between items-start z-10">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">已报名</span>
                <span className="material-symbols-outlined text-slate-400">how_to_reg</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 z-10">{draft.registered ? "已完成报名" : "尚未报名"}</p>
            </button>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400 text-[18px]">event</span>
              关键时间节点
            </h3>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 rounded-full bg-orange-400"></div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">报名截止</label>
                  <input
                    className="w-full bg-slate-50 dark:bg-[#151e2a] border border-slate-200 dark:border-border-dark rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary"
                    type="date"
                    value={draft.registration_deadline_at}
                    onChange={(e) => setDraft((d) => ({ ...d, registration_deadline_at: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 rounded-full bg-blue-400"></div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">提交截止</label>
                  <input
                    className="w-full bg-slate-50 dark:bg-[#151e2a] border border-slate-200 dark:border-border-dark rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary"
                    type="date"
                    value={draft.submission_deadline_at || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, submission_deadline_at: e.target.value ? e.target.value : null }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-1 h-10 rounded-full bg-purple-400"></div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">结果公布</label>
                  <input
                    className="w-full bg-slate-50 dark:bg-[#151e2a] border border-slate-200 dark:border-border-dark rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary"
                    type="date"
                    value={draft.result_deadline_at || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, result_deadline_at: e.target.value ? e.target.value : null }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400 text-[18px]">sticky_note_2</span>
              当前状态备注
            </h3>
            <textarea
              className="w-full h-28 bg-slate-50 dark:bg-[#151e2a] border border-slate-200 dark:border-border-dark rounded-lg text-sm text-slate-900 dark:text-white p-3 focus:ring-1 focus:ring-primary focus:border-primary resize-none placeholder-slate-400"
              placeholder="填写备忘录，例如：需要准备学生证复印件..."
              value={draft.status_text}
              onChange={(e) => setDraft((d) => ({ ...d, status_text: e.target.value }))}
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400 text-[18px]">group</span>
              队员名单
            </h3>
            <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-[#151e2a] rounded-lg border border-slate-200 dark:border-border-dark min-h-[3rem]">
              {draft.team_members.map((m) => (
                <span
                  key={m}
                  className="flex items-center gap-1 bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 px-2 py-1 rounded text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm"
                >
                  <span className="size-4 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[8px]">{m[0]?.toUpperCase() || "?"}</span>
                  <span className="max-w-[8rem] truncate">{m}</span>
                  <button
                    className="hover:text-red-500 ml-1"
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, team_members: d.team_members.filter((x) => x !== m) }))}
                    title="移除"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </span>
              ))}
              <input
                className="flex-1 bg-transparent border-none text-xs focus:ring-0 p-1 min-w-[80px] text-slate-900 dark:text-white placeholder-slate-400"
                placeholder="+ 添加队员"
                type="text"
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const v = memberInput.trim();
                  if (!v) return;
                  setDraft((d) => ({ ...d, team_members: d.team_members.includes(v) ? d.team_members : [...d.team_members, v] }));
                  setMemberInput("");
                }}
              />
            </div>
          </div>

          <div className="space-y-3 pb-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400 text-[18px]">link</span>
              相关链接
            </h3>
            <div className="space-y-2">
              {draft.links.length ? (
                draft.links.map((l, idx) => (
                  <div
                    key={`${l.url}:${idx}`}
                    className="flex flex-col gap-2 p-3 rounded-lg border border-slate-200 dark:border-border-dark bg-white dark:bg-[#151e2a]"
                  >
                    <div className="flex gap-2">
                      <input
                        className="flex-1 bg-slate-50 dark:bg-[#111822] border border-slate-200 dark:border-border-dark rounded px-2 py-1 text-sm"
                        placeholder="标题（可选）"
                        value={l.title}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            links: d.links.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)),
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="h-8 w-8 grid place-items-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                        title="删除"
                        onClick={() => setDraft((d) => ({ ...d, links: d.links.filter((_, i) => i !== idx) }))}
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                    <input
                      className="w-full bg-slate-50 dark:bg-[#111822] border border-slate-200 dark:border-border-dark rounded px-2 py-1 text-sm"
                      placeholder="https://..."
                      value={l.url}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          links: d.links.map((x, i) => (i === idx ? { ...x, url: e.target.value } : x)),
                        }))
                      }
                    />
                    <a className="text-xs text-primary hover:underline truncate" href={l.url} target="_blank" rel="noreferrer">
                      {l.title?.trim() ? l.title.trim() : parseHostname(l.url)}
                    </a>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">暂无链接</p>
              )}
            </div>
            <button
              type="button"
              className="w-full py-2 px-3 bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors"
              onClick={() => setDraft((d) => ({ ...d, links: [...d.links, { title: "", url: "" }] }))}
            >
              + 添加链接
            </button>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-[#151e2a]/50 flex gap-3 items-center">
          <button
            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            type="button"
            disabled={saving}
            onClick={save}
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            保存更改
          </button>
          <button
            className="px-4 py-2.5 bg-white dark:bg-surface-dark border border-slate-200 dark:border-border-dark hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors"
            type="button"
            onClick={props.onClose}
          >
            取消
          </button>
          {error ? <span className="text-xs text-danger truncate max-w-[12rem]">{error}</span> : null}
        </div>
      </aside>
    </div>
  );
}

function ListView(props: {
  events: CompetitionEvent[];
  competitionsById: Map<string, Competition>;
  todayISO: YMD;
  onOpenCompetition: (id: string) => void;
}) {
  const [overdueExpanded, setOverdueExpanded] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<ReturnType<typeof groupKeyForDate>, CompetitionEvent[]>();
    for (const ev of props.events) {
      const key = groupKeyForDate(ev.date, props.todayISO);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    const order: ReturnType<typeof groupKeyForDate>[] = ["overdue", "today", "this_week", "this_month", "later"];
    return order
      .map((k) => ({ key: k, title: groupTitle(k), items: (map.get(k) || []).sort((a, b) => (a.date === b.date ? eventTypeOrder(a.type) - eventTypeOrder(b.type) : a.date.localeCompare(b.date))) }))
      .filter((g) => g.items.length > 0);
  }, [props.events, props.todayISO]);

	  const renderEvent = (ev: CompetitionEvent) => {
	    const comp = props.competitionsById.get(ev.competition_id);
	    if (!comp) return null;
	    const missed = isMissedRegistration(comp, props.todayISO);
	    const planned = comp.included_in_plan && !missed;
	    const d = parseYMD(ev.date);
	    const month = d ? `${d.getMonth() + 1}月` : ev.date.slice(5, 7) + "月";
	    const day = d ? String(d.getDate()).padStart(2, "0") : ev.date.slice(8, 10);
	    const typeBadge =
	      missed
        ? "bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
        : ev.type === "registration_deadline"
          ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800"
          : ev.type === "submission_deadline"
            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
            : "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800";
	    const tone =
	      missed
	        ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/20"
	        : planned
	          ? "border-primary/40 bg-primary/5 dark:bg-primary/10 shadow-sm"
	          : ev.type === "registration_deadline"
	            ? "border-orange-500/40 bg-orange-500/5 dark:bg-orange-500/10"
	            : ev.type === "submission_deadline"
	              ? "border-blue-500/30 bg-blue-500/5 dark:bg-blue-500/10"
	              : "border-purple-500/30 bg-purple-500/5 dark:bg-purple-500/10";
	    return (
	      <button
	        key={ev.event_id}
	        type="button"
	        className={["w-full text-left group relative flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md", tone].join(" ")}
	        onClick={() => props.onOpenCompetition(comp.id)}
	      >
	        {planned ? <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-xl"></div> : null}
	        <div className={["flex flex-col items-center justify-center min-w-[3rem] text-center", planned ? "" : "opacity-70"].join(" ")}>
	          <span className={["text-xs font-medium uppercase", planned ? "text-primary" : "text-slate-500 dark:text-slate-400"].join(" ")}>
	            {month}
	          </span>
	          <span className="text-xl font-bold text-slate-900 dark:text-white">{day}</span>
	        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 min-w-0">
            <h4
              className={[
                "text-base font-semibold truncate",
                missed ? "text-slate-500 dark:text-slate-300 line-through" : "text-slate-900 dark:text-white",
              ].join(" ")}
            >
              {comp.name}
            </h4>
            <span className={["px-2 py-0.5 rounded text-[10px] font-medium border shrink-0", typeBadge].join(" ")}>
              {eventTypeLabel(ev.type)}
            </span>
            {missed ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200/60 dark:bg-slate-700/50 text-slate-600 dark:text-slate-200 border border-slate-300/50 dark:border-slate-600/40 shrink-0">
                已错过报名
              </span>
            ) : null}
            {comp.included_in_plan ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 shrink-0">规划中</span>
            ) : null}
            {comp.registered ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                已报名
              </span>
            ) : null}
          </div>
          {comp.status_text ? <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{clampText(comp.status_text, 120)}</p> : null}
        </div>
        <span className="material-symbols-outlined text-slate-300 group-hover:text-primary text-[18px]">chevron_right</span>
      </button>
    );
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-background-dark/50">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-8 pb-24">
        {groups.length ? (
          groups.map((g) => {
            if (g.key === "overdue") {
              const open = overdueExpanded;
              return (
                <section key={g.key} className="opacity-60 hover:opacity-100 transition-opacity">
                  <button
                    className="flex items-center gap-2 w-full text-left mb-3 group"
                    type="button"
                    onClick={() => setOverdueExpanded((x) => !x)}
                  >
                    <span
                      className={[
                        "material-symbols-outlined text-slate-400 text-sm transition-transform group-hover:rotate-90",
                        open ? "rotate-90" : "",
                      ].join(" ")}
                    >
                      chevron_right
                    </span>
                    <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {g.title} ({g.items.length})
                    </h3>
                    <div className="h-px bg-slate-200 dark:bg-[#243347] flex-1 ml-2"></div>
                  </button>
                  {open ? <div className="space-y-3">{g.items.map(renderEvent)}</div> : null}
                </section>
              );
            }

            return (
              <section key={g.key}>
                <div className="flex items-center justify-between mb-4 sticky top-0 bg-white/95 dark:bg-[#111822]/95 backdrop-blur-sm py-2 z-10">
                  <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    {g.key === "today" ? <span className="size-2 rounded-full bg-emerald-500 animate-pulse"></span> : null}
                    {g.title}
                  </h3>
                  {g.key === "today" ? <span className="text-xs text-slate-400">{formatCNDate(parseYMD(props.todayISO) || new Date())}</span> : null}
                </div>
                <div className="space-y-3">{g.items.map(renderEvent)}</div>
              </section>
            );
          })
        ) : (
          <div className="h-full grid place-items-center text-slate-500 dark:text-slate-400">
            <div className="text-center">
              <div className="text-4xl opacity-30 mb-2">
                <span className="material-symbols-outlined text-[48px]">event_busy</span>
              </div>
              <p className="text-sm">暂无事件</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function CalendarView(props: {
  mode: CalendarMode;
  anchorDate: YMD;
  todayISO: YMD;
  onAnchorDateChange: (d: YMD) => void;
  onModeChange: (m: CalendarMode) => void;
  events: CompetitionEvent[];
  competitionsById: Map<string, Competition>;
  onOpenCompetition: (id: string) => void;
}) {
  const anchor = parseYMD(props.anchorDate) || new Date();
  const title = `${anchor.getFullYear()}年 ${anchor.getMonth() + 1}月`;

  const eventsByDate = useMemo(() => {
    const m = new Map<YMD, CompetitionEvent[]>();
    for (const ev of props.events) {
      if (!m.has(ev.date)) m.set(ev.date, []);
      m.get(ev.date)!.push(ev);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => eventTypeOrder(a.type) - eventTypeOrder(b.type));
      m.set(k, arr);
    }
    return m;
  }, [props.events]);

  if (props.mode === "week") {
    const weekStart = startOfWeek(anchor);
    const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
    const labels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    return (
      <main className="flex-1 flex flex-col min-w-0 bg-background-light dark:bg-background-dark relative">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:px-6 sm:py-4 gap-4 bg-white/50 dark:bg-[#111822]/50 backdrop-blur-sm border-b border-slate-200 dark:border-[#243347] shrink-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
            <div className="flex items-center bg-slate-100 dark:bg-[#243347] rounded-lg p-0.5 border border-slate-200 dark:border-[#243347]/50">
              <button
                className="p-1 px-2 hover:bg-white dark:hover:bg-white/10 rounded-md transition-colors text-slate-600 dark:text-slate-300"
                type="button"
                onClick={() => {
                  const prev = addDays(weekStart, -7);
                  props.onAnchorDateChange(localISODate(prev));
                }}
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              <button
                className="px-3 py-1 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-white/10 rounded-md transition-colors"
                type="button"
                onClick={() => props.onAnchorDateChange(todayYMD())}
              >
                今天
              </button>
              <button
                className="p-1 px-2 hover:bg-white dark:hover:bg-white/10 rounded-md transition-colors text-slate-600 dark:text-slate-300"
                type="button"
                onClick={() => {
                  const next = addDays(weekStart, 7);
                  props.onAnchorDateChange(localISODate(next));
                }}
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <div className="flex bg-slate-100 dark:bg-[#243347] rounded-lg p-1 border border-slate-200 dark:border-[#243347]/50">
              <button className="px-4 py-1.5 rounded-md text-sm font-medium bg-white dark:bg-primary text-primary dark:text-white shadow-sm transition-all" type="button">
                周视图
              </button>
              <button
                className="px-4 py-1.5 rounded-md text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                type="button"
                onClick={() => props.onModeChange("month")}
              >
                月视图
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <div className="flex h-full min-w-[800px] divide-x divide-slate-200 dark:divide-[#243347]">
            {days.map((d, idx) => {
              const dateISO = localISODate(d);
              const isToday = dateISO === props.todayISO;
              const items = eventsByDate.get(dateISO) || [];
              return (
                <div key={dateISO} className="flex-1 min-w-[140px] flex flex-col bg-white dark:bg-[#111822]">
                  <div
                    className={[
                      "sticky top-0 z-10 p-3 text-center border-b border-slate-200 dark:border-[#243347]",
                      isToday ? "bg-primary/5 dark:bg-primary/5" : "bg-slate-50 dark:bg-[#161f2c]",
                    ].join(" ")}
                  >
                    <span className="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold mb-1">{labels[idx]}</span>
                    <div
                      className={[
                        "inline-flex items-center justify-center size-8 rounded-full text-lg font-bold",
                        isToday ? "bg-primary text-white shadow-lg shadow-primary/30" : "text-slate-900 dark:text-white",
                      ].join(" ")}
                    >
                      {String(d.getDate()).padStart(2, "0")}
                    </div>
                  </div>
                  <div
                    className={[
                      "flex-1 p-2 space-y-2 transition-colors",
                      isToday ? "bg-primary/5 dark:bg-primary/5" : "hover:bg-slate-50 dark:hover:bg-[#161f2c]/50",
                    ].join(" ")}
                  >
                    {items.length ? (
                      items.map((ev) => {
                        const comp = props.competitionsById.get(ev.competition_id);
                        if (!comp) return null;
                        const missed = isMissedRegistration(comp, props.todayISO);
                        const color =
                          missed
                            ? "bg-slate-100 dark:bg-slate-800/40 border-slate-400/40 text-slate-600 dark:text-slate-300"
                            : ev.type === "registration_deadline"
                              ? "bg-orange-50 dark:bg-orange-900/20 border-orange-500 text-orange-600 dark:text-orange-400"
                              : ev.type === "submission_deadline"
                                ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400"
                                : "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-600 dark:text-indigo-400";
                        return (
                          <button
                            key={ev.event_id}
                            type="button"
                            className={["group relative w-full text-left border-l-4 rounded-r-md p-2.5 hover:shadow-md transition-all cursor-pointer", color].join(" ")}
                            onClick={() => props.onOpenCompetition(comp.id)}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider">{eventTypeLabel(ev.type)}</span>
                            </div>
                            <h3
                              className={[
                                "text-sm font-semibold leading-tight mb-1 truncate",
                                missed ? "text-slate-500 dark:text-slate-300 line-through" : "text-slate-800 dark:text-white",
                              ].join(" ")}
                            >
                              {comp.name}
                            </h3>
                            {comp.included_in_plan ? <span className="text-[10px] text-primary">规划中</span> : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-700">
                        <span className="material-symbols-outlined text-4xl opacity-20">event_busy</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    );
  }

  // Month mode
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay()); // Sunday
  gridStart.setHours(0, 0, 0, 0);

  const last = endOfMonth(anchor);
  const gridEnd = new Date(last);
  gridEnd.setDate(last.getDate() + (6 - last.getDay()));
  gridEnd.setHours(0, 0, 0, 0);

  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const cells = Array.from({ length: totalDays }).map((_, i) => addDays(gridStart, i));
  const daysHeader = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-background-light dark:bg-background-dark relative">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-border-dark bg-white dark:bg-[#111822]">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-100 dark:bg-surface-dark rounded-lg p-1">
            <button
              className="px-3 py-1.5 text-sm font-medium rounded text-slate-600 dark:text-text-secondary hover:bg-white dark:hover:bg-white/10 hover:shadow-sm transition-all"
              type="button"
              onClick={() => props.onAnchorDateChange(todayYMD())}
            >
              今天
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-border-dark mx-1"></div>
            <button
              className="p-1.5 text-slate-600 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white rounded hover:bg-white dark:hover:bg-white/10"
              type="button"
              onClick={() => {
                const prev = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
                props.onAnchorDateChange(localISODate(prev));
              }}
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <button
              className="p-1.5 text-slate-600 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white rounded hover:bg-white dark:hover:bg-white/10"
              type="button"
              onClick={() => {
                const next = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
                props.onAnchorDateChange(localISODate(next));
              }}
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 dark:bg-surface-dark rounded-lg p-1">
            <button className="px-4 py-1.5 text-sm font-medium bg-white dark:bg-primary text-primary dark:text-white shadow-sm rounded transition-all" type="button">
              月视图
            </button>
            <button
              className="px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-text-secondary hover:text-slate-900 dark:hover:text-white transition-all"
              type="button"
              onClick={() => props.onModeChange("week")}
            >
              周视图
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="h-full flex flex-col bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-border-dark shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-border-dark bg-gray-50 dark:bg-[#151d29]">
            {daysHeader.map((d) => (
              <div key={d} className="py-3 text-center text-sm font-semibold text-slate-500 dark:text-text-secondary">
                {d}
              </div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-7" style={{ gridAutoRows: "minmax(96px, 1fr)" }}>
            {cells.map((d) => {
              const dateISO = localISODate(d);
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = dateISO === props.todayISO;
              const items = eventsByDate.get(dateISO) || [];
              return (
                <div
                  key={dateISO}
                  className={[
                    "border-b border-r border-gray-100 dark:border-border-dark/50 p-2 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group overflow-hidden",
                    !inMonth ? "bg-gray-50/50 dark:bg-[#151d29]/30" : "",
                    isToday ? "bg-primary/5 dark:bg-primary/10 relative ring-2 ring-inset ring-primary z-10" : "",
                  ].join(" ")}
                  onClick={() => {
                    props.onAnchorDateChange(dateISO);
                    props.onModeChange("week");
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    props.onAnchorDateChange(dateISO);
                    props.onModeChange("week");
                  }}
                >
                  <span
                    className={[
                      "text-sm font-medium block mb-1",
                      isToday
                        ? "text-primary font-bold"
                        : inMonth
                          ? "text-slate-700 dark:text-text-secondary group-hover:text-primary"
                          : "text-slate-400 dark:text-text-secondary/50",
                    ].join(" ")}
                  >
                    {d.getDate()}
                  </span>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((ev) => {
                      const comp = props.competitionsById.get(ev.competition_id);
                      if (!comp) return null;
                      const missed = isMissedRegistration(comp, props.todayISO);
                      const color =
                        missed
                          ? "bg-slate-200/40 dark:bg-slate-800/40 border-slate-400/30 text-slate-600 dark:text-slate-300"
                          : ev.type === "registration_deadline"
                            ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
                            : ev.type === "submission_deadline"
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400"
                              : "bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-400";
                      return (
                        <button
                          key={ev.event_id}
                          type="button"
                          className={["w-full border rounded px-2 py-1 text-xs truncate hover:shadow-sm transition-shadow", color].join(" ")}
                          onClick={(e) => {
                            e.stopPropagation();
                            props.onOpenCompetition(ev.competition_id);
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current inline-block mr-1"></span>
                          <span className={missed ? "line-through" : ""}>
                            {comp.name} {eventTypeLabel(ev.type)}
                          </span>
                        </button>
                      );
                    })}
                    {items.length > 3 ? <div className="text-[10px] text-slate-400">+{items.length - 3}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}

function AIPanel(props: {
  open: boolean;
  onClose: () => void;
  apiAvailable: boolean;
  todayISO: YMD;
  useWebSearch: boolean;
  onUseWebSearchChange: (v: boolean) => void;
  onApplyAction: (a: AIAction) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "ai" | "user"; content: string; actions?: AIAction[] }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!props.open) return null;

  const ask = async (q: string) => {
    const msg = q.trim();
    if (!msg) return;
    if (!props.apiAvailable) {
      setErr("AI 需要启用 Cloudflare Pages Functions（本地用 wrangler pages dev 运行）。");
      return;
    }
    setErr(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    try {
      // AI 默认上下文仅包含有效竞赛（排除已错过报名）。
      const reply: AIReply = await aiAsk(msg, { useWebSearch: props.useWebSearch, includeMissed: false, todayISO: props.todayISO });
      setMessages((m) => [...m, { role: "ai", content: reply.content, actions: reply.actions || [] }]);
    } catch (e) {
      setErr(String(e && typeof e === "object" && "message" in e ? (e as any).message : e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 md:static md:inset-auto md:z-auto md:w-[380px] md:shrink-0 md:h-full">
      <button className="absolute inset-0 bg-black/30 md:hidden" type="button" aria-label="Close" onClick={props.onClose}></button>
      <aside className="absolute right-0 inset-y-0 w-[min(96vw,26rem)] md:static md:inset-auto md:w-full md:h-full bg-white dark:bg-[#151d29] border-l border-gray-200 dark:border-border-dark flex flex-col shrink-0 shadow-xl">
        <div className="p-4 border-b border-gray-200 dark:border-border-dark flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-primary flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <span className="material-symbols-outlined text-white text-[18px]">auto_awesome</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">AI 助手</h3>
              <p className="text-xs text-slate-500 dark:text-text-secondary">行动卡片需要你确认后才会写入</p>
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-600 dark:hover:text-white" type="button" onClick={props.onClose}>
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-border-dark bg-gray-50 dark:bg-[#151d29]/50 space-y-3">
          <p className="text-xs text-slate-500 dark:text-text-secondary">上下文：默认仅有效竞赛（排除已错过报名），可选联网搜索。</p>
          <label className="flex items-center justify-between text-sm">
            <span className="text-slate-700 dark:text-slate-200">联网搜索</span>
            <input
              type="checkbox"
              checked={props.useWebSearch}
              disabled={!props.apiAvailable}
              onChange={(e) => props.onUseWebSearchChange(e.target.checked)}
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length ? (
            messages.map((m, idx) => (
              <div key={idx} className={["flex gap-3", m.role === "user" ? "justify-end" : ""].join(" ")}>
                {m.role === "ai" ? (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-primary flex items-center justify-center shrink-0 mt-1">
                    <span className="material-symbols-outlined text-white text-[16px]">auto_awesome</span>
                  </div>
                ) : null}
                <div className={["flex flex-col gap-2 max-w-[90%]", m.role === "user" ? "items-end" : ""].join(" ")}>
                  <div
                    className={[
                      "p-3.5 rounded-2xl border shadow-sm whitespace-pre-wrap text-sm leading-relaxed",
                      m.role === "user"
                        ? "bg-primary text-white border-primary/30 rounded-tr-none"
                        : "bg-gray-100 dark:bg-surface-dark text-slate-700 dark:text-gray-200 border-gray-200 dark:border-border-dark rounded-tl-none",
                    ].join(" ")}
                  >
                    {m.content}
                  </div>
                  {m.role === "ai" && m.actions && m.actions.length ? (
                    <div className="space-y-2 w-full">
                      {m.actions.map((a) => (
                        <div key={a.id} className="bg-white dark:bg-[#111822] border border-gray-200 dark:border-border-dark rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{a.title}</p>
                              {a.reason ? <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{a.reason}</p> : null}
                              <pre className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 overflow-x-auto">{JSON.stringify(a.patch, null, 2)}</pre>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 px-2 py-1 text-xs font-semibold rounded bg-primary text-white hover:bg-primary-dark"
                              onClick={async () => {
                                if (!confirm(`确认执行动作：${a.title}？`)) return;
                                await props.onApplyAction(a);
                              }}
                            >
                              应用
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-500 dark:text-slate-400">输入问题，例如：下周有哪些报名截止？帮我标记某个竞赛为已报名。</div>
          )}
          {err ? <div className="text-xs text-danger whitespace-pre-wrap">{err}</div> : null}
        </div>

        <div className="p-4 bg-gray-50 dark:bg-[#151d29]/50 border-t border-gray-200 dark:border-border-dark">
          <div className="relative">
            <input
              className="w-full bg-white dark:bg-[#111822] text-slate-900 dark:text-white border border-gray-200 dark:border-border-dark rounded-xl pl-4 pr-12 py-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary shadow-sm placeholder-slate-400 dark:placeholder-text-secondary"
              placeholder="询问 AI 助手..."
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                ask(input);
                setInput("");
              }}
              disabled={busy || !props.apiAvailable}
            />
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
              type="button"
              disabled={busy || !props.apiAvailable}
              onClick={() => {
                ask(input);
                setInput("");
              }}
            >
              <span className="material-symbols-outlined text-[18px] block">send</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function BoardPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const view: View = searchParams.get(VIEW_PARAM) === "calendar" ? "calendar" : "list";
  const calendarMode: CalendarMode = searchParams.get(CAL_PARAM) === "week" ? "week" : "month";
  const anchorDate: YMD = (() => {
    const v = (searchParams.get(CAL_DATE_PARAM) || "").trim();
    return isYMD(v) ? (v as YMD) : todayYMD();
  })();
  const openId = (searchParams.get(OPEN_PARAM) || "").trim() || null;

  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [onlyPlanned, setOnlyPlanned] = useState(false);
  const [onlyRegistered, setOnlyRegistered] = useState(false);
  const [showResult, setShowResult] = useState(true);
  const [showMissed, setShowMissed] = useState(false);
  const [aiUseWebSearch, setAiUseWebSearch] = useState(true);

  const now = useStableNowTick(60_000);
  const todayISO: YMD = todayYMD(now);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (String(e.key || "").toLowerCase() !== "k") return;
      e.preventDefault();
      const el = document.getElementById("board-search") as HTMLInputElement | null;
      if (!el) return;
      el.focus();
      el.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const competitionsQ = useQuery({ queryKey: ["competitions"], queryFn: loadCompetitionsWithFallback, refetchInterval: 60_000 });

  const competitionsRaw = competitionsQ.data?.competitions || [];
  const competitionsSource = competitionsQ.data?.source || "seed";
  const competitions = useMemo(() => (competitionsSource === "seed" ? applyOfflinePatches(competitionsRaw) : competitionsRaw), [competitionsRaw, competitionsSource]);

  const competitionsById = useMemo(() => new Map(competitions.map((c) => [c.id, c] as const)), [competitions]);

  const missedCount = useMemo(() => competitions.filter((c) => isMissedRegistration(c, todayISO)).length, [competitions, todayISO]);

  const filteredCompetitions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return competitions.filter((c) => {
      if (onlyPlanned && !c.included_in_plan) return false;
      if (onlyRegistered && !c.registered) return false;
      if (!showMissed && isMissedRegistration(c, todayISO)) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [competitions, onlyPlanned, onlyRegistered, query, showMissed, todayISO]);

  const events = useMemo(() => {
    const list = buildEvents(filteredCompetitions, { showResult });
    return list.sort((a, b) => (a.date === b.date ? eventTypeOrder(a.type) - eventTypeOrder(b.type) : a.date.localeCompare(b.date)));
  }, [filteredCompetitions, showResult]);

  const upcomingForPanel = useMemo(() => {
    const upcoming = events.filter((e) => e.date >= todayISO).slice(0, 6);
    return upcoming
      .map((e) => {
        const c = competitionsById.get(e.competition_id);
        if (!c) return null;
        return { key: e.event_id, title: `${c.name} - ${eventTypeLabel(e.type)}`, dateISO: e.date };
      })
      .filter(Boolean) as { key: string; title: string; dateISO: YMD }[];
  }, [events, competitionsById, todayISO]);

  const setParam = (k: string, v: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
      return next;
    });
  };

  const openCompetition = (id: string) => {
    setFiltersOpen(false);
    setAiOpen(false);
    setParam(OPEN_PARAM, id);
  };
  const closeDrawer = () => setParam(OPEN_PARAM, null);

  const saveCompetition = async (id: string, patch: CompetitionPatch) => {
    try {
      const updated = await patchCompetition(id, patch);
      queryClient.setQueryData(["competitions"], (cur: LoadResult | undefined) => {
        if (!cur) return cur;
        return { ...cur, competitions: cur.competitions.map((c) => (c.id === id ? updated : c)) };
      });
    } catch (e) {
      // Offline write-through.
      upsertOfflinePatch(id, patch);
      queryClient.setQueryData(["competitions"], (cur: LoadResult | undefined) => {
        if (!cur) return cur;
        return { ...cur, competitions: cur.competitions.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
      });
    }
  };

  const applyAiAction = async (a: AIAction) => {
    if (a.type !== "update_competition") return;
    await saveCompetition(a.competition_id, a.patch);
  };

  const drawerCompetition = openId ? competitionsById.get(openId) || null : null;

  return (
    <>
      <Header
        view={view}
        calendarMode={calendarMode}
        onViewChange={(v) => setParam(VIEW_PARAM, v === "calendar" ? "calendar" : null)}
        onCalendarModeChange={(m) => setParam(CAL_PARAM, m === "week" ? "week" : null)}
        query={query}
        onQueryChange={setQuery}
        onToggleFilters={() => {
          closeDrawer();
          setFiltersOpen((x) => !x);
          setAiOpen(false);
        }}
        onToggleAI={() => {
          closeDrawer();
          setAiOpen((x) => !x);
          setFiltersOpen(false);
        }}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {view === "list" ? (
          <ListView events={events} competitionsById={competitionsById} todayISO={todayISO} onOpenCompetition={openCompetition} />
        ) : (
          <CalendarView
            mode={calendarMode}
            anchorDate={anchorDate}
            todayISO={todayISO}
            onAnchorDateChange={(d) => setParam(CAL_DATE_PARAM, d)}
            onModeChange={(m) => setParam(CAL_PARAM, m === "week" ? "week" : null)}
            events={events}
            competitionsById={competitionsById}
            onOpenCompetition={openCompetition}
          />
        )}

        <FiltersPanel
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          filters={{ onlyPlanned, onlyRegistered, showResult, showMissed }}
          onChange={(next) => {
            if (next.onlyPlanned !== undefined) setOnlyPlanned(next.onlyPlanned);
            if (next.onlyRegistered !== undefined) setOnlyRegistered(next.onlyRegistered);
            if (next.showResult !== undefined) setShowResult(next.showResult);
            if (next.showMissed !== undefined) setShowMissed(next.showMissed);
          }}
          upcoming={upcomingForPanel}
          onJumpToDate={(d) => {
            setParam(VIEW_PARAM, "calendar");
            setParam(CAL_DATE_PARAM, d);
            setParam(CAL_PARAM, "week");
          }}
        />

        <AIPanel
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          apiAvailable={competitionsSource === "api"}
          todayISO={todayISO}
          useWebSearch={aiUseWebSearch}
          onUseWebSearchChange={setAiUseWebSearch}
          onApplyAction={applyAiAction}
        />

        {drawerCompetition ? (
          <Drawer
            competition={drawerCompetition}
            onClose={closeDrawer}
            onSave={async (patch) => {
              await saveCompetition(drawerCompetition.id, patch);
            }}
          />
        ) : null}

        {missedCount > 0 && !showMissed ? (
          <div className="pointer-events-none absolute bottom-4 left-4 text-xs text-slate-600 dark:text-slate-300 bg-white/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 backdrop-blur">
            已隐藏已错过：{missedCount}
          </div>
        ) : null}
      </div>
    </>
  );
}
