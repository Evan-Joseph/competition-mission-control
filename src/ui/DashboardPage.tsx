import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

export default function DashboardPage() {
  const queryClient = useQueryClient();

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

  useEffect(() => {
    const stored = getString(STORAGE_MEMBER_ID, null);
    if (stored) setMemberId(stored);
    const ai = getString(STORAGE_AI_WEB_SEARCH, "0");
    setAiWebSearch(ai === "1");

    const g = (getString(STORAGE_GROUP_BY, "none") || "none") as GroupBy;
    if (["none", "source", "result", "urgency", "owner", "state"].includes(g)) setGroupBy(g);
    const s = (getString(STORAGE_SORT_BY, "next") || "next") as SortBy;
    if (["next", "name", "result"].includes(s)) setSortBy(s);

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
        computeAutoPhase(c, now);
        return true;
      });
  }, [competitions, q, urgentOnly]);

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
    if (!memberId) setIdentityOpen(true);
  }, [memberId]);

  return (
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-background-light dark:bg-background-dark relative">
        <section className="grid grid-cols-5 gap-4 p-6 shrink-0">
          <KpiCard title="总竞赛数" icon="inventory_2" value={String(kpis.total)} accent="text-slate-900 dark:text-white" />
          <KpiCard title="报名进行中" icon="app_registration" value={String(kpis.registering)} accent="text-primary" />
          <KpiCard title="临近截止" icon="alarm" value={String(kpis.urgent)} accent="text-white" danger />
          <KpiCard title="高风险" icon="warning" value={String(kpis.risk)} accent="text-danger" />
          <KpiCard title="本月结果公布" icon="emoji_events" value={String(kpis.resultsThisMonth)} accent="text-slate-900 dark:text-white" />
        </section>

        <div className="flex-1 px-6 pb-6 min-h-0 flex flex-col">
          <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700/50 rounded-xl shadow-lg flex-1 flex flex-col overflow-hidden">
            <div className="h-12 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 bg-slate-50 dark:bg-slate-800/50">
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

              <div className="flex items-center gap-3">
                <div className="hidden lg:flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">account_tree</span>
                    <select
                      className="text-xs rounded-lg bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary"
                      value={groupBy}
                      onChange={(e) => {
                        const v = e.target.value as GroupBy;
                        setGroupBy(v);
                        setString(STORAGE_GROUP_BY, v);
                        setCollapsedGroups(new Set());
                        remove(STORAGE_COLLAPSED_GROUPS);
                      }}
                    >
                      <option value="none">不分组</option>
                      <option value="source">按含金量</option>
                      <option value="result">按结果公布</option>
                      <option value="urgency">按紧急程度</option>
                      <option value="owner">按负责人</option>
                      <option value="state">按进展状态</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-400">sort</span>
                    <select
                      className="text-xs rounded-lg bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary"
                      value={sortBy}
                      onChange={(e) => {
                        const v = e.target.value as SortBy;
                        setSortBy(v);
                        setString(STORAGE_SORT_BY, v);
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
                      setString(STORAGE_COLLAPSED_GROUPS, JSON.stringify([...next]));
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

                <label className="flex items-center cursor-pointer gap-2 select-none group">
                  <div className="relative">
                    <input className="sr-only peer" type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary dark:peer-focus:ring-primary/50 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-danger"></div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 group-hover:text-danger transition-colors">
                    仅紧急
                  </span>
                </label>

                <button
                  className="text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors"
                  type="button"
                  onClick={() => setTimeline((t) => ({ ...t, start: startOfWeek(new Date()) }))}
                >
                  跳转至今天
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

            <div className="flex-1 overflow-auto relative flex">
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
                          setString(STORAGE_COLLAPSED_GROUPS, JSON.stringify([...next]));
                        }}
                      />
                    ) : (
                      <CompetitionListItem key={r.comp.id} comp={r.comp} onOpen={() => setDrawerId(r.comp.id)} />
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
                  setString(STORAGE_COLLAPSED_GROUPS, JSON.stringify([...next]));
                }}
                onOpenCompetition={(id) => setDrawerId(id)}
              />
            </div>
          </div>
        </div>
      </main>

      <aside className="w-[28%] max-w-[420px] bg-slate-50 dark:bg-surface-darker border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0 z-10">
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
                setAiWebSearch(next);
                setString(STORAGE_AI_WEB_SEARCH, next ? "1" : "0");
              }}
            >
              WEB
            </button>
          </div>
        </div>
        <AiPanel useWebSearch={aiWebSearch} />
      </aside>

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
          onClose={() => setDrawerId(null)}
          onSwitchIdentity={() => {
            setDrawerId(null);
            setIdentityOpen(true);
          }}
          onSave={async (payload) => {
            if (!memberId) return;
            await updateProgress(drawerComp.id, payload, memberId);
            await queryClient.invalidateQueries({ queryKey: ["competitions"] });
            setDrawerId(null);
          }}
        />
      ) : null}
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
  const tone = urgencyTone(typeof dl === "number" ? dl : null);
  const manual = comp.progress_state ? STATE_LABEL[comp.progress_state] || comp.progress_state : null;
  const auto = computeAutoPhase(comp, now);
  const label = manual || auto;

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
              <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={idx} className="flex gap-3 flex-row-reverse">
              <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
                <span className="text-xs font-bold">我</span>
              </div>
              <div className="bg-primary text-white rounded-2xl rounded-tr-none p-3 shadow-md text-sm whitespace-pre-wrap">{m.text}</div>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-surface-darker border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Identity</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">选择你的身份</div>
          </div>
          <button className="text-slate-400 hover:text-slate-900 dark:hover:text-white" type="button" onClick={props.onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

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
                  <button className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50" type="submit" disabled={busy}>
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
      <aside className="absolute inset-y-0 right-0 w-full md:w-[600px] bg-surface-darker border-l border-slate-800 shadow-2xl flex flex-col">
        <header className="p-6 border-b border-slate-800 bg-surface-darker/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/30">
                  {c.progress_state ? STATE_LABEL[c.progress_state] || c.progress_state : "未维护"}
                </span>
                {c.source_tag ? (
                  <span className="inline-flex items-center rounded-full bg-slate-900/30 px-2.5 py-0.5 text-xs font-medium text-slate-200 border border-slate-700">
                    {c.source_tag}
                  </span>
                ) : null}
                {c.offline_defense ? (
                  <span className="inline-flex items-center rounded-full bg-slate-900/30 px-2.5 py-0.5 text-xs font-medium text-slate-200 border border-slate-700">
                    答辩:{c.offline_defense}
                  </span>
                ) : null}
              </div>
              <h2 className="text-2xl font-bold text-white leading-tight tracking-tight truncate">{c.display_name || c.name}</h2>
            </div>
            <button className="text-slate-400 hover:text-white transition-colors" type="button" onClick={props.onClose}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <section>
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
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
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
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
                  <span className="text-xs text-slate-400">状态</span>
                  <select
                    className="rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-white"
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
                  <span className="text-xs text-slate-400">负责人</span>
                  <select className="rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-white" value={owner} onChange={(e) => setOwner(e.target.value)}>
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
                <span className="text-xs text-slate-400">阶段备注（例如：省赛中 / 国赛决赛中）</span>
                <input className="rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-white" value={stateDetail} onChange={(e) => setStateDetail(e.target.value)} placeholder="可选" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">奖次/结果（完工后填写）</span>
                <input className="rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-white" value={award} onChange={(e) => setAward(e.target.value)} placeholder="可选" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">备注</span>
                <textarea className="rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-white min-h-[120px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="记录关键信息、待办、风险等..." />
              </label>
              <div className="flex items-center justify-between gap-3 pt-2">
                <div className="text-xs text-slate-400">当前身份：{cur ? cur.name : "未选择"}{cur ? "" : "（请先选择）"}</div>
                <div className="flex gap-2">
                  <button className="px-4 py-2 rounded-lg bg-slate-900/40 border border-slate-700 text-white text-sm hover:bg-slate-900/60 transition-colors" type="button" onClick={props.onSwitchIdentity}>
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
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
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
    <div className="rounded-xl bg-slate-900/30 border border-slate-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-white font-bold">{props.title}</div>
        <div className="text-xs text-slate-400 font-mono">{line || "-"}</div>
      </div>
      <div className="text-sm text-slate-300 mt-2 break-words">{props.text || "-"}</div>
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

  if (!links.length) return <div className="text-slate-400 text-sm">无</div>;
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
