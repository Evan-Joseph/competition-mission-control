import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Competition } from "../lib/types";
import { getCompetitions } from "../lib/api";
import { ensureNextDeadlines } from "../lib/compute";

async function loadCompetitionsWithFallback(): Promise<Competition[]> {
  try {
    return await getCompetitions();
  } catch {
    const r = await fetch("/data/competitions.seed.preview.json", { headers: { accept: "application/json" } });
    if (!r.ok) return [];
    return (await r.json()) as Competition[];
  }
}

function computeTop(list: Competition[]) {
  const withDl = list
    .map((c) => ({
      ...c,
      dl: typeof c.nextDeadline?.daysLeft === "number" ? c.nextDeadline.daysLeft : null,
    }))
    .filter((c) => c.dl !== null && (c.dl as number) >= 0)
    .sort((a, b) => (a.dl as number) - (b.dl as number));

  const within7 = withDl.filter((c) => (c.dl as number) <= 7);
  const urgent = withDl.filter((c) => (c.dl as number) <= 3);

  return { withDl, within7, urgent };
}

export default function PlanningPage() {
  const competitionsQ = useQuery({ queryKey: ["competitions"], queryFn: loadCompetitionsWithFallback, refetchInterval: 60_000 });
  const competitions = useMemo(() => ensureNextDeadlines(competitionsQ.data || []), [competitionsQ.data]);
  const top = useMemo(() => computeTop(competitions), [competitions]);

  return (
    <main className="flex-1 overflow-y-auto bg-background-light dark:bg-background-dark">
      <div className="p-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard title="7天内节点" value={String(top.within7.length)} />
          <StatCard title="3天内紧急" value={String(top.urgent.length)} danger />
          <StatCard title="可计算的节点" value={String(top.withDl.length)} />
        </div>

        <div className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 shadow-lg">
          <div className="text-sm font-bold text-slate-900 dark:text-white mb-3">Top 5（按下一节点）</div>
          <div className="space-y-3">
            {top.withDl.slice(0, 5).map((c) => {
              const title = c.display_name || c.name;
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {c.nextDeadline ? `${c.nextDeadline.daysLeft} 天后 • ${c.nextDeadline.label}` : "-"}
                      </div>
                    </div>
                    <a
                      className="text-xs font-bold text-primary border border-primary/30 hover:bg-primary/10 px-3 py-1.5 rounded transition-colors"
                      href="/"
                    >
                      回面板
                    </a>
                  </div>
                </div>
              );
            })}

            {!top.withDl.length ? <div className="text-slate-500 dark:text-slate-400 text-sm">暂无可计算的截止节点。</div> : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ title, value, danger }: { title: string; value: string; danger?: boolean }) {
  return (
    <div
      className={[
        "bg-white dark:bg-surface-dark border rounded-xl p-4 shadow-sm",
        danger ? "border-danger/30" : "border-slate-200 dark:border-slate-700/50",
      ].join(" ")}
    >
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</div>
      <div className={["text-3xl font-bold font-display mt-2", danger ? "text-danger" : "text-slate-900 dark:text-white"].join(" ")}>
        {value}
      </div>
    </div>
  );
}

