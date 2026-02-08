import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { isMissedRegistration } from "../../../domain/competitionEvents";
import { invalidCompetitionReason, isCompetitionEnded, nextCompetitionDue } from "../../../domain/competitionSchedule";
import { parseYMD, type YMD } from "../../../lib/date";
import { listAuditLogs as listAuditLogsApi } from "../../../lib/api";
import type { Competition } from "../../../lib/types";
import { useV3App } from "../state/v3Context";

function daysUntil(todayISO: YMD, dateISO: string): number | null {
  const a = parseYMD(todayISO);
  const b = parseYMD(dateISO as YMD);
  if (!a || !b) return null;
  const aa = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bb - aa) / (1000 * 60 * 60 * 24));
}

function remainingLabel(dateISO: string | null): string {
  if (!dateISO) return "--";
  const d = parseYMD(dateISO as YMD);
  if (!d) return "--";
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
  const diff = Math.max(0, end - Date.now());
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours <= 36) return `${Math.max(1, hours)}小时`;
  const days = Math.ceil(hours / 24);
  return `${days}天`;
}

function stageLabel(comp: Competition): string {
  const t = String(comp.status_text || "");
  if (t.includes("提交") || t.includes("完结")) return "提交";
  if (t.includes("刷题") || t.includes("准备") || t.includes("初赛")) return "备赛";
  if (comp.registered) return "报名";
  if (comp.team_members.length > 1) return "组队";
  return "筹备";
}

function initials(name: string) {
  const s = String(name || "").trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
}

function formatLocalTimestampFromISO(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export default function DashboardPage() {
  const { competitions, todayISO, openCompetition, currentUser } = useV3App();
  const todayTime = useMemo(() => parseYMD(todayISO)?.getTime() ?? null, [todayISO]);

  const dateLabel = useMemo(() => {
    const d = new Date();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = d.toLocaleDateString("zh-CN", { weekday: "long" });
    return `${month}月 ${day}日, ${weekday}`;
  }, []);

  const focus = useMemo(() => {
    if (todayTime === null) return competitions[0] || null;

    const list = competitions
      .map((c) => {
        const invalid = invalidCompetitionReason(c);
        const missed = invalid ? false : isMissedRegistration(c, todayISO);
        const ended = invalid ? false : isCompetitionEnded(c, todayISO);
        const unplanned = !c.included_in_plan && !c.registered;
        const due = invalid ? null : nextCompetitionDue(c, todayISO);
        return { c, invalid, missed, ended, unplanned, due };
      })
      .filter((x) => !x.invalid && !x.missed && !x.ended && !x.unplanned && x.due && x.due.time >= todayTime)
      .sort((a, b) => a.due!.time - b.due!.time);

    return list[0]?.c || null;
  }, [competitions, todayISO, todayTime]);

  const risk = useMemo(() => {
    if (todayTime === null) return null;
    const list = competitions
      .filter((c) => c.included_in_plan && !c.registered && !invalidCompetitionReason(c) && !isMissedRegistration(c, todayISO))
      .map((c) => ({ c, due: nextCompetitionDue(c, todayISO) }))
      .filter((x) => x.due && x.due.kind === "reg" && x.due.time >= todayTime)
      .sort((a, b) => a.due!.time - b.due!.time);
    return list[0]?.c || null;
  }, [competitions, todayISO, todayTime]);

  const riskDays = risk ? daysUntil(todayISO, risk.registration_deadline_at) : null;
  const trackedCount = competitions.length;

  const upcoming = useMemo(() => {
    if (todayTime === null) return [];
    return competitions
      .filter((c) => c.registered && !invalidCompetitionReason(c) && !isCompetitionEnded(c, todayISO))
      .map((c) => ({ c, due: nextCompetitionDue(c, todayISO) }))
      .filter((x) => x.due && (x.due.kind === "sub" || x.due.kind === "res") && x.due.time >= todayTime)
      .sort((a, b) => a.due!.time - b.due!.time)
      .slice(0, 4)
      .map((x) => x.c);
  }, [competitions, todayISO, todayTime]);

  const auditQ = useQuery({
    queryKey: ["auditLogs", "recent"],
    queryFn: () => listAuditLogsApi({ limit: 200 }),
    enabled: true,
    refetchInterval: 15_000,
  });

  const recent = (auditQ.data || []).slice(0, 3);

  return (
    <div className="p-6 md:p-10 space-y-8 animate-fade-in pb-20">
      <header className="flex justify-between items-end">
        <div>
          <p className="text-text-secondary text-sm mb-1 font-medium">{dateLabel}</p>
          <h2 className="text-3xl text-white font-bold">早安, {currentUser} 👋</h2>
        </div>
        <div className="hidden md:block">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/20">
            <CheckCircle2 size={14} /> 正在跟踪 {trackedCount} 项竞赛
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Focus Card */}
        <div className="lg:col-span-2 rounded-2xl bg-surface-dark border border-border-dark p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all duration-700"></div>

          <div className="relative z-10 h-full flex flex-col justify-between">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                  <Clock size={20} />
                </div>
                <h3 className="text-xl font-bold text-white">今日首要任务</h3>
              </div>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 animate-pulse">
                进行中
              </span>
            </div>

            <div
              className="bg-panel-dark border border-border-dark rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center gap-5 cursor-pointer hover:border-emerald-500/50 transition-colors shadow-lg"
              onClick={() => focus && openCompetition(focus.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                if (focus) openCompetition(focus.id);
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-white font-bold text-lg truncate">{focus ? focus.name : "暂无竞赛"}</h4>
                </div>
                <p className="text-text-secondary text-sm truncate">{focus?.status_text ? focus.status_text : "连接数据后会显示更准确的任务描述"}</p>

                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs font-bold text-text-secondary">当前阶段:</span>
                  <span className="text-xs font-bold px-2 py-0.5 bg-emerald-500 text-[#111816] rounded">{focus ? stageLabel(focus) : "--"}</span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 w-full md:w-auto border-t md:border-t-0 md:border-l border-border-dark pt-3 md:pt-0 md:pl-5">
                <span className="text-[10px] text-text-secondary uppercase tracking-wider">剩余时间</span>
                <div className="text-2xl font-bold text-white font-mono">
                  {focus ? remainingLabel(focus.submission_deadline_at || focus.registration_deadline_at) : "--"}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">待办子任务</p>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                <div className="min-w-[180px] p-3 rounded-xl bg-panel-dark border border-dashed border-border-dark hover:border-emerald-500/30 hover:bg-surface-dark transition-all cursor-pointer flex items-center gap-3 group/item">
                  <div className="w-4 h-4 rounded-full border-2 border-text-secondary group-hover/item:border-emerald-500 transition-colors"></div>
                  <span className="text-sm text-text-secondary group-hover/item:text-white">校对材料与格式</span>
                </div>
                <div className="min-w-[180px] p-3 rounded-xl bg-panel-dark border border-dashed border-border-dark hover:border-emerald-500/30 hover:bg-surface-dark transition-all cursor-pointer flex items-center gap-3 group/item">
                  <div className="w-4 h-4 rounded-full border-2 border-text-secondary group-hover/item:border-emerald-500 transition-colors"></div>
                  <span className="text-sm text-text-secondary group-hover/item:text-white">导出 / 打包 / 备份</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Risk / Alerts Widget */}
        <div className="rounded-2xl bg-gradient-to-br from-surface-dark to-[#1d1818] border border-border-dark p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <AlertTriangle size={120} />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4 text-rose-400">
              <AlertTriangle size={20} />
              <h3 className="font-bold">紧急提醒</h3>
            </div>

            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-5xl font-bold text-white tracking-tighter">{riskDays === null ? "--" : Math.max(0, riskDays)}</span>
              <span className="text-text-secondary font-medium">天剩余</span>
            </div>
            <p className="text-white font-bold text-lg mb-1 truncate">{risk ? risk.name : "暂无临期竞赛"}</p>
            <p className="text-text-secondary text-sm leading-relaxed truncate">{risk?.status_text ? risk.status_text : "保持节奏，持续推进。"}</p>
          </div>

          <button
            className="w-full mt-6 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold text-sm hover:bg-rose-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            onClick={() => risk && openCompetition(risk.id)}
            disabled={!risk}
            type="button"
          >
            立即处理 <ArrowRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="rounded-2xl bg-surface-dark border border-border-dark p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white">最近动态</h3>
            <button className="text-text-secondary hover:text-white text-sm" type="button">
              查看全部
            </button>
          </div>

          <div className="space-y-6 relative pl-2">
            <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-border-dark"></div>

            {recent.length ? (
              recent.map((log, idx) => (
                <div key={log.id} className="relative pl-6">
                  <div className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 z-10 bg-surface-dark ${idx === 0 ? "border-emerald-400" : "border-text-secondary"}`}></div>
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-white">
                      <span className="font-bold text-emerald-400">{log.user}</span> · <span className="font-medium text-white/90">{log.target}</span>
                    </p>
                    <p className="text-xs text-text-secondary font-medium">{log.details}</p>
                    <span className="text-[10px] text-text-secondary/60 mt-0.5">{log.timestamp || formatLocalTimestampFromISO(log.iso)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="pl-6 text-text-secondary italic">暂无动态</div>
            )}
          </div>
        </div>

        {/* Coming Up */}
        <div className="rounded-2xl bg-surface-dark border border-border-dark p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white">日程概览</h3>
            <CalendarDays size={18} className="text-text-secondary" />
          </div>
          <div className="space-y-3">
            {upcoming.length ? (
              upcoming.map((comp) => (
                <div
                  key={comp.id}
                  className="flex items-center gap-4 p-3 rounded-xl bg-panel-dark border border-border-dark hover:border-text-secondary transition-colors cursor-pointer"
                  onClick={() => openCompetition(comp.id)}
                >
                  <div className="w-12 h-12 rounded-lg bg-surface-dark flex flex-col items-center justify-center border border-border-dark">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase">
                      {(() => {
                        const d = comp.submission_deadline_at ? parseYMD(comp.submission_deadline_at as YMD) : null;
                        return d ? d.toLocaleString("default", { month: "short" }) : "--";
                      })()}
                    </span>
                    <span className="text-lg text-white font-bold leading-none">
                      {(() => {
                        const d = comp.submission_deadline_at ? parseYMD(comp.submission_deadline_at as YMD) : null;
                        return d ? d.getDate() : "--";
                      })()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">{comp.name}</h4>
                    <p className="text-xs text-text-secondary mt-0.5 truncate">{comp.status_text || "点击补充状态"}</p>
                  </div>
                  <div className="flex -space-x-2">
                    {comp.team_members.slice(0, 4).map((m) => (
                      <div key={m} className="w-6 h-6 rounded-full border border-panel-dark bg-border-dark grid place-items-center text-[10px] font-bold text-white">
                        {initials(m)}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-text-secondary italic">暂无近期提交节点</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
