import { useMemo, useState } from "react";
import { AlertTriangle, Award, Calendar, Clock, Filter, MoreHorizontal, Search, TrendingUp, Users } from "lucide-react";
import type { Competition } from "../../../lib/types";
import { addDaysYMD, parseYMD, type YMD } from "../../../lib/date";
import { isMissedRegistration } from "../../../domain/competitionEvents";
import { invalidCompetitionReason, isCompetitionEnded, nextCompetitionDue, type Due, type DueKind } from "../../../domain/competitionSchedule";
import { useV3App } from "../state/v3Context";

function initials(name: string): string {
  const s = String(name || "").trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
}

function avatarTone(name: string): string {
  const tones = [
    "bg-emerald-500/25 text-emerald-200 border-emerald-500/30",
    "bg-blue-500/25 text-blue-200 border-blue-500/30",
    "bg-rose-500/25 text-rose-200 border-rose-500/30",
    "bg-amber-500/25 text-amber-200 border-amber-500/30",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return tones[h % tones.length] || tones[0];
}

function hostname(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function deriveTags(comp: Competition): string[] {
  const hosts = comp.links.map((l) => hostname(l.url)).filter(Boolean) as string[];
  const uniq = Array.from(new Set(hosts));
  return uniq.slice(0, 3);
}

function dueTone(kind: DueKind): { dot: string; chip: string } {
  if (kind === "reg") return { dot: "bg-blue-400", chip: "bg-blue-500/10 text-blue-300 border-blue-500/20" };
  if (kind === "sub") return { dot: "bg-emerald-400", chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" };
  return { dot: "bg-purple-400", chip: "bg-purple-500/10 text-purple-300 border-purple-500/20" };
}

// Logic: Map status to discrete steps instead of arbitrary percentage
// Steps: 1.筹备 2.组队 3.报名 4.备赛 5.提交
function getStage(comp: Competition) {
  const t = String(comp.status_text || "");
  if (t.includes("提交") || t.includes("完结")) return 5;
  if (t.includes("刷题") || t.includes("准备") || t.includes("初赛")) return 4;
  if (comp.registered) return 3;
  if (comp.team_members.length > 1) return 2;
  return 1;
}

const STAGES = ["筹备", "组队", "报名", "备赛", "提交"] as const;

type CompMeta = {
  comp: Competition;
  tags: string[];
  invalid: string | null;
  missed: boolean;
  ended: boolean;
  unplanned: boolean;
  due: Due | null;
};

export default function TasksPage() {
  const { competitions, openCompetition, todayISO } = useV3App();

  const [viewFilter, setViewFilter] = useState<"all" | "active">("all");
  const [searchTerm, setSearchTerm] = useState("");

  const thresholdISO: YMD = (addDaysYMD(todayISO, 14) as YMD | null) || todayISO;
  const thresholdTime = useMemo(() => parseYMD(thresholdISO)?.getTime() ?? null, [thresholdISO]);

  const metas = useMemo((): CompMeta[] => {
    return competitions.map((c) => {
      const invalid = invalidCompetitionReason(c);
      const missed = invalid ? false : isMissedRegistration(c, todayISO);
      const ended = invalid ? false : isCompetitionEnded(c, todayISO);
      const due = invalid ? null : nextCompetitionDue(c, todayISO);
      const unplanned = !c.included_in_plan && !c.registered;
      return { comp: c, tags: deriveTags(c), invalid, missed, ended, unplanned, due };
    });
  }, [competitions, todayISO]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return metas.filter((m) => {
      if (viewFilter === "active") {
        if (m.invalid) return false;
        if (m.missed || m.ended) return false;
        if (m.unplanned) return false;
      }

      if (!q) return true;
      const nameHit = m.comp.name.toLowerCase().includes(q);
      const tagHit = m.tags.some((t) => t.toLowerCase().includes(q));
      const linkHit = m.comp.links.some((l) => String(l.title || "").toLowerCase().includes(q) || String(l.url || "").toLowerCase().includes(q));
      return nameHit || tagHit || linkHit;
    });
  }, [metas, searchTerm, viewFilter]);

  const invalidList = useMemo(() => filtered.filter((m) => Boolean(m.invalid)), [filtered]);
  const expiredList = useMemo(() => filtered.filter((m) => !m.invalid && (m.missed || m.ended)), [filtered]);
  const activeList = useMemo(() => filtered.filter((m) => !m.invalid && !m.missed && !m.ended), [filtered]);

  const plannedActive = useMemo(() => activeList.filter((m) => !m.unplanned), [activeList]);
  const unplannedActive = useMemo(() => activeList.filter((m) => m.unplanned), [activeList]);

  const noMilestone = useMemo(() => plannedActive.filter((m) => !m.due), [plannedActive]);
  const dueActive = useMemo(() => plannedActive.filter((m): m is CompMeta & { due: Due } => Boolean(m.due)), [plannedActive]);

  const soon = useMemo(() => {
    if (thresholdTime === null) return dueActive;
    return dueActive.filter((m) => m.due.time <= thresholdTime);
  }, [dueActive, thresholdTime]);

  const future = useMemo(() => {
    if (thresholdTime === null) return [];
    return dueActive.filter((m) => m.due.time > thresholdTime);
  }, [dueActive, thresholdTime]);

  return (
    <div className="p-8 max-w-6xl mx-auto w-full animate-fade-in pb-24">
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">竞赛列表</h1>
          <p className="text-text-secondary">统一管理赛事生命周期，从立项到最终提交。</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="搜索项目..."
              className="w-full bg-surface-dark border border-border-dark rounded-xl py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-primary transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            onClick={() => setViewFilter(viewFilter === "all" ? "active" : "all")}
            className={[
              "px-4 py-2 border rounded-xl text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap",
              viewFilter === "active"
                ? "bg-primary text-[#111816] border-primary"
                : "bg-surface-dark border-border-dark text-white hover:border-primary",
            ].join(" ")}
            type="button"
          >
            <Filter size={14} /> {viewFilter === "active" ? "只看进行中" : "全部项目"}
          </button>
        </div>
      </div>

      <div className="space-y-10">
        {viewFilter === "active" ? (
          <div className="text-xs text-text-secondary flex items-center gap-2">
            <span>只显示纳入规划/已报名且未过期的竞赛</span>
            <span className="w-1 h-1 rounded-full bg-border-dark" />
            <button type="button" className="text-primary hover:underline" onClick={() => setViewFilter("all")}>
              查看全部
            </button>
          </div>
        ) : null}

        {/* Invalid */}
        {viewFilter === "all" && invalidList.length > 0 ? (
          <div>
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 pl-1 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" /> 日期异常（需修复）
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {invalidList.map((m) => (
                <div
                  key={m.comp.id}
                  className="group bg-surface-dark/60 border border-amber-500/30 rounded-2xl p-5 flex items-center gap-4 hover:border-amber-400 transition-colors cursor-pointer"
                  onClick={() => openCompetition(m.comp.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    openCompetition(m.comp.id);
                  }}
                >
                  <div className="flex flex-col items-center justify-center w-12 h-12 bg-panel-dark rounded-lg border border-border-dark shrink-0 opacity-90">
                    <AlertTriangle size={20} className="text-amber-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-bold text-white truncate">{m.comp.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-amber-300 font-mono truncate">{m.invalid}</span>
                    </div>
                  </div>

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity text-amber-200 text-xs font-bold">
                    去修复
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Active / High Priority */}
        {soon.length > 0 ? (
          <div>
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 pl-1 flex items-center gap-2">
              <TrendingUp size={16} /> 进行中 / 需关注
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {soon.map((m) => {
                const comp = m.comp;
                const currentStage = getStage(comp);
                const tags = m.tags;
                const due = m.due;
                const dueKind = due?.kind || "reg";
                const tone = dueTone(dueKind);
                const badgeISO = due?.iso || (comp.registration_deadline_at as YMD);
                return (
                  <div
                    key={comp.id}
                    className="group bg-surface-dark border border-border-dark rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center gap-6 hover:border-text-secondary transition-colors cursor-pointer"
                    onClick={() => openCompetition(comp.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      openCompetition(comp.id);
                    }}
                  >
                    {/* Date Badge */}
                    <div className="flex flex-col items-center justify-center w-16 h-16 bg-panel-dark rounded-xl border border-border-dark shrink-0 group-hover:border-primary transition-colors shadow-sm">
                      <span className="text-xs text-text-secondary font-bold uppercase">{badgeISO.slice(5, 7)}月</span>
                      <span className="text-2xl text-white font-bold">{badgeISO.slice(8, 10)}</span>
                    </div>

                    {/* Info Block */}
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3 min-w-0">
                        <h4 className="text-xl font-bold text-white truncate">{comp.name}</h4>
                        {due ? (
                          <span className={["px-2 py-0.5 rounded text-[10px] font-bold border shrink-0", tone.chip].join(" ")}>{due.label}</span>
                        ) : null}
                        {tags.length ? (
                          <div className="flex flex-wrap gap-2">
                            {tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded text-[10px] font-medium bg-background-dark text-text-secondary border border-border-dark"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {/* Phase Stepper */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1 w-full max-w-md">
                          {STAGES.map((_, idx) => {
                            const stepNum = idx + 1;
                            const isCompleted = stepNum <= currentStage;
                            const isCurrent = stepNum === currentStage;
                            return (
                              <div key={idx} className="flex-1 flex flex-col gap-1">
                                <div
                                  className={[
                                    "h-1.5 rounded-full transition-all duration-500",
                                    isCompleted ? "bg-emerald-500" : "bg-border-dark",
                                    isCurrent ? "shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "",
                                  ].join(" ")}
                                ></div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between max-w-md text-xs">
                          <span className="text-emerald-400 font-bold">当前阶段: {STAGES[currentStage - 1]}</span>
                          <span className="text-text-secondary truncate max-w-[60%]">{comp.status_text || "暂无备注"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Team & Meta */}
                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-4 md:gap-2 pl-0 md:pl-6 md:border-l border-border-dark">
                      <div className="flex -space-x-2 shrink-0">
                        {comp.team_members.slice(0, 4).map((m) => (
                          <div
                            key={m}
                            className={["w-8 h-8 rounded-full border-2 border-surface-dark grid place-items-center text-xs font-bold", avatarTone(m)].join(" ")}
                            title={m}
                          >
                            {initials(m)}
                          </div>
                        ))}
                        {comp.team_members.length === 0 ? (
                          <div className="w-8 h-8 rounded-full bg-border-dark border-2 border-surface-dark flex items-center justify-center">
                            <Users size={14} className="text-text-secondary" />
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {!comp.included_in_plan ? (
                          <span className="text-xs px-2 py-1 rounded font-bold bg-background-dark text-text-secondary border border-border-dark">
                            未纳入规划
                          </span>
                        ) : null}
                        <span
                          className={[
                            "text-xs px-2 py-1 rounded font-bold",
                            comp.registered ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400",
                          ].join(" ")}
                        >
                          {comp.registered ? "已报名" : "未报名"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Future Planning */}
        {future.length > 0 ? (
          <div>
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 pl-1 flex items-center gap-2">
              <Calendar size={16} /> 远期规划
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {future.map((m) => {
                const comp = m.comp;
                const due = m.due;
                const badgeISO = due?.iso || (comp.registration_deadline_at as YMD);
                return (
                  <div
                    key={comp.id}
                    className="group bg-surface-dark/50 border border-border-dark rounded-2xl p-5 flex items-center gap-4 hover:bg-surface-dark hover:border-text-secondary transition-colors cursor-pointer"
                    onClick={() => openCompetition(comp.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      openCompetition(comp.id);
                    }}
                  >
                    <div className="flex flex-col items-center justify-center w-12 h-12 bg-panel-dark rounded-lg border border-border-dark shrink-0 opacity-70">
                      <Award size={20} className="text-text-secondary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-bold text-white truncate opacity-90">{comp.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-border-dark"></span>
                        <p className="text-sm text-text-secondary truncate">
                          {!comp.included_in_plan ? "未纳入规划 · " : ""}
                          {due ? `${due.label}: ${badgeISO}` : `预计报名: ${comp.registration_deadline_at}`}
                        </p>
                      </div>
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal size={20} className="text-text-secondary" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* No Upcoming Milestone */}
        {noMilestone.length > 0 ? (
          <div>
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4 pl-1 flex items-center gap-2">
              <Clock size={16} /> 已报名 / 待补全节点
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {noMilestone.map((m) => {
                const comp = m.comp;
                return (
                  <div
                    key={comp.id}
                    className="group bg-surface-dark/50 border border-border-dark rounded-2xl p-5 flex items-center gap-4 hover:bg-surface-dark hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => openCompetition(comp.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      openCompetition(comp.id);
                    }}
                  >
                    <div className="flex flex-col items-center justify-center w-12 h-12 bg-panel-dark rounded-lg border border-border-dark shrink-0 opacity-80">
                      <Clock size={20} className="text-text-secondary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-bold text-white truncate opacity-90">{comp.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-border-dark"></span>
                        <p className="text-sm text-text-secondary truncate">已报名，但未设置提交/公布节点</p>
                      </div>
                      <div className="mt-1 text-[11px] text-text-tertiary font-mono truncate">报名截止: {comp.registration_deadline_at}</div>
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-primary text-xs font-bold">
                      去补全
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Unplanned */}
        {viewFilter === "all" && unplannedActive.length > 0 ? (
          <details className="rounded-2xl border border-border-dark bg-surface-dark/30 overflow-hidden">
            <summary className="cursor-pointer list-none select-none px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-text-secondary uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-border-dark" />
                未纳入规划（{unplannedActive.length}）
              </div>
              <span className="text-xs text-text-secondary">展开</span>
            </summary>
            <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {unplannedActive.map((m) => {
                const comp = m.comp;
                const due = m.due;
                const badgeISO = (due?.iso || comp.registration_deadline_at) as YMD;
                return (
                  <div
                    key={comp.id}
                    className="group bg-background-dark/50 border border-border-dark rounded-2xl p-5 flex items-center gap-4 hover:border-text-secondary transition-colors cursor-pointer opacity-80 hover:opacity-100"
                    onClick={() => openCompetition(comp.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      openCompetition(comp.id);
                    }}
                  >
                    <div className="flex flex-col items-center justify-center w-12 h-12 bg-panel-dark rounded-lg border border-border-dark shrink-0 opacity-80">
                      <Award size={20} className="text-text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-bold text-white truncate opacity-90">{comp.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-border-dark"></span>
                        <p className="text-sm text-text-secondary truncate">{due ? `${due.label}: ${badgeISO}` : `预计报名: ${badgeISO}`}</p>
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-primary text-xs font-bold">
                      纳入规划
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}

        {viewFilter === "all" && expiredList.length > 0 ? (
          <details className="rounded-2xl border border-border-dark bg-surface-dark/30 overflow-hidden">
            <summary className="cursor-pointer list-none select-none px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-text-secondary uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-border-dark" />
                已过期 / 已结束（{expiredList.length}）
              </div>
              <span className="text-xs text-text-secondary">展开</span>
            </summary>
            <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {expiredList.map((m) => {
                const comp = m.comp;
                const endedAtISO = (comp.result_deadline_at || comp.submission_deadline_at || comp.registration_deadline_at) as YMD;
                const badgeISO = (m.missed ? comp.registration_deadline_at : endedAtISO) as YMD;
                return (
                  <div
                    key={comp.id}
                    className="group bg-background-dark/50 border border-border-dark rounded-2xl p-5 flex items-center gap-4 hover:border-text-secondary transition-colors cursor-pointer opacity-75 hover:opacity-100"
                    onClick={() => openCompetition(comp.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      openCompetition(comp.id);
                    }}
                  >
                    <div className="flex flex-col items-center justify-center w-12 h-12 bg-panel-dark rounded-lg border border-border-dark shrink-0 opacity-80">
                      <Calendar size={20} className="text-text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-bold text-white truncate opacity-90 line-through">{comp.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-border-dark"></span>
                        <p className="text-sm text-text-secondary truncate">{m.missed ? `已错过报名: ${badgeISO}` : `已结束: ${badgeISO}`}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                      {m.missed ? "错过" : "结束"}
                    </span>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}

        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-surface-dark rounded-full flex items-center justify-center mx-auto mb-4 text-text-secondary">
              <Search size={32} />
            </div>
            <h3 className="text-white font-bold mb-1">未找到相关竞赛</h3>
            <p className="text-text-secondary">尝试更换搜索关键词或筛选条件</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
