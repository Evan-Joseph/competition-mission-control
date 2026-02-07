import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { Competition, Member } from "../lib/types";
import { aiAsk, createMember, getCompetitions, getMembers, updateMember, updateProgress } from "../lib/api";
import { ensureNextDeadlines, computeAutoPhase, STATE_LABEL, timelineRangeLabel, defaultTimeline, urgencyTone } from "../lib/compute";
import { addDays, parseISODate, startOfWeek } from "../lib/date";
import { getString, remove, setString } from "../lib/storage";
import type { GroupBy, RowVm, SortBy } from "./dashboardRows";
import { buildRows } from "./dashboardRows";

const STORAGE_MEMBER_ID = "memberId";
const STORAGE_GROUP_BY = "groupBy";
const STORAGE_SORT_BY = "sortBy";
const STORAGE_COLLAPSED_GROUPS = "collapsedGroups";
const STORAGE_AI_WEB_SEARCH = "aiWebSearch";
const STORAGE_VIEW_MODE = "dashboardView";
const STORAGE_FILTER_STATUS = "filterStatus";
const STORAGE_FILTER_TAGS = "filterTags";
const STORAGE_FILTER_OWNERS = "filterOwners";
const STORAGE_HIDE_MISSED = "hideMissed";

const OWNER_UNASSIGNED = "__unassigned__";

const DEFAULT_MEMBERS: Member[] = [
  { id: "member_gaoshenzhou", name: "高神舟", avatar_emoji: "🚀", avatar_color: "#13c8ec" },
  { id: "member_nierui", name: "聂睿", avatar_emoji: "🧠", avatar_color: "#f59e0b" },
  { id: "member_sunhuizhi", name: "孙慧智", avatar_emoji: "🧩", avatar_color: "#10b981" },
  { id: "member_yuzetong", name: "于泽通", avatar_emoji: "🛰️", avatar_color: "#ef4444" },
  { id: "member_gengxiaoran", name: "耿孝然", avatar_emoji: "⚙️", avatar_color: "#6366f1" },
];

async function loadCompetitionsWithFallback(): Promise<Competition[]> {
  try {
    return await getCompetitions();
  } catch {
    const r = await fetch("/data/competitions.seed.preview.json", { headers: { accept: "application/json" } });
    if (!r.ok) return [];
    return (await r.json()) as Competition[];
  }
}

async function loadMembersWithFallback(): Promise<Member[]> {
  try {
    const m = await getMembers();
    return m.length ? m : DEFAULT_MEMBERS;
  } catch {
    return DEFAULT_MEMBERS;
  }
}

function memberById(members: Member[], id: string | null): Member | null {
  if (!id) return null;
  return members.find((m) => m.id === id) || null;
}

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
  if (regEnd >= today) return false; // only count as missed if strictly before today

  const st = String(c.progress_state || "").trim();
  if (!st) return true;
  return st === "not_started" || st === "registering";
}

function effectiveStateLabel(c: Competition, now: Date): string {
  if (isMissedRegistration(c, now)) return "已错过";
  if (c.progress_state) return STATE_LABEL[c.progress_state] || c.progress_state;
  return computeAutoPhase(c, now);
}

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x)).filter(Boolean);
  } catch {
    return [];
  }
}

function competitionTags(c: Competition): string[] {
  const tags = new Set<string>();
  const source = String(c.source_tag || "").trim();
  if (source) tags.add(source);
  for (const t of parseJsonStringArray(c.type_tags_json)) {
    const x = String(t || "").trim();
    if (x) tags.add(x);
  }
  return [...tags];
}

function loadStringSet(key: string): Set<string> {
  try {
    const raw = getString(key, "[]") || "[]";
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => String(x)));
  } catch {
    return new Set();
  }
}

function saveStringSet(key: string, set: Set<string>) {
  if (!set.size) {
    remove(key);
    return;
  }
  setString(key, JSON.stringify([...set]));
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [q, setQ] = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [timeline, setTimeline] = useState(() => defaultTimeline());
  const [memberId, setMemberId] = useState<string | null>(null);
  const [aiWebSearch, setAiWebSearch] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sortBy, setSortBy] = useState<SortBy>("next");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [lastGroupKeys, setLastGroupKeys] = useState<string[]>([]);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"gantt" | "list">("gantt");
  const [aiOpen, setAiOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => new Set());
  const [tagFilter, setTagFilter] = useState<Set<string>>(() => new Set());
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(() => new Set());
  const [hideMissed, setHideMissed] = useState(true);

  useEffect(() => {
    const stored = getString(STORAGE_MEMBER_ID, null);
    if (stored) setMemberId(stored);
    const ai = getString(STORAGE_AI_WEB_SEARCH, "0");
    setAiWebSearch(ai === "1");

    const vm = getString(STORAGE_VIEW_MODE, null);
    if (vm === "list" || vm === "gantt") setViewMode(vm);
    else if (window.matchMedia && window.matchMedia("(max-width: 1023px)").matches) setViewMode("list");

    const g = (getString(STORAGE_GROUP_BY, "none") || "none") as GroupBy;
    if (["none", "source", "result", "urgency", "deadline", "owner", "state"].includes(g)) setGroupBy(g);
    const s = (getString(STORAGE_SORT_BY, "next") || "next") as SortBy;
    if (["next", "name", "result"].includes(s)) setSortBy(s);

    setStatusFilter(loadStringSet(STORAGE_FILTER_STATUS));
    setTagFilter(loadStringSet(STORAGE_FILTER_TAGS));
    setOwnerFilter(loadStringSet(STORAGE_FILTER_OWNERS));
    setHideMissed((getString(STORAGE_HIDE_MISSED, "1") || "1") !== "0");

    try {
      const raw = getString(STORAGE_COLLAPSED_GROUPS, "[]") || "[]";
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) setCollapsedGroups(new Set(arr.map((x) => String(x))));
    } catch {
      // ignore
    }
  }, []);

  const membersQ = useQuery({ queryKey: ["members"], queryFn: loadMembersWithFallback });
  const competitionsQ = useQuery({ queryKey: ["competitions"], queryFn: loadCompetitionsWithFallback, refetchInterval: 60_000 });

  const members = membersQ.data || DEFAULT_MEMBERS;
  const rawCompetitions = competitionsQ.data || [];

  const competitions = useMemo(() => ensureNextDeadlines(rawCompetitions), [rawCompetitions]);

  useEffect(() => {
    // If selected member doesn't exist (e.g., first load before members), keep it null.
    if (!memberId) return;
    if (!memberById(members, memberId)) setMemberId(null);
  }, [members, memberId]);

  const filtered = useMemo(() => {
    const now = new Date();
    return competitions
      .filter((c) => {
        const name = String(c.display_name || c.name || "");
        if (q && !name.toLowerCase().includes(q.toLowerCase())) return false;
        if (urgentOnly) {
          const dl = c.nextDeadline?.daysLeft;
          if (typeof dl !== "number") return false;
          if (dl < 0 || dl > 7) return false;
        }
        if (hideMissed && isMissedRegistration(c, now)) return false;
        if (statusFilter.size > 0) {
          const st = effectiveStateLabel(c, now);
          if (!statusFilter.has(st)) return false;
        }
        if (ownerFilter.size > 0) {
          const owner = String(c.progress_owner_member_id || "").trim() || OWNER_UNASSIGNED;
          if (!ownerFilter.has(owner)) return false;
        }
        if (tagFilter.size > 0) {
          const tags = competitionTags(c);
          if (!tags.some((t) => tagFilter.has(t))) return false;
        }
        return true;
      });
  }, [competitions, q, urgentOnly, hideMissed, statusFilter, ownerFilter, tagFilter]);

  const rowsBundle = useMemo(() => {
    return buildRows({ competitions: filtered, groupBy, sortBy, collapsed: collapsedGroups, members });
  }, [filtered, groupBy, sortBy, collapsedGroups, members]);

  const rowsVm: RowVm[] = rowsBundle.rows;

  useEffect(() => {
    setLastGroupKeys(rowsBundle.groupKeys);
  }, [rowsBundle.groupKeys]);

  const kpis = useMemo(() => {
    const now = new Date();
    const total = filtered.length;
    const registering = filtered.filter((c) => computeAutoPhase(c, now) === "报名中").length;
    const urgent = filtered.filter((c) => typeof c.nextDeadline?.daysLeft === "number" && c.nextDeadline!.daysLeft >= 0 && c.nextDeadline!.daysLeft <= 3).length;
    const risk = filtered.filter((c) => Number(c.progress_risk_level || 0) >= 2).length;
    const resultsThisMonth = filtered.filter((c) => {
      const r = parseISODate(c.result_end);
      return r && r.getFullYear() === now.getFullYear() && r.getMonth() === now.getMonth();
    }).length;
    return { total, registering, urgent, risk, resultsThisMonth };
  }, [filtered]);

  const curMember = memberById(members, memberId);
  const drawerComp = drawerId ? competitions.find((c) => c.id === drawerId) || null : null;

  useEffect(() => {
    const open = String(searchParams.get("open") || "").trim();
    if (!open) return;
    setDrawerId(open);
  }, [searchParams]);

  useEffect(() => {
    const open = String(searchParams.get("open") || "").trim();
    if (!open) return;
    if (!competitions.length) return;
    if (competitions.some((c) => c.id === open)) return;
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
    setDrawerId(null);
  }, [competitions, searchParams, setSearchParams]);

  useEffect(() => {
    if (!memberId) setIdentityOpen(true);
  }, [memberId]);

  const openDrawer = (id: string) => {
    setDrawerId(id);
    const next = new URLSearchParams(searchParams);
    next.set("open", id);
    setSearchParams(next, { replace: true });
  };

  const closeDrawer = () => {
    setDrawerId(null);
    if (!searchParams.has("open")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("open");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (identityOpen) {
        setIdentityOpen(false);
        return;
      }
      if (drawerId) {
        closeDrawer();
        return;
      }
      if (filtersOpen) {
        setFiltersOpen(false);
        return;
      }
      if (aiOpen) {
        setAiOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [identityOpen, drawerId, filtersOpen, aiOpen, closeDrawer]);

  const activeFilterCount = statusFilter.size + tagFilter.size + ownerFilter.size;

  const filterMeta = useMemo(() => {
    const now = new Date();

    const statusCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    const ownerCounts: Record<string, number> = {};
    let missedCount = 0;

    for (const c of competitions) {
      if (isMissedRegistration(c, now)) missedCount += 1;

      const st = effectiveStateLabel(c, now);
      statusCounts[st] = (statusCounts[st] || 0) + 1;

      const owner = String(c.progress_owner_member_id || "").trim() || OWNER_UNASSIGNED;
      ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;

      for (const t of competitionTags(c)) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
    }

    const statusOrder = [
      "报名中",
      "提交中",
      "等待结果",
      "未开始",
      "已报名",
      "孵化中",
      "已提交",
      "比赛中",
      "完工/获奖",
      "未维护",
    ];

    const statusOptions = Object.keys(statusCounts).sort((a, b) => {
      const ia = statusOrder.indexOf(a);
      const ib = statusOrder.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b, "zh-Hans-CN-u-co-pinyin");
    });

    const tagOptions = Object.keys(tagCounts).sort((a, b) => a.localeCompare(b, "zh-Hans-CN-u-co-pinyin"));

    const ownerOptionKeys = new Set<string>(Object.keys(ownerCounts));
    ownerOptionKeys.add(OWNER_UNASSIGNED);
    for (const m of members) ownerOptionKeys.add(m.id);

    const ownerOptions: { key: string; label: string }[] = [
      { key: OWNER_UNASSIGNED, label: "未分配" },
      ...members.map((m) => ({ key: m.id, label: m.name })),
      ...[...ownerOptionKeys]
        .filter((id) => id !== OWNER_UNASSIGNED && !members.some((m) => m.id === id))
        .sort((a, b) => a.localeCompare(b))
        .map((id) => ({ key: id, label: id })),
    ];

    return { statusCounts, tagCounts, ownerCounts, statusOptions, tagOptions, ownerOptions, missedCount };
  }, [competitions, members]);

  const setViewModePersist = (v: "gantt" | "list") => {
    setViewMode(v);
    setString(STORAGE_VIEW_MODE, v);
  };

  const setGroupByPersist = (v: GroupBy) => {
    setGroupBy(v);
    setString(STORAGE_GROUP_BY, v);
    setCollapsedGroups(new Set());
    remove(STORAGE_COLLAPSED_GROUPS);
  };

  const setSortByPersist = (v: SortBy) => {
    setSortBy(v);
    setString(STORAGE_SORT_BY, v);
  };

  const setAiWebSearchPersist = (v: boolean) => {
    setAiWebSearch(v);
    setString(STORAGE_AI_WEB_SEARCH, v ? "1" : "0");
  };

  const setStatusFilterPersist = (next: Set<string>) => {
    setStatusFilter(next);
    saveStringSet(STORAGE_FILTER_STATUS, next);
  };

  const setTagFilterPersist = (next: Set<string>) => {
    setTagFilter(next);
    saveStringSet(STORAGE_FILTER_TAGS, next);
  };

  const setOwnerFilterPersist = (next: Set<string>) => {
    setOwnerFilter(next);
    saveStringSet(STORAGE_FILTER_OWNERS, next);
  };

  const setHideMissedPersist = (v: boolean) => {
    setHideMissed(v);
    setString(STORAGE_HIDE_MISSED, v ? "1" : "0");
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-background-light dark:bg-background-dark relative">
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4 p-4 sm:p-6 shrink-0">
          <KpiCard title="总竞赛数" icon="inventory_2" value={String(kpis.total)} accent="text-slate-900 dark:text-white" />
          <KpiCard title="报名进行中" icon="app_registration" value={String(kpis.registering)} accent="text-primary" />
          <KpiCard title="临近截止" icon="alarm" value={String(kpis.urgent)} accent="text-danger dark:text-white" danger />
          <KpiCard title="高风险" icon="warning" value={String(kpis.risk)} accent="text-danger" />
          <KpiCard title="本月结果公布" icon="emoji_events" value={String(kpis.resultsThisMonth)} accent="text-slate-900 dark:text-white" />
        </section>

        <div className="flex-1 px-4 sm:px-6 pb-4 sm:pb-6 min-h-0 flex flex-col">
          <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-lg flex-1 flex flex-col overflow-hidden">
            <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
                  时间轴视图
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500"
                    type="button"
                    onClick={() => setTimeline((t) => ({ ...t, start: addDays(t.start, -28) }))}
                  >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                  </button>
                  <span className="text-sm font-medium dark:text-slate-200">{timelineRangeLabel(timeline)}</span>
                  <button
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500"
                    type="button"
                    onClick={() => setTimeline((t) => ({ ...t, start: addDays(t.start, 28) }))}
                  >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                  <button
                    className={[
                      "flex items-center justify-center px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap",
                      viewMode === "gantt"
                        ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
                    ].join(" ")}
                    type="button"
                    onClick={() => {
                      setViewModePersist("gantt");
                    }}
                  >
                    <span className="material-symbols-outlined text-[16px] sm:mr-1">view_timeline</span>
                    <span className="hidden sm:inline">甘特图</span>
                  </button>
                  <button
                    className={[
                      "flex items-center justify-center px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap",
                      viewMode === "list"
                        ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
                    ].join(" ")}
                    type="button"
                    onClick={() => {
                      setViewModePersist("list");
                    }}
                  >
                    <span className="material-symbols-outlined text-[16px] sm:mr-1">format_list_bulleted</span>
                    <span className="hidden sm:inline">列表</span>
                  </button>
                </div>

                <button
                  className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium transition-colors border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                >
                  <span className="material-symbols-outlined text-[18px]">filter_list</span>
                  筛选
                  {activeFilterCount ? (
                    <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </button>

                <button
                  className="xl:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium transition-colors border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  type="button"
                  onClick={() => setAiOpen(true)}
                >
                  <span className="material-symbols-outlined text-[18px] text-primary">smart_toy</span>
                  AI
                </button>

                <div className="hidden lg:flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">account_tree</span>
                    <select
                      className="text-xs rounded-lg bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary w-[152px] truncate"
                      value={groupBy}
                      onChange={(e) => {
                        const v = e.target.value as GroupBy;
                        setGroupByPersist(v);
                      }}
                    >
                      <option value="none">不分组</option>
                      <option value="source">按含金量</option>
                      <option value="result">按结果公布</option>
                      <option value="urgency">按紧急程度</option>
                      <option value="deadline">按截止日期桶</option>
                      <option value="owner">按负责人</option>
                      <option value="state">按进展状态</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">sort</span>
                    <select
                      className="text-xs rounded-lg bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary w-[132px] truncate"
                      value={sortBy}
                      onChange={(e) => {
                        const v = e.target.value as SortBy;
                        setSortByPersist(v);
                      }}
                    >
                      <option value="next">按下一节点</option>
                      <option value="name">按名称</option>
                      <option value="result">按结果时间</option>
                    </select>
                  </div>
                  <button
                    className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-40"
                    type="button"
                    disabled={groupBy === "none"}
                    onClick={() => {
                      if (groupBy === "none") return;
                      const allCollapsed = lastGroupKeys.length > 0 && lastGroupKeys.every((k) => collapsedGroups.has(k));
                      const next = allCollapsed ? new Set<string>() : new Set<string>(lastGroupKeys);
                      setCollapsedGroups(next);
                      saveStringSet(STORAGE_COLLAPSED_GROUPS, next);
                    }}
                  >
                    {groupBy !== "none" && lastGroupKeys.length > 0 && lastGroupKeys.every((k) => collapsedGroups.has(k)) ? "展开全部" : "收起全部"}
                  </button>
                </div>

                <div className="relative group w-64 hidden lg:block">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary">
                    <span className="material-symbols-outlined text-[20px]">search</span>
                  </div>
                  <input
                    className="block w-full pl-10 pr-3 py-1.5 border-none rounded-lg bg-slate-100 dark:bg-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary text-slate-900 dark:text-slate-200 transition-colors"
                    placeholder="搜索竞赛..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>

                <div className="relative group w-full sm:w-64 lg:hidden">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary">
                    <span className="material-symbols-outlined text-[20px]">search</span>
                  </div>
                  <input
                    className="block w-full pl-10 pr-3 py-2 border-none rounded-lg bg-slate-100 dark:bg-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary text-slate-900 dark:text-slate-200 transition-colors"
                    placeholder="搜索竞赛..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </div>

                <label className="flex items-center cursor-pointer gap-2 select-none group whitespace-nowrap">
                  <div className="relative">
                    <input className="sr-only peer" type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary dark:peer-focus:ring-primary/50 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-danger"></div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 group-hover:text-danger transition-colors">
                    仅紧急
                  </span>
                </label>

                <button
                  className="hidden lg:inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400/50 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                  type="button"
                  title="报名截止早于今天且未标记为已报名及以后"
                  onClick={() => setHideMissedPersist(!hideMissed)}
                >
                  <span className="material-symbols-outlined text-[16px]">{hideMissed ? "visibility_off" : "visibility"}</span>
                  已错过
                  <span className="font-mono opacity-70">{filterMeta.missedCount}</span>
                </button>

                <button
                  className="text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors flex items-center gap-1 whitespace-nowrap"
                  type="button"
                  onClick={() => setTimeline((t) => ({ ...t, start: startOfWeek(new Date()) }))}
                >
                  <span className="material-symbols-outlined text-[16px]">today</span>
                  <span className="hidden sm:inline">跳转至今天</span>
                </button>

                <button
                  className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 border border-slate-400/40 dark:border-slate-600 ml-1 grid place-items-center overflow-hidden"
                  title="选择/编辑身份"
                  type="button"
                  onClick={() => setIdentityOpen(true)}
                >
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {(curMember?.avatar_emoji || curMember?.name?.slice(0, 1) || "选").slice(0, 2)}
                  </span>
                </button>
              </div>
            </div>

            {viewMode === "list" ? (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="h-10 border-b border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/20 flex items-center px-4 sticky top-0 z-10 backdrop-blur-sm">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">竞赛列表</span>
                </div>
                <div>
                  {rowsVm.map((r) =>
                    r.type === "group" ? (
                      <GroupRow
                        key={r.key}
                        title={r.title}
                        stats={r.stats}
                        collapsed={collapsedGroups.has(r.key)}
                        onToggle={() => {
                          const next = new Set(collapsedGroups);
                          if (next.has(r.key)) next.delete(r.key);
                          else next.add(r.key);
                          setCollapsedGroups(next);
                          saveStringSet(STORAGE_COLLAPSED_GROUPS, next);
                        }}
                      />
                    ) : (
                      <CompetitionListItem key={r.comp.id} comp={r.comp} onOpen={() => openDrawer(r.comp.id)} />
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto relative flex">
                <div className="w-72 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark z-10 sticky left-0 shadow-[4px_0_24px_rgba(0,0,0,0.2)]">
                  <div className="h-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center px-4">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">竞赛名称</span>
                  </div>
                  <div>
                    {rowsVm.map((r) =>
                      r.type === "group" ? (
                        <GroupRow
                          key={r.key}
                          title={r.title}
                          stats={r.stats}
                          collapsed={collapsedGroups.has(r.key)}
                          onToggle={() => {
                            const next = new Set(collapsedGroups);
                            if (next.has(r.key)) next.delete(r.key);
                            else next.add(r.key);
                            setCollapsedGroups(next);
                            saveStringSet(STORAGE_COLLAPSED_GROUPS, next);
                          }}
                        />
                      ) : (
                        <CompetitionListItem key={r.comp.id} comp={r.comp} onOpen={() => openDrawer(r.comp.id)} />
                      )
                    )}
                  </div>
                </div>

                <Gantt
                  timeline={timeline}
                  rows={rowsVm}
                  collapsedGroups={collapsedGroups}
                  onToggleGroup={(key) => {
                    const next = new Set(collapsedGroups);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    setCollapsedGroups(next);
                    saveStringSet(STORAGE_COLLAPSED_GROUPS, next);
                  }}
                  onOpenCompetition={(id) => openDrawer(id)}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <aside className="hidden xl:flex w-[28%] max-w-[420px] bg-slate-50 dark:bg-surface-darker border-l border-slate-200 dark:border-slate-800 flex-col shrink-0 z-10">
        <div className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 bg-white dark:bg-surface-darker">
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined text-2xl">smart_toy</span>
            <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">AI 助手</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              className={[
                "text-[10px] font-bold px-2 py-1 rounded border transition-colors",
                aiWebSearch
                  ? "bg-primary/10 text-primary border-primary/40"
                  : "border-slate-300/40 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/40",
              ].join(" ")}
              title="联网搜索（需配置 BOCHA_API_KEY）"
              type="button"
              onClick={() => {
                const next = !aiWebSearch;
                setAiWebSearchPersist(next);
              }}
            >
              WEB
            </button>
          </div>
        </div>
        <AiPanel useWebSearch={aiWebSearch} />
      </aside>

      {aiOpen ? (
        <div className="fixed inset-0 z-[50] xl:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAiOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-full sm:w-[420px] bg-slate-50 dark:bg-surface-darker border-l border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 bg-white dark:bg-surface-darker">
              <div className="flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-2xl">smart_toy</span>
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">AI 助手</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={[
                    "text-[10px] font-bold px-2 py-1 rounded border transition-colors",
                    aiWebSearch
                      ? "bg-primary/10 text-primary border-primary/40"
                      : "border-slate-300/40 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-primary hover:border-primary/40",
                  ].join(" ")}
                  title="联网搜索（需配置 BOCHA_API_KEY）"
                  type="button"
                  onClick={() => setAiWebSearchPersist(!aiWebSearch)}
                >
                  WEB
                </button>
                <button
                  className="h-9 w-9 grid place-items-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
                  type="button"
                  title="关闭"
                  onClick={() => setAiOpen(false)}
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>
            <AiPanel useWebSearch={aiWebSearch} />
          </aside>
        </div>
      ) : null}

      {filtersOpen ? (
        <DashboardFiltersDrawer
          q={q}
          setQ={setQ}
          urgentOnly={urgentOnly}
          setUrgentOnly={setUrgentOnly}
          hideMissed={hideMissed}
          setHideMissed={setHideMissedPersist}
          viewMode={viewMode}
          setViewMode={setViewModePersist}
          groupBy={groupBy}
          setGroupBy={setGroupByPersist}
          sortBy={sortBy}
          setSortBy={setSortByPersist}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilterPersist}
          tagFilter={tagFilter}
          setTagFilter={setTagFilterPersist}
          ownerFilter={ownerFilter}
          setOwnerFilter={setOwnerFilterPersist}
          meta={filterMeta}
          onClose={() => setFiltersOpen(false)}
        />
      ) : null}

      {identityOpen ? (
        <IdentityModal
          members={members}
          memberId={memberId}
          onClose={() => setIdentityOpen(false)}
          onSelect={(id) => {
            setMemberId(id);
            setString(STORAGE_MEMBER_ID, id);
            setIdentityOpen(false);
          }}
          onCreate={async (payload) => {
            const m = await createMember(payload);
            await queryClient.invalidateQueries({ queryKey: ["members"] });
            setMemberId(m.id);
            setString(STORAGE_MEMBER_ID, m.id);
            setIdentityOpen(false);
          }}
          onUpdate={async (id, payload) => {
            await updateMember(id, payload);
            await queryClient.invalidateQueries({ queryKey: ["members"] });
          }}
        />
      ) : null}

      {drawerComp ? (
        <CompetitionDrawer
          comp={drawerComp}
          members={members}
          memberId={memberId}
          onClose={() => closeDrawer()}
          onSwitchIdentity={() => {
            closeDrawer();
            setIdentityOpen(true);
          }}
          onSave={async (payload) => {
            if (!memberId) return;
            await updateProgress(drawerComp.id, payload, memberId);
            await queryClient.invalidateQueries({ queryKey: ["competitions"] });
            closeDrawer();
          }}
        />
      ) : null}
    </div>
  );
}

type DashboardFilterMeta = {
  statusCounts: Record<string, number>;
  tagCounts: Record<string, number>;
  ownerCounts: Record<string, number>;
  statusOptions: string[];
  tagOptions: string[];
  ownerOptions: { key: string; label: string }[];
  missedCount: number;
};

function DashboardFiltersDrawer(props: {
  q: string;
  setQ: (v: string) => void;
  urgentOnly: boolean;
  setUrgentOnly: (v: boolean) => void;
  hideMissed: boolean;
  setHideMissed: (v: boolean) => void;
  viewMode: "gantt" | "list";
  setViewMode: (v: "gantt" | "list") => void;
  groupBy: GroupBy;
  setGroupBy: (v: GroupBy) => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  statusFilter: Set<string>;
  setStatusFilter: (s: Set<string>) => void;
  tagFilter: Set<string>;
  setTagFilter: (s: Set<string>) => void;
  ownerFilter: Set<string>;
  setOwnerFilter: (s: Set<string>) => void;
  meta: DashboardFilterMeta;
  onClose: () => void;
}) {
  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const clearFilters = () => {
    props.setQ("");
    props.setUrgentOnly(false);
    props.setHideMissed(true);
    props.setStatusFilter(new Set());
    props.setTagFilter(new Set());
    props.setOwnerFilter(new Set());
  };

  return (
    <div className="fixed inset-0 z-[52]">
      <div className="absolute inset-0 bg-black/50" onClick={props.onClose} />
      <aside className="absolute inset-y-0 right-0 w-full sm:w-[520px] bg-white dark:bg-surface-darker border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        <header className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Filters</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">筛选与视图</div>
          </div>
          <button
            className="h-9 w-9 grid place-items-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
            type="button"
            title="关闭"
            onClick={props.onClose}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">搜索</div>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary">
                <span className="material-symbols-outlined text-[20px]">search</span>
              </div>
              <input
                className="block w-full pl-10 pr-3 py-2 border-none rounded-lg bg-slate-100 dark:bg-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary text-slate-900 dark:text-slate-200 transition-colors"
                placeholder="搜索竞赛..."
                value={props.q}
                onChange={(e) => props.setQ(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">视图</div>
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <button
                  className={[
                    "flex items-center justify-center px-3 py-1 rounded text-xs font-medium transition-colors",
                    props.viewMode === "gantt"
                      ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
                  ].join(" ")}
                  type="button"
                  onClick={() => props.setViewMode("gantt")}
                >
                  <span className="material-symbols-outlined text-[16px] mr-1">view_timeline</span> 甘特图
                </button>
                <button
                  className={[
                    "flex items-center justify-center px-3 py-1 rounded text-xs font-medium transition-colors",
                    props.viewMode === "list"
                      ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
                  ].join(" ")}
                  type="button"
                  onClick={() => props.setViewMode("list")}
                >
                  <span className="material-symbols-outlined text-[16px] mr-1">format_list_bulleted</span> 列表
                </button>
              </div>

              <label className="flex items-center cursor-pointer gap-2 select-none group">
                <div className="relative">
                  <input className="sr-only peer" type="checkbox" checked={props.urgentOnly} onChange={(e) => props.setUrgentOnly(e.target.checked)} />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary dark:peer-focus:ring-primary/50 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-danger"></div>
                </div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 group-hover:text-danger transition-colors">仅紧急</span>
              </label>

              <label className="flex items-center cursor-pointer gap-2 select-none group">
                <div className="relative">
                  <input className="sr-only peer" type="checkbox" checked={props.hideMissed} onChange={(e) => props.setHideMissed(e.target.checked)} />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary dark:peer-focus:ring-primary/50 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-slate-900"></div>
                </div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                  隐藏已错过
                  <span className="ml-1 text-[10px] font-mono opacity-70">({props.meta.missedCount})</span>
                </span>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">分组与排序</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">分组</span>
                <select
                  className="rounded-lg bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary"
                  value={props.groupBy}
                  onChange={(e) => props.setGroupBy(e.target.value as GroupBy)}
                >
                  <option value="none">不分组</option>
                  <option value="source">按含金量</option>
                  <option value="result">按结果公布</option>
                  <option value="urgency">按紧急程度</option>
                  <option value="deadline">按截止日期桶</option>
                  <option value="owner">按负责人</option>
                  <option value="state">按进展状态</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">排序</span>
                <select
                  className="rounded-lg bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary"
                  value={props.sortBy}
                  onChange={(e) => props.setSortBy(e.target.value as SortBy)}
                >
                  <option value="next">按下一节点</option>
                  <option value="name">按名称</option>
                  <option value="result">按结果时间</option>
                </select>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">状态</div>
              <button
                className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-primary"
                type="button"
                onClick={() => props.setStatusFilter(new Set())}
              >
                清空
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {props.meta.statusOptions.map((opt) => (
                <label
                  key={opt}
                  className={[
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors",
                    props.statusFilter.has(opt)
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-white/60 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-primary/40",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary"
                    checked={props.statusFilter.has(opt)}
                    onChange={() => toggle(props.statusFilter, opt, props.setStatusFilter)}
                  />
                  <span className="truncate">{opt}</span>
                  <span className="ml-auto text-[10px] font-mono opacity-70">{props.meta.statusCounts[opt] || 0}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">负责人</div>
              <button
                className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-primary"
                type="button"
                onClick={() => props.setOwnerFilter(new Set())}
              >
                清空
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {props.meta.ownerOptions.map((o) => (
                <label
                  key={o.key}
                  className={[
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors",
                    props.ownerFilter.has(o.key)
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-white/60 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-primary/40",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary"
                    checked={props.ownerFilter.has(o.key)}
                    onChange={() => toggle(props.ownerFilter, o.key, props.setOwnerFilter)}
                  />
                  <span className="truncate">{o.label}</span>
                  <span className="ml-auto text-[10px] font-mono opacity-70">{props.meta.ownerCounts[o.key] || 0}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">标签</div>
              <button
                className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-primary"
                type="button"
                onClick={() => props.setTagFilter(new Set())}
              >
                清空
              </button>
            </div>
            <div className="max-h-56 overflow-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {props.meta.tagOptions.map((t) => (
                <label
                  key={t}
                  className={[
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors",
                    props.tagFilter.has(t)
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-white/60 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-primary/40",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary"
                    checked={props.tagFilter.has(t)}
                    onChange={() => toggle(props.tagFilter, t, props.setTagFilter)}
                  />
                  <span className="truncate">{t}</span>
                  <span className="ml-auto text-[10px] font-mono opacity-70">{props.meta.tagCounts[t] || 0}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <footer className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/20 flex items-center justify-between gap-3">
          <button
            className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors"
            type="button"
            onClick={clearFilters}
          >
            清空筛选
          </button>
          <button className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors" type="button" onClick={props.onClose}>
            完成
          </button>
        </footer>
      </aside>
    </div>
  );
}

function KpiCard(props: { title: string; icon: string; value: string; accent: string; danger?: boolean }) {
  return (
    <div
      className={[
        "bg-white dark:bg-surface-dark border rounded-xl p-4 shadow-sm flex flex-col justify-between h-32 group transition-all",
        props.danger ? "border-danger/30" : "border-slate-200 dark:border-slate-700/50 hover:border-primary/30",
      ].join(" ")}
    >
      <div className="flex justify-between items-start">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{props.title}</span>
        <span className={["material-symbols-outlined text-lg", props.danger ? "text-danger" : "text-slate-300 dark:text-slate-600"].join(" ")}>
          {props.icon}
        </span>
      </div>
      <div>
        <span className={["text-4xl font-bold font-display", props.accent].join(" ")}>{props.value}</span>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">实时从数据计算</div>
      </div>
    </div>
  );
}

function CompetitionListItem({ comp, onOpen }: { comp: Competition; onOpen: () => void }) {
  const now = new Date();
  const name = comp.display_name || comp.name;
  const dl = comp.nextDeadline?.daysLeft;
  const missed = isMissedRegistration(comp, now);
  const tone = missed ? { dot: "bg-danger", text: "text-danger", badge: "紧急" as const } : urgencyTone(typeof dl === "number" ? dl : null);
  const label = effectiveStateLabel(comp, now);

  return (
    <button
      type="button"
      className={[
        "w-full h-24 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group text-left",
        tone.dot === "bg-danger" ? "bg-danger/5" : "",
      ].join(" ")}
      onClick={onOpen}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors truncate">{name}</span>
        <span className={["text-xs mt-1 flex items-center gap-1", tone.text].join(" ")}>
          <span className={["w-2 h-2 rounded-full", tone.dot].join(" ")}></span>
          {label}
          {missed ? <span className="ml-2 text-[10px] font-bold bg-danger/15 text-danger border border-danger/30 px-2 py-0.5 rounded-full">报名已错过</span> : null}
          {typeof dl === "number" && dl >= 0 ? (
            <span className="ml-2 text-[10px] font-bold bg-slate-900/5 dark:bg-white/10 px-2 py-0.5 rounded-full">D-{dl}</span>
          ) : null}
        </span>
      </div>
    </button>
  );
}

function GroupRow({
  title,
  stats,
  collapsed,
  onToggle,
}: {
  title: string;
  stats: { count: number; urgent3: number; urgent7: number; overdue: number };
  collapsed: boolean;
  onToggle: () => void;
}) {
  const icon = collapsed ? "chevron_right" : "expand_more";

  const badges: { cls: string; text: string }[] = [{ cls: "bg-slate-900/5 dark:bg-white/10", text: `${stats.count}项` }];
  if (stats.urgent3) badges.push({ cls: "bg-danger/15 text-danger border border-danger/30", text: `紧急 ${stats.urgent3}` });
  else if (stats.urgent7) badges.push({ cls: "bg-warning/15 text-warning border border-warning/30", text: `临近 ${stats.urgent7}` });
  if (stats.overdue) badges.push({ cls: "bg-slate-900/5 dark:bg-white/10", text: `已过期 ${stats.overdue}` });

  return (
    <button
      type="button"
      className="w-full h-12 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 bg-slate-50/80 dark:bg-slate-900/20 hover:bg-slate-100 dark:hover:bg-slate-900/35 transition-colors cursor-pointer select-none"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2 min-w-0 w-full">
        <span className="material-symbols-outlined text-[18px] text-slate-400">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{title}</span>
        <div className="ml-auto flex items-center gap-2">
          {badges.map((b, idx) => (
            <span key={idx} className={["text-[10px] font-bold px-2 py-0.5 rounded-full", b.cls].join(" ")}>
              {b.text}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

function Gantt({
  timeline,
  rows,
  collapsedGroups,
  onToggleGroup,
  onOpenCompetition,
}: {
  timeline: { start: Date; days: number; columnWidth: number };
  rows: RowVm[];
  collapsedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  onOpenCompetition: (id: string) => void;
}) {
  const start = timeline.start;
  const pxPerDay = timeline.columnWidth / 7;
  const dayMs = 24 * 60 * 60 * 1000;
  const end = addDays(start, timeline.days);
  const now = new Date();
  const todayX = ((now.getTime() - start.getTime()) / dayMs) * pxPerDay;

  return (
    <div className="flex-1 relative min-w-[800px] bg-slate-50 dark:bg-[#131c2e]">
      <div className="h-10 border-b border-slate-200 dark:border-slate-700 flex sticky top-0 bg-slate-50 dark:bg-[#131c2e] z-0">
        {Array.from({ length: Math.ceil(timeline.days / 7) }).map((_, idx) => {
          const d = addDays(start, idx * 7);
          return (
            <div
              key={idx}
              className="w-[100px] shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs text-slate-400"
            >
              {d.getMonth() + 1}月{String(d.getDate()).padStart(2, "0")}
            </div>
          );
        })}
      </div>

      <div
        className="absolute top-0 bottom-0 left-0 w-px bg-primary z-20 shadow-[0_0_8px_rgba(19,200,236,0.6)]"
        style={{ transform: `translateX(${Math.max(0, todayX)}px)` }}
      >
        <div className="absolute -top-1 -left-[3px] w-[7px] h-[7px] rounded-full bg-primary" />
        <div className="absolute top-2 left-2 text-[10px] font-bold text-primary uppercase bg-background-dark/80 px-1 rounded backdrop-blur-sm">
          今天
        </div>
      </div>

      <div className="absolute inset-0 top-10 pointer-events-none opacity-20 dark:opacity-10" style={{ backgroundImage: "linear-gradient(to right, #334155 1px, transparent 1px)", backgroundSize: "100px 100%" }} />

      <div>
        {rows.map((r) =>
          r.type === "group" ? (
            <div
              key={r.key}
              className="h-12 border-b border-slate-200 dark:border-slate-800/60 bg-slate-100/60 dark:bg-slate-900/20 hover:bg-slate-200/30 dark:hover:bg-slate-900/30 transition-colors flex items-center cursor-pointer select-none"
              onClick={() => onToggleGroup(r.key)}
              role="button"
              tabIndex={0}
            >
              <div className="px-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="material-symbols-outlined text-[18px] text-slate-400">{collapsedGroups.has(r.key) ? "chevron_right" : "expand_more"}</span>
                <span className="font-bold uppercase tracking-wider">{r.title}</span>
                <span className="text-[10px] font-mono opacity-70">{String(r.stats?.count ?? 0)}项</span>
              </div>
            </div>
          ) : (
            <GanttRow key={r.comp.id} comp={r.comp} start={start} end={end} pxPerDay={pxPerDay} onOpen={() => onOpenCompetition(r.comp.id)} />
          )
        )}
      </div>
    </div>
  );
}

function GanttRow({
  comp,
  start,
  end,
  pxPerDay,
  onOpen,
}: {
  comp: Competition;
  start: Date;
  end: Date;
  pxPerDay: number;
  onOpen: () => void;
}) {
  const dayMs = 24 * 60 * 60 * 1000;
  const regS = parseISODate(comp.registration_start);
  const regE = parseISODate(comp.registration_end);
  const subS = parseISODate(comp.submission_start);
  const subE = parseISODate(comp.submission_end);
  const resE = parseISODate(comp.result_end);

  const bars: { left: number; width: number; top: number; label: string; cls: string; tip: string }[] = [];

  const addSeg = (kind: "reg" | "sub", s: Date | null, e: Date | null) => {
    if (!e) return;
    const segS = s || e;
    const segStart = segS.getTime();
    const segEnd = e.getTime();
    const clampStart = Math.max(segStart, start.getTime());
    const clampEnd = Math.min(segEnd, end.getTime());
    const x = ((clampStart - start.getTime()) / dayMs) * pxPerDay;
    const wDays = Math.max(1, Math.floor((clampEnd - clampStart) / dayMs) + 1);
    const w = wDays * pxPerDay;
    bars.push({
      left: x,
      width: Math.max(8, w),
      top: kind === "reg" ? 26 : 54,
      label: kind === "reg" ? "报名" : "提交",
      cls: kind === "reg" ? "from-warning/25 to-warning/55 border-warning/60" : "from-primary/20 to-primary/45 border-primary/50",
      tip: kind === "reg" ? String(comp.registration_text || "") : String(comp.submission_text || ""),
    });
  };

  addSeg("reg", regS, regE);
  addSeg("sub", subS, subE);

  const milestoneX = resE ? ((resE.getTime() - start.getTime()) / dayMs) * pxPerDay : null;

  return (
    <button type="button" className="w-full h-24 border-b border-slate-200 dark:border-slate-800/50 relative text-left" onClick={onOpen}>
      {bars.map((b, i) => (
        <div
          key={i}
          className={[
            "absolute h-6 rounded-md border bg-gradient-to-r flex items-center px-2 shadow-lg hover:brightness-110 cursor-pointer group",
            b.cls,
          ].join(" ")}
          style={{ left: `${b.left.toFixed(1)}px`, width: `${b.width.toFixed(1)}px`, top: `${b.top}px` }}
          title={b.tip}
        >
          <span className="text-[11px] font-medium text-white drop-shadow-md truncate">{b.label}</span>
        </div>
      ))}

      {milestoneX !== null ? (
        <div className="absolute top-[38px] -translate-x-1/2" style={{ left: `${milestoneX.toFixed(1)}px` }} title={String(comp.result_text || "")}>
          <div className="w-3 h-3 rounded-full bg-success shadow-[0_0_10px_rgba(16,185,129,0.55)]" />
        </div>
      ) : null}
    </button>
  );
}

function AiPanel({ useWebSearch }: { useWebSearch: boolean }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "bot"; text: string }[]>([
    { role: "bot", text: "你可以问我：最近的竞赛、最急的竞赛、按负责人列出待办、某个竞赛下一步做什么。" },
  ]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: t }]);
    setInput("");
    try {
      const reply = await aiAsk(t, { useWebSearch });
      setMessages((m) => [...m, { role: "bot", text: reply.content || "(无内容)" }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "bot", text: `AI 请求失败：${String(e?.message || e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, idx) =>
          m.role === "bot" ? (
            <div key={idx} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-sm">smart_toy</span>
              </div>
              <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={idx} className="flex gap-3 flex-row-reverse">
              <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                <span className="text-xs font-bold">我</span>
              </div>
              <div className="bg-primary text-white rounded-2xl rounded-tr-none p-3 shadow-md text-sm whitespace-pre-wrap break-words">{m.text}</div>
            </div>
          )
        )}
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-darker">
        <div className="relative">
          <input
            className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl py-3 pl-4 pr-12 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-primary"
            placeholder={busy ? "AI 思考中..." : "向 AI 提问..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send(input);
            }}
            disabled={busy}
          />
          <button
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-40"
            type="button"
            onClick={() => send(input)}
            disabled={busy}
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </div>
        <div className="text-[10px] text-center text-slate-400 mt-2">AI 可能会犯错。请核实关键数据。</div>
      </div>
    </>
  );
}

function IdentityModal(props: {
  members: Member[];
  memberId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: (payload: { name: string; avatarEmoji?: string | null; avatarColor?: string | null }) => Promise<void>;
  onUpdate: (id: string, payload: { name: string; avatarEmoji?: string | null; avatarColor?: string | null }) => Promise<void>;
}) {
  const cur = props.memberId ? props.members.find((m) => m.id === props.memberId) || null : null;
  const [busy, setBusy] = useState(false);
  const [editName, setEditName] = useState(cur?.name || "");
  const [editEmoji, setEditEmoji] = useState(cur?.avatar_emoji || "");
  const [editColor, setEditColor] = useState(cur?.avatar_color || "");

  useEffect(() => {
    setEditName(cur?.name || "");
    setEditEmoji(cur?.avatar_emoji || "");
    setEditColor(cur?.avatar_color || "");
  }, [cur?.id]);

  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newColor, setNewColor] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div className="absolute inset-0 bg-black/60" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-surface-darker border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div>
            <div className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Identity</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">选择你的身份</div>
          </div>
          <button className="text-slate-400 hover:text-slate-900 dark:hover:text-white" type="button" onClick={props.onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            {props.members.map((m) => (
              <button
                key={m.id}
                type="button"
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/20 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left"
                onClick={() => props.onSelect(m.id)}
              >
                <div className="w-10 h-10 rounded-full grid place-items-center font-bold" style={{ background: m.avatar_color || "#334155" }}>
                  <span className="text-sm" style={{ color: "#0b1220" }}>
                    {(m.avatar_emoji || m.name.slice(0, 1)).slice(0, 2)}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{m.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.id}</div>
                </div>
                {props.memberId === m.id ? <span className="ml-auto text-primary text-xs font-bold">当前</span> : <span className="ml-auto text-slate-400 text-xs">选择</span>}
              </button>
            ))}
          </div>

          <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">编辑当前成员</div>
                <form
                  className="grid grid-cols-1 gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!props.memberId) return;
                    setBusy(true);
                    try {
                      await props.onUpdate(props.memberId, {
                        name: editName.trim(),
                        avatarEmoji: editEmoji.trim() || null,
                        avatarColor: editColor.trim() || null,
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <input
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm"
                    placeholder="姓名"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={!props.memberId || busy}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm"
                      placeholder="Emoji"
                      value={editEmoji}
                      onChange={(e) => setEditEmoji(e.target.value)}
                      disabled={!props.memberId || busy}
                    />
                    <input
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm"
                      placeholder="#13c8ec"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      disabled={!props.memberId || busy}
                    />
                  </div>
                  <button
                    className="px-4 py-2 rounded-lg bg-slate-900/10 dark:bg-white/10 hover:bg-slate-900/20 dark:hover:bg-white/20 text-slate-900 dark:text-white text-sm font-bold transition-colors disabled:opacity-50"
                    type="submit"
                    disabled={!props.memberId || busy}
                  >
                    保存
                  </button>
                </form>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">头像/颜色仅用于面板识别。</div>
              </div>

              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">新增成员</div>
                <form
                  className="grid grid-cols-1 md:grid-cols-3 gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = newName.trim();
                    if (!name) return;
                    setBusy(true);
                    try {
                      await props.onCreate({ name, avatarEmoji: newEmoji.trim() || null, avatarColor: newColor.trim() || null });
                      setNewName("");
                      setNewEmoji("");
                      setNewColor("");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <input
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm"
                    placeholder="姓名"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    disabled={busy}
                  />
                  <input
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm"
                    placeholder="头像 Emoji (可选)"
                    value={newEmoji}
                    onChange={(e) => setNewEmoji(e.target.value)}
                    disabled={busy}
                  />
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm"
                      placeholder="#13c8ec (可选)"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      disabled={busy}
                    />
                    <button
                      className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
                      type="submit"
                      disabled={busy}
                    >
                      添加
                    </button>
                  </div>
                </form>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">不做强认证：任何人都可以切换身份。用于团队协作记录。</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompetitionDrawer(props: {
  comp: Competition;
  members: Member[];
  memberId: string | null;
  onClose: () => void;
  onSwitchIdentity: () => void;
  onSave: (payload: {
    state: string;
    ownerMemberId?: string | null;
    stateDetail?: string | null;
    award?: string | null;
    notes?: string | null;
    riskLevel?: number;
  }) => Promise<void>;
}) {
  const c = props.comp;
  const [busy, setBusy] = useState(false);
  const [stateVal, setStateVal] = useState(c.progress_state || "not_started");
  const [owner, setOwner] = useState<string>(c.progress_owner_member_id || "");
  const [stateDetail, setStateDetail] = useState(c.progress_state_detail || "");
  const [award, setAward] = useState(c.progress_award || "");
  const [notes, setNotes] = useState(c.progress_notes || "");

  const cur = props.memberId ? props.members.find((m) => m.id === props.memberId) || null : null;

  return (
    <div className="fixed inset-0 z-[55]">
      <div className="absolute inset-0 bg-black/50" onClick={props.onClose} />
      <aside className="absolute inset-y-0 right-0 w-full md:w-[600px] bg-white dark:bg-surface-darker border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        <header className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-surface-darker/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/30">
                  {c.progress_state ? STATE_LABEL[c.progress_state] || c.progress_state : "未维护"}
                </span>
                {c.source_tag ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-900/30 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                    {c.source_tag}
                  </span>
                ) : null}
                {c.offline_defense ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-900/30 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                    答辩:{c.offline_defense}
                  </span>
                ) : null}
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight tracking-tight truncate">{c.display_name || c.name}</h2>
            </div>
            <button className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors" type="button" onClick={props.onClose}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <section>
            <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">timeline</span>
              时间轴
            </h3>
            <div className="space-y-3">
              <TimelineItem title="报名" text={c.registration_text} startISO={c.registration_start} endISO={c.registration_end} />
              <TimelineItem title="提交" text={c.submission_text} startISO={c.submission_start} endISO={c.submission_end} />
              <TimelineItem title="结果" text={c.result_text} startISO={c.result_start} endISO={c.result_end} />
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">edit_note</span>
              进展维护
            </h3>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!props.memberId) return;
                setBusy(true);
                try {
                  await props.onSave({
                    state: stateVal,
                    ownerMemberId: owner.trim() || null,
                    stateDetail: stateDetail.trim() || null,
                    award: award.trim() || null,
                    notes: notes.trim() || null,
                    riskLevel: 0,
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">状态</span>
                  <select
                    className="rounded-lg bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary"
                    value={stateVal}
                    onChange={(e) => setStateVal(e.target.value)}
                  >
                    {Object.entries(STATE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">负责人</span>
                  <select
                    className="rounded-lg bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    <option value="">未分配</option>
                    {props.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">阶段备注（例如：省赛中 / 国赛决赛中）</span>
                <input
                  className="rounded-lg bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary"
                  value={stateDetail}
                  onChange={(e) => setStateDetail(e.target.value)}
                  placeholder="可选"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">奖次/结果（完工后填写）</span>
                <input
                  className="rounded-lg bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-primary"
                  value={award}
                  onChange={(e) => setAward(e.target.value)}
                  placeholder="可选"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">备注</span>
                <textarea
                  className="rounded-lg bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white min-h-[120px] focus:ring-1 focus:ring-primary"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="记录关键信息、待办、风险等..."
                />
              </label>
              <div className="flex items-center justify-between gap-3 pt-2">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  当前身份：{cur ? cur.name : "未选择"}
                  {cur ? "" : "（请先选择）"}
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm hover:bg-slate-200 dark:hover:bg-slate-900/60 transition-colors"
                    type="button"
                    onClick={props.onSwitchIdentity}
                  >
                    切换身份
                  </button>
                  <button className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50" type="submit" disabled={!props.memberId || busy}>
                    保存
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section>
            <h3 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">link</span>
              证据链接
            </h3>
            <div className="space-y-2 text-sm">{renderLinks(c.evidence_links_json)}</div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function TimelineItem(props: { title: string; text?: string | null; startISO?: string | null; endISO?: string | null }) {
  const s = props.startISO || "";
  const e = props.endISO && props.endISO !== props.startISO ? props.endISO : "";
  const line = e ? `${s} ~ ${e}` : s;

  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-slate-900 dark:text-white font-bold">{props.title}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{line || "-"}</div>
      </div>
      <div className="text-sm text-slate-700 dark:text-slate-300 mt-2 break-words">{props.text || "-"}</div>
    </div>
  );
}

function renderLinks(linksJson: string): JSX.Element {
  let links: string[] = [];
  try {
    links = JSON.parse(linksJson || "[]");
  } catch {
    links = [];
  }

  if (!links.length) return <div className="text-slate-500 dark:text-slate-400 text-sm">无</div>;
  return (
    <>
      {links.map((u) => (
        <a key={u} className="block text-primary hover:underline break-all" href={u} target="_blank" rel="noreferrer">
          {u}
        </a>
      ))}
    </>
  );
}
