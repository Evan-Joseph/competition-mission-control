import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import type { ThemePref } from "../lib/theme";
import { applyThemePref, readThemePref, setThemePref, toggleThemePref } from "../lib/theme";
import DashboardPage from "./DashboardPage";
import PlanningPage from "./PlanningPage";

function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(() => readThemePref());
  const [isDarkResolved, setIsDarkResolved] = useState<boolean>(() => {
    try {
      return document.documentElement.classList.contains("dark");
    } catch {
      return false;
    }
  });

  // Keep resolved state in sync when pref changes.
  useEffect(() => {
    applyThemePref(pref);
    setIsDarkResolved(document.documentElement.classList.contains("dark"));
  }, [pref]);

  // If pref is system, react to OS theme changes.
  useEffect(() => {
    if (pref !== "system") return;
    const mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (!mql) return;
    const onChange = () => {
      applyThemePref("system");
      setIsDarkResolved(document.documentElement.classList.contains("dark"));
    };
    onChange();
    if (typeof mql.addEventListener === "function") mql.addEventListener("change", onChange);
    // @ts-expect-error - Safari < 14
    else if (typeof mql.addListener === "function") mql.addListener(onChange);
    return () => {
      if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", onChange);
      // @ts-expect-error - Safari < 14
      else if (typeof mql.removeListener === "function") mql.removeListener(onChange);
    };
  }, [pref]);

  const icon = isDarkResolved ? "dark_mode" : "light_mode";
  const title = isDarkResolved ? "切换到浅色" : "切换到深色";

  return (
    <button
      className="h-9 w-9 grid place-items-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700"
      type="button"
      title={title}
      onClick={() => {
        const next = toggleThemePref(pref);
        setPref(next);
        setThemePref(next);
      }}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  );
}

function Header() {
  const loc = useLocation();
  const isPlanning = loc.pathname.startsWith("/planning");
  const dateLabel = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `星历日期 ${y}年${m}月${day}日`;
  }, []);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-darker flex items-center justify-between px-4 sm:px-6 shrink-0 z-20 relative">
      <div className="flex items-center gap-6 min-w-0">
        <div className="flex items-center gap-3 text-primary min-w-0">
          <span className="material-symbols-outlined text-3xl">rocket_launch</span>
          <div className="flex flex-col min-w-0">
            <h1 className="text-xl font-bold tracking-tight leading-none text-slate-900 dark:text-white uppercase font-display truncate">
              竞赛作战面板
            </h1>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tracking-widest mt-0.5">{dateLabel}</span>
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
            <span className="material-symbols-outlined text-[16px] sm:mr-1">view_timeline</span>
            <span className="hidden sm:inline">面板</span>
          </Link>
          <Link
            className={[
              "flex items-center justify-center px-3 py-1 rounded text-xs font-medium transition-colors",
              isPlanning ? "bg-white dark:bg-slate-700 shadow-sm text-primary" : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50",
            ].join(" ")}
            to="/planning"
          >
            <span className="material-symbols-outlined text-[16px] sm:mr-1">route</span>
            <span className="hidden sm:inline">规划</span>
          </Link>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100">
      <Header />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/planning" element={<PlanningPage />} />
      </Routes>
    </div>
  );
}
