import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Download, Filter, Search } from "lucide-react";
import type { AuditAction } from "../../../domain/auditLog";
import { listAuditLogs as listAuditLogsApi } from "../../../lib/api";

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

function localDatePrefixFromISO(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function avatarTone(name: string): string {
  const tones = [
    "bg-emerald-500/30 text-emerald-200",
    "bg-blue-500/30 text-blue-200",
    "bg-rose-500/30 text-rose-200",
    "bg-amber-500/30 text-amber-200",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return tones[h % tones.length] || tones[0];
}

function initials(name: string): string {
  const s = String(name || "").trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
}

export default function AuditPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState<AuditAction | "all">("all");
  const [dateFilter, setDateFilter] = useState<string>("");

  const auditQ = useQuery({
    queryKey: ["auditLogs", "all"],
    queryFn: () => listAuditLogsApi({ limit: 500 }),
    enabled: true,
    refetchInterval: 15_000,
  });

  const logs = auditQ.data || [];
  const auditErrorText = auditQ.error instanceof Error ? auditQ.error.message : "加载失败";

  const filteredLogs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return logs.filter((log) => {
      const matchesSearch = !q
        ? true
        : log.user.toLowerCase().includes(q) || log.target.toLowerCase().includes(q) || log.details.toLowerCase().includes(q);
      const matchesAction = actionFilter === "all" || log.action === actionFilter;
      const matchesDate = !dateFilter ? true : (log.timestamp ? log.timestamp.slice(0, 10) : localDatePrefixFromISO(log.iso)) === dateFilter;
      return matchesSearch && matchesAction && matchesDate;
    });
  }, [actionFilter, dateFilter, logs, searchTerm]);

  return (
    <div className="p-8 animate-fade-in max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex justify-between items-end gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">全局审查日志</h1>
            <p className="text-text-secondary">系统变更追溯与安全审计中心，记录所有关键操作。</p>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-[#111816] font-bold rounded-xl transition-colors shrink-0"
            type="button"
            title="导出（占位）"
          >
            <Download size={18} /> 导出数据
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-dark border border-border-dark rounded-2xl p-4 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative md:col-span-2">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            <Search size={18} />
          </span>
          <input
            type="text"
            placeholder="搜索操作人、对象或详情..."
            className="w-full bg-background-dark border border-border-dark rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            <Filter size={18} />
          </span>
          <select
            className="w-full bg-background-dark border border-border-dark rounded-lg py-2.5 pl-10 pr-4 text-sm text-white appearance-none focus:outline-none focus:border-primary"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as any)}
          >
            <option value="all">所有动作</option>
            <option value="create">创建 (Create)</option>
            <option value="update">更新 (Update)</option>
            <option value="delete">删除 (Delete)</option>
            <option value="upload">上传 (Upload)</option>
            <option value="comment">评论 (Comment)</option>
          </select>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            <Calendar size={18} />
          </span>
          <input
            type="date"
            className="w-full bg-background-dark border border-border-dark rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-primary"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-xl">
        {auditQ.isError ? (
          <div className="px-6 py-4 border-b border-border-dark text-sm text-amber-300">日志接口不可用：{auditErrorText}</div>
        ) : null}
        {filteredLogs.length > 0 ? (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-panel-dark border-b border-border-dark">
                <th className="px-6 py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">时间</th>
                <th className="px-6 py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">操作人</th>
                <th className="px-6 py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">动作</th>
                <th className="px-6 py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">对象</th>
                <th className="px-6 py-4 text-xs font-bold text-text-secondary uppercase tracking-wider">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dark">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="group hover:bg-panel-dark/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-white text-sm font-medium">
                        {(log.timestamp || formatLocalTimestampFromISO(log.iso)).split(" ")[0]}
                      </span>
                      <span className="text-text-secondary text-xs">
                        {(log.timestamp || formatLocalTimestampFromISO(log.iso)).split(" ")[1] || ""}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={[
                          "w-8 h-8 rounded-full border border-border-dark grid place-items-center text-xs font-bold",
                          avatarTone(log.user),
                        ].join(" ")}
                        title={log.user}
                      >
                        {initials(log.user)}
                      </div>
                      <span className="text-white text-sm font-medium">{log.user}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={[
                        "inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border",
                        log.action === "create"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : log.action === "delete"
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : log.action === "upload"
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/20",
                      ].join(" ")}
                    >
                      {String(log.action).toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white text-sm">{log.target}</td>
                  <td className="px-6 py-4">
                    <span className="text-text-secondary text-sm font-mono">{log.details}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-text-secondary">没有找到匹配的日志记录。</div>
        )}
      </div>
    </div>
  );
}
