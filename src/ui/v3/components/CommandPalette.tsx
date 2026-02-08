import { useEffect, useMemo, useRef, useState } from "react";
import type { Competition } from "../../../lib/types";

type NavItem = { kind: "nav"; label: string; to: string; icon: string };
type CompItem = { kind: "competition"; label: string; id: string; icon: string };
type Item = NavItem | CompItem;

export default function CommandPalette(props: {
  open: boolean;
  onClose: () => void;
  competitions: Competition[];
  onOpenCompetition: (id: string) => void;
  onNavigate: (to: string) => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.open) return;
    setQ("");
    setSelected(0);
    // Focus after paint.
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [props.open]);

  const nav: NavItem[] = useMemo(
    () => [
      { kind: "nav", label: "总览", to: "/dashboard", icon: "space_dashboard" },
      { kind: "nav", label: "竞赛列表", to: "/tasks", icon: "view_kanban" },
      { kind: "nav", label: "日历", to: "/calendar", icon: "calendar_month" },
      { kind: "nav", label: "审查日志", to: "/audit", icon: "shield_person" },
      { kind: "nav", label: "设置", to: "/settings", icon: "settings" },
    ],
    []
  );

  const items: Item[] = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const compItems: CompItem[] = props.competitions.map((c) => ({ kind: "competition", label: c.name, id: c.id, icon: "trophy" }));
    const all: Item[] = [...nav, ...compItems];
    if (!qq) return all.slice(0, 20);
    return all.filter((x) => x.label.toLowerCase().includes(qq)).slice(0, 30);
  }, [nav, props.competitions, q]);

  useEffect(() => {
    setSelected((cur) => {
      if (cur < 0) return 0;
      if (cur >= items.length) return Math.max(0, items.length - 1);
      return cur;
    });
  }, [items.length]);

  const run = (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === "nav") props.onNavigate(item.to);
    else props.onOpenCompetition(item.id);
    props.onClose();
  };

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" type="button" aria-label="Close" onClick={props.onClose} />

      <div className="absolute inset-0 flex items-start justify-center p-4 pt-20 md:pt-28">
        <div
          role="dialog"
          aria-modal="true"
          className="w-full max-w-2xl rounded-3xl border border-border-dark bg-surface-dark/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              props.onClose();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((x) => Math.min(items.length - 1, x + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((x) => Math.max(0, x - 1));
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              run(items[selected]);
              return;
            }
          }}
        >
          <div className="p-4 border-b border-border-dark flex items-center gap-3">
            <span className="material-symbols-outlined text-[20px] text-text-secondary">search</span>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent border-none p-0 text-sm text-white placeholder:text-text-secondary/70 focus:ring-0"
              placeholder="搜索竞赛或跳转页面..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-text-secondary border border-border-dark rounded px-1.5 py-0.5">
              <span>Esc</span>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length ? (
              <div className="p-2">
                {items.map((item, idx) => {
                  const isSel = idx === selected;
                  const subtitle = item.kind === "nav" ? item.to : item.id;
                  return (
                    <button
                      key={`${item.kind}:${subtitle}`}
                      type="button"
                      className={[
                        "w-full text-left flex items-center gap-3 px-3 py-3 rounded-2xl border transition-colors",
                        isSel ? "bg-primary/10 border-primary/30" : "border-transparent hover:bg-panel-dark/40",
                      ].join(" ")}
                      onMouseEnter={() => setSelected(idx)}
                      onClick={() => run(item)}
                    >
                      <div className={["w-9 h-9 rounded-2xl border grid place-items-center", isSel ? "border-primary/30 text-primary bg-primary/10" : "border-border-dark text-text-secondary bg-background-dark/40"].join(" ")}>
                        <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={["text-sm font-extrabold truncate", isSel ? "text-white" : "text-white"].join(" ")}>{item.label}</div>
                        <div className="text-[11px] text-text-secondary font-mono truncate">{subtitle}</div>
                      </div>
                      <span className="material-symbols-outlined text-[18px] text-text-secondary">keyboard_return</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-10 text-center text-text-secondary">
                <div className="font-extrabold text-white">无结果</div>
                <div className="text-sm mt-1">换个关键词试试。</div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-border-dark bg-background-dark/30 text-xs text-text-secondary flex items-center justify-between">
            <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
            <span className="font-mono">⌘K</span>
          </div>
        </div>
      </div>
    </div>
  );
}
