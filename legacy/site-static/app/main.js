import {
  aiAsk,
  createMember,
  getCompetitions,
  getMembers,
  updateMember,
  updateProgress,
} from "./api.js";
import { getString, remove, setString } from "./storage.js";
import {
  addDays,
  daysBetweenCeil,
  formatCNDate,
  parseISODate,
  startOfWeek,
} from "./date.js";

const STORAGE_MEMBER_ID = "memberId";
const STORAGE_GROUP_BY = "groupBy";
const STORAGE_SORT_BY = "sortBy";
const STORAGE_COLLAPSED_GROUPS = "collapsedGroups";
const STORAGE_AI_WEB_SEARCH = "aiWebSearch";

const DEFAULT_MEMBERS = [
  { id: "member_gaoshenzhou", name: "高神舟", avatar_emoji: "🚀", avatar_color: "#13c8ec" },
  { id: "member_nierui", name: "聂睿", avatar_emoji: "🧠", avatar_color: "#f59e0b" },
  { id: "member_sunhuizhi", name: "孙慧智", avatar_emoji: "🧩", avatar_color: "#10b981" },
  { id: "member_yuzetong", name: "于泽通", avatar_emoji: "🛰️", avatar_color: "#ef4444" },
  { id: "member_gengxiaoran", name: "耿孝然", avatar_emoji: "⚙️", avatar_color: "#6366f1" },
];

const STATE_LABEL = {
  not_started: "未开始",
  registering: "报名中",
  registered: "已报名",
  incubating: "孵化中",
  submitted: "已提交",
  competing: "比赛中",
  waiting_result: "等待结果",
  finished: "完工/获奖",
};

const state = {
  memberId: null,
  members: [],
  competitions: [],
  q: "",
  urgentOnly: false,
  aiWebSearch: false,
  groupBy: "none",
  sortBy: "next",
  collapsedGroups: new Set(),
  _lastGroupKeys: [],
  timeline: {
    start: null,
    days: 84, // 12 weeks
    columnWidth: 100, // px per 7 days
  },
};

function $(id) {
  return document.getElementById(id);
}

function memberById(id) {
  return state.members.find((m) => m.id === id) || null;
}

function ensureMemberSelected() {
  const stored = getString(STORAGE_MEMBER_ID, null);
  if (stored && memberById(stored)) {
    state.memberId = stored;
    return;
  }
  state.memberId = null;
}

function loadUIPreferences() {
  const groupBy = getString(STORAGE_GROUP_BY, "none");
  state.groupBy = ["none", "source", "result", "urgency", "owner", "state"].includes(groupBy) ? groupBy : "none";

  const sortBy = getString(STORAGE_SORT_BY, "next");
  state.sortBy = ["next", "name", "result"].includes(sortBy) ? sortBy : "next";

  const aiWeb = getString(STORAGE_AI_WEB_SEARCH, "0");
  state.aiWebSearch = aiWeb === "1";

  try {
    const raw = getString(STORAGE_COLLAPSED_GROUPS, "[]");
    const arr = JSON.parse(raw || "[]");
    state.collapsedGroups = new Set(Array.isArray(arr) ? arr : []);
  } catch {
    state.collapsedGroups = new Set();
  }
}

function saveUIPreferences() {
  setString(STORAGE_GROUP_BY, state.groupBy);
  setString(STORAGE_SORT_BY, state.sortBy);
  setString(STORAGE_AI_WEB_SEARCH, state.aiWebSearch ? "1" : "0");
  setString(STORAGE_COLLAPSED_GROUPS, JSON.stringify([...state.collapsedGroups]));
}

function renderMemberButton() {
  const btn = $("member-button");
  const avatar = $("member-avatar");
  const m = state.memberId ? memberById(state.memberId) : null;

  if (!btn || !avatar) return;

  if (!m) {
    avatar.textContent = "选";
    btn.style.background = "";
    return;
  }

  const emoji = m.avatar_emoji || "";
  avatar.textContent = emoji || m.name.slice(0, 1);
  btn.style.background = m.avatar_color ? m.avatar_color : "";
  avatar.style.color = "#0b1220";
}

function setStarDate() {
  const el = $("star-date");
  if (!el) return;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  el.textContent = `星历日期 ${y}年${m}月${d}日`;
}

function computeAutoPhase(comp, now) {
  const rs = parseISODate(comp.registration_start);
  const re = parseISODate(comp.registration_end);
  const ss = parseISODate(comp.submission_start);
  const se = parseISODate(comp.submission_end);
  const re2 = parseISODate(comp.result_end);

  if (rs && re && now >= rs && now <= re) return "报名中";
  if (ss && se && now >= ss && now <= se) return "提交中";
  if (re2 && se && now >= se && now <= re2) return "等待结果";
  return "未维护";
}

function computeNextDeadline(comp, now) {
  const candidates = [
    { key: "registration_end", label: "报名截止", date: parseISODate(comp.registration_end) },
    { key: "submission_end", label: "提交截止", date: parseISODate(comp.submission_end) },
    { key: "result_end", label: "结果公布", date: parseISODate(comp.result_end) },
  ].filter((c) => c.date);

  const future = candidates.filter((c) => c.date.getTime() >= now.getTime()).sort((a, b) => a.date - b.date);
  if (future.length > 0) {
    const c = future[0];
    return {
      key: c.key,
      label: c.label,
      dateISO: c.date.toISOString().slice(0, 10),
      daysLeft: daysBetweenCeil(now, c.date),
    };
  }

  const past = candidates.sort((a, b) => b.date - a.date);
  if (past.length > 0) {
    const c = past[0];
    return {
      key: c.key,
      label: c.label,
      dateISO: c.date.toISOString().slice(0, 10),
      daysLeft: -daysBetweenCeil(c.date, now),
    };
  }

  return null;
}

function urgencyTone(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return { dot: "bg-slate-400", text: "text-slate-400", badge: "" };
  if (daysLeft <= 3) return { dot: "bg-danger", text: "text-danger", badge: "紧急" };
  if (daysLeft <= 7) return { dot: "bg-warning", text: "text-warning", badge: "临近" };
  return { dot: "bg-success", text: "text-slate-400", badge: "" };
}

function filteredCompetitions() {
  const now = new Date();
  return state.competitions.filter((c) => {
    if (state.q) {
      const t = (c.display_name || c.name || "").toLowerCase();
      if (!t.includes(state.q.toLowerCase())) return false;
    }
    if (state.urgentOnly) {
      const dl = c.nextDeadline?.daysLeft;
      if (dl === null || dl === undefined) return false;
      if (dl < 0 || dl > 7) return false;
    }
    // Hide competitions that are clearly out of current year? Keep all for now.
    // Force a date parse here to avoid runtime surprises.
    computeAutoPhase(c, now);
    return true;
  });
}

function displayName(c) {
  return String(c.display_name || c.name || "");
}

function compareName(a, b) {
  return displayName(a).localeCompare(displayName(b), "zh-Hans-CN-u-co-pinyin");
}

function compareNextDeadline(a, b) {
  const da = a.nextDeadline;
  const db = b.nextDeadline;
  const ha = da && typeof da.daysLeft === "number";
  const hb = db && typeof db.daysLeft === "number";
  const ca = !ha ? 2 : da.daysLeft >= 0 ? 0 : 1;
  const cb = !hb ? 2 : db.daysLeft >= 0 ? 0 : 1;
  if (ca !== cb) return ca - cb;
  if (ca === 0) return da.daysLeft - db.daysLeft;
  if (ca === 1) return db.daysLeft - da.daysLeft; // -1 before -10
  return compareName(a, b);
}

function compareResultEnd(a, b) {
  const ra = parseISODate(a.result_end);
  const rb = parseISODate(b.result_end);
  const ha = Boolean(ra);
  const hb = Boolean(rb);
  if (ha !== hb) return ha ? -1 : 1;
  if (ra && rb) return ra - rb;
  return compareName(a, b);
}

function sortCompetitions(list) {
  const copy = [...list];
  if (state.sortBy === "name") return copy.sort(compareName);
  if (state.sortBy === "result") return copy.sort(compareResultEnd);
  return copy.sort(compareNextDeadline);
}

function resultBucket(comp, now) {
  const d = parseISODate(comp.result_end);
  if (!d) return { key: "result:unknown", title: "未公布/未知" };

  const y = now.getFullYear();
  const aug1 = parseISODate(`${y}-08-01`);
  const sep1 = parseISODate(`${y}-09-01`);
  const oct1 = parseISODate(`${y}-10-01`);
  const nextYear1 = parseISODate(`${y + 1}-01-01`);
  if (!aug1 || !sep1 || !oct1 || !nextYear1) return { key: "result:unknown", title: "未公布/未知" };

  if (d < aug1) return { key: "result:before_aug", title: "8月前公布" };
  if (d < sep1) return { key: "result:aug", title: "8月公布（=9月前）" };
  if (d < oct1) return { key: "result:sep", title: "9月公布" };
  if (d < nextYear1) return { key: "result:after_sep", title: "10月及以后公布" };
  return { key: "result:next_year", title: "跨年公布" };
}

function urgencyBucket(comp) {
  const dl = comp.nextDeadline?.daysLeft;
  if (typeof dl !== "number") return { key: "urgency:unknown", title: "未知" };
  if (dl < 0) return { key: "urgency:past", title: "已过期/已结束" };
  if (dl <= 3) return { key: "urgency:d3", title: "紧急（<=3天）" };
  if (dl <= 7) return { key: "urgency:d7", title: "临近（<=7天）" };
  if (dl <= 14) return { key: "urgency:d14", title: "两周内（<=14天）" };
  return { key: "urgency:future", title: "更远（>14天）" };
}

function groupCompetitions(list) {
  const now = new Date();
  const groups = new Map();
  const add = (key, title, comp) => {
    if (!groups.has(key)) groups.set(key, { key, title, competitions: [] });
    groups.get(key).competitions.push(comp);
  };

  if (state.groupBy === "source") {
    for (const c of list) {
      const tag = String(c.source_tag || "").trim();
      add(`source:${tag || "unknown"}`, tag || "未标注", c);
    }
  } else if (state.groupBy === "result") {
    for (const c of list) {
      const b = resultBucket(c, now);
      add(b.key, b.title, c);
    }
  } else if (state.groupBy === "urgency") {
    for (const c of list) {
      const b = urgencyBucket(c);
      add(b.key, b.title, c);
    }
  } else if (state.groupBy === "owner") {
    for (const c of list) {
      const ownerId = String(c.progress_owner_member_id || "").trim();
      if (!ownerId) add("owner:unassigned", "未分配", c);
      else add(`owner:${ownerId}`, memberById(ownerId)?.name || ownerId, c);
    }
  } else if (state.groupBy === "state") {
    for (const c of list) {
      const st = String(c.progress_state || "").trim();
      if (!st) add("state:unmaintained", "未维护", c);
      else add(`state:${st}`, STATE_LABEL[st] || st, c);
    }
  } else {
    // none
    for (const c of list) add("all", "全部", c);
  }

  const orderIndex = (key) => {
    if (state.groupBy === "source") {
      const tag = key.slice("source:".length);
      const order = ["两者都有", "计科院重点支持", "教育部名录"];
      const idx = order.indexOf(tag);
      return idx === -1 ? 99 : idx;
    }
    if (state.groupBy === "result") {
      const order = [
        "result:before_aug",
        "result:aug",
        "result:sep",
        "result:after_sep",
        "result:next_year",
        "result:unknown",
      ];
      const idx = order.indexOf(key);
      return idx === -1 ? 99 : idx;
    }
    if (state.groupBy === "urgency") {
      const order = ["urgency:d3", "urgency:d7", "urgency:d14", "urgency:future", "urgency:past", "urgency:unknown"];
      const idx = order.indexOf(key);
      return idx === -1 ? 99 : idx;
    }
    if (state.groupBy === "owner") {
      if (key === "owner:unassigned") return -1;
      const id = key.slice("owner:".length);
      const idx = state.members.findIndex((m) => m.id === id);
      return idx === -1 ? 99 : idx;
    }
    if (state.groupBy === "state") {
      const order = [
        "state:unmaintained",
        "state:registering",
        "state:registered",
        "state:incubating",
        "state:submitted",
        "state:competing",
        "state:waiting_result",
        "state:finished",
        "state:not_started",
      ];
      const idx = order.indexOf(key);
      return idx === -1 ? 99 : idx;
    }
    return 0;
  };

  const out = Array.from(groups.values())
    .map((g) => {
      const comps = sortCompetitions(g.competitions);
      const urgent7 = comps.filter((c) => typeof c.nextDeadline?.daysLeft === "number" && c.nextDeadline.daysLeft >= 0 && c.nextDeadline.daysLeft <= 7).length;
      const urgent3 = comps.filter((c) => typeof c.nextDeadline?.daysLeft === "number" && c.nextDeadline.daysLeft >= 0 && c.nextDeadline.daysLeft <= 3).length;
      const overdue = comps.filter((c) => typeof c.nextDeadline?.daysLeft === "number" && c.nextDeadline.daysLeft < 0).length;
      return {
        ...g,
        competitions: comps,
        stats: { count: comps.length, urgent3, urgent7, overdue },
      };
    })
    .sort((a, b) => orderIndex(a.key) - orderIndex(b.key) || a.title.localeCompare(b.title, "zh-Hans-CN-u-co-pinyin"));

  return out;
}

function buildRows(list) {
  if (state.groupBy === "none") {
    const comps = sortCompetitions(list);
    state._lastGroupKeys = [];
    return comps.map((c) => ({ type: "competition", competition: c }));
  }

  const groups = groupCompetitions(list);
  state._lastGroupKeys = groups.map((g) => g.key);

  const rows = [];
  for (const g of groups) {
    rows.push({ type: "group", group: g });
    if (state.collapsedGroups.has(g.key)) continue;
    for (const c of g.competitions) rows.push({ type: "competition", competition: c });
  }
  return rows;
}

function renderKPIs(list) {
  const now = new Date();

  const total = list.length;
  const registering = list.filter((c) => computeAutoPhase(c, now) === "报名中").length;

  const urgent = list.filter((c) => {
    const dl = c.nextDeadline?.daysLeft;
    return typeof dl === "number" && dl >= 0 && dl <= 3;
  }).length;

  const risk = list.filter((c) => Number(c.progress_risk_level || 0) >= 2).length;

  const resultsThisMonth = list.filter((c) => {
    const r = parseISODate(c.result_end);
    return r && r.getFullYear() === now.getFullYear() && r.getMonth() === now.getMonth();
  }).length;

  $("kpi-total").textContent = String(total);
  $("kpi-registering").textContent = String(registering);
  $("kpi-urgent").textContent = String(urgent);
  $("kpi-risk").textContent = String(risk);
  $("kpi-results").textContent = String(resultsThisMonth);
}

function toggleGroup(groupKey) {
  if (!groupKey) return;
  if (state.collapsedGroups.has(groupKey)) state.collapsedGroups.delete(groupKey);
  else state.collapsedGroups.add(groupKey);
  saveUIPreferences();
  rerender();
}

function renderCompetitionList(rowsVm) {
  const root = $("competition-list");
  if (!root) return;
  root.innerHTML = "";

  const now = new Date();

  for (const row of rowsVm) {
    if (row.type === "group") {
      const g = row.group;
      const s = g.stats || { count: g.competitions?.length || 0, urgent3: 0, urgent7: 0, overdue: 0 };
      const collapsed = state.collapsedGroups.has(g.key);
      const icon = collapsed ? "chevron_right" : "expand_more";

      const badges = [`<span class="text-[10px] font-bold bg-slate-900/5 dark:bg-white/10 px-2 py-0.5 rounded-full">${s.count}项</span>`];
      if (s.urgent3) {
        badges.push(
          `<span class="text-[10px] font-bold bg-danger/15 text-danger border border-danger/30 px-2 py-0.5 rounded-full">紧急 ${s.urgent3}</span>`
        );
      } else if (s.urgent7) {
        badges.push(
          `<span class="text-[10px] font-bold bg-warning/15 text-warning border border-warning/30 px-2 py-0.5 rounded-full">临近 ${s.urgent7}</span>`
        );
      }
      if (s.overdue) badges.push(`<span class="text-[10px] font-bold bg-slate-900/5 dark:bg-white/10 px-2 py-0.5 rounded-full">已过期 ${s.overdue}</span>`);

      const item = document.createElement("div");
      item.className =
        "h-12 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 bg-slate-50/80 dark:bg-slate-900/20 hover:bg-slate-100 dark:hover:bg-slate-900/35 transition-colors cursor-pointer select-none";
      item.dataset.groupKey = g.key;
      item.innerHTML = `
        <div class="flex items-center gap-2 min-w-0 w-full">
          <span class="material-symbols-outlined text-[18px] text-slate-400">${icon}</span>
          <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">${escapeHtml(g.title)}</span>
          <div class="ml-auto flex items-center gap-2">${badges.join("")}</div>
        </div>
      `;
      item.addEventListener("click", () => toggleGroup(g.key));
      root.appendChild(item);
      continue;
    }

    const c = row.competition;
    const name = c.display_name || c.name;
    const dl = c.nextDeadline?.daysLeft;
    const tone = urgencyTone(typeof dl === "number" ? dl : null);

    const manual = c.progress_state ? STATE_LABEL[c.progress_state] || c.progress_state : null;
    const auto = computeAutoPhase(c, now);
    const label = manual || auto;

    const item = document.createElement("div");
    item.className =
      "h-24 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group";
    if (tone.dot === "bg-danger") item.classList.add("bg-danger/5");

    item.dataset.compId = c.id;
    item.innerHTML = `
        <div class="flex flex-col min-w-0">
          <span class="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary transition-colors truncate">${escapeHtml(
            name
          )}</span>
          <span class="text-xs mt-1 flex items-center gap-1 ${tone.text}">
            <span class="w-2 h-2 rounded-full ${tone.dot}"></span>
            ${escapeHtml(label)}
            ${
              typeof dl === "number" && dl >= 0
                ? `<span class="ml-2 text-[10px] font-bold bg-slate-900/5 dark:bg-white/10 px-2 py-0.5 rounded-full">D-${dl}</span>`
                : ""
            }
          </span>
        </div>
      `;

    item.addEventListener("click", () => openDrawer(c.id));
    root.appendChild(item);
  }
}

function renderTimelineLabel(start, end) {
  const el = $("timeline-label");
  if (!el) return;

  const sY = start.getFullYear();
  const eY = end.getFullYear();
  const sM = start.getMonth() + 1;
  const eM = end.getMonth() + 1;

  if (sY === eY) el.textContent = `${sY}年 ${sM}月 - ${eM}月`;
  else el.textContent = `${sY}年${sM}月 - ${eY}年${eM}月`;
}

function renderGantt(rowsVm) {
  const header = $("gantt-header");
  const rows = $("gantt-rows");
  const todayLine = $("gantt-today-line");
  if (!header || !rows || !todayLine) return;

  const now = new Date();
  const start = state.timeline.start || startOfWeek(now);
  state.timeline.start = start;

  header.innerHTML = "";
  rows.innerHTML = "";

  const dayMs = 24 * 60 * 60 * 1000;
  const pxPerDay = state.timeline.columnWidth / 7;
  const end = addDays(start, state.timeline.days);
  renderTimelineLabel(start, addDays(start, state.timeline.days - 1));

  // Header columns (weekly)
  for (let i = 0; i < state.timeline.days; i += 7) {
    const d = addDays(start, i);
    const col = document.createElement("div");
    col.className =
      "w-[100px] shrink-0 border-r border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs text-slate-400";
    col.textContent = formatCNDate(d);
    header.appendChild(col);
  }

  // Today line
  const todayX = ((now.getTime() - start.getTime()) / dayMs) * pxPerDay;
  todayLine.style.transform = `translateX(${Math.max(0, todayX)}px)`;

  for (const rowVm of rowsVm) {
    if (rowVm.type === "group") {
      const g = rowVm.group;
      const collapsed = state.collapsedGroups.has(g.key);
      const icon = collapsed ? "chevron_right" : "expand_more";

      const row = document.createElement("div");
      row.className =
        "h-12 border-b border-slate-200 dark:border-slate-800/60 bg-slate-100/60 dark:bg-slate-900/20 hover:bg-slate-200/30 dark:hover:bg-slate-900/30 transition-colors flex items-center cursor-pointer select-none";
      row.dataset.groupKey = g.key;
      row.innerHTML = `
        <div class="px-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span class="material-symbols-outlined text-[18px] text-slate-400">${icon}</span>
          <span class="font-bold uppercase tracking-wider">${escapeHtml(g.title)}</span>
          <span class="text-[10px] font-mono opacity-70">${escapeHtml(String(g.stats?.count ?? g.competitions?.length ?? 0))}项</span>
        </div>
      `;
      row.addEventListener("click", () => toggleGroup(g.key));
      rows.appendChild(row);
      continue;
    }

    const c = rowVm.competition;
    const row = document.createElement("div");
    row.className = "h-24 border-b border-slate-200 dark:border-slate-800/50 relative";
    row.dataset.compId = c.id;

    const bars = [];

    const reg = { s: parseISODate(c.registration_start), e: parseISODate(c.registration_end), kind: "reg" };
    const sub = { s: parseISODate(c.submission_start), e: parseISODate(c.submission_end), kind: "sub" };
    const res = { s: parseISODate(c.result_start), e: parseISODate(c.result_end), kind: "res" };

    for (const seg of [reg, sub]) {
      if (!seg.e) continue;
      const s = seg.s || seg.e;
      const e = seg.e;

      const segStart = s.getTime();
      const segEnd = e.getTime();

      const clampStart = Math.max(segStart, start.getTime());
      const clampEnd = Math.min(segEnd, end.getTime());
      const x = ((clampStart - start.getTime()) / dayMs) * pxPerDay;
      const wDays = Math.max(1, Math.floor((clampEnd - clampStart) / dayMs) + 1);
      const w = wDays * pxPerDay;

      const top = seg.kind === "reg" ? 26 : 54;
      const cls =
        seg.kind === "reg"
          ? "from-warning/25 to-warning/55 border-warning/60"
          : "from-primary/20 to-primary/45 border-primary/50";
      const label = seg.kind === "reg" ? "报名" : "提交";

      bars.push(
        `<div class="absolute h-6 rounded-md border bg-gradient-to-r ${cls} flex items-center px-2 shadow-lg hover:brightness-110 cursor-pointer group"
              style="left:${x.toFixed(1)}px;width:${Math.max(8, w).toFixed(1)}px;top:${top}px">
           <span class="text-[11px] font-medium text-white drop-shadow-md truncate">${label}</span>
           <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-surface-darker text-white text-xs p-2 rounded shadow-xl border border-slate-700 whitespace-nowrap z-30">
             ${escapeHtml(c.display_name || c.name)}<br/>
             ${label}: ${escapeHtml(c[seg.kind === "reg" ? "registration_text" : "submission_text"] || "")}
           </div>
         </div>`
      );
    }

    // Result milestone
    if (res.e) {
      const x = ((res.e.getTime() - start.getTime()) / dayMs) * pxPerDay;
      bars.push(
        `<div class="absolute top-[38px] -translate-x-1/2 cursor-pointer group" style="left:${x.toFixed(1)}px;">
           <div class="w-3 h-3 rounded-full bg-success shadow-[0_0_10px_rgba(16,185,129,0.55)]"></div>
           <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-surface-darker text-white text-xs p-2 rounded shadow-xl border border-slate-700 whitespace-nowrap z-30">
             ${escapeHtml(c.display_name || c.name)}<br/>
             结果: ${escapeHtml(c.result_text || "")}
           </div>
         </div>`
      );
    }

    row.innerHTML = bars.join("");
    row.addEventListener("click", () => openDrawer(c.id));
    rows.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function openModal(el) {
  const root = $("modal-root");
  if (!root) return;
  root.innerHTML = "";
  root.appendChild(el);
}

function closeModal() {
  const root = $("modal-root");
  if (!root) return;
  root.innerHTML = "";
}

function identityModal() {
  const wrap = document.createElement("div");
  wrap.className = "fixed inset-0 z-[60] flex items-center justify-center p-6";
  wrap.innerHTML = `
    <div class="absolute inset-0 bg-black/60"></div>
    <div class="relative w-full max-w-2xl bg-white dark:bg-surface-darker border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
      <div class="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div>
          <div class="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 uppercase">Identity</div>
          <div class="text-lg font-bold text-slate-900 dark:text-white">选择你的身份</div>
        </div>
        <button class="text-slate-400 hover:text-slate-900 dark:hover:text-white" data-close type="button">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-3" id="member-cards"></div>
      <div class="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div class="text-sm font-bold text-slate-900 dark:text-white mb-3">编辑当前成员</div>
            <form class="grid grid-cols-1 gap-3" id="member-edit-form">
              <input class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm" name="name" placeholder="姓名" />
              <div class="grid grid-cols-2 gap-3">
                <input class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm" name="emoji" placeholder="Emoji" />
                <input class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm" name="color" placeholder="#13c8ec" />
              </div>
              <button class="px-4 py-2 rounded-lg bg-slate-900/10 dark:bg-white/10 hover:bg-slate-900/20 dark:hover:bg-white/20 text-slate-900 dark:text-white text-sm font-bold transition-colors disabled:opacity-50" id="member-edit-submit" type="submit">保存</button>
            </form>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-2">头像/颜色仅用于面板识别。</div>
          </div>
          <div>
            <div class="text-sm font-bold text-slate-900 dark:text-white mb-3">新增成员</div>
            <form class="grid grid-cols-1 md:grid-cols-3 gap-3" id="member-create-form">
              <input class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm" name="name" placeholder="姓名" required />
              <input class="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm" name="emoji" placeholder="头像 Emoji (可选)" />
              <div class="flex gap-2">
                <input class="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 px-3 py-2 text-sm" name="color" placeholder="#13c8ec (可选)" />
                <button class="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors" type="submit">添加</button>
              </div>
            </form>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-2">不做强认证：任何人都可以切换身份。用于团队协作记录。</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const cards = wrap.querySelector("#member-cards");
  for (const m of state.members) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/20 hover:border-primary/40 hover:bg-primary/5 transition-colors text-left";
    btn.innerHTML = `
      <div class="w-10 h-10 rounded-full grid place-items-center font-bold" style="background:${m.avatar_color || "#334155"};">
        <span class="text-sm" style="color:#0b1220;">${escapeHtml(m.avatar_emoji || m.name.slice(0, 1))}</span>
      </div>
      <div class="min-w-0">
        <div class="font-bold text-slate-900 dark:text-white truncate">${escapeHtml(m.name)}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400 truncate">${escapeHtml(m.id)}</div>
      </div>
      ${state.memberId === m.id ? '<span class="ml-auto text-primary text-xs font-bold">当前</span>' : '<span class="ml-auto text-slate-400 text-xs">选择</span>'}
    `;
    btn.addEventListener("click", () => {
      state.memberId = m.id;
      setString(STORAGE_MEMBER_ID, m.id);
      renderMemberButton();
      closeModal();
    });
    cards.appendChild(btn);
  }

  wrap.querySelector("[data-close]").addEventListener("click", closeModal);
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap.querySelector(".absolute.inset-0")) closeModal();
  });

  // Edit current member (optional)
  const editForm = wrap.querySelector("#member-edit-form");
  const editSubmit = wrap.querySelector("#member-edit-submit");
  const cur = state.memberId ? memberById(state.memberId) : null;
  if (editForm) {
    const nameEl = editForm.querySelector('input[name="name"]');
    const emojiEl = editForm.querySelector('input[name="emoji"]');
    const colorEl = editForm.querySelector('input[name="color"]');

    if (cur) {
      nameEl.value = cur.name || "";
      emojiEl.value = cur.avatar_emoji || "";
      colorEl.value = cur.avatar_color || "";
    } else {
      nameEl.value = "";
      emojiEl.value = "";
      colorEl.value = "";
      if (editSubmit) editSubmit.disabled = true;
    }

    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state.memberId) return;
      const fd = new FormData(editForm);
      const name = String(fd.get("name") || "").trim();
      const emoji = String(fd.get("emoji") || "").trim() || null;
      const color = String(fd.get("color") || "").trim() || null;

      try {
        const updated = await updateMember(state.memberId, { name, avatarEmoji: emoji, avatarColor: color });
        state.members = state.members.map((m) => (m.id === updated.id ? updated : m));
        renderMemberButton();
        rerender();
      } catch (err) {
        alert(`更新失败: ${err.message}`);
      }
    });
  }

  wrap.querySelector("#member-create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = String(fd.get("name") || "").trim();
    const emoji = String(fd.get("emoji") || "").trim() || null;
    const color = String(fd.get("color") || "").trim() || null;
    if (!name) return;

    try {
      const member = await createMember({ name, avatarEmoji: emoji, avatarColor: color });
      state.members.push(member);
      state.memberId = member.id;
      setString(STORAGE_MEMBER_ID, member.id);
      renderMemberButton();
      closeModal();
      // Refresh UI so newly added owner is selectable in drawer.
      rerender();
    } catch (err) {
      alert(`新增成员失败: ${err.message}`);
    }
  });

  return wrap;
}

function openIdentityModal() {
  openModal(identityModal());
}

function openDrawer(compId) {
  const root = $("drawer-root");
  if (!root) return;
  const comp = state.competitions.find((c) => c.id === compId);
  if (!comp) return;

  const m = state.memberId ? memberById(state.memberId) : null;

  const el = document.createElement("div");
  el.className = "fixed inset-0 z-[55]";
  el.innerHTML = `
    <div class="absolute inset-0 bg-black/50" data-backdrop></div>
    <aside class="absolute inset-y-0 right-0 w-full md:w-[600px] bg-surface-darker border-l border-slate-800 shadow-2xl flex flex-col">
      <header class="p-6 border-b border-slate-800 bg-surface-darker/80 backdrop-blur-sm sticky top-0 z-10">
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col gap-2 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/30">
                ${(comp.progress_state ? escapeHtml(STATE_LABEL[comp.progress_state] || comp.progress_state) : "未维护")}
              </span>
              ${comp.source_tag ? `<span class="inline-flex items-center rounded-full bg-slate-900/30 px-2.5 py-0.5 text-xs font-medium text-slate-200 border border-slate-700">${escapeHtml(comp.source_tag)}</span>` : ""}
              ${comp.offline_defense ? `<span class="inline-flex items-center rounded-full bg-slate-900/30 px-2.5 py-0.5 text-xs font-medium text-slate-200 border border-slate-700">答辩:${escapeHtml(comp.offline_defense)}</span>` : ""}
            </div>
            <h2 class="text-2xl font-bold text-white leading-tight tracking-tight truncate">${escapeHtml(comp.display_name || comp.name)}</h2>
          </div>
          <button class="text-slate-400 hover:text-white transition-colors" type="button" data-close>
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto p-6 space-y-8">
        <section>
          <h3 class="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[18px]">timeline</span>
            时间轴
          </h3>
          <div class="space-y-3">
            ${timelineItem("报名", comp.registration_text, comp.registration_start, comp.registration_end)}
            ${timelineItem("提交", comp.submission_text, comp.submission_start, comp.submission_end)}
            ${timelineItem("结果", comp.result_text, comp.result_start, comp.result_end)}
          </div>
        </section>

        <section>
          <h3 class="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[18px]">edit_note</span>
            进展维护
          </h3>
          <form class="space-y-3" id="progress-form">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-xs text-slate-400">状态</span>
                <select class="rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-white" name="state" required>
                  ${Object.entries(STATE_LABEL)
                    .map(([k, v]) => `<option value="${k}" ${comp.progress_state === k ? "selected" : ""}>${v}</option>`)
                    .join("")}
                </select>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-slate-400">负责人</span>
                <select class="rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-white" name="owner">
                  <option value="">未分配</option>
                  ${state.members
                    .map(
                      (mm) =>
                        `<option value="${mm.id}" ${comp.progress_owner_member_id === mm.id ? "selected" : ""}>${escapeHtml(mm.name)}</option>`
                    )
                    .join("")}
                </select>
              </label>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-slate-400">阶段备注（例如：省赛中 / 国赛决赛中）</span>
              <input class="rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-white" name="stateDetail" value="${escapeHtml(comp.progress_state_detail || "")}" placeholder="可选" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-slate-400">奖次/结果（完工后填写）</span>
              <input class="rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-white" name="award" value="${escapeHtml(comp.progress_award || "")}" placeholder="可选" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-slate-400">备注</span>
              <textarea class="rounded-lg bg-slate-900/40 border border-slate-700 px-3 py-2 text-sm text-white min-h-[100px]" name="notes" placeholder="记录关键信息、待办、风险等...">${escapeHtml(
                comp.progress_notes || ""
              )}</textarea>
            </label>
            <div class="flex items-center justify-between gap-3 pt-2">
              <div class="text-xs text-slate-400">
                当前身份：${escapeHtml(m ? m.name : "未选择")} ${m ? "" : "（请先选择）"}
              </div>
              <div class="flex gap-2">
                <button class="px-4 py-2 rounded-lg bg-slate-900/40 border border-slate-700 text-white text-sm hover:bg-slate-900/60 transition-colors" type="button" data-switch>切换身份</button>
                <button class="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50" type="submit" ${m ? "" : "disabled"}>保存</button>
              </div>
            </div>
          </form>
        </section>

        <section>
          <h3 class="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[18px]">link</span>
            证据链接
          </h3>
          <div class="space-y-2 text-sm">
            ${renderLinks(comp.evidence_links_json)}
          </div>
        </section>
      </div>
    </aside>
  `;

  el.querySelector("[data-backdrop]").addEventListener("click", () => closeDrawer());
  el.querySelector("[data-close]").addEventListener("click", () => closeDrawer());
  el.querySelector("[data-switch]").addEventListener("click", () => {
    closeDrawer();
    openIdentityModal();
  });

  const form = el.querySelector("#progress-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.memberId) return;
    const fd = new FormData(form);
    const payload = {
      state: String(fd.get("state") || "").trim(),
      ownerMemberId: String(fd.get("owner") || "").trim() || null,
      stateDetail: String(fd.get("stateDetail") || "").trim() || null,
      award: String(fd.get("award") || "").trim() || null,
      notes: String(fd.get("notes") || "").trim() || null,
      riskLevel: 0,
    };

    try {
      await updateProgress(compId, payload, state.memberId);
      closeDrawer();
      await refreshCompetitions();
    } catch (err) {
      alert(`保存失败: ${err.message}`);
    }
  });

  root.innerHTML = "";
  root.appendChild(el);
}

function closeDrawer() {
  const root = $("drawer-root");
  if (!root) return;
  root.innerHTML = "";
}

function renderLinks(linksJson) {
  let links = [];
  try {
    links = JSON.parse(linksJson || "[]");
  } catch {
    links = [];
  }
  if (!links.length) return `<div class="text-slate-400 text-sm">无</div>`;
  return links
    .map(
      (u) =>
        `<a class="block text-primary hover:underline break-all" href="${escapeHtml(u)}" target="_blank" rel="noreferrer">${escapeHtml(u)}</a>`
    )
    .join("");
}

function timelineItem(title, text, startISO, endISO) {
  const s = startISO ? startISO : "";
  const e = endISO && endISO !== startISO ? endISO : "";
  const line = e ? `${s} ~ ${e}` : s;
  return `
    <div class="rounded-xl bg-slate-900/30 border border-slate-800 p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="text-white font-bold">${escapeHtml(title)}</div>
        <div class="text-xs text-slate-400 font-mono">${escapeHtml(line || "-")}</div>
      </div>
      <div class="text-sm text-slate-300 mt-2 break-words">${escapeHtml(text || "-")}</div>
    </div>
  `;
}

function setupHeaderControls() {
  const search = $("global-search");
  if (search) {
    search.addEventListener("input", () => {
      state.q = search.value.trim();
      rerender();
    });
  }

  const urgentOnly = $("urgent-only");
  if (urgentOnly) {
    urgentOnly.addEventListener("change", () => {
      state.urgentOnly = urgentOnly.checked;
      rerender();
    });
  }

  const groupBy = $("group-by");
  if (groupBy) {
    groupBy.value = state.groupBy;
    groupBy.addEventListener("change", () => {
      state.groupBy = String(groupBy.value || "none");
      state.collapsedGroups = new Set();
      remove(STORAGE_COLLAPSED_GROUPS);
      saveUIPreferences();
      rerender();
    });
  }

  const sortBy = $("sort-by");
  if (sortBy) {
    sortBy.value = state.sortBy;
    sortBy.addEventListener("change", () => {
      state.sortBy = String(sortBy.value || "next");
      saveUIPreferences();
      rerender();
    });
  }

  const collapseAll = $("collapse-all");
  if (collapseAll) {
    collapseAll.addEventListener("click", () => {
      if (state.groupBy === "none") return;
      const keys = Array.isArray(state._lastGroupKeys) ? state._lastGroupKeys : [];
      if (!keys.length) return;

      const allCollapsed = keys.every((k) => state.collapsedGroups.has(k));
      state.collapsedGroups = allCollapsed ? new Set() : new Set(keys);
      saveUIPreferences();
      rerender();
    });
  }

  const memberBtn = $("member-button");
  if (memberBtn) memberBtn.addEventListener("click", openIdentityModal);
}

function setupTimelineControls() {
  const prev = $("timeline-prev");
  const next = $("timeline-next");
  const today = $("timeline-today");

  const shift = (days) => {
    const base = state.timeline.start || startOfWeek(new Date());
    state.timeline.start = addDays(base, days);
    rerender();
  };

  prev?.addEventListener("click", () => shift(-28));
  next?.addEventListener("click", () => shift(28));
  today?.addEventListener("click", () => {
    state.timeline.start = startOfWeek(new Date());
    rerender();
  });
}

function syncControls() {
  const groupBy = $("group-by");
  if (groupBy && groupBy.value !== state.groupBy) groupBy.value = state.groupBy;

  const sortBy = $("sort-by");
  if (sortBy && sortBy.value !== state.sortBy) sortBy.value = state.sortBy;

  const collapseAll = $("collapse-all");
  if (collapseAll) {
    const enabled = state.groupBy !== "none";
    collapseAll.disabled = !enabled;

    if (!enabled) {
      collapseAll.textContent = "收起全部";
      return;
    }

    const keys = Array.isArray(state._lastGroupKeys) ? state._lastGroupKeys : [];
    const allCollapsed = keys.length > 0 && keys.every((k) => state.collapsedGroups.has(k));
    collapseAll.textContent = allCollapsed ? "展开全部" : "收起全部";
  }
}

function setupAI() {
  const input = $("ai-input");
  const send = $("ai-send");
  const messages = $("ai-messages");
  const chips = $("ai-chips");
  const webToggle = $("ai-web-toggle");

  if (!input || !send || !messages || !chips) return;

  // Keep existing placeholder content but allow appends.
  const appendUser = (txt) => {
    const wrap = document.createElement("div");
    wrap.className = "flex gap-3 flex-row-reverse";
    wrap.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
        <span class="text-xs font-bold">${escapeHtml((memberById(state.memberId)?.avatar_emoji || "我").slice(0, 2))}</span>
      </div>
      <div class="flex flex-col gap-1 items-end max-w-[90%]">
        <div class="bg-primary text-white rounded-2xl rounded-tr-none p-3 shadow-md text-sm"><p>${escapeHtml(txt)}</p></div>
      </div>
    `;
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  };

  const appendBot = (txt) => {
    const wrap = document.createElement("div");
    wrap.className = "flex gap-3";
    wrap.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
        <span class="material-symbols-outlined text-primary text-sm">smart_toy</span>
      </div>
      <div class="flex flex-col gap-1 max-w-[90%]">
        <div class="bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none p-3 shadow-sm text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">${escapeHtml(
          txt
        )}</div>
      </div>
    `;
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  };

  const doSend = async () => {
    const txt = input.value.trim();
    if (!txt) return;
    input.value = "";
    appendUser(txt);

    send.disabled = true;
    try {
      const reply = await aiAsk(txt, { useWebSearch: state.aiWebSearch });
      appendBot(reply.content || "(无内容)");
    } catch (err) {
      appendBot(`AI 请求失败：${err.message}`);
    } finally {
      send.disabled = false;
    }
  };

  send.addEventListener("click", doSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSend();
  });

  for (const btn of chips.querySelectorAll("button")) {
    btn.addEventListener("click", () => {
      input.value = btn.textContent.trim();
      doSend();
    });
  }

  if (webToggle) {
    const sync = () => {
      webToggle.classList.toggle("bg-primary/10", state.aiWebSearch);
      webToggle.classList.toggle("text-primary", state.aiWebSearch);
      webToggle.classList.toggle("border-primary/40", state.aiWebSearch);
    };
    sync();
    webToggle.addEventListener("click", () => {
      state.aiWebSearch = !state.aiWebSearch;
      saveUIPreferences();
      sync();
    });
  }
}

async function refreshMembers() {
  try {
    state.members = await getMembers();
    if (!state.members.length) state.members = DEFAULT_MEMBERS;
  } catch {
    state.members = DEFAULT_MEMBERS;
  }
}

async function refreshCompetitions() {
  try {
    state.competitions = await getCompetitions();
  } catch {
    // Static fallback (preview JSON in repo)
    try {
      const res = await fetch("/data/competitions.seed.preview.json");
      state.competitions = await res.json();
    } catch {
      state.competitions = [];
    }
  }

  // API returns nextDeadline; fallback JSON does not.
  const now = new Date();
  state.competitions = (state.competitions || []).map((c) => {
    if (!c || c.nextDeadline) return c;
    return { ...c, nextDeadline: computeNextDeadline(c, now) };
  });

  rerender();
}

function rerender() {
  const comps = filteredCompetitions();
  const rows = buildRows(comps);
  renderKPIs(comps);
  renderCompetitionList(rows);
  renderGantt(rows);
  renderMemberButton();
  syncControls();
}

async function main() {
  setStarDate();
  loadUIPreferences();
  setupHeaderControls();
  setupTimelineControls();
  await refreshMembers();
  ensureMemberSelected();
  renderMemberButton();

  if (!state.memberId) {
    openIdentityModal();
  }

  await refreshCompetitions();
  setupAI();

  const url = new URL(window.location.href);
  const openId = url.searchParams.get("open");
  if (openId) {
    // Clean the URL so refresh doesn't re-open.
    url.searchParams.delete("open");
    window.history.replaceState({}, "", url.pathname + url.search);
    openDrawer(openId);
  }
}

window.addEventListener("DOMContentLoaded", main);
