import { useEffect, useMemo, useRef, useState } from "react";
import {
  Cloud,
  CloudOff,
  Hand,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  Move,
  Plus,
  Redo,
  StickyNote,
  Trash2,
  Type,
  Undo,
} from "lucide-react";
import { getWhiteboard, putWhiteboard } from "../../../lib/api";
import { getString, setString } from "../../../lib/storage";
import type { WhiteboardDoc, WhiteboardItem, WhiteboardItemType } from "../../../lib/types";
import { useV3App } from "../state/v3Context";

type Tool = "select" | "hand";

const NOTE_COLORS = ["#fef08a", "#bae6fd", "#bbf7d0", "#fbcfe8"];

function storageKey(competitionId: string) {
  return `v3:whiteboard:${competitionId}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function initials(name: string) {
  const s = String(name || "").trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
}

function updatedAt(item: WhiteboardItem): number {
  return Number.isFinite(Number(item.updated_at)) ? Number(item.updated_at) : 0;
}

function safeParseItems(raw: string | null): WhiteboardItem[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .map((x: any) => {
        if (!x || typeof x !== "object") return null;
        const id = typeof x.id === "string" ? x.id : null;
        const type = x.type as WhiteboardItemType;
        if (!id) return null;
        if (type !== "note" && type !== "image" && type !== "text") return null;
        return {
          id,
          type,
          x: Number.isFinite(x.x) ? x.x : 0,
          y: Number.isFinite(x.y) ? x.y : 0,
          content: typeof x.content === "string" ? x.content : "",
          color: typeof x.color === "string" ? x.color : undefined,
          rotation: Number.isFinite(x.rotation) ? x.rotation : undefined,
          author: typeof x.author === "string" ? x.author : undefined,
          updated_at: Number.isFinite(x.updated_at) ? x.updated_at : undefined,
          deleted: typeof x.deleted === "boolean" ? x.deleted : undefined,
        } satisfies WhiteboardItem;
      })
      .filter(Boolean)
      .slice(0, 500) as WhiteboardItem[];
  } catch {
    return [];
  }
}

function prune(items: WhiteboardItem[]): WhiteboardItem[] {
  const list = items.slice(0, 800);
  if (list.length <= 500) return list;
  // Keep most recently touched items/tombstones.
  return list
    .slice()
    .sort((a, b) => updatedAt(b) - updatedAt(a))
    .slice(0, 500);
}

function mergeItems(remote: WhiteboardItem[], local: WhiteboardItem[]): WhiteboardItem[] {
  const map = new Map<string, WhiteboardItem>();
  for (const it of local) {
    map.set(it.id, it);
  }
  for (const it of remote) {
    const cur = map.get(it.id);
    if (!cur) {
      map.set(it.id, it);
      continue;
    }
    const ta = updatedAt(cur);
    const tb = updatedAt(it);
    if (tb > ta || tb === ta) map.set(it.id, it); // remote wins ties
  }
  return prune(Array.from(map.values()));
}

function equalLoose(a: WhiteboardItem[], b: WhiteboardItem[]): boolean {
  if (a.length !== b.length) return false;
  // Deterministic compare: sort by id.
  const aa = a.slice().sort((x, y) => x.id.localeCompare(y.id));
  const bb = b.slice().sort((x, y) => x.id.localeCompare(y.id));
  return JSON.stringify(aa) === JSON.stringify(bb);
}

export default function Whiteboard(props: { competitionId: string }) {
  const { competitionsSource, currentUser } = useV3App();
  const remoteEnabled = competitionsSource === "api";
  const competitionIdRef = useRef(props.competitionId);
  const sessionRef = useRef(0);

  const [items, setItems] = useState<WhiteboardItem[]>([]);
  const itemsRef = useRef<WhiteboardItem[]>([]);

  const [remoteVersion, setRemoteVersion] = useState(0);
  const remoteVersionRef = useRef(0);

  const [syncMode, setSyncMode] = useState<"offline" | "syncing" | "synced">("offline");
  const suppressNextSyncRef = useRef(false);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);

  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // screen-space px
  const [tool, setTool] = useState<Tool>("select");
  const [spaceHand, setSpaceHand] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPointerId, setDragPointerId] = useState<number | null>(null);

  const [isPanning, setIsPanning] = useState(false);
  const [panPointerId, setPanPointerId] = useState<number | null>(null);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOrigin, setPanOrigin] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    competitionIdRef.current = props.competitionId;
  }, [props.competitionId]);

  const isCurrentSession = (session: number, competitionId: string): boolean =>
    session === sessionRef.current && competitionIdRef.current === competitionId;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    remoteVersionRef.current = remoteVersion;
  }, [remoteVersion]);

  const scale = zoom / 100;

  const zoomAt = (nextZoom: number, clientX: number, clientY: number) => {
    const z = clamp(nextZoom, 10, 200);
    const el = containerRef.current;
    if (!el) {
      setZoom(z);
      return;
    }
    const rect = el.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const prevScale = scale;
    const nextScale = z / 100;
    if (prevScale <= 0 || nextScale <= 0) {
      setZoom(z);
      return;
    }

    // Keep the point under the cursor stable while zooming.
    const worldX = (cx - pan.x) / prevScale;
    const worldY = (cy - pan.y) / prevScale;
    const nextPanX = cx - worldX * nextScale;
    const nextPanY = cy - worldY * nextScale;
    setPan({ x: nextPanX, y: nextPanY });
    setZoom(z);
  };

  const visibleItems = useMemo(() => items.filter((i) => !i.deleted), [items]);
  const selected = useMemo(() => visibleItems.find((i) => i.id === selectedId) || null, [selectedId, visibleItems]);

  const applyRemote = (wb: WhiteboardDoc, merged?: WhiteboardItem[]) => {
    suppressNextSyncRef.current = true;
    setItems(merged || wb.items);
    setRemoteVersion(wb.version);
    setSyncMode("synced");
  };

  const syncNow = async (opts?: { forceItems?: WhiteboardItem[]; forceBaseVersion?: number }) => {
    if (!remoteEnabled) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    const session = sessionRef.current;
    inFlightRef.current = true;
    const id = props.competitionId;
    if (!isCurrentSession(session, id)) {
      inFlightRef.current = false;
      return;
    }
    setSyncMode("syncing");
    const baseVersion = opts?.forceBaseVersion ?? remoteVersionRef.current;
    const local = prune(opts?.forceItems ?? itemsRef.current);

    try {
      const wb = await putWhiteboard(id, { items: local, baseVersion });
      if (!isCurrentSession(session, id)) return;
      applyRemote(wb);
      try {
        const bc = new BroadcastChannel("mmc:whiteboard");
        bc.postMessage({ competitionId: id, version: wb.version, items: wb.items });
        bc.close();
      } catch {
        // ignore
      }
    } catch (e: any) {
      if (e && e.status === 409 && e.data?.error?.current) {
        const cur = e.data.error.current as WhiteboardDoc;
        const merged = mergeItems(cur.items || [], local);
        try {
          const wb2 = await putWhiteboard(id, { items: merged, baseVersion: cur.version });
          if (!isCurrentSession(session, id)) return;
          applyRemote(wb2);
          try {
            const bc = new BroadcastChannel("mmc:whiteboard");
            bc.postMessage({ competitionId: id, version: wb2.version, items: wb2.items });
            bc.close();
          } catch {
            // ignore
          }
        } catch {
          // Keep local state, but mark as offline to avoid spamming.
          if (isCurrentSession(session, id)) setSyncMode("offline");
        }
      } else {
        if (isCurrentSession(session, id)) setSyncMode("offline");
      }
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current && isCurrentSession(session, id)) {
        queuedRef.current = false;
        // Schedule a microtask so state updates settle.
        queueMicrotask(() => syncNow());
      }
    }
  };

  // Load + persist + remote hydrate
  useEffect(() => {
    sessionRef.current += 1;
    const session = sessionRef.current;
    const id = props.competitionId;
    const local = safeParseItems(getString(storageKey(props.competitionId), null));
    suppressNextSyncRef.current = true;
    setItems(local);
    setRemoteVersion(0);

    setSelectedId(null);
    setDragItemId(null);
    setDragPointerId(null);
    setIsDragging(false);
    setIsPanning(false);
    setPanPointerId(null);
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setTool("select");
    setSpaceHand(false);

    let cancelled = false;
    if (remoteEnabled) {
      setSyncMode("syncing");
      (async () => {
        try {
          const wb = await getWhiteboard(id);
          if (cancelled || !isCurrentSession(session, id)) return;
          const merged = wb.items && wb.items.length ? mergeItems(wb.items, local) : prune(local);
          applyRemote(wb, merged);
          // Migrate local-only data to server if needed.
          if (!equalLoose(wb.items || [], merged)) {
            await syncNow({ forceItems: merged, forceBaseVersion: wb.version });
          }
        } catch {
          if (cancelled) return;
          setSyncMode("offline");
        }
      })();
    } else {
      setSyncMode("offline");
    }

    return () => {
      cancelled = true;
    };
  }, [props.competitionId, remoteEnabled]);

  useEffect(() => {
    // Debounce localStorage writes to avoid jank while dragging.
    const key = storageKey(props.competitionId);
    const t = window.setTimeout(() => {
      try {
        setString(key, JSON.stringify(itemsRef.current));
      } catch {
        // ignore storage errors (quota/private mode)
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [items, props.competitionId]);

  useEffect(() => {
    // Flush on unmount/competition switch so closing the drawer won't lose the last drag.
    const key = storageKey(props.competitionId);
    return () => {
      try {
        setString(key, JSON.stringify(itemsRef.current));
      } catch {
        // ignore
      }
    };
  }, [props.competitionId]);

  // Remote sync (debounced write-through)
  useEffect(() => {
    if (!remoteEnabled) return;
    if (suppressNextSyncRef.current) {
      suppressNextSyncRef.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      syncNow();
    }, 500);
    return () => window.clearTimeout(t);
  }, [items, remoteEnabled]);

  // Remote polling (pull) + cross-tab sync.
  useEffect(() => {
    if (!remoteEnabled) return;
    const session = sessionRef.current;
    const id = props.competitionId;

    let stopped = false;
    const pull = async () => {
      if (stopped || !isCurrentSession(session, id)) return;
      if (inFlightRef.current) return;
      try {
        const wb = await getWhiteboard(id);
        if (stopped || !isCurrentSession(session, id)) return;
        const curVer = remoteVersionRef.current;
        if (Number(wb.version) > Number(curVer)) {
          const merged = mergeItems(wb.items || [], itemsRef.current);
          applyRemote(wb, merged);
        }
      } catch {
        // ignore transient pull errors
      }
    };

    const interval = window.setInterval(() => {
      pull();
    }, 5000);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("mmc:whiteboard");
      bc.onmessage = (ev) => {
        const msg: any = ev.data || null;
        if (!msg || msg.competitionId !== id || !isCurrentSession(session, id)) return;
        const nextVer = Number(msg.version) || 0;
        if (nextVer <= remoteVersionRef.current) return;
        const merged = mergeItems(Array.isArray(msg.items) ? (msg.items as WhiteboardItem[]) : [], itemsRef.current);
        applyRemote({ competition_id: id, items: merged, version: nextVer, updated_at: null }, merged);
      };
    } catch {
      // ignore
    }

    return () => {
      stopped = true;
      window.clearInterval(interval);
      if (bc) bc.close();
    };
  }, [props.competitionId, remoteEnabled]);

  useEffect(() => {
    const key = storageKey(props.competitionId);
    const flushLocal = () => {
      try {
        setString(key, JSON.stringify(itemsRef.current));
      } catch {
        // ignore
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushLocal();
      if (document.visibilityState === "visible" && remoteEnabled) void syncNow();
    };
    const onOnline = () => {
      if (remoteEnabled) void syncNow();
    };
    const onBeforeUnload = () => {
      flushLocal();
      if (remoteEnabled) void syncNow();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [props.competitionId, remoteEnabled]);

  const touchItem = (id: string, next: Partial<WhiteboardItem>) => {
    const now = Date.now();
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...next, author: next.author || currentUser, updated_at: now } : it))
    );
  };

  const handlePointerDownItem = (e: React.PointerEvent, id: string) => {
    if (tool !== "select") return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(id);

    const item = visibleItems.find((i) => i.id === id);
    if (!item) return;

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / scale;
    const mouseY = (e.clientY - rect.top - pan.y) / scale;

    setDragOffset({ x: mouseX - item.x, y: mouseY - item.y });
    setDragItemId(id);
    setDragPointerId(e.pointerId);
    setIsDragging(true);

    try {
      containerRef.current.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!containerRef.current) return;

    if (isDragging && dragItemId) {
      if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / scale;
      const mouseY = (e.clientY - rect.top - pan.y) / scale;
      const nextX = mouseX - dragOffset.x;
      const nextY = mouseY - dragOffset.y;
      touchItem(dragItemId, { x: nextX, y: nextY });
      return;
    }

    if (isPanning) {
      if (panPointerId !== null && e.pointerId !== panPointerId) return;
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan({ x: panOrigin.x + dx, y: panOrigin.y + dy });
    }
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e && (dragPointerId !== null || panPointerId !== null)) {
      try {
        containerRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    setIsDragging(false);
    setDragItemId(null);
    setDragPointerId(null);
    setIsPanning(false);
    setPanPointerId(null);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("[data-wb-ui]")) return;

    if (tool === "hand") {
      e.preventDefault();
      setSelectedId(null);
      setIsPanning(true);
      setPanPointerId(e.pointerId);
      setPanStart({ x: e.clientX, y: e.clientY });
      setPanOrigin(pan);
      try {
        containerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    setSelectedId(null);
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    const now = Date.now();
    setItems((prev) => prev.map((i) => (i.id === selectedId ? { ...i, deleted: true, updated_at: now } : i)));
    setSelectedId(null);
  };

  const addNote = () => {
    const id = Date.now().toString(36);
    const rect = containerRef.current?.getBoundingClientRect() || null;
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 300;
    const worldX = (cx - pan.x) / scale;
    const worldY = (cy - pan.y) / scale;
    const noteSize = 48 * 4; // Tailwind w-48 / h-48 => 192px at 100%
    const now = Date.now();
    const newItem: WhiteboardItem = {
      id,
      type: "note",
      content: "点击编辑...",
      x: Math.round(worldX - noteSize / 2),
      y: Math.round(worldY - noteSize / 2),
      color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
      author: currentUser,
      rotation: (Math.random() - 0.5) * 6,
      updated_at: now,
    };
    setItems((prev) => prune([...prev, newItem]));
    setTool("select");
    setSelectedId(id);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("[data-wb-ui]")) return;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "textarea" || tag === "input") return;

    // Trackpad/pointer wheel: pan. Pinch (ctrl/meta): zoom.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const next = Math.round(zoom * Math.exp(-e.deltaY / 200));
      zoomAt(next, e.clientX, e.clientY);
      return;
    }

    if (e.deltaX !== 0 || e.deltaY !== 0) {
      e.preventDefault();
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const typing = tag === "input" || tag === "textarea" || Boolean(target?.isContentEditable);
      if (typing) return;

      const key = String(e.key || "");
      const lower = key.toLowerCase();

      // Tool shortcuts (prototype parity).
      if (lower === "v") {
        setTool("select");
        setSpaceHand(false);
        return;
      }
      if (lower === "h") {
        setTool("hand");
        setSpaceHand(false);
        return;
      }

      // Hold Space to temporarily switch to hand tool.
      if (key === " " && tool === "select" && !spaceHand) {
        e.preventDefault();
        setTool("hand");
        setSpaceHand(true);
        return;
      }

      if (key === "Backspace" || key === "Delete") {
        if (!selectedId) return;
        const now = Date.now();
        setItems((prev) => prev.map((i) => (i.id === selectedId ? { ...i, deleted: true, updated_at: now } : i)));
        setSelectedId(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (String(e.key || "") !== " ") return;
      if (!spaceHand) return;
      setTool("select");
      setSpaceHand(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedId, spaceHand, tool]);

  // If selected item disappears (deleted by remote), clear selection.
  useEffect(() => {
    if (!selectedId) return;
    const still = visibleItems.some((i) => i.id === selectedId);
    if (!still) setSelectedId(null);
  }, [selectedId, visibleItems]);

  const syncLabel = syncMode === "syncing" ? "同步中" : syncMode === "synced" ? "已同步" : "离线";
  const SyncIcon = syncMode === "synced" ? Cloud : CloudOff;

  return (
    <div
      className={["absolute inset-0 bg-background-dark overflow-hidden touch-none", tool === "hand" ? "cursor-grab active:cursor-grabbing" : "cursor-default"].join(" ")}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerDown={handleCanvasPointerDown}
      onWheel={handleWheel}
      ref={containerRef}
    >
      {/* Dot Grid Background */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgb(var(--v3-border)) 1px, transparent 1px)",
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* Toolbar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50" data-wb-ui>
        <div className="flex items-center gap-1 p-1.5 bg-surface-dark/90 backdrop-blur-xl border border-border-dark rounded-full shadow-2xl">
          <button
            onClick={() => setTool("select")}
            className={["p-2.5 rounded-full transition-colors", tool === "select" ? "bg-primary text-[#111816]" : "text-text-secondary hover:text-white hover:bg-border-dark/70"].join(" ")}
            title="选择工具 (V)"
            type="button"
            aria-label="Select tool"
          >
            <MousePointer2 size={20} className="fill-current" />
          </button>
          <button
            onClick={() => setTool("hand")}
            className={["p-2.5 rounded-full transition-colors", tool === "hand" ? "bg-primary text-[#111816]" : "text-text-secondary hover:text-white hover:bg-border-dark/70"].join(" ")}
            title="漫游 (H)"
            type="button"
            aria-label="Hand tool"
          >
            <Hand size={20} />
          </button>
          <div className="w-px h-6 bg-border-dark mx-1"></div>
          <button
            onClick={addNote}
            className="p-2.5 rounded-full text-text-secondary hover:text-white hover:bg-border-dark/70 transition-colors"
            title="添加便签"
            type="button"
            aria-label="Add note"
          >
            <StickyNote size={20} />
          </button>
          <button
            className="p-2.5 rounded-full text-text-secondary hover:text-white hover:bg-border-dark/70 transition-colors"
            title="文本（占位）"
            type="button"
            aria-label="Text (placeholder)"
          >
            <Type size={20} />
          </button>
          <button
            className="p-2.5 rounded-full text-text-secondary hover:text-white hover:bg-border-dark/70 transition-colors"
            title="图片（占位）"
            type="button"
            aria-label="Image (placeholder)"
          >
            <ImageIcon size={20} />
          </button>

          {selected ? (
            <>
              <div className="w-px h-6 bg-border-dark mx-1"></div>
              <button
                onClick={handleDeleteSelected}
                className="p-2.5 rounded-full text-rose-400 hover:text-white hover:bg-rose-500/20 transition-colors"
                title="删除选中 (Del)"
                type="button"
                aria-label="Delete selected"
              >
                <Trash2 size={20} />
              </button>
            </>
          ) : null}

          <div className="w-px h-6 bg-border-dark mx-1"></div>
          <button className="p-2.5 rounded-full text-text-secondary hover:text-white hover:bg-border-dark/70 transition-colors" type="button" aria-label="Undo (placeholder)">
            <Undo size={20} />
          </button>
          <button className="p-2.5 rounded-full text-text-secondary hover:text-white hover:bg-border-dark/70 transition-colors" type="button" aria-label="Redo (placeholder)">
            <Redo size={20} />
          </button>
        </div>
      </div>

      {/* Zoom Controls */}
      <div className="absolute bottom-8 right-8 z-50 flex items-center gap-2 bg-surface-dark/90 backdrop-blur border border-border-dark p-1.5 rounded-lg shadow-lg" data-wb-ui>
        <button
          onClick={() => {
            const rect = containerRef.current?.getBoundingClientRect() || null;
            const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
            const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
            zoomAt(zoom - 10, cx, cy);
          }}
          className="p-1 text-text-secondary hover:text-white"
          type="button"
          aria-label="Zoom out"
        >
          <Minus size={16} />
        </button>
        <span className="text-xs font-mono text-white w-8 text-center">{zoom}%</span>
        <button
          onClick={() => {
            const rect = containerRef.current?.getBoundingClientRect() || null;
            const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
            const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
            zoomAt(zoom + 10, cx, cy);
          }}
          className="p-1 text-text-secondary hover:text-white"
          type="button"
          aria-label="Zoom in"
        >
          <Plus size={16} />
        </button>

        <div className="w-px h-5 bg-border-dark/60 mx-1"></div>
        <div className="flex items-center gap-1 pr-1.5 text-[10px] font-bold text-text-secondary">
          <SyncIcon size={14} className={syncMode === "syncing" ? "animate-pulse" : ""} />
          <span>{syncLabel}</span>
        </div>
      </div>

      {/* Canvas Content */}
      <div className="absolute inset-0 origin-top-left will-change-transform" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
        {visibleItems.map((item) => (
          <div
            key={item.id}
            className={["absolute shadow-xl hover:shadow-2xl transition-shadow group", tool === "select" ? "cursor-move" : ""].join(" ")}
            style={{
              left: item.x,
              top: item.y,
              transform: `rotate(${item.rotation || 0}deg)`,
              zIndex: dragItemId === item.id ? 100 : selectedId === item.id ? 50 : 1,
            }}
            onPointerDown={(e) => handlePointerDownItem(e, item.id)}
          >
            {item.type === "note" ? (
              <div className="w-48 h-48 p-4 text-[#111816] font-medium leading-relaxed flex flex-col relative" style={{ backgroundColor: item.color || NOTE_COLORS[0], fontFamily: '"Comic Sans MS", "Chalkboard SE", sans-serif' }}>
                <div className="opacity-40 mb-2 flex justify-between">
                  <StickyNote size={16} className="fill-current" />
                  {tool === "select" ? <Move size={14} className="opacity-0 group-hover:opacity-50" /> : null}
                </div>
                <textarea
                  className="bg-transparent w-full h-full resize-none focus:outline-none touch-auto"
                  value={item.content}
                  onChange={(e) => touchItem(item.id, { content: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                <div className="absolute bottom-2 left-2 flex items-center gap-1 opacity-60 pointer-events-none">
                  <div className="w-5 h-5 rounded-full bg-white/50 flex items-center justify-center text-[10px] font-bold">{initials(item.author || "U")}</div>
                </div>
                {selectedId === item.id ? <div className="absolute inset-0 border-2 border-primary pointer-events-none animate-pulse"></div> : null}
              </div>
            ) : item.type === "image" ? (
              <div className="bg-white p-2 rounded-lg transform rotate-2">
                <div className="bg-gray-200 w-48 h-32 rounded flex items-center justify-center text-gray-400">
                  <ImageIcon size={32} />
                </div>
                <div className="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded shadow">关键截图</div>
              </div>
            ) : (
              <div className="text-white text-2xl font-bold border border-dashed border-transparent hover:border-primary p-2 rounded">{item.content}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
