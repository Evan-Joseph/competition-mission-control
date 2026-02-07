import { useEffect, useState } from "react";
import type { ThemePref } from "../lib/theme";
import { applyThemePref, readThemePref, setThemePref, toggleThemePref } from "../lib/theme";

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(() => readThemePref());
  const [isDarkResolved, setIsDarkResolved] = useState<boolean>(() => {
    try {
      return document.documentElement.classList.contains("dark");
    } catch {
      return false;
    }
  });

  useEffect(() => {
    applyThemePref(pref);
    setIsDarkResolved(document.documentElement.classList.contains("dark"));
  }, [pref]);

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

