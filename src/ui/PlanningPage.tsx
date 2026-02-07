import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Competition, Member } from "../lib/types";
import { getCompetitions, getMembers } from "../lib/api";
import { computeAutoPhase, ensureNextDeadlines, STATE_LABEL, urgencyTone } from "../lib/compute";
import { addDays, formatCNDate, isoDate, parseISODate, startOfWeek } from "../lib/date";

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

function effectiveStateLabel(c: Competition, now: Date): string {
  if (c.progress_state) return STATE_LABEL[c.progress_state] || c.progress_state;
  return computeAutoPhase(c, now);
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
  if (regEnd >= today) return false;
  const st = String(c.progress_state || "").trim();
  if (!st) return true;
  return st === "not_started" || st === "registering";
}

function downloadJson(filename: string, data: unknown) {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PlanningPage() {
  const membersQ = useQuery({ queryKey: ["members"], queryFn: loadMembersWithFallback });
  const competitionsQ = useQuery({ queryKey: ["competitions"], queryFn: loadCompetitionsWithFallback, refetchInterval: 60_000 });

  const members = membersQ.data || DEFAULT_MEMBERS;
  const competitions = useMemo(() => ensureNextDeadlines(competitionsQ.data || []), [competitionsQ.data]);

  const now = new Date();
  const missedCount = competitions.filter((c) => isMissedRegistration(c, now)).length;
  const upcoming = useMemo(() => {
    return competitions
      .filter((c) => !isMissedRegistration(c, now))
      .map((c) => ({
        comp: c,
        dl: typeof c.nextDeadline?.daysLeft === "number" ? c.nextDeadline.daysLeft : null,
      }))
      .filter((x) => x.dl !== null && (x.dl as number) >= 0)
      .sort((a, b) => (a.dl as number) - (b.dl as number));
  }, [competitions]);

  const within7 = upcoming.filter((x) => (x.dl as number) <= 7);
  const urgent3 = upcoming.filter((x) => (x.dl as number) <= 3);
  const within30 = upcoming.filter((x) => (x.dl as number) <= 30);
  const mostUrgentId = within7[0]?.comp?.id || null;

  const unassigned = competitions.filter((c) => !String(c.progress_owner_member_id || "").trim()).length;
  const unmaintained = competitions.filter((c) => !String(c.progress_state || "").trim()).length;
  const highRisk = competitions.filter((c) => Number(c.progress_risk_level || 0) >= 2).length;

  const conflicts = useMemo(() => {
    const map = new Map<string, Competition[]>();
    for (const x of within30) {
      const dateISO = x.comp.nextDeadline?.dateISO;
      if (!dateISO) continue;
      if (!map.has(dateISO)) map.set(dateISO, []);
      map.get(dateISO)!.push(x.comp);
    }
    return Array.from(map.entries())
      .filter(([, comps]) => comps.length >= 2)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 3);
  }, [within30]);

  const groupedWithin30 = useMemo(() => {
    const map = new Map<string, { weekStart: Date; items: { comp: Competition; daysLeft: number }[] }>();
    for (const x of within30) {
      const d = parseISODate(x.comp.nextDeadline?.dateISO || "");
      if (!d) continue;
      const w = startOfWeek(d);
      const key = isoDate(w);
      if (!map.has(key)) map.set(key, { weekStart: w, items: [] });
      map.get(key)!.items.push({ comp: x.comp, daysLeft: x.dl as number });
    }
    const arr = Array.from(map.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
    for (const g of arr) g.items.sort((a, b) => a.daysLeft - b.daysLeft);
    return arr;
  }, [within30]);

  const [shareHint, setShareHint] = useState<string | null>(null);

  return (
    <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark">
      <div className="p-4 sm:p-6 lg:p-10 max-w-[1920px] mx-auto w-full flex flex-col gap-6 lg:gap-8">
        <div className="flex flex-wrap justify-between items-end gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm uppercase tracking-wider font-bold">
              <span className="material-symbols-outlined text-sm">calendar_month</span>
              <span>策略规划助手</span>
            </div>
            <h1 className="text-slate-900 dark:text-white text-3xl sm:text-4xl font-bold leading-tight tracking-tight">30/60/90 天展望</h1>
            <p className="text-slate-500 dark:text-slate-400 text-base font-normal">从截止节点反推策略：先保命，再提效。</p>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 text-sm font-medium hover:border-primary/40 hover:text-primary transition-colors"
              type="button"
              onClick={() => {
                const snap = {
                  nowISO: new Date().toISOString(),
                  kpi: { within7: within7.length, urgent3: urgent3.length, within30: within30.length, unassigned, unmaintained, highRisk },
                  within30: within30.slice(0, 50).map((x) => ({
                    id: x.comp.id,
                    name: x.comp.display_name || x.comp.name,
                    nextDeadline: x.comp.nextDeadline,
                    owner: x.comp.progress_owner_member_id || null,
                    state: x.comp.progress_state || null,
                  })),
                };
                downloadJson("planning.snapshot.json", snap);
              }}
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              导出
            </button>

            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-100 text-sm font-medium hover:border-primary/40 hover:text-primary transition-colors"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setShareHint("链接已复制");
                  window.setTimeout(() => setShareHint(null), 1500);
                } catch {
                  setShareHint("复制失败（浏览器限制）");
                  window.setTimeout(() => setShareHint(null), 1500);
                }
              }}
            >
              <span className="material-symbols-outlined text-[18px]">share</span>
              分享
            </button>

            {shareHint ? <span className="text-xs text-slate-500 dark:text-slate-400">{shareHint}</span> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <section className="flex flex-col gap-6">
            <div className="flex items-center justify-between pb-2 border-b-2 border-primary">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">未来 7 天</h2>
              <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20">TACTICAL</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-surface-dark p-4 rounded-lg border border-slate-200 dark:border-slate-700/50">
                <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">7天内节点</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white font-display">{within7.length}</p>
              </div>
              <div className="bg-white dark:bg-surface-dark p-4 rounded-lg border border-slate-200 dark:border-slate-700/50">
                <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">3天内紧急</p>
                <p className="text-2xl font-bold text-primary font-display">{urgent3.length}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Top 5 优先级任务</h3>
              <div className="flex flex-col gap-3">
                {within7.slice(0, 5).map(({ comp, dl }) => {
                  const daysLeft = dl as number;
                  const tone = urgencyTone(daysLeft);
                  const title = comp.display_name || comp.name;
                  const ownerName = comp.progress_owner_member_id
                    ? members.find((m) => m.id === comp.progress_owner_member_id)?.name || comp.progress_owner_member_id
                    : null;
                  const badge =
                    daysLeft <= 3 ? { text: "高优先级", cls: "bg-danger/15 text-danger border border-danger/30" } : { text: "优先", cls: "bg-warning/15 text-warning border border-warning/30" };
                  const stripe = tone.dot === "bg-danger" ? "bg-danger" : tone.dot === "bg-warning" ? "bg-warning" : "bg-success";

                  return (
                    <div
                      key={comp.id}
                      className="group bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-surface-darker transition-colors rounded-xl border border-slate-200 dark:border-slate-700/50 p-4 shadow-lg relative overflow-hidden"
                    >
                      <div className={["absolute top-0 left-0 w-1 h-full", stripe].join(" ")} />
                      <div className="flex justify-between items-start mb-2 pl-2 gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white text-lg truncate">{title}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {daysLeft} 天后截止 • {comp.nextDeadline?.label || "-"}
                            {comp.nextDeadline?.dateISO ? `（${comp.nextDeadline.dateISO}）` : ""}
                          </div>
                        </div>
                        <span className={["text-[10px] font-bold px-2 py-1 rounded uppercase whitespace-nowrap", badge.cls].join(" ")}>{badge.text}</span>
                      </div>
                      <div className="pl-2 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          状态：<span className="text-slate-700 dark:text-slate-200 font-medium">{effectiveStateLabel(comp, now)}</span>
                          {ownerName ? <span className="ml-2">负责人：{ownerName}</span> : <span className="ml-2 text-danger font-medium">未分配负责人</span>}
                        </div>
                        <Link
                          className="text-xs font-bold text-primary border border-primary/30 hover:bg-primary/10 px-3 py-1.5 rounded transition-colors"
                          to={`/?open=${encodeURIComponent(comp.id)}`}
                        >
                          打开
                        </Link>
                      </div>
                    </div>
                  );
                })}

                {!within7.length ? (
                  <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 text-sm text-slate-500 dark:text-slate-400">
                    未来 7 天暂无可计算的截止节点。
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-6 lg:border-l border-slate-200 dark:border-slate-800 lg:pl-8">
            <div className="flex items-center justify-between pb-2 border-b-2 border-slate-900/20 dark:border-white/20">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">未来 30 天</h2>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-surface-dark px-2 py-1 rounded border border-slate-200 dark:border-slate-700/50">
                OPERATIONAL
              </span>
            </div>

            <div className={["border rounded-xl p-4 flex gap-4 items-start", conflicts.length ? "bg-danger/5 border-danger/20" : "bg-white dark:bg-surface-dark border-slate-200 dark:border-slate-700/50"].join(" ")}>
              <div className={["p-2 rounded shrink-0", conflicts.length ? "bg-danger/15 text-danger" : "bg-slate-900/5 dark:bg-white/10 text-slate-500 dark:text-slate-300"].join(" ")}>
                <span className="material-symbols-outlined">{conflicts.length ? "warning" : "check_circle"}</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">{conflicts.length ? "检测到节点冲突" : "未检测到明显冲突"}</h3>
                <p className="text-xs mt-1 text-slate-600 dark:text-slate-400 leading-relaxed">
                  {conflicts.length
                    ? "以下日期有 2 个及以上截止节点，建议提前拆分负责人或提前完成。"
                    : "仍建议关注未分配负责人/未维护条目，避免临近截止才补录。"}
                </p>
                {conflicts.length ? (
                  <div className="mt-3 space-y-2">
                    {conflicts.map(([dateISO, comps]) => (
                      <div key={dateISO} className="text-xs text-slate-700 dark:text-slate-200">
                        <span className="font-mono text-danger">{dateISO}</span>：
                        <span className="ml-2">{comps.map((c) => c.display_name || c.name).join("、")}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatPill title="30天内节点" value={String(within30.length)} />
              <StatPill title="未分配负责人" value={String(unassigned)} danger={unassigned > 0} />
              <StatPill title="已错过" value={String(missedCount)} danger={missedCount > 0} />
              <StatPill title="高风险" value={String(highRisk)} danger={highRisk > 0} />
            </div>

            <div className="bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-700/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
                <div className="text-sm font-bold text-slate-900 dark:text-white">节点日历（按周）</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">未维护：{unmaintained}</div>
              </div>
              <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                {groupedWithin30.map((g) => {
                  const wEnd = addDays(g.weekStart, 6);
                  return (
                    <div key={isoDate(g.weekStart)} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {formatCNDate(g.weekStart)} - {formatCNDate(wEnd)}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">{g.items.length}项</div>
                      </div>
                      <div className="space-y-2">
                        {g.items.map((it) => {
                          const title = it.comp.display_name || it.comp.name;
                          const tone = urgencyTone(it.daysLeft);
                          return (
                            <Link
                              key={it.comp.id}
                              className="block rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/20 hover:border-primary/40 hover:bg-primary/5 transition-colors p-3"
                              to={`/?open=${encodeURIComponent(it.comp.id)}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{title}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    {it.comp.nextDeadline?.label || "-"} • {it.comp.nextDeadline?.dateISO || "-"}
                                  </div>
                                </div>
                                <div className={["text-xs font-bold", tone.text].join(" ")}>
                                  D-{it.daysLeft}
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {!groupedWithin30.length ? (
                  <div className="p-4 text-sm text-slate-500 dark:text-slate-400">未来 30 天暂无可计算的截止节点。</div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-6 lg:border-l border-slate-200 dark:border-slate-800 lg:pl-8">
            <div className="flex items-center justify-between pb-2 border-b-2 border-slate-900/20 dark:border-white/20">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">更远规划</h2>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-surface-dark px-2 py-1 rounded border border-slate-200 dark:border-slate-700/50">
                STRATEGIC
              </span>
            </div>

            <div className="rounded-xl p-[1px] bg-gradient-to-br from-primary via-indigo-500 to-primary">
              <div className="bg-white dark:bg-surface-darker rounded-[11px] p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-primary font-bold text-sm">
                  <span className="material-symbols-outlined text-lg">auto_awesome</span>
                  AI 建议（离线规则）
                </div>
                <p className="text-slate-700 dark:text-white text-sm leading-relaxed">
                  当前共 <span className="font-mono text-primary">{competitions.length}</span> 项竞赛，其中{" "}
                  <span className="font-mono text-primary">{within30.length}</span> 项在 30 天内有可计算节点。
                  {unassigned ? (
                    <>
                      {" "}
                      <span className="font-mono text-danger">{unassigned}</span> 项未分配负责人，建议先分配再推进。
                    </>
                  ) : null}
                </p>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <ActionRow icon="person" title="先分配负责人" desc={unassigned ? `优先处理 ${unassigned} 项未分配` : "当前无未分配负责人"} tone={unassigned ? "danger" : "ok"} />
                  <ActionRow icon="edit_note" title="补齐维护状态" desc={unmaintained ? `仍有 ${unmaintained} 项未维护` : "维护较完整"} tone={unmaintained ? "warn" : "ok"} />
                  <ActionRow icon="alarm" title="把紧急前置" desc={urgent3.length ? `3 天内紧急 ${urgent3.length} 项` : "暂无 3 天内紧急"} tone={urgent3.length ? "danger" : "ok"} />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    className="flex-1 min-w-[180px] flex items-center justify-center gap-2 bg-primary hover:bg-[#4de1fc] text-background-dark font-bold py-2.5 px-4 rounded-lg transition-all shadow-[0_0_15px_rgba(19,200,236,0.3)]"
                    to="/"
                  >
                    <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                    回到面板
                  </Link>
                  <Link
                    className={[
                      "flex-1 min-w-[180px] flex items-center justify-center gap-2 bg-white dark:bg-surface-dark hover:bg-slate-50 dark:hover:bg-surface-darker text-slate-900 dark:text-white font-bold py-2.5 px-4 rounded-lg transition-colors border border-slate-200 dark:border-slate-700/50",
                      !mostUrgentId ? "opacity-50 pointer-events-none" : "",
                    ].join(" ")}
                    to={mostUrgentId ? `/?open=${encodeURIComponent(mostUrgentId)}` : "/"}
                    aria-disabled={!mostUrgentId}
                  >
                    <span className="material-symbols-outlined text-[18px]">bolt</span>
                    打开最急
                  </Link>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-700/50 p-4">
              <div className="text-sm font-bold text-slate-900 dark:text-white mb-2">备忘清单</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed space-y-1">
                <div>1. 统一口径：优先级以 D-天数为准（D-3 红色，D-7 黄色）。</div>
                <div>2. 团队协作：所有 7 天内节点尽量有负责人，否则默认归入“未分配”。</div>
                <div>3. 风险处理：高风险条目先写清“下一步动作”，再讨论是否继续投入。</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function StatPill(props: { title: string; value: string; danger?: boolean }) {
  return (
    <div
      className={[
        "bg-white dark:bg-surface-dark border rounded-xl p-4 shadow-sm",
        props.danger ? "border-danger/30" : "border-slate-200 dark:border-slate-700/50",
      ].join(" ")}
    >
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{props.title}</div>
      <div className={["text-2xl font-bold font-display mt-2", props.danger ? "text-danger" : "text-slate-900 dark:text-white"].join(" ")}>
        {props.value}
      </div>
    </div>
  );
}

function ActionRow(props: { icon: string; title: string; desc: string; tone: "ok" | "warn" | "danger" }) {
  const toneCls =
    props.tone === "danger"
      ? "border-danger/20 bg-danger/5"
      : props.tone === "warn"
        ? "border-warning/20 bg-warning/5"
        : "border-slate-200 dark:border-slate-700/50 bg-white/60 dark:bg-slate-900/20";

  const iconCls = props.tone === "danger" ? "text-danger" : props.tone === "warn" ? "text-warning" : "text-slate-400";

  return (
    <div className={["rounded-lg border p-3 flex items-start gap-3", toneCls].join(" ")}>
      <div className={["shrink-0", iconCls].join(" ")}>
        <span className="material-symbols-outlined text-[20px]">{props.icon}</span>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-slate-900 dark:text-white">{props.title}</div>
        <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{props.desc}</div>
      </div>
    </div>
  );
}
