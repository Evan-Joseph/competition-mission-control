import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Bell, Menu, Search } from "lucide-react";
import { parseYMD, todayYMD, type YMD } from "../../../lib/date";
import { createUser as createUserApi, listUsers as listUsersApi } from "../../../lib/api";
import { DEFAULT_MEMBERS, getCurrentIdentityUser, setCurrentIdentityUser, subscribeIdentityChanged } from "../../../lib/identity";
import { getString, setString } from "../../../lib/storage";
import { isMissedRegistration } from "../../../domain/competitionEvents";
import { invalidCompetitionReason, isCompetitionEnded, nextCompetitionDue } from "../../../domain/competitionSchedule";
import CompetitionDrawer from "../drawer/CompetitionDrawer";
import Sidebar from "../components/Sidebar";
import SettingsModal from "../modals/SettingsModal";
import { useCompetitionsData } from "../state/useCompetitionsData";
import { useStableNowTick } from "../state/useStableNowTick";
import { V3AppProvider } from "../state/v3Context";

function initials(name: string) {
  const s = String(name || "").trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
}

export default function AppShell() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeSearch, setActiveSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [users, setUsers] = useState<string[]>(() => [...DEFAULT_MEMBERS]);
  const [currentUser, setCurrentUserState] = useState<string>(() => getCurrentIdentityUser());

  const openId = (searchParams.get("open") || "").trim() || null;

  const now = useStableNowTick(60_000);
  const todayISO: YMD = todayYMD(now);

  const { competitionsQ, competitions, competitionsSource, competitionsById, saveCompetition } = useCompetitionsData();
  const usersQ = useQuery({
    queryKey: ["users"],
    queryFn: listUsersApi,
    enabled: true,
    refetchInterval: 15_000,
  });
  const backendUnavailable = competitionsSource !== "api";
  const backendErrorText =
    competitionsQ.error instanceof Error && competitionsQ.error.message
      ? competitionsQ.error.message
      : "无法连接后端数据源。请使用 Cloudflare Pages Functions / Wrangler Pages Dev 启动。";

  useEffect(() => {
    const data = usersQ.data || [];
    if (!data.length) return;
    setUsers(data);
    const cur = getCurrentIdentityUser();
    if (!data.includes(cur)) {
      setCurrentIdentityUser(data[0]!);
      setCurrentUserState(getCurrentIdentityUser());
    }
  }, [usersQ.data]);

  useEffect(() => {
    const syncIdentity = () => {
      setCurrentUserState(getCurrentIdentityUser());
    };
    syncIdentity();
    return subscribeIdentityChanged(syncIdentity);
  }, []);

  const setCurrentUser = (name: string) => {
    const res = setCurrentIdentityUser(name);
    setCurrentUserState(res.currentUser);
  };

  const addUser = async (name: string): Promise<{ ok: boolean; reason?: string }> => {
    const next = String(name || "").trim();
    if (!next) return { ok: false, reason: "姓名不能为空" };
    try {
      const created = await createUserApi(next);
      setUsers((prev) => (prev.includes(created) ? prev : [...prev, created]));
      setCurrentIdentityUser(created);
      setCurrentUserState(getCurrentIdentityUser());
      void usersQ.refetch();
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "添加失败" };
    }
  };

  const [dismissedNotifIds, setDismissedNotifIds] = useState<string[]>(() => {
    try {
      const raw = getString("v3:notif:dismissed", "[]") || "[]";
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  });

  const notifications = useMemo(() => {
    const today = parseYMD(todayISO);
    const todayTime = today ? today.getTime() : null;
    const msDay = 24 * 60 * 60 * 1000;

    const dismissed = new Set(dismissedNotifIds);
    const out: {
      id: string;
      tone: "rose" | "amber" | "blue";
      title: string;
      body: string;
      right: string;
      sortTime: number;
      competitionId?: string;
    }[] = [];

    for (const c of competitions) {
      const invalid = invalidCompetitionReason(c);
      if (invalid) {
        const id = `invalid:${c.id}`;
        if (!dismissed.has(id)) {
          out.push({ id, tone: "amber", title: "日期异常", body: `${c.name}：${invalid}`, right: "需修复", sortTime: 0, competitionId: c.id });
        }
        continue;
      }

      const missed = isMissedRegistration(c, todayISO);
      const ended = isCompetitionEnded(c, todayISO);
      if (missed || ended) continue;

      const due = nextCompetitionDue(c, todayISO);
      if (!due) {
        if (c.registered) {
          const id = `no_milestone:${c.id}`;
          if (!dismissed.has(id)) {
            out.push({
              id,
              tone: "blue",
              title: "待补全节点",
              body: `${c.name}：已报名但缺少提交/结果时间`,
              right: "待定",
              sortTime: Number.POSITIVE_INFINITY,
              competitionId: c.id,
            });
          }
        }
        continue;
      }

      const days = todayTime === null ? null : Math.round((due.time - todayTime) / msDay);
      if (days === null) continue;

      if (days <= 0) {
        const id = `due_today:${due.kind}:${c.id}:${due.iso}`;
        if (!dismissed.has(id)) {
          out.push({
            id,
            tone: "rose",
            title: "今日到期",
            body: `${c.name}：${due.label}（${due.iso}）`,
            right: due.iso,
            sortTime: due.time,
            competitionId: c.id,
          });
        }
        continue;
      }

      if (days <= 1) {
        const id = `due_24h:${due.kind}:${c.id}:${due.iso}`;
        if (!dismissed.has(id)) {
          out.push({
            id,
            tone: "rose",
            title: "24小时内",
            body: `${c.name}：${due.label}（${due.iso}）`,
            right: due.iso,
            sortTime: due.time,
            competitionId: c.id,
          });
        }
        continue;
      }

      if (days <= 3) {
        const id = `due_soon:${due.kind}:${c.id}:${due.iso}`;
        if (!dismissed.has(id)) {
          out.push({
            id,
            tone: "amber",
            title: "临期提醒",
            body: `${c.name}：${due.label} 还有 ${days} 天`,
            right: due.iso,
            sortTime: due.time,
            competitionId: c.id,
          });
        }
      }
    }

    const toneRank = (t: string) => (t === "rose" ? 2 : t === "amber" ? 1 : 0);
    out.sort((a, b) => toneRank(b.tone) - toneRank(a.tone) || a.sortTime - b.sortTime || a.title.localeCompare(b.title));
    return out.slice(0, 8);
  }, [competitions, dismissedNotifIds, todayISO]);

  const markAllRead = () => {
    if (!notifications.length) return;
    const next = Array.from(new Set([...dismissedNotifIds, ...notifications.map((n) => n.id)])).slice(-500);
    setDismissedNotifIds(next);
    try {
      setString("v3:notif:dismissed", JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const dismissOne = (id: string) => {
    if (dismissedNotifIds.includes(id)) return;
    const next = [...dismissedNotifIds, id].slice(-500);
    setDismissedNotifIds(next);
    try {
      setString("v3:notif:dismissed", JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (String(e.key || "").toLowerCase() !== "k") return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setParam = (k: string, v: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
      return next;
    });
  };

  const openCompetition = (id: string) => {
    setParam("open", id);
  };
  const closeDrawer = () => setParam("open", null);

  const drawerCompetition = openId ? competitionsById.get(openId) || null : null;

  return (
    <V3AppProvider
      value={{
        todayISO,
        competitions,
        competitionsSource,
        competitionsById,
        saveCompetition,
        currentUser,
        users,
        setCurrentUser,
        addUser,
        openId,
        openCompetition,
        closeDrawer,
      }}
    >
      <div className="flex h-screen w-full bg-background-dark font-sans selection:bg-primary selection:text-[#111816]">
        {/* Desktop Sidebar */}
        <Sidebar openId={openId} onOpenSettings={() => setIsSettingsOpen(true)} />

        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen ? (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
            <div className="relative h-full w-64 animate-slide-in-left">
              <Sidebar
                openId={openId}
                onOpenSettings={() => setIsSettingsOpen(true)}
                className="w-full h-full"
                onCloseMobile={() => setIsMobileMenuOpen(false)}
              />
            </div>
          </div>
        ) : null}

        {/* Main Content Wrapper */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative">
          {/* Header */}
          <header className="h-16 border-b border-border-dark bg-background-dark/90 backdrop-blur-md flex items-center justify-between px-6 z-20 flex-shrink-0">
            <div className="flex items-center gap-4">
              <button className="md:hidden text-white" onClick={() => setIsMobileMenuOpen(true)} type="button" aria-label="Open menu">
                <Menu size={24} />
              </button>

              {/* Global Search */}
                <div className="relative group hidden md:block">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-secondary group-focus-within:text-primary">
                  <Search size={16} />
                </div>
                <input
                  ref={searchRef}
                  id="global-search"
                  type="text"
                  className="block w-64 bg-surface-dark text-white rounded-xl border border-border-dark py-2 pl-10 pr-3 text-sm placeholder:text-text-secondary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  placeholder="搜索 (Cmd+K)"
                  value={activeSearch}
                  onChange={(e) => setActiveSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Notifications */}
              <div className="relative">
                <button
                  className={["relative text-text-secondary hover:text-white transition-colors", isNotifOpen ? "text-white" : ""].join(" ")}
                  onClick={() => setIsNotifOpen((x) => !x)}
                  type="button"
                  aria-label="Notifications"
                >
                  <Bell size={20} />
	                  {notifications.length ? (
	                    <span className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full border-2 border-background-dark"></span>
	                  ) : null}
	                </button>

                {isNotifOpen ? (
                  <>
	                    <div className="fixed inset-0 z-10" onClick={() => setIsNotifOpen(false)}></div>
	                    <div className="absolute right-0 mt-3 w-80 bg-surface-dark border border-border-dark rounded-xl shadow-2xl z-20 overflow-hidden animate-fade-in">
	                      <div className="px-4 py-3 border-b border-border-dark flex justify-between items-center">
	                        <h3 className="text-white font-bold text-sm">通知</h3>
	                        <button className="text-xs text-primary disabled:opacity-50" type="button" onClick={markAllRead} disabled={!notifications.length}>
	                          全部标记为已读
	                        </button>
	                      </div>
	                      <div className="max-h-[300px] overflow-y-auto">
	                        {notifications.length ? (
	                          notifications.map((n, idx) => (
	                            <div
	                              key={n.id}
	                              className={["p-4 hover:bg-background-dark cursor-pointer transition-colors", idx !== notifications.length - 1 ? "border-b border-border-dark/50" : ""].join(" ")}
	                              onClick={() => {
	                                dismissOne(n.id);
	                                setIsNotifOpen(false);
	                                if (n.competitionId) openCompetition(n.competitionId);
	                              }}
	                              role="button"
	                              tabIndex={0}
	                              onKeyDown={(e) => {
	                                if (e.key !== "Enter" && e.key !== " ") return;
	                                dismissOne(n.id);
	                                setIsNotifOpen(false);
	                                if (n.competitionId) openCompetition(n.competitionId);
	                              }}
	                            >
	                              <div className="flex justify-between items-start mb-1 gap-3">
	                                <span
	                                  className={[
	                                    "text-xs font-bold shrink-0",
	                                    n.tone === "rose" ? "text-rose-400" : n.tone === "amber" ? "text-amber-300" : "text-blue-300",
	                                  ].join(" ")}
	                                >
	                                  {n.title}
	                                </span>
	                                <span className="text-[10px] text-text-secondary font-mono shrink-0">{n.right}</span>
	                              </div>
	                              <p className="text-white text-sm">{n.body}</p>
	                            </div>
	                          ))
	                        ) : (
	                          <div className="p-8 text-center text-text-secondary text-sm">暂无通知</div>
	                        )}
	                      </div>
	                    </div>
	                  </>
	                ) : null}
	              </div>

              {/* Profile */}
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="h-8 px-2 rounded-full bg-gradient-to-tr from-primary to-blue-500 border-2 border-surface-dark text-[#111816] font-bold text-xs flex items-center gap-1.5 hover:brightness-105 transition"
                title={`当前成员：${currentUser}`}
              >
                <span className="w-4 h-4 rounded-full bg-[#111816]/15 grid place-items-center text-[10px] font-black">{initials(currentUser)}</span>
                <span className="hidden sm:inline max-w-20 truncate">{currentUser}</span>
              </button>
            </div>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-auto scroll-smooth bg-background-dark">
            {backendUnavailable ? (
              <div className="mx-6 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <span className="font-semibold">后端连接不可用：</span>
                <span className="ml-1">{backendErrorText}</span>
              </div>
            ) : null}
            <Outlet />
          </div>

          {/* Modals */}
          {drawerCompetition ? (
            <CompetitionDrawer
              competition={drawerCompetition}
              todayISO={todayISO}
              onClose={closeDrawer}
              onSave={async (patch) => {
                await saveCompetition(drawerCompetition.id, patch);
              }}
            />
          ) : null}

          {isSettingsOpen ? <SettingsModal onClose={() => setIsSettingsOpen(false)} users={users} currentUser={currentUser} onSwitchUser={setCurrentUser} onAddUser={addUser} /> : null}
        </main>
      </div>
    </V3AppProvider>
  );
}
