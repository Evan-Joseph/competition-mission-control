import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import type { Competition } from "../../../lib/types";
import { addDays, formatYMD, parseYMD, startOfWeek, type YMD } from "../../../lib/date";
import { isMissedRegistration } from "../../../domain/competitionEvents";
import { isCompetitionEnded } from "../../../domain/competitionSchedule";
import { useV3App } from "../state/v3Context";

type CalendarMode = "month" | "week";

const CAL_PARAM = "cal"; // month|week
const CAL_DATE_PARAM = "d"; // anchor YYYY-MM-DD

type DayEvent = { comp: Competition; type: "reg" | "sub" | "res" };

function ensureYMD(v: string | null, fallback: YMD): YMD {
  const d = parseYMD(v);
  return d ? (formatYMD(d) as YMD) : fallback;
}

export default function CalendarPage() {
  const { competitions, openCompetition, todayISO } = useV3App();
  const [searchParams, setSearchParams] = useSearchParams();

  const mode: CalendarMode = searchParams.get(CAL_PARAM) === "week" ? "week" : "month";
  const anchorISO: YMD = ensureYMD(searchParams.get(CAL_DATE_PARAM), todayISO);

  const [cursor, setCursor] = useState<Date>(() => parseYMD(anchorISO) || new Date());

  useEffect(() => {
    const d = parseYMD(anchorISO);
    if (d) setCursor(d);
  }, [anchorISO]);

  const setParam = (k: string, v: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
      return next;
    });
  };

  const setCursorAndUrl = (d: Date) => {
    setCursor(d);
    setParam(CAL_DATE_PARAM, formatYMD(d));
  };

  const openWeekAt = (dateISO: YMD) => {
    const d = parseYMD(dateISO);
    if (d) setCursor(d);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(CAL_PARAM, "week");
      next.set(CAL_DATE_PARAM, dateISO);
      return next;
    });
  };

  const viewMonth = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const monthTitle = useMemo(() => viewMonth.toLocaleString("default", { month: "long", year: "numeric" }), [viewMonth]);

  const legend = (
    <div className="flex gap-4 text-xs font-medium bg-surface-dark px-3 py-1.5 rounded-lg border border-border-dark">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
        <span className="text-text-secondary">报名截止</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
        <span className="text-text-secondary">作品提交</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
        <span className="text-text-secondary">结果公布</span>
      </div>
    </div>
  );

  const modeToggle = (
    <div className="flex items-center bg-surface-dark rounded-xl border border-border-dark p-1 shadow-sm">
      <button
        type="button"
        onClick={() => setParam(CAL_PARAM, null)}
        className={[
          "px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
          mode === "month" ? "bg-primary text-[#111816]" : "text-text-secondary hover:text-white",
        ].join(" ")}
        aria-label="Month view"
      >
        月
      </button>
      <button
        type="button"
        onClick={() => setParam(CAL_PARAM, "week")}
        className={[
          "px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
          mode === "week" ? "bg-primary text-[#111816]" : "text-text-secondary hover:text-white",
        ].join(" ")}
        aria-label="Week view"
      >
        周
      </button>
    </div>
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<YMD, DayEvent[]>();
    const push = (iso: string | null, evt: DayEvent) => {
      if (!iso) return;
      const raw = String(iso || "").trim();
      if (!raw) return;
      const ymd = (raw.includes("T") ? raw.slice(0, 10) : raw) as YMD;
      if (!parseYMD(ymd)) return;
      const key = ymd;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(evt);
    };

    for (const c of competitions) {
      push(c.registration_deadline_at, { comp: c, type: "reg" });
      if (c.submission_deadline_at) push(c.submission_deadline_at, { comp: c, type: "sub" });
      if (c.result_deadline_at) push(c.result_deadline_at, { comp: c, type: "res" });
    }

    const order = (t: DayEvent["type"]) => (t === "reg" ? 0 : t === "sub" ? 1 : 2);
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => order(a.type) - order(b.type) || a.comp.name.localeCompare(b.comp.name));
      map.set(k, arr);
    }
    return map;
  }, [competitions]);

  const getEventsForDay = (dateISO: YMD): DayEvent[] => eventsByDate.get(dateISO) || [];

  const weekStart = useMemo(() => startOfWeek(cursor), [cursor]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekRangeLabel = useMemo(() => `${formatYMD(weekStart)} ~ ${formatYMD(weekEnd)}`, [weekEnd, weekStart]);

  const weekAgenda = useMemo(() => {
    if (mode !== "week") return [];
    const out: { dateISO: YMD; evt: DayEvent }[] = [];
    for (const d of weekDays) {
      const dateISO = formatYMD(d) as YMD;
      const evts = eventsByDate.get(dateISO) || [];
      for (const evt of evts) out.push({ dateISO, evt });
    }
    const order = (t: DayEvent["type"]) => (t === "reg" ? 0 : t === "sub" ? 1 : 2);
    out.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || order(a.evt.type) - order(b.evt.type) || a.evt.comp.name.localeCompare(b.evt.comp.name));
    return out;
  }, [eventsByDate, mode, weekDays]);

  const toolbar = (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between px-8 py-6 border-b border-border-dark gap-4">
      <div className="flex items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{monthTitle}</h2>
          {mode === "week" ? <p className="text-xs text-text-secondary mt-1 font-mono">{weekRangeLabel}</p> : null}
        </div>
        <div className="flex items-center bg-surface-dark rounded-xl border border-border-dark p-1 shadow-sm">
          <button
            onClick={() => {
              if (mode === "week") setCursorAndUrl(addDays(startOfWeek(cursor), -7));
              else setCursorAndUrl(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
            }}
            className="p-2 hover:bg-border-dark rounded-lg text-text-secondary hover:text-white transition-colors"
            type="button"
            aria-label={mode === "week" ? "Previous week" : "Previous month"}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => {
              const now = new Date();
              setCursorAndUrl(now);
            }}
            className="px-4 text-sm font-bold text-white hover:text-primary transition-colors"
            type="button"
          >
            今天
          </button>
          <button
            onClick={() => {
              if (mode === "week") setCursorAndUrl(addDays(startOfWeek(cursor), 7));
              else setCursorAndUrl(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
            }}
            className="p-2 hover:bg-border-dark rounded-lg text-text-secondary hover:text-white transition-colors"
            type="button"
            aria-label={mode === "week" ? "Next week" : "Next month"}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {modeToggle}
        {legend}
        <button
          className="flex items-center gap-2 px-4 py-2 bg-surface-dark border border-border-dark rounded-xl text-sm font-medium text-text-secondary hover:text-white hover:border-primary transition-colors"
          type="button"
          title="筛选（占位）"
        >
          <Filter size={16} /> 筛选
        </button>
      </div>
    </div>
  );

  if (mode === "week") {
    const days = weekDays;
    const labels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

    return (
      <div className="flex flex-col h-full bg-background-dark text-white animate-fade-in">
        {toolbar}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-7 border-b border-border-dark bg-panel-dark">
            {labels.map((d) => (
              <div key={d} className="py-3 text-center text-xs font-bold text-text-secondary uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 bg-background-dark">
            {days.map((d, idx) => {
              const dateISO = formatYMD(d) as YMD;
              const isToday = dateISO === todayISO;
              const events = getEventsForDay(dateISO);
              return (
                <div
                  key={idx}
                  className="border-b border-r border-border-dark p-2 min-h-[140px] relative hover:bg-panel-dark transition-colors group flex flex-col"
                >
                  <div className="flex justify-between items-start">
                    <span
                      className={[
                        "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full transition-all",
                        isToday
                          ? "bg-primary text-[#111816] shadow-[0_0_10px_rgba(43,238,173,0.4)]"
                          : "text-text-secondary group-hover:text-white",
                      ].join(" ")}
                    >
                      {d.getDate()}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1.5 overflow-y-auto max-h-[140px] scrollbar-hide">
                    {events.map((evt, i) => {
                      const missed = isMissedRegistration(evt.comp, todayISO);
                      const ended = isCompetitionEnded(evt.comp, todayISO);
                      const expired = missed || ended;
                      return (
                        <div
                          key={i}
                          onClick={() => openCompetition(evt.comp.id)}
                          className={[
                            "px-2 py-1.5 rounded-md text-xs font-bold border cursor-pointer transition-all hover:scale-[1.02] shadow-sm flex items-center gap-2",
                            evt.type === "reg"
                              ? "bg-blue-500/10 text-blue-300 border-blue-500/20 hover:bg-blue-500/20"
                              : evt.type === "sub"
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20"
                                : "bg-purple-500/10 text-purple-300 border-purple-500/20 hover:bg-purple-500/20",
                            expired ? "opacity-60" : "",
                            !evt.comp.included_in_plan && !evt.comp.registered ? "opacity-70" : "",
                          ].join(" ")}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            openCompetition(evt.comp.id);
                          }}
                        >
                          <div
                            className={[
                              "w-1.5 h-1.5 rounded-full flex-shrink-0",
                              evt.type === "reg" ? "bg-blue-400" : evt.type === "sub" ? "bg-emerald-400" : "bg-purple-400",
                            ].join(" ")}
                          ></div>
                          <span className={["truncate", expired ? "line-through" : ""].join(" ")}>{evt.comp.name}</span>
                        </div>
                      );
                    })}
                    {events.length === 0 ? <div className="text-xs text-text-secondary italic">暂无事件</div> : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Week Agenda */}
          <div className="px-6 md:px-8 py-6 border-t border-border-dark bg-background-dark">
            <div className="max-w-6xl mx-auto w-full">
              <div className="flex items-center justify-between mb-4 gap-4">
                <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_10px_rgba(43,238,173,0.3)]" />
                  本周事件
                </h3>
                <div className="text-xs text-text-secondary font-mono">{weekRangeLabel}</div>
              </div>

              <div className="bg-surface-dark border border-border-dark rounded-2xl overflow-hidden shadow-xl">
                {weekAgenda.length ? (
                  <div className="divide-y divide-border-dark">
                    {weekAgenda.map(({ dateISO, evt }, i) => {
                      const missed = isMissedRegistration(evt.comp, todayISO);
                      const ended = isCompetitionEnded(evt.comp, todayISO);
                      const expired = missed || ended;
                      const label = evt.type === "reg" ? "报名截止" : evt.type === "sub" ? "提交截止" : "结果公布";
                      const tone =
                        evt.type === "reg"
                          ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                          : evt.type === "sub"
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            : "bg-purple-500/10 text-purple-300 border-purple-500/20";
                      return (
                        <button
                          key={`${dateISO}:${evt.comp.id}:${evt.type}:${i}`}
                          type="button"
                          className="w-full text-left px-6 py-4 hover:bg-panel-dark/50 transition-colors flex items-start gap-4"
                          onClick={() => openCompetition(evt.comp.id)}
                        >
                          <div className="flex flex-col items-center justify-center w-12 h-12 bg-panel-dark rounded-lg border border-border-dark shrink-0">
                            <span className="text-[10px] text-text-secondary font-bold uppercase">{dateISO.slice(5, 7)}月</span>
                            <span className="text-lg text-white font-bold leading-none">{dateISO.slice(8, 10)}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={["inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border", tone].join(" ")}>
                                {label}
                              </span>
                              <span className={["text-sm font-bold text-white truncate", expired ? "line-through opacity-70" : ""].join(" ")}>
                                {evt.comp.name}
                              </span>
                              {!evt.comp.included_in_plan && !evt.comp.registered ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-background-dark text-text-secondary border border-border-dark">
                                  未纳入规划
                                </span>
                              ) : null}
                              {evt.comp.registered ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  已报名
                                </span>
                              ) : null}
                              {missed ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20">
                                  已错过报名
                                </span>
                              ) : null}
                              {!missed && ended ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/20">
                                  已结束
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs text-text-secondary truncate">{evt.comp.status_text || "暂无备注"}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-text-secondary">本周暂无事件。</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Month view (prototype parity)
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Monday start

  const days = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - startOffset + 1;
    if (dayNum > 0 && dayNum <= daysInMonth) return dayNum;
    return null;
  });

  return (
    <div className="flex flex-col h-full bg-background-dark text-white animate-fade-in">
      {toolbar}

      <div className="grid grid-cols-7 border-b border-border-dark bg-panel-dark">
        {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((d) => (
          <div key={d} className="py-3 text-center text-xs font-bold text-text-secondary uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-7 grid-rows-6 bg-background-dark">
        {days.map((day, idx) => {
          if (!day) {
            return <div key={idx} className="border-b border-r border-border-dark p-2 min-h-[100px] bg-background-dark/50"></div>;
          }

          const dateISO = formatYMD(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)) as YMD;
          const events = getEventsForDay(dateISO);
          const isToday = dateISO === todayISO;

          return (
            <div
              key={idx}
              className="border-b border-r border-border-dark p-2 min-h-[100px] relative hover:bg-panel-dark transition-colors group flex flex-col cursor-pointer"
              onClick={() => openWeekAt(dateISO)}
            >
              <div className="flex justify-between items-start">
                <span
                  className={[
                    "text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full transition-all",
                    isToday ? "bg-primary text-[#111816] shadow-[0_0_10px_rgba(43,238,173,0.4)]" : "text-text-secondary group-hover:text-white",
                  ].join(" ")}
                >
                  {day}
                </span>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-border-dark rounded text-text-secondary transition-opacity"
                  type="button"
                  aria-label="Add (placeholder)"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs">+</span>
                </button>
              </div>

              <div className="mt-2 space-y-1.5 overflow-y-auto max-h-[100px] scrollbar-hide">
                {events.map((evt, i) => {
                  const missed = isMissedRegistration(evt.comp, todayISO);
                  const ended = isCompetitionEnded(evt.comp, todayISO);
                  const expired = missed || ended;
                  return (
                    <div
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCompetition(evt.comp.id);
                      }}
                      className={[
                        "px-2 py-1.5 rounded-md text-xs font-bold border cursor-pointer transition-all hover:scale-[1.02] shadow-sm flex items-center gap-2",
                        evt.type === "reg"
                          ? "bg-blue-500/10 text-blue-300 border-blue-500/20 hover:bg-blue-500/20"
                          : evt.type === "sub"
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20"
                          : "bg-purple-500/10 text-purple-300 border-purple-500/20 hover:bg-purple-500/20",
                        expired ? "opacity-60" : "",
                        !evt.comp.included_in_plan && !evt.comp.registered ? "opacity-70" : "",
                      ].join(" ")}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        openCompetition(evt.comp.id);
                      }}
                    >
                      <div
                        className={[
                          "w-1.5 h-1.5 rounded-full flex-shrink-0",
                          evt.type === "reg" ? "bg-blue-400" : evt.type === "sub" ? "bg-emerald-400" : "bg-purple-400",
                        ].join(" ")}
                      ></div>
                      <span className={["truncate", expired ? "line-through" : ""].join(" ")}>{evt.comp.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
