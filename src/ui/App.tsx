import { Link, Route, Routes, useLocation } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import PlanningPage from "./PlanningPage";

function Header() {
  const loc = useLocation();
  const isPlanning = loc.pathname.startsWith("/planning");

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-darker flex items-center justify-between px-6 shrink-0 z-20 relative">
      <div className="flex items-center gap-6 min-w-0">
        <div className="flex items-center gap-3 text-primary min-w-0">
          <span className="material-symbols-outlined text-3xl">rocket_launch</span>
          <div className="flex flex-col min-w-0">
            <h1 className="text-xl font-bold tracking-tight leading-none text-slate-900 dark:text-white uppercase font-display truncate">
              竞赛作战面板
            </h1>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tracking-widest mt-0.5">
              {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          <Link
            className={[
              "flex items-center justify-center px-3 py-1 rounded text-xs font-medium transition-colors",
              !isPlanning ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
            ].join(" ")}
            to="/"
          >
            <span className="material-symbols-outlined text-[16px] mr-1">view_timeline</span> 面板
          </Link>
          <Link
            className={[
              "flex items-center justify-center px-3 py-1 rounded text-xs font-medium transition-colors",
              isPlanning ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
            ].join(" ")}
            to="/planning"
          >
            <span className="material-symbols-outlined text-[16px] mr-1">route</span> 规划
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100">
      <Header />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/planning" element={<PlanningPage />} />
      </Routes>
    </div>
  );
}

