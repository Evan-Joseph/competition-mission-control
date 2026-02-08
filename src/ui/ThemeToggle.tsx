import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
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
    else if (typeof mql.addListener === "function") mql.addListener(onChange);
    return () => {
      if (typeof mql.removeEventListener === "function") mql.removeEventListener("change", onChange);
      else if (typeof mql.removeListener === "function") mql.removeListener(onChange);
    };
  }, [pref]);

  const title = isDarkResolved ? "切换到浅色" : "切换到深色";
  const Icon = isDarkResolved ? Sun : Moon;

  return (
    <button
      className="h-10 w-10 grid place-items-center rounded-xl bg-surface-dark border border-border-dark text-text-secondary hover:text-white hover:border-primary transition-colors"
      type="button"
      title={title}
      aria-label={title}
      onClick={() => {
        const next = toggleThemePref(pref);
        setPref(next);
        setThemePref(next);
      }}
    >
      <Icon size={18} />
    </button>
  );
}
