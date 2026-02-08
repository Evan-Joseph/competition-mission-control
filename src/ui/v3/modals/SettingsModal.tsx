import { useMemo, useState } from "react";
import { Bell, Check, Database, Monitor, Moon, Plus, Shield, Sun, User, X } from "lucide-react";
import type { ThemePref } from "../../../lib/theme";
import { readThemePref, setThemePref } from "../../../lib/theme";

export default function SettingsModal(props: {
  onClose: () => void;
  users: string[];
  currentUser: string;
  onSwitchUser: (name: string) => void;
  onAddUser: (name: string) => Promise<{ ok: boolean; reason?: string }>;
}) {
  const [theme, setTheme] = useState<ThemePref>(() => readThemePref());
  const [deadlineNotify, setDeadlineNotify] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(false);
  const [memberInput, setMemberInput] = useState("");
  const [memberMsg, setMemberMsg] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);

  const submitAddMember = async () => {
    if (addingMember) return;
    setAddingMember(true);
    try {
      const res = await props.onAddUser(memberInput);
      setMemberMsg(res.ok ? "已添加并可在上方切换" : res.reason || "添加失败");
      if (res.ok) setMemberInput("");
    } finally {
      setAddingMember(false);
    }
  };

  const applyTheme = (next: ThemePref) => {
    setTheme(next);
    setThemePref(next);
  };

  const options = useMemo(
    () =>
      [
        { id: "light" as const, label: "浅色", icon: Sun },
        { id: "dark" as const, label: "深色", icon: Moon },
        { id: "system" as const, label: "跟随系统", icon: Monitor },
      ] as const,
    []
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" type="button" aria-label="Close" onClick={props.onClose}></button>
      <div className="relative bg-panel-dark border border-border-dark rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="flex justify-between items-center p-6 border-b border-border-dark">
          <h2 className="text-xl font-bold text-white">设置</h2>
          <button onClick={props.onClose} className="p-2 text-text-secondary hover:text-white rounded-lg hover:bg-border-dark" type="button" aria-label="Close settings">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Appearance */}
          <div>
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4">外观</h3>
            <div className="grid grid-cols-3 gap-4">
              {options.map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => applyTheme(opt.id)}
                    className={[
                      "relative flex flex-col items-center gap-3 p-4 rounded-xl border transition-all",
                      active ? "border-primary bg-surface-dark text-white" : "border-border-dark bg-background-dark text-text-secondary hover:border-primary hover:text-white",
                    ].join(" ")}
                    type="button"
                  >
                    <Icon size={24} />
                    <span className={["text-sm", opt.id === "dark" ? "font-bold" : "font-medium"].join(" ")}>{opt.label}</span>
                    {active ? <Check size={16} className="text-primary absolute top-2 right-2" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notifications */}
          <div>
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4">通知策略</h3>
            <div className="space-y-3">
              <div
                className="flex items-center justify-between p-4 rounded-xl bg-background-dark border border-border-dark cursor-pointer hover:border-text-secondary transition-colors"
                onClick={() => setDeadlineNotify(!deadlineNotify)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  setDeadlineNotify((x) => !x);
                }}
              >
                <div className="flex items-center gap-3">
                  <Bell size={20} className={deadlineNotify ? "text-primary" : "text-text-secondary"} />
                  <div>
                    <p className="text-white font-medium">临期强提醒</p>
                    <p className="text-xs text-text-secondary">当任务剩余时间少于 24 小时</p>
                  </div>
                </div>
                <div className={["w-12 h-6 rounded-full relative transition-colors", deadlineNotify ? "bg-primary" : "bg-border-dark"].join(" ")}>
                  <div className={["absolute top-1 w-4 h-4 rounded-full bg-background-dark transition-all", deadlineNotify ? "right-1" : "left-1"].join(" ")}></div>
                </div>
              </div>

              <div
                className="flex items-center justify-between p-4 rounded-xl bg-background-dark border border-border-dark cursor-pointer hover:border-text-secondary transition-colors"
                onClick={() => setWeeklyReport(!weeklyReport)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  setWeeklyReport((x) => !x);
                }}
              >
                <div className="flex items-center gap-3">
                  <Shield size={20} className={weeklyReport ? "text-primary" : "text-text-secondary"} />
                  <div>
                    <p className="text-white font-medium">审查日志摘要</p>
                    <p className="text-xs text-text-secondary">每周一发送上周团队活动报告</p>
                  </div>
                </div>
                <div className={["w-12 h-6 rounded-full relative transition-colors", weeklyReport ? "bg-primary" : "bg-border-dark"].join(" ")}>
                  <div className={["absolute top-1 w-4 h-4 rounded-full bg-background-dark transition-all", weeklyReport ? "right-1" : "left-1"].join(" ")}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Identity */}
          <div>
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4">身份（无密码）</h3>
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-background-dark border border-border-dark">
                <div className="flex items-center gap-3 mb-3">
                  <User size={18} className="text-primary" />
                  <p className="text-sm text-white font-medium">当前成员</p>
                </div>
                <select
                  className="w-full bg-panel-dark border border-border-dark rounded-lg py-2.5 px-3 text-sm text-white appearance-none focus:outline-none focus:border-primary"
                  value={props.currentUser}
                  onChange={(e) => {
                    props.onSwitchUser(e.target.value);
                    setMemberMsg(null);
                  }}
                >
                  {props.users.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 rounded-xl bg-background-dark border border-border-dark">
                <p className="text-sm text-white font-medium mb-3">新增成员</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={memberInput}
                    onChange={(e) => setMemberInput(e.target.value)}
                    placeholder="输入姓名，例如：张三"
                    className="flex-1 bg-panel-dark border border-border-dark rounded-lg py-2.5 px-3 text-sm text-white placeholder:text-text-secondary focus:outline-none focus:border-primary"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      void submitAddMember();
                    }}
                  />
                  <button
                    type="button"
                    className="h-10 px-3 rounded-lg bg-primary text-[#111816] font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
                    onClick={() => void submitAddMember()}
                    disabled={addingMember}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Plus size={14} /> {addingMember ? "添加中..." : "添加"}
                    </span>
                  </button>
                </div>
                {memberMsg ? <p className="mt-2 text-xs text-text-secondary">{memberMsg}</p> : null}
                <p className="mt-2 text-xs text-text-secondary">默认成员：高神舟、聂睿、孙慧智、于泽通、耿孝然。</p>
              </div>
            </div>
          </div>

          {/* Data */}
          <div>
            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-4">数据管理</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-surface-dark border border-border-dark text-white rounded-lg text-sm font-medium hover:bg-border-dark transition-colors active:scale-95" type="button">
              <Database size={16} /> 导出所有数据 (JSON)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
