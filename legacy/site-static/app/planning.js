import { createMember, getCompetitions, getMembers } from "./api.js";
import { parseISODate, daysBetweenCeil } from "./date.js";
import { getString, setString } from "./storage.js";

const STORAGE_MEMBER_ID = "memberId";

const DEFAULT_MEMBERS = [
  { id: "member_gaoshenzhou", name: "高神舟", avatar_emoji: "🚀", avatar_color: "#13c8ec" },
  { id: "member_nierui", name: "聂睿", avatar_emoji: "🧠", avatar_color: "#f59e0b" },
  { id: "member_sunhuizhi", name: "孙慧智", avatar_emoji: "🧩", avatar_color: "#10b981" },
  { id: "member_yuzetong", name: "于泽通", avatar_emoji: "🛰️", avatar_color: "#ef4444" },
  { id: "member_gengxiaoran", name: "耿孝然", avatar_emoji: "⚙️", avatar_color: "#6366f1" },
];

const state = {
  memberId: null,
  members: [],
  competitions: [],
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function memberById(id) {
  return state.members.find((m) => m.id === id) || null;
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
  avatar.textContent = m.avatar_emoji || m.name.slice(0, 1);
  btn.style.background = m.avatar_color || "";
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
    <div class="relative w-full max-w-2xl bg-surface-darker border border-border-dark rounded-2xl shadow-2xl overflow-hidden">
      <div class="p-5 border-b border-border-dark flex items-center justify-between">
        <div>
          <div class="text-xs font-bold tracking-widest text-text-secondary uppercase">Identity</div>
          <div class="text-lg font-bold text-white">选择你的身份</div>
        </div>
        <button class="text-text-secondary hover:text-white" data-close type="button">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-3" id="member-cards"></div>
      <div class="p-5 border-t border-border-dark bg-surface-dark/60">
        <div class="text-sm font-bold text-white mb-3">新增成员</div>
        <form class="grid grid-cols-1 md:grid-cols-3 gap-3" id="member-create-form">
          <input class="rounded-lg border border-border-dark bg-surface-dark px-3 py-2 text-sm text-white" name="name" placeholder="姓名" required />
          <input class="rounded-lg border border-border-dark bg-surface-dark px-3 py-2 text-sm text-white" name="emoji" placeholder="头像 Emoji (可选)" />
          <div class="flex gap-2">
            <input class="flex-1 rounded-lg border border-border-dark bg-surface-dark px-3 py-2 text-sm text-white" name="color" placeholder="#13c8ec (可选)" />
            <button class="px-4 py-2 rounded-lg bg-primary text-background-dark text-sm font-bold hover:bg-[#4de1fc] transition-colors" type="submit">添加</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const cards = wrap.querySelector("#member-cards");
  for (const m of state.members) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "flex items-center gap-3 p-4 rounded-xl border border-border-dark bg-surface-dark hover:border-primary/40 hover:bg-white/5 transition-colors text-left";
    btn.innerHTML = `
      <div class="w-10 h-10 rounded-full grid place-items-center font-bold" style="background:${m.avatar_color || "#283639"};">
        <span class="text-sm" style="color:#0b1220;">${escapeHtml(m.avatar_emoji || m.name.slice(0, 1))}</span>
      </div>
      <div class="min-w-0">
        <div class="font-bold text-white truncate">${escapeHtml(m.name)}</div>
        <div class="text-xs text-text-secondary truncate">${escapeHtml(m.id)}</div>
      </div>
      ${state.memberId === m.id ? '<span class="ml-auto text-primary text-xs font-bold">当前</span>' : '<span class="ml-auto text-text-secondary text-xs">选择</span>'}
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
    } catch (err) {
      alert(`新增成员失败: ${err.message}`);
    }
  });

  return wrap;
}

function openIdentityModal() {
  openModal(identityModal());
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
    return { key: c.key, label: c.label, dateISO: c.date.toISOString().slice(0, 10), daysLeft: daysBetweenCeil(now, c.date) };
  }

  const past = candidates.sort((a, b) => b.date - a.date);
  if (past.length > 0) {
    const c = past[0];
    return { key: c.key, label: c.label, dateISO: c.date.toISOString().slice(0, 10), daysLeft: -daysBetweenCeil(c.date, now) };
  }

  return null;
}

function computeTop(list) {
  const withDl = list
    .map((c) => ({
      ...c,
      dl: typeof c.nextDeadline?.daysLeft === "number" ? c.nextDeadline.daysLeft : null,
    }))
    .filter((c) => c.dl !== null && c.dl >= 0)
    .sort((a, b) => a.dl - b.dl);

  const within7 = withDl.filter((c) => c.dl <= 7);
  const urgent = withDl.filter((c) => c.dl <= 3);

  return { withDl, within7, urgent };
}

function renderTop5(top) {
  const root = $("planning-top5");
  if (!root) return;
  root.innerHTML = "";

  const colors = [
    { bar: "bg-red-500", badge: "bg-red-500/20 text-red-400", label: "高优先级" },
    { bar: "bg-yellow-500", badge: "bg-yellow-500/20 text-yellow-400", label: "中等" },
    { bar: "bg-blue-500", badge: "bg-blue-500/20 text-blue-400", label: "普通" },
  ];

  for (let i = 0; i < Math.min(5, top.withDl.length); i++) {
    const c = top.withDl[i];
    const theme = colors[i === 0 ? 0 : i <= 2 ? 1 : 2];

    const owner = c.progress_owner_member_id ? memberById(c.progress_owner_member_id)?.name || c.progress_owner_member_id : "未分配";
    const title = c.display_name || c.name;
    const deadlineText = c.nextDeadline ? `${c.dl} 天后 • ${c.nextDeadline.label}` : "-";

    const card = document.createElement("div");
    card.className =
      "group bg-surface-dark hover:bg-surface-darker transition-colors rounded-lg border border-border-dark p-4 shadow-lg relative overflow-hidden";
    card.innerHTML = `
      <div class="absolute top-0 left-0 w-1 h-full ${theme.bar}"></div>
      <div class="flex justify-between items-start mb-3 pl-2 gap-3">
        <div class="min-w-0">
          <h5 class="font-bold text-white text-lg truncate">${escapeHtml(title)}</h5>
          <p class="text-xs text-text-secondary mt-1 truncate">${escapeHtml(deadlineText)} • 负责人: ${escapeHtml(owner)}</p>
        </div>
        <span class="${theme.badge} text-[10px] font-bold px-2 py-1 rounded uppercase shrink-0">${theme.label}</span>
      </div>
      <div class="pl-2 mt-2 flex gap-2">
        <a class="text-xs font-medium text-white bg-border-dark hover:bg-white/10 px-3 py-1.5 rounded transition-colors text-center" href="/?open=${encodeURIComponent(
          c.id
        )}">打开</a>
        <a class="text-xs font-medium text-primary border border-primary/30 hover:bg-primary/10 px-3 py-1.5 rounded transition-colors text-center" href="/">回到面板</a>
      </div>
    `;
    root.appendChild(card);
  }

  if (!top.withDl.length) {
    root.innerHTML = `<div class="text-text-secondary text-sm">暂无可计算的截止日期（可能缺少赛程日期）。</div>`;
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
    try {
      const res = await fetch("/data/competitions.seed.preview.json");
      state.competitions = await res.json();
    } catch {
      state.competitions = [];
    }
  }

  const now = new Date();
  state.competitions = (state.competitions || []).map((c) => {
    if (!c || c.nextDeadline) return c;
    return { ...c, nextDeadline: computeNextDeadline(c, now) };
  });
}

async function main() {
  await refreshMembers();

  const stored = getString(STORAGE_MEMBER_ID, null);
  if (stored && memberById(stored)) state.memberId = stored;

  renderMemberButton();
  $("member-button")?.addEventListener("click", openIdentityModal);

  if (!state.memberId) openIdentityModal();

  await refreshCompetitions();

  const top = computeTop(state.competitions);
  $("planning-active").textContent = String(top.within7.length);
  $("planning-urgent").textContent = String(top.urgent.length);
  renderTop5(top);
}

window.addEventListener("DOMContentLoaded", main);
