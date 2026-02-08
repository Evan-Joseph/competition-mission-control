import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, File as FileIcon, FileText, Layout, PenTool, Save, UploadCloud, UserPlus, X } from "lucide-react";
import type { Competition, CompetitionPatch } from "../../../lib/types";
import { parseHostname, validateCompetitionDraft, normalizeCompetitionPatch } from "../../../domain/competitionDraft";
import { isMissedRegistration } from "../../../domain/competitionEvents";
import { isCompetitionEnded } from "../../../domain/competitionSchedule";
import type { AuditAction } from "../../../domain/auditLog";
import { listAuditLogs as listAuditLogsApi } from "../../../lib/api";
import type { YMD } from "../../../lib/date";
import Whiteboard from "../whiteboard/Whiteboard";

function avatarTone(name: string): string {
  const tones = ["bg-emerald-500/30 text-emerald-200", "bg-blue-500/30 text-blue-200", "bg-rose-500/30 text-rose-200", "bg-amber-500/30 text-amber-200"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return tones[h % tones.length] || tones[0];
}

function initials(name: string): string {
  const s = String(name || "").trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
}

function actionTone(action: AuditAction): string {
  if (action === "create") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (action === "delete") return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  if (action === "upload") return "bg-purple-500/10 text-purple-400 border-purple-500/20";
  if (action === "comment") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-blue-500/10 text-blue-400 border-blue-500/20";
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

type TabId = "overview" | "whiteboard" | "files" | "activity";

export default function CompetitionDrawer(props: {
  competition: Competition;
  todayISO: YMD;
  onClose: () => void;
  onSave: (patch: CompetitionPatch) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [draft, setDraft] = useState<Competition>(props.competition);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberInput, setMemberInput] = useState("");

  useEffect(() => setDraft(props.competition), [props.competition]);
  useEffect(() => setActiveTab("overview"), [props.competition.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const missed = useMemo(() => isMissedRegistration(draft, props.todayISO), [draft, props.todayISO]);
  const ended = useMemo(() => isCompetitionEnded(draft, props.todayISO), [draft, props.todayISO]);

  const auditQ = useQuery({
    queryKey: ["auditLogs", "competition", draft.id],
    queryFn: () => listAuditLogsApi({ target_type: "competition", target_id: draft.id, limit: 200 }),
    enabled: true,
    refetchInterval: 15_000,
  });

  const activityLogs = useMemo(() => auditQ.data || [], [auditQ.data]);
  const auditErrorText = auditQ.error instanceof Error ? auditQ.error.message : "加载失败";

  const save = async () => {
    const msg = validateCompetitionDraft(draft);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const patch: CompetitionPatch = normalizeCompetitionPatch({
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
    } catch (e) {
      setError(String(e && typeof e === "object" && "message" in e ? (e as any).message : e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <button className="absolute inset-0 bg-[#000]/60 backdrop-blur-sm" onClick={props.onClose} type="button" aria-label="Close"></button>

      {/* Drawer */}
      <div className="relative w-full md:w-[85%] lg:w-[80%] h-full bg-panel-dark border-l border-border-dark shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="h-auto min-h-[80px] border-b border-border-dark bg-background-dark flex flex-col flex-shrink-0 z-10">
          <div className="flex items-center justify-between px-6 pt-5 pb-2 gap-6">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white flex items-center gap-3 min-w-0">
                <span className="truncate">{draft.name}</span>
                <span
                  className={[
                    "px-2 py-0.5 rounded-full text-xs font-bold border shrink-0",
                    draft.registered
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-blue-500/20 text-blue-400 border-blue-500/30",
                  ].join(" ")}
                >
                  {draft.registered ? "已报名" : "规划中"}
                </span>
                {missed ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold border border-border-dark bg-surface-dark text-text-secondary shrink-0">
                    已错过报名
                  </span>
                ) : null}
                {!missed && ended ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold border border-border-dark bg-surface-dark text-text-secondary shrink-0">
                    已结束
                  </span>
                ) : null}
              </h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock size={14} /> 提交截止: {draft.submission_deadline_at || "待定"}
                </span>
                <span>·</span>
                <span>ID: {draft.id.toUpperCase()}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex -space-x-2 mr-4">
                {draft.team_members.slice(0, 4).map((m) => (
                  <div
                    key={m}
                    className={[
                      "w-8 h-8 rounded-full border-2 border-background-dark grid place-items-center text-xs font-bold",
                      avatarTone(m),
                    ].join(" ")}
                    title={m}
                  >
                    {initials(m)}
                  </div>
                ))}
                <button
                  className="w-8 h-8 rounded-full bg-border-dark text-text-secondary flex items-center justify-center border-2 border-background-dark text-xs hover:text-white hover:bg-border-dark/80"
                  type="button"
                  title="协作（占位）"
                >
                  +
                </button>
              </div>

              <button
                onClick={save}
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-[#111816] font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
                type="button"
                disabled={saving}
                title={error ? error : "保存更改"}
              >
                <Save size={16} /> 保存
              </button>

              <button
                className="flex items-center gap-2 h-9 px-4 rounded-lg bg-surface-dark border border-border-dark text-white font-bold text-sm hover:border-primary transition-colors"
                type="button"
                title="邀请协作（占位）"
              >
                <UserPlus size={16} /> 邀请协作
              </button>

              <div className="w-px h-6 bg-border-dark mx-1"></div>

              <button onClick={props.onClose} className="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-border-dark" type="button" aria-label="Close drawer">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex px-6 gap-8 mt-4">
            {[
              { id: "overview" as const, label: "概览", icon: Layout },
              { id: "whiteboard" as const, label: "画板", icon: PenTool },
              { id: "files" as const, label: "文件", icon: FileText },
              { id: "activity" as const, label: "动态", icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "pb-3 text-sm font-medium flex items-center gap-2 relative transition-colors",
                    activeTab === tab.id ? "text-white" : "text-text-secondary hover:text-white",
                  ].join(" ")}
                  type="button"
                >
                  <Icon size={16} />
                  {tab.label}
                  {activeTab === tab.id ? (
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_8px_rgba(43,238,173,0.6)]"></span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-background-dark relative overflow-hidden">
          {activeTab === "whiteboard" ? <Whiteboard competitionId={draft.id} /> : null}

          {activeTab === "overview" ? (
            <div className="p-8 max-w-5xl overflow-y-auto h-full pb-24">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-surface-dark rounded-xl border border-border-dark p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-white">项目进度</h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, included_in_plan: !d.included_in_plan }))}
                          className={[
                            "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                            draft.included_in_plan ? "bg-primary text-[#111816] border-primary" : "bg-panel-dark text-text-secondary border-border-dark hover:border-primary",
                          ].join(" ")}
                        >
                          {draft.included_in_plan ? "已纳入规划" : "未纳入规划"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, registered: !d.registered }))}
                          className={[
                            "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                            draft.registered ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-panel-dark text-text-secondary border-border-dark hover:border-primary",
                          ].join(" ")}
                        >
                          {draft.registered ? "已报名" : "未报名"}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs text-text-secondary block mb-1">报名截止</label>
                          <input
                            className="w-full bg-background-dark border border-border-dark rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-primary"
                            type="date"
                            value={draft.registration_deadline_at}
                            onChange={(e) => setDraft((d) => ({ ...d, registration_deadline_at: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-text-secondary block mb-1">提交截止</label>
                          <input
                            className="w-full bg-background-dark border border-border-dark rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-primary"
                            type="date"
                            value={draft.submission_deadline_at || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, submission_deadline_at: e.target.value ? e.target.value : null }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-text-secondary block mb-1">结果公布</label>
                          <input
                            className="w-full bg-background-dark border border-border-dark rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-primary"
                            type="date"
                            value={draft.result_deadline_at || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, result_deadline_at: e.target.value ? e.target.value : null }))}
                          />
                        </div>
                      </div>
                      {error ? <div className="text-sm text-rose-300">{error}</div> : null}
                      <div className="text-xs text-text-secondary">提示: 点击右上角“保存”会写入云端数据库并记录审计日志。</div>
                    </div>
                  </div>

                  <div className="bg-surface-dark rounded-xl border border-border-dark p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-white">备注与说明</h3>
                      <button className="text-xs text-primary" type="button" onClick={save} disabled={saving}>
                        保存
                      </button>
                    </div>
                    <textarea
                      className="w-full min-h-28 bg-background-dark border border-border-dark rounded-lg p-3 text-sm text-white leading-relaxed focus:outline-none focus:border-primary resize-none"
                      placeholder="填写备忘录，例如：需要准备学生证复印件..."
                      value={draft.status_text}
                      onChange={(e) => setDraft((d) => ({ ...d, status_text: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-surface-dark rounded-xl border border-border-dark p-6">
                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">队员</h3>
                    <div className="flex flex-wrap gap-2 min-h-[3rem]">
                      {draft.team_members.map((m) => (
                        <span key={m} className="flex items-center gap-2 bg-background-dark border border-border-dark px-2 py-1 rounded-full text-xs font-medium text-white">
                          <span className={["w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold border border-border-dark", avatarTone(m)].join(" ")}>
                            {initials(m)}
                          </span>
                          <span className="max-w-[10rem] truncate">{m}</span>
                          <button
                            type="button"
                            className="text-text-secondary hover:text-white"
                            title="移除"
                            onClick={() => setDraft((d) => ({ ...d, team_members: d.team_members.filter((x) => x !== m) }))}
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                      <input
                        className="flex-1 bg-transparent border border-dashed border-border-dark rounded-lg px-2 py-1 text-xs text-white placeholder:text-text-secondary min-w-[120px] focus:outline-none focus:border-primary"
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

                  <div className="bg-surface-dark rounded-xl border border-border-dark p-6">
                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">关键链接</h3>
                    <div className="space-y-3">
                      {draft.links.length ? (
                        draft.links.map((l, idx) => (
                          <div key={`${l.url}:${idx}`} className="p-3 rounded-xl bg-background-dark border border-border-dark">
                            <div className="flex gap-2 mb-2">
                              <input
                                className="flex-1 bg-panel-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-primary"
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
                                className="h-10 w-10 grid place-items-center rounded-lg bg-panel-dark border border-border-dark text-text-secondary hover:text-white hover:border-primary transition-colors"
                                title="删除"
                                onClick={() => setDraft((d) => ({ ...d, links: d.links.filter((_, i) => i !== idx) }))}
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <input
                              className="w-full bg-panel-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-primary"
                              placeholder="https://..."
                              value={l.url}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  links: d.links.map((x, i) => (i === idx ? { ...x, url: e.target.value } : x)),
                                }))
                              }
                            />
                            {l.url ? (
                              <a className="text-xs text-primary hover:underline truncate block mt-2" href={l.url} target="_blank" rel="noreferrer">
                                {l.title?.trim() ? l.title.trim() : parseHostname(l.url)}
                              </a>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-text-secondary italic">暂无链接</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="w-full mt-4 flex items-center justify-center gap-2 bg-panel-dark hover:bg-surface-dark text-white py-2.5 rounded-xl transition-colors border border-border-dark hover:border-primary"
                      onClick={() => setDraft((d) => ({ ...d, links: [...d.links, { title: "", url: "" }] }))}
                    >
                      + 添加链接
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "files" ? (
            <div className="p-8 h-full overflow-y-auto">
              <div className="border-2 border-dashed border-border-dark rounded-2xl p-8 flex flex-col items-center justify-center text-text-secondary hover:border-primary hover:text-primary transition-colors cursor-pointer mb-8 bg-surface-dark/30">
                <UploadCloud size={48} className="mb-4" />
                <p className="font-bold">点击或拖拽上传文件</p>
                <p className="text-xs opacity-60 mt-1">先做 UI 占位，后续接 D1/对象存储</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center p-4 bg-surface-dark border border-border-dark rounded-xl opacity-60">
                  <div className="w-10 h-10 rounded-lg bg-border-dark flex items-center justify-center text-white mr-4">
                    <FileIcon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-bold text-sm truncate">暂无文件</h4>
                    <p className="text-xs text-text-secondary mt-0.5">上传区是占位，后续接入存储。</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "activity" ? (
            <div className="p-8 h-full overflow-y-auto">
              <div className="space-y-8 relative pl-2">
                <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-border-dark"></div>
                {auditQ.isError ? (
                  <div className="pl-8 text-amber-300 text-sm">审计日志不可用：{auditErrorText}</div>
                ) : activityLogs.length > 0 ? (
                  activityLogs.map((log, idx) => (
                    <div key={log.id} className="relative pl-8">
                      <div
                        className={[
                          "absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 z-10 bg-surface-dark",
                          idx === 0 ? "border-emerald-400 bg-emerald-400/20" : "border-text-secondary",
                        ].join(" ")}
                      ></div>
                      <div className="flex flex-col gap-1">
                        <p className="text-sm text-white flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-emerald-400">{log.user}</span>
                          <span className={["inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border", actionTone(log.action)].join(" ")}>
                            {String(log.action).toUpperCase()}
                          </span>
                          <span className="text-white/90">{log.target}</span>
                        </p>
                        <div className="bg-surface-dark border border-border-dark p-3 rounded-lg mt-1">
                          <p className="text-xs text-text-secondary">{log.details}</p>
                        </div>
                        <span className="text-[10px] text-text-secondary/60 mt-0.5">{log.timestamp || formatLocalTimestampFromISO(log.iso)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="pl-8 text-text-secondary italic">暂无相关动态</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
