import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import { Calendar, LayoutDashboard, Plus, Settings, ShieldCheck, Trello, X } from "lucide-react";

type SidebarItem = { to: string; label: string; icon: ComponentType<{ size?: string | number; className?: string }> };

const MENU: SidebarItem[] = [
  { to: "/dashboard", label: "总览", icon: LayoutDashboard },
  { to: "/tasks", label: "竞赛列表", icon: Trello },
  { to: "/calendar", label: "日历", icon: Calendar },
  { to: "/audit", label: "审查日志", icon: ShieldCheck },
];

export default function Sidebar(props: {
  openId: string | null;
  onOpenSettings: () => void;
  className?: string;
  onCloseMobile?: () => void;
}) {
  const handleNavigate = () => {
    if (props.onCloseMobile) props.onCloseMobile();
  };

  const searchForNav = props.openId ? `?open=${encodeURIComponent(props.openId)}` : "";

  return (
    <aside
      className={[
        "flex flex-col h-full bg-panel-dark border-r border-border-dark flex-shrink-0 transition-all",
        props.className || "hidden md:flex w-64",
      ].join(" ")}
    >
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck size={20} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-bold tracking-wide text-lg truncate">竞赛矩阵</h1>
            <p className="text-text-secondary text-xs truncate">竞赛规划 V3</p>
          </div>
        </div>

        {props.onCloseMobile ? (
          <button onClick={props.onCloseMobile} className="md:hidden text-text-secondary hover:text-white" type="button" aria-label="Close sidebar">
            <X size={24} />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {MENU.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={{ pathname: item.to, search: searchForNav }}
              className={({ isActive }) =>
                [
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive
                    ? "bg-primary text-[#111816] font-bold shadow-[0_0_15px_rgba(43,238,173,0.2)]"
                    : "text-text-secondary hover:bg-surface-dark hover:text-white",
                ].join(" ")
              }
              onClick={handleNavigate}
              end
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} className={isActive ? "text-[#111816]" : "text-text-secondary group-hover:text-white"} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 mt-auto">
        <button className="w-full flex items-center justify-center gap-2 bg-surface-dark hover:bg-surface-dark-alt text-white py-3 rounded-xl transition-colors border border-border-dark" type="button">
          <Plus size={18} />
          <span className="text-sm font-medium">新建项目</span>
        </button>
        <button
          onClick={() => {
            props.onOpenSettings();
            if (props.onCloseMobile) props.onCloseMobile();
          }}
          className="w-full mt-2 flex items-center gap-3 px-4 py-3 rounded-xl text-text-secondary hover:text-white transition-colors"
          type="button"
        >
          <Settings size={20} />
          <span className="text-sm">设置</span>
        </button>
      </div>
    </aside>
  );
}
