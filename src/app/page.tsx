"use client";
/* Paulsvee To do — v16 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { addDoneTaskToTrash } from "@/store/trashStore";
import { loadCategories, createCategory, type Category } from "@/store/categoryStore";
import TopNav from "@/components/TopNav";

// ─── 사이드바 아바타 컬러 (한줄 메모장 스타일) ───────────────────────────────────
const AVATAR_COLORS = ["#4a90d9","#5c6bc0","#26a69a","#66bb6a","#ef5350","#ab47bc","#ff7043","#42a5f5"];
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ─── JS Masonry 컬럼 훅 ────────────────────────────────────────────────────────
function useColumnCount(): number {
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 860) setCols(1);
      else if (w < 1300) setCols(2);
      else if (w < 1900) setCols(3);
      else if (w < 2400) setCols(4);
      else setCols(5);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type TodoItem = {
  id: string; text: string; done: boolean;
  createdAt: number;
};

type Panel = {
  id: string; title: string; color: string; createdAt: number;
  items: TodoItem[];
  categoryIds: string[];          // v16: 다중 카테고리
  categoryAssignedAt?: number | null;
  isSpecial?: boolean; bgImage?: string | null;
  isDream?: boolean;              // 드림에서 흡수된 패널 — 체크 시 이룸 표시
};

type AppState = {
  version: 4; appTitle: string; motto: string;
  activeCategoryId: string;
  layout: {
    expandedPanelIdsByCategory: Record<string, string[]>;
    collapsedPanelIds: string[];
    sidebarWidth: number;
  };
  panels: Panel[];
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "paulsvee_todo_v4";
const LEGACY_EXPANDED_PANEL_KEY = "psv-expanded-panel";
const LEGACY_COLLAPSED_PANELS_KEY = "psv-collapsed-panels";
const LEGACY_SIDEBAR_WIDTH_KEY = "todo_sidebar_w";

const defaultLayout = () => ({
  expandedPanelIdsByCategory: {} as Record<string, string[]>,
  collapsedPanelIds: [] as string[],
  sidebarWidth: 240,
});

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
const clampText = (s: string) => s.replace(/\s+/g, " ").trim();
const formatStamp = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
};

const extractPanelSum = (items: TodoItem[]): number | null => {
  let total = 0, found = false;
  for (const item of items) {
    const m = item.text.match(/:\s*([\d,]+)\s*$/);
    if (m) { const n = parseInt(m[1].replace(/,/g,""),10); if(!isNaN(n)){ total += item.done ? 0 : n; found = true; } }
  }
  return found ? total : null;
};
const formatNumber = (n: number) => n.toLocaleString("ko-KR");

function migratePanel(p: any): Panel {
  const items: TodoItem[] = Array.isArray(p.items)
    ? p.items.map((t: any) => t ? ({
        id: typeof t.id==="string"?t.id:uid(),
        text: typeof t.text==="string"?t.text:"",
        done: !!t.done,
        createdAt: typeof t.createdAt==="number"?t.createdAt:Date.now(),
      }) : null).filter(Boolean) as TodoItem[]
    : [];

  let categoryIds: string[] = [];
  if (Array.isArray(p.categoryIds)) {
    categoryIds = p.categoryIds.filter((x: any) => typeof x === "string");
  } else if (typeof p.categoryId === "string" && p.categoryId) {
    categoryIds = [p.categoryId];
  }

  return {
    id: typeof p.id==="string"?p.id:uid(),
    title: typeof p.title==="string"?p.title:"패널",
    color: typeof p.color==="string"?p.color:"#7c98ff",
    createdAt: typeof p.createdAt==="number"?p.createdAt:Date.now(),
    categoryIds,
    categoryAssignedAt: typeof p.categoryAssignedAt==="number"?p.categoryAssignedAt:null,
    isSpecial: !!p.isSpecial,
    bgImage: typeof p.bgImage==="string"?p.bgImage:null,
    items,
  };
}

const seedState = (): AppState => ({
  version: 4, appTitle: "Paulsvee To do", motto: "", activeCategoryId: "all",
  layout: defaultLayout(),
  panels: [
    { id: uid(), title: "할 일", color: "#e45b70", createdAt: Date.now(), categoryIds: [],
      items: [{ id: uid(), text: "항목 예시", done: false, createdAt: Date.now() }] },
  ],
});

function safeParseState(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const appTitle = typeof data.appTitle === "string" ? data.appTitle : "Paulsvee To do";
    const motto    = typeof data.motto    === "string" ? data.motto    : "";
    const activeCategoryId = typeof data.activeCategoryId === "string" ? data.activeCategoryId : "all";
    const layoutIn = data.layout && typeof data.layout === "object" ? data.layout : null;
    const panelsIn: Panel[] = Array.isArray(data.panels)
      ? data.panels.map((p: any) => p ? migratePanel(p) : null).filter(Boolean) as Panel[]
      : [];
    // 구버전 expandedPanelIds → expandedPanelIdsByCategory["all"] 로 마이그레이션
    let expandedPanelIdsByCategory: Record<string, string[]> = {};
    if (layoutIn?.expandedPanelIdsByCategory && typeof layoutIn.expandedPanelIdsByCategory === "object" && !Array.isArray(layoutIn.expandedPanelIdsByCategory)) {
      for (const [catId, ids] of Object.entries(layoutIn.expandedPanelIdsByCategory)) {
        if (Array.isArray(ids)) expandedPanelIdsByCategory[catId] = ids.filter((id: unknown): id is string => typeof id === "string");
      }
    } else if (Array.isArray(layoutIn?.expandedPanelIds) && layoutIn.expandedPanelIds.length > 0) {
      expandedPanelIdsByCategory["all"] = layoutIn.expandedPanelIds.filter((id: unknown): id is string => typeof id === "string");
    } else if (typeof layoutIn?.expandedPanelId === "string") {
      expandedPanelIdsByCategory["all"] = [layoutIn.expandedPanelId];
    }
    const layout = {
      expandedPanelIdsByCategory,
      collapsedPanelIds: Array.isArray(layoutIn?.collapsedPanelIds)
        ? layoutIn.collapsedPanelIds.filter((id: unknown): id is string => typeof id === "string")
        : [],
      sidebarWidth: typeof layoutIn?.sidebarWidth === "number" ? layoutIn.sidebarWidth : 240,
    };
    return { version: 4, appTitle, motto, activeCategoryId, layout, panels: panelsIn };
  } catch { return null; }
}

function tryMigrateFromV3(): AppState | null {
  try {
    const raw = localStorage.getItem("paulsvee_todo_v3");
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.panels) return null;
    return safeParseState(JSON.stringify({ ...data, version: 4, activeCategoryId: "all" }));
  } catch { return null; }
}

function absorbLegacyLayoutPrefs(state: AppState): AppState {
  try {
    const expandedPanelId = localStorage.getItem(LEGACY_EXPANDED_PANEL_KEY);
    const collapsedRaw = localStorage.getItem(LEGACY_COLLAPSED_PANELS_KEY);
    const sidebarWidthRaw = localStorage.getItem(LEGACY_SIDEBAR_WIDTH_KEY);
    const collapsedPanelIds = collapsedRaw
      ? JSON.parse(collapsedRaw)
      : state.layout.collapsedPanelIds;
    return {
      ...state,
      layout: {
        expandedPanelIdsByCategory: expandedPanelId
          ? { ...state.layout.expandedPanelIdsByCategory, all: [expandedPanelId] }
          : state.layout.expandedPanelIdsByCategory,
        collapsedPanelIds: Array.isArray(collapsedPanelIds)
          ? collapsedPanelIds.filter((id): id is string => typeof id === "string")
          : state.layout.collapsedPanelIds,
        sidebarWidth: sidebarWidthRaw ? Number(sidebarWidthRaw) || state.layout.sidebarWidth : state.layout.sidebarWidth,
      },
    };
  } catch {
    return state;
  }
}

function clearLegacyLayoutPrefs() {
  try {
    localStorage.removeItem(LEGACY_EXPANDED_PANEL_KEY);
    localStorage.removeItem(LEGACY_COLLAPSED_PANELS_KEY);
    localStorage.removeItem(LEGACY_SIDEBAR_WIDTH_KEY);
  } catch {}
}

// ─── 드림 → 메인 일회성 흡수 ──────────────────────────────────────────────────
async function absorbDreamOnce(
  mainState: AppState,
  mainCats: Category[]
): Promise<{ state: AppState; cats: Category[]; didMerge: boolean }> {
  let dreamPanels: Panel[] = [];
  let dreamCats: Category[] = [];
  try {
    const res = await fetch("/api/dream");
    if (res.ok) {
      const data = await res.json();
      dreamCats = Array.isArray(data.categories_dream) ? data.categories_dream : [];
      dreamPanels = Array.isArray(data.state?.panels)
        ? data.state.panels.map((p: any) => migratePanel(p))
        : [];
    }
  } catch {
    try {
      const raw = localStorage.getItem("paulsvee_todo_carousel_dream_v3");
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d?.panels)) dreamPanels = d.panels.map((p: any) => migratePanel(p));
      }
      dreamCats = loadCategories("dream");
    } catch {}
  }
  const dreamPanelIds = new Set(dreamPanels.map((p) => p.id));
  const mainPanelsWithoutDream = mainState.panels.filter((p) => !dreamPanelIds.has(p.id));
  const existingIds = new Set(mainCats.map((c) => c.id));
  const mergedCats = [...mainCats, ...dreamCats.filter((c) => !existingIds.has(c.id))];
  const mergedState: AppState = {
    ...mainState,
    panels: [...mainPanelsWithoutDream, ...dreamPanels.map((p) => ({ ...p, isDream: true }))],
  };
  // 드림 패널 없으면 재시도 방지용 플래그만 세움, 있으면 서버 저장 후 init에서 플래그 세움
  return { state: mergedState, cats: mergedCats, didMerge: dreamPanels.length > 0 };
}

function useDebouncedSave(state: AppState, categories: Category[], hydrated: boolean) {
  const latestState = useRef(state);
  const latestCats  = useRef(categories);
  latestState.current = state;
  latestCats.current  = categories;
  useEffect(() => {
    if (!hydrated) return; // 서버 로드 완료 전엔 저장 금지
    const t = window.setTimeout(() => {
      fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: latestState.current, categories_main: latestCats.current }),
      }).catch(() => {});
    }, 220);
    return () => window.clearTimeout(t);
  }, [state, categories, hydrated]);
}

type UndoEntry = AppState;
const MAX_UNDO = 20;

// ─── CategoryModal ────────────────────────────────────────────────────────────
function CategoryModal({ onConfirm, onCancel }: { onConfirm: (n: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div onClick={(e) => { if(e.target===e.currentTarget) onCancel(); }}
      style={{ position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background:"#14151c",border:"1px solid rgba(255,255,255,0.14)",borderRadius:16,padding:"22px 22px 18px",minWidth:280,boxShadow:"0 20px 60px rgba(0,0,0,0.65)" }}>
        <div style={{ fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.88)",marginBottom:14 }}>새 카테고리</div>
        <input ref={ref} value={val} onChange={(e) => setVal(e.target.value)} placeholder="카테고리 이름" maxLength={40}
          onKeyDown={(e) => { if(e.key==="Enter"&&val.trim()) onConfirm(val.trim()); if(e.key==="Escape") onCancel(); }}
          style={{ width:"100%",padding:"9px 12px",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:8,color:"rgba(255,255,255,0.88)",fontSize:13,outline:"none" }} />
        <div style={{ display:"flex",gap:8,marginTop:14,justifyContent:"flex-end" }}>
          <button onClick={onCancel} style={{ padding:"7px 14px",borderRadius:7,border:"1px solid rgba(255,255,255,0.14)",background:"none",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:12 }}>취소</button>
          <button onClick={() => val.trim() && onConfirm(val.trim())} disabled={!val.trim()}
            style={{ padding:"7px 14px",borderRadius:7,border:"none",background:val.trim()?"rgba(124,152,255,0.85)":"rgba(255,255,255,0.08)",color:val.trim()?"#fff":"rgba(255,255,255,0.30)",cursor:val.trim()?"pointer":"default",fontSize:12,fontWeight:700 }}>만들기</button>
        </div>
      </div>
    </div>
  );
}

function DeleteCatModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div onClick={(e) => { if(e.target===e.currentTarget) onCancel(); }}
      style={{ position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background:"#14151c",border:"1px solid rgba(255,255,255,0.14)",borderRadius:16,padding:"22px 22px 18px",minWidth:280,boxShadow:"0 20px 60px rgba(0,0,0,0.65)" }}>
        <div style={{ fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.88)",marginBottom:8 }}>카테고리 삭제</div>
        <div style={{ fontSize:13,color:"rgba(255,255,255,0.55)",marginBottom:20 }}>
          <span style={{ color:"rgba(255,255,255,0.88)",fontWeight:600 }}>"{name}"</span> 삭제 시 패널은 분류 없음으로 이동됩니다.
        </div>
        <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
          <button onClick={onCancel} style={{ padding:"7px 14px",borderRadius:7,border:"1px solid rgba(255,255,255,0.14)",background:"none",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:12 }}>취소</button>
          <button onClick={onConfirm} style={{ padding:"7px 14px",borderRadius:7,border:"none",background:"#e45b70",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700 }}>삭제</button>
        </div>
      </div>
    </div>
  );
}

// ─── ConfirmDeleteModal ───────────────────────────────────────────────────────
function ConfirmDeleteModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div onClick={(e) => { if(e.target===e.currentTarget) onCancel(); }}
      style={{ position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",justifyContent:"center" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background:"#14151c",border:"1px solid rgba(255,255,255,0.14)",borderRadius:16,padding:"22px 22px 18px",minWidth:280,boxShadow:"0 20px 60px rgba(0,0,0,0.65)" }}>
        <div style={{ fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.88)",marginBottom:8 }}>삭제 확인</div>
        <div style={{ fontSize:13,color:"rgba(255,255,255,0.55)",marginBottom:20 }}>{message}</div>
        <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
          <button onClick={onCancel} style={{ padding:"7px 14px",borderRadius:7,border:"1px solid rgba(255,255,255,0.14)",background:"none",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:12 }}>취소</button>
          <button onClick={onConfirm} style={{ padding:"7px 14px",borderRadius:7,border:"none",background:"#e45b70",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700 }}>삭제</button>
        </div>
      </div>
    </div>
  );
}

// ─── PanelDotsMenu (다중 카테고리 버튼 토글) ──────────────────────────────────
function PanelDotsMenu({ panel, categories, onToggleCategory, onToggleDream, onDelete, onClose }: {
  panel: Panel; categories: Category[];
  onToggleCategory: (catId: string) => void;
  onToggleDream: () => void;
  onDelete: () => void; onClose: () => void;
}) {
  return (
    <div className="panelMenuDim" onClick={(e) => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="panelMenuBox" onClick={(e) => e.stopPropagation()}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <span className="panelMenuTitle">패널 옵션</span>
          <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.40)",fontSize:20,lineHeight:1,padding:"2px 6px" }}>×</button>
        </div>
        {categories.length > 0 && (
          <>
            <div className="panelMenuTitle" style={{ marginTop:4 }}>카테고리 분류</div>
            <div className="panelMenuCategories">
              {categories.map((cat) => (
                <button key={cat.id}
                  className={`panelMenuCatBtn${panel.categoryIds.includes(cat.id) ? " selected" : ""}`}
                  onClick={() => onToggleCategory(cat.id)}>
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="panelMenuDivider" />
          </>
        )}
        <button onClick={onToggleDream}
          style={{ width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,0.10)",
            background: panel.isDream ? "rgba(124,152,255,0.18)" : "none",
            color: panel.isDream ? "rgba(124,152,255,1)" : "rgba(255,255,255,0.55)",
            cursor:"pointer",fontSize:12,textAlign:"left",display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {panel.isDream ? "이룸 모드 ON (클릭하여 해제)" : "이룸 모드 OFF (클릭하여 설정)"}
        </button>
        <div className="panelMenuDivider" />
        <button className="panelMenuDeleteBtn" onClick={() => { onDelete(); onClose(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M9 3h6m-8 4h10m-9 0l1 14h6l1-14M10 11v7m4-7v7M5 7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          패널 삭제
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ categories, activeCategoryId, panelCount, latestText, sidebarOpen,
  sidebarWidth, onSidebarWidthChange,
  onSelectCategory, onCreateCategory, onDeleteCategory, onRenameCategory, onClose,
}: {
  categories: Category[]; activeCategoryId: string; panelCount: (id: string) => number;
  latestText: (id: string) => string | undefined;
  sidebarOpen: boolean;
  sidebarWidth: number;
  onSidebarWidthChange: (width: number) => void;
  onSelectCategory: (id: string) => void; onCreateCategory: (name: string) => void;
  onDeleteCategory: (id: string) => void; onRenameCategory: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const resizing = useRef(false);

  return (
    <>
      {sidebarOpen && <div className="sidebarDim" onClick={onClose} />}
      <div className={`sidebar${sidebarOpen ? " open" : ""}`} style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
        <button className={`sidebarItem${activeCategoryId==="all"?" active":""}`}
          onClick={() => { onSelectCategory("all"); onClose(); }}>
          <span className="sidebarAvatar" style={{ background: "linear-gradient(135deg,#4a90d9,#5c6bc0)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 10h10M4 14h7M4 18h5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <span style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:2 }}>
            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>All</span>
            <span style={{ fontSize:11, color:"rgba(255,255,255,0.38)", fontWeight:400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {latestText("all") ?? `${panelCount("all")}개의 패널`}
            </span>
          </span>
          <span className="sidebarCount">{panelCount("all")}</span>
        </button>

        {categories.length > 0 && <div className="sidebarDivider" />}

        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id;
          const preview = latestText(cat.id);
          if (editingId === cat.id) return (
            <input key={cat.id} value={editVal} autoFocus
              onChange={(e) => setEditVal(e.target.value)}
              onBlur={() => { if(editVal.trim()&&editVal.trim()!==cat.name) onRenameCategory(cat.id,editVal.trim()); setEditingId(null); }}
              onKeyDown={(e) => { if(e.key==="Enter"){if(editVal.trim())onRenameCategory(cat.id,editVal.trim());setEditingId(null);} if(e.key==="Escape")setEditingId(null); }}
              style={{ width:"100%",padding:"7px 10px",margin:"1px 0",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.20)",borderRadius:8,color:"rgba(255,255,255,0.88)",fontSize:13,outline:"none" }}
            />
          );
          return (
            <div key={cat.id} className={`sidebarItem${isActive?" active":""}`} role="button" tabIndex={0}
              onClick={() => { onSelectCategory(cat.id); onClose(); }}
              onKeyDown={(e) => { if(e.key==="Enter"||e.key===" "){onSelectCategory(cat.id);onClose();} }}
              onDoubleClick={(e) => { e.stopPropagation(); setEditVal(cat.name); setEditingId(cat.id); }}>
              <span className="sidebarAvatar" style={{ background: avatarColor(cat.id) }}>
                {cat.name[0]?.toUpperCase() ?? "?"}
              </span>
              <span style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:2 }}>
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cat.name}</span>
                {preview && (
                  <span style={{ fontSize:11, color:"rgba(255,255,255,0.38)", fontWeight:400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {preview}
                  </span>
                )}
              </span>
              <span className="sidebarCount">{panelCount(cat.id)}</span>
              <button className="sidebarDelBtn" onClick={(e) => { e.stopPropagation(); setDeleteTarget(cat); }}
                onMouseEnter={(e) => (e.currentTarget.style.color="#ff6b6b")}
                onMouseLeave={(e) => (e.currentTarget.style.color="")}>✕</button>
            </div>
          );
        })}

        <button className="sidebarAddBtn" onClick={() => setShowCreate(true)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          카테고리 추가
        </button>

        {/* 리사이즈 핸들 */}
        <div className="sidebarResizeHandle"
          onMouseDown={(e) => {
            e.preventDefault();
            resizing.current = true;
            const startX = e.clientX;
            const startW = sidebarWidth;
            let lastW = startW;
            const onMove = (ev: MouseEvent) => {
              if (!resizing.current) return;
              const next = Math.min(400, Math.max(180, startW + ev.clientX - startX));
              lastW = next;
              onSidebarWidthChange(next);
            };
            const onUp = () => {
              resizing.current = false;
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
              onSidebarWidthChange(lastW);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
        />
      </div>

      {showCreate && <CategoryModal onConfirm={(name) => { onCreateCategory(name); setShowCreate(false); }} onCancel={() => setShowCreate(false)} />}
      {deleteTarget && <DeleteCatModal name={deleteTarget.name} onConfirm={() => { onDeleteCategory(deleteTarget.id); setDeleteTarget(null); }} onCancel={() => setDeleteTarget(null)} />}
    </>
  );
}

// ─── TodoComposer ─────────────────────────────────────────────────────────────
function TodoComposer({ onAdd }: { onAdd: (text: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="composer">
      <input className="todoInput" value={v} placeholder="할 일 입력 후 Enter"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if(e.key==="Enter"){onAdd(v);setV("");} }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Page() {
  const [hydrated, setHydrated]     = useState(false);
  const [state, setState]           = useState<AppState>(() => seedState());
  const [categories, setCategories] = useState<Category[]>([]);
  const [undo, setUndo]             = useState<UndoEntry[]>([]);
  const [toast, setToast]           = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dotsMenuPanelId, setDotsMenuPanelId] = useState<string | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<{ panelId: string; itemId: string } | null>(null);
  const [deletePanelTarget, setDeletePanelTarget] = useState<string | null>(null);
  const activeCatId = state.activeCategoryId;
  const expandedPanelSet = new Set(state.layout.expandedPanelIdsByCategory[activeCatId] ?? []);
  const collapsedPanels = new Set(state.layout.collapsedPanelIds);
  const sidebarWidth = state.layout.sidebarWidth;
  const setExpandedPanel = (id: string) => {
    setState((prev) => {
      const catId = prev.activeCategoryId;
      const cur = prev.layout.expandedPanelIdsByCategory[catId] ?? [];
      const next = cur.includes(id) ? cur.filter((pid) => pid !== id) : [...cur, id];
      return {
        ...prev,
        layout: {
          ...prev.layout,
          expandedPanelIdsByCategory: { ...prev.layout.expandedPanelIdsByCategory, [catId]: next },
        },
      };
    });
  };
  const setSidebarWidth = (width: number) => {
    setState((prev) => ({
      ...prev,
      layout: { ...prev.layout, sidebarWidth: width },
    }));
  };

  const dragPanelId = useRef<string | null>(null);
  const [panelDropHint, setPanelDropHint] = useState<{ targetId: string; before: boolean } | null>(null);
  const panelDropHintRef = useRef<{ targetId: string; before: boolean } | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const colCount = useColumnCount();
  const dragItem    = useRef<{ panelId: string; itemId: string } | null>(null);
  const [dropHint, setDropHint] = useState<{ panelId: string; beforeItemId: string | null } | null>(null);
  const specialInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    async function init() {
      try { localStorage.removeItem("paulsvee_dream_merged"); } catch {}
      // 1) 파일에서 로드 시도
      try {
        const res = await fetch("/api/todos");
        if (res.ok) {
          const data = await res.json();
          if (data.state) {
            const loaded = absorbLegacyLayoutPrefs(safeParseState(JSON.stringify(data.state)) ?? seedState());
            const cats: Category[] = Array.isArray(data.categories_main) ? data.categories_main : [];
            // 드림 일회성 흡수
            const { state: merged, cats: mergedCats, didMerge } = await absorbDreamOnce(loaded, cats);
            setState(merged);
            setCategories(mergedCats);
            if (didMerge) {
              // 서버 저장 성공 후 플래그 + localStorage 모두 갱신
              // (localStorage 갱신 안 하면 API 폴백 시 옛날 데이터로 덮어쓰는 버그 발생)
              try {
                await fetch("/api/todos", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ state: merged, categories_main: mergedCats }),
                });
              } catch { /* 실패 시 다음 로드에 재시도 */ }
            }
            clearLegacyLayoutPrefs();
          } else {
            // 파일이 비어 있음 → localStorage에서 마이그레이션 (최초 1회)
            const loaded = absorbLegacyLayoutPrefs(safeParseState(localStorage.getItem(STORAGE_KEY)) || tryMigrateFromV3() || seedState());
            const cats   = loadCategories("main");
            const { state: merged, cats: mergedCats, didMerge } = await absorbDreamOnce(loaded, cats);
            setState(merged);
            setCategories(mergedCats);
            setHydrated(true);
            if (didMerge) {
              try {
                await fetch("/api/todos", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ state: merged, categories_main: mergedCats }),
                });
              } catch {}
            }
            clearLegacyLayoutPrefs();
            return;
          }
          clearLegacyLayoutPrefs();
          setHydrated(true);
          return;
        }
      } catch {}

      // 2) API 실패 시 localStorage fallback — 서버 없을 땐 플래그 안 세움 (재시도 보장)
      const loaded = absorbLegacyLayoutPrefs(safeParseState(localStorage.getItem(STORAGE_KEY)) || tryMigrateFromV3() || seedState());
      const cats = loadCategories("main");
      const { state: merged, cats: mergedCats } = await absorbDreamOnce(loaded, cats);
      setState(merged);
      setCategories(mergedCats);
      clearLegacyLayoutPrefs();
      setHydrated(true);
    }
    init();
  }, []);

  useDebouncedSave(state, categories, hydrated);

  useEffect(() => {
    if (hydrated) document.title = state.appTitle || "To do";
  }, [state.appTitle, hydrated]);

  useEffect(() => {
    const byCategory = state.layout.expandedPanelIdsByCategory;
    const panelIds = new Set(state.panels.map((p) => p.id));
    let changed = false;
    const cleaned: Record<string, string[]> = {};
    for (const [catId, ids] of Object.entries(byCategory)) {
      const valid = ids.filter((id) => panelIds.has(id));
      cleaned[catId] = valid;
      if (valid.length !== ids.length) changed = true;
    }
    if (!changed) return;
    setState((prev) => ({
      ...prev,
      layout: { ...prev.layout, expandedPanelIdsByCategory: cleaned },
    }));
  }, [state.layout.expandedPanelIdsByCategory, state.panels]);

  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string, ms = 1200) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const pushUndo = useCallback((next: AppState) => {
    setUndo((prev) => [state, ...prev].slice(0, MAX_UNDO));
    setState(next);
  }, [state]);

  const doUndo = () => {
    setUndo((prev) => {
      if (!prev.length) return prev;
      const [top, ...rest] = prev;
      setState(top);
      showToast("되돌림 완료", 900);
      return rest;
    });
  };

  const updateCategories = (next: Category[]) => {
    setCategories(next);
    // 파일 저장은 useDebouncedSave 가 처리 (state + categories 함께 POST)
  };

  const togglePanelCollapse = (id: string) => {
    setState((prev) => {
      const next = new Set(prev.layout.collapsedPanelIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return {
        ...prev,
        layout: { ...prev.layout, collapsedPanelIds: [...next] },
      };
    });
  };

  const panels = state.panels;

  // ── Category actions ───────────────────────────────────────────────────────
  const addCategory = (name: string) => {
    const next = [...categories, createCategory(name)];
    updateCategories(next);
    showToast("카테고리 추가됨");
  };
  const deleteCategory = (id: string) => {
    updateCategories(categories.filter((c) => c.id !== id));
    pushUndo({
      ...state,
      panels: panels.map((p) => ({
        ...p,
        categoryIds: p.categoryIds.filter((cid) => cid !== id),
      })),
      activeCategoryId: state.activeCategoryId === id ? "all" : state.activeCategoryId,
    });
    showToast("카테고리 삭제됨");
  };
  const renameCategory = (id: string, name: string) => {
    updateCategories(categories.map((c) => c.id === id ? { ...c, name } : c));
  };
  const setActiveCategory = (id: string) => {
    pushUndo({ ...state, activeCategoryId: id });
  };

  // ── Panel actions ──────────────────────────────────────────────────────────
  const addPanel = () => {
    const categoryIds = state.activeCategoryId === "all" ? [] : [state.activeCategoryId];
    pushUndo({ ...state, panels: [...panels, { id: uid(), title: "P", color: "#7c98ff", createdAt: Date.now(), items: [], categoryIds, categoryAssignedAt: categoryIds.length ? Date.now() : null }] });
  };
  const addSpecialPanel = () => {
    const categoryIds = state.activeCategoryId === "all" ? [] : [state.activeCategoryId];
    pushUndo({ ...state, panels: [...panels, { id: uid(), title: "Special", color: "#7c98ff", createdAt: Date.now(), items: [], isSpecial: true, bgImage: null, categoryIds, categoryAssignedAt: categoryIds.length ? Date.now() : null }] });
    showToast("스페셜 패널 추가됨");
  };
  const deletePanel = (id: string) => { pushUndo({ ...state, panels: panels.filter((p) => p.id !== id) }); showToast("패널 삭제됨 (되돌림 가능)", 1400); };

  const togglePanelDream = (panelId: string) => {
    pushUndo({ ...state, panels: panels.map((p) => p.id === panelId ? { ...p, isDream: !p.isDream } : p) });
  };

  const togglePanelCategory = (panelId: string, catId: string) => {
    pushUndo({
      ...state,
      panels: panels.map((p) => {
        if (p.id !== panelId) return p;
        const already = p.categoryIds.includes(catId);
        const categoryIds = already
          ? p.categoryIds.filter((id) => id !== catId)
          : [...p.categoryIds, catId];
        return { ...p, categoryIds, categoryAssignedAt: Date.now() };
      }),
    });
  };

  // 색상 변경은 undo 없이 즉각 반영 (드래그 중 상태 손실 방지)
  const setPanelColor = (id: string, color: string) =>
    setState((prev) => ({ ...prev, panels: prev.panels.map((p) => p.id === id ? { ...p, color } : p) }));

  const renamePanel = (id: string, title: string) => pushUndo({ ...state, panels: panels.map((p) => p.id === id ? { ...p, title } : p) });

  const setPanelBgImage = (id: string, dataUrl: string | null) =>
    pushUndo({ ...state, panels: panels.map((p) => p.id === id ? { ...p, isSpecial: true, bgImage: dataUrl } : p) });

  const onPickPanelImage = (panelId: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const d = typeof reader.result==="string"?reader.result:null; if(d){ setPanelBgImage(panelId,d); showToast("배경 이미지 설정됨"); } };
    reader.readAsDataURL(file);
  };
  const clearPanelImage = (panelId: string) => {
    setPanelBgImage(panelId, null);
    const el = specialInputRefs.current[panelId]; if(el) el.value="";
    showToast("배경 이미지 제거됨");
  };

  // ── Item actions ───────────────────────────────────────────────────────────
  const addItem = (panelId: string, text: string) => {
    const t = clampText(text); if(!t) return;
    pushUndo({ ...state, panels: panels.map((p) => p.id===panelId ? { ...p, items:[{id:uid(),text:t,done:false,createdAt:Date.now()},...p.items] } : p) });
  };
  const updateItemText = (panelId: string, itemId: string, text: string) =>
    pushUndo({ ...state, panels: panels.map((p) => p.id===panelId ? { ...p, items:p.items.map((it) => it.id===itemId?{...it,text}:it) } : p) });

  const toggleItem = (panelId: string, itemId: string) => {
    const p = panels.find((x) => x.id===panelId);
    const it = p?.items.find((x) => x.id===itemId);
    if (!p || !it) return;
    if (p.isDream) {
      // 드림 패널 — 체크해도 패널에 남음, 이룸 표시만
      const nd = !it.done;
      pushUndo({ ...state, panels: panels.map((px) => px.id===panelId ? { ...px, items:px.items.map((x) => x.id===itemId?{...x,done:nd}:x) } : px) });
      showToast(nd ? "이룸 표시 ✓" : "이룸 해제", 900);
    } else {
      // 일반 패널 — 휴지통으로 이동
      addDoneTaskToTrash({ id:it.id, title:it.text, categoryId:p.id, categoryName:p.title, originPanelTitle:p.title, createdAt:new Date(it.createdAt).toISOString(), doneAt:new Date().toISOString() });
      pushUndo({ ...state, panels: panels.map((px) => px.id===panelId ? { ...px, items:px.items.filter((x) => x.id!==itemId) } : px) });
      showToast("휴지통으로 이동", 900);
    }
  };

  const deleteItem = (panelId: string, itemId: string) => {
    pushUndo({ ...state, panels: panels.map((p) => p.id===panelId ? { ...p, items:p.items.filter((it) => it.id!==itemId) } : p) });
    showToast("항목 삭제됨 (되돌림 가능)", 1400);
  };

  // ── DnD panels (document-level pointer listeners) ─────────────────────────
  const panelElemsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [panelDragging, setPanelDragging] = useState<string | null>(null);
  const panelsRef = useRef(panels); panelsRef.current = panels;
  const stateRef = useRef(state); stateRef.current = state;
  const pushUndoRef = useRef(pushUndo); pushUndoRef.current = pushUndo;

  const getPanelAtPoint = (x: number, y: number): { targetId: string; before: boolean } | null => {
    for (const [id, el] of panelElemsRef.current.entries()) {
      if (id === dragPanelId.current) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { targetId: id, before: x < r.left + r.width / 2 };
      }
    }
    return null;
  };

  const onGrabPointerDown = (panelId: string, e: React.PointerEvent) => {
    dragPanelId.current = panelId;
    setPanelDragging(panelId);

    const onMove = (ev: PointerEvent) => {
      const hit = getPanelAtPoint(ev.clientX, ev.clientY);
      if (hit) {
        if (panelDropHintRef.current?.targetId !== hit.targetId || panelDropHintRef.current?.before !== hit.before) {
          panelDropHintRef.current = hit;
          setPanelDropHint({ ...hit });
        }
      } else {
        // 패널 위가 아닐 때 — 시각만 숨기고 ref는 마지막 유효값 유지
        setPanelDropHint(null);
      }
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      const fromId = dragPanelId.current;
      const hint = panelDropHintRef.current ?? getPanelAtPoint(ev.clientX, ev.clientY);
      dragPanelId.current = null; panelDropHintRef.current = null;
      setPanelDropHint(null); setPanelDragging(null);
      if (!fromId) return;
      if (!hint) return;
      const cur = panelsRef.current; const cs = stateRef.current;
      const fi = cur.findIndex((p) => p.id === fromId); if (fi < 0) return;
      const next = [...cur]; const [m] = next.splice(fi, 1);
      const ti = next.findIndex((p) => p.id === hint.targetId); if (ti < 0) return;
      const insertAt = hint.before ? ti : ti + 1;
      next.splice(insertAt, 0, m);
      showToast(`${fi}→${insertAt}`, 3000);
      pushUndoRef.current({ ...cs, panels: next });
    };

    // capture:true — React 루트보다 먼저 받아서 stopPropagation 영향 없음
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
  };

  // ── DnD items ──────────────────────────────────────────────────────────────
  const reorderItem = (panelId: string, itemId: string, beforeItemId: string | null) => {
    const p = panels.find((x) => x.id===panelId); if(!p) return;
    const fi = p.items.findIndex((x) => x.id===itemId); if(fi<0) return;
    const items = [...p.items]; const [m] = items.splice(fi,1);
    let ti = beforeItemId ? items.findIndex((x) => x.id===beforeItemId) : items.length;
    if(ti<0) ti = items.length; items.splice(ti,0,m);
    pushUndo({ ...state, panels: panels.map((x) => x.id===panelId?{...x,items}:x) });
  };
  const onItemDragStart = (panelId: string, itemId: string) => { dragItem.current = { panelId, itemId }; };
  const onItemDragOver  = (panelId: string, beforeItemId: string | null) => {
    const cur = dragItem.current; if(!cur||cur.panelId!==panelId) return;
    setDropHint({ panelId, beforeItemId });
  };
  const onItemDrop = (panelId: string, beforeItemId: string | null) => {
    const cur = dragItem.current; dragItem.current = null; setDropHint(null);
    if(!cur||cur.panelId!==panelId) return;
    reorderItem(panelId, cur.itemId, beforeItemId);
  };
  const onItemDragEnd = () => { dragItem.current = null; setDropHint(null); };

  // ── Filtered panels ────────────────────────────────────────────────────────
  const visiblePanels = state.activeCategoryId === "all"
    ? panels
    : panels.filter((p) => p.categoryIds.includes(state.activeCategoryId));

  const panelCount = (id: string) => id === "all" ? panels.length : panels.filter((p) => p.categoryIds.includes(id)).length;
  const latestText = (id: string): string | undefined => {
    const pool = id === "all" ? panels : panels.filter((p) => p.categoryIds.includes(id));
    const allItems = pool.flatMap((p) => p.items).sort((a, b) => b.createdAt - a.createdAt);
    return allItems[0]?.text;
  };
  const dotsPanel = dotsMenuPanelId ? panels.find((p) => p.id===dotsMenuPanelId) ?? null : null;

  if (!hydrated) return (
    <main className="app">
      <div className="topbar"><div className="titleBlock"><div className="skeletonTitle"/><div className="skeletonSub"/></div></div>
    </main>
  );

  const renderPanelArticle = (p: Panel) => {
    const catNames = p.categoryIds
      .map((cid) => categories.find((c) => c.id===cid)?.name)
      .filter(Boolean) as string[];
    const isExpanded = expandedPanelSet.has(p.id);
    return (
      <article className={`panel${panelDragging === p.id ? " panel--dragging" : ""}`}
        ref={(el) => { if (el) panelElemsRef.current.set(p.id, el); else panelElemsRef.current.delete(p.id); }}
        style={{ ["--panel" as any]: p.color, ...(p.bgImage ? {
          backgroundImage:`linear-gradient(180deg,rgba(0,0,0,0.62),rgba(0,0,0,0.62)),url(${p.bgImage})`,
          backgroundSize:"cover",backgroundPosition:"center",backgroundRepeat:"no-repeat"
        } : {}) }}
      >
        {panelDropHint?.targetId === p.id && (
          <div className={`panelDropLine ${panelDropHint.before ? "before" : "after"}`}/>
        )}
        <header className="panelHeader">
          <span className="grabBtn"
            onPointerDown={(e) => onGrabPointerDown(p.id, e)}
            title="패널 이동">⠿</span>
          <div className="panelTitleWrap">
            <div className="dotColorWrap" title="클릭해서 색상 변경"
              onClick={() => colorInputRefs.current[p.id]?.click()}>
              <span className="dot"/>
              <input
                type="color"
                className="dotColorInput"
                value={p.color}
                ref={(el) => { colorInputRefs.current[p.id] = el; }}
                onChange={(e) => setPanelColor(p.id, e.target.value)}
              />
            </div>
            <div style={{ minWidth:0, display:"flex", alignItems:"center", gap:8 }}>
              <input className="panelTitle" value={p.title} onChange={(e) => renamePanel(p.id,e.target.value)}/>
            </div>
          </div>
          <div className="panelRight">
            {catNames.length > 0 && (
              <span className="panelCatBadge">{catNames.join(" / ")}</span>
            )}
            <button className="collapseBtn" onClick={() => togglePanelCollapse(p.id)} title="접기/펼치기">
              {collapsedPanels.has(p.id) ? '▸' : '▾'}
            </button>
            <button
              className={`expandBtn${isExpanded ? " active" : ""}`}
              onClick={() => setExpandedPanel(p.id)}
              title={isExpanded ? "원래대로" : "가로 꽉 채우기"}
            >
              {isExpanded ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M9 9L4 4M4 4h5M4 4v5M15 9l5-5M20 4h-5M20 4v5M9 15l-5 5M4 20h5M4 20v-5M15 15l5 5M20 20h-5M20 20v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <button className="dotsBtn" onClick={() => setDotsMenuPanelId(p.id)} title="패널 옵션">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="5" cy="12" r="1.8" fill="currentColor"/>
                <circle cx="12" cy="12" r="1.8" fill="currentColor"/>
                <circle cx="19" cy="12" r="1.8" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </header>

        {!collapsedPanels.has(p.id) && <>
        <div className="panelTools">
          {p.isSpecial && (
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
              <label className="secondaryBtn" style={{ height:34,padding:"0 14px",borderRadius:999,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,cursor:"pointer" }}>
                img
                <input type="file" accept="image/*" style={{ display:"none" }}
                  ref={(el) => { specialInputRefs.current[p.id]=el; }}
                  onChange={(e) => onPickPanelImage(p.id,e.currentTarget.files?.[0]??null)}/>
              </label>
              {p.bgImage && (
                <button className="dangerBtn" onClick={() => clearPanelImage(p.id)} style={{ width:34,height:34 }} title="배경 이미지 삭제">×</button>
              )}
            </div>
          )}
          <TodoComposer onAdd={(t) => addItem(p.id,t)}/>
        </div>

        <ul className="list">
          {p.items.map((it) => {
            const hintHere = dropHint?.panelId===p.id && dropHint?.beforeItemId===it.id;
            return (
              <React.Fragment key={it.id}>
                {hintHere && <div className="dropLine"/>}
                <li className={`item${p.isDream && it.done ? " specialDone" : it.done ? " done" : ""}`} draggable
                  onDragStart={() => onItemDragStart(p.id,it.id)}
                  onDragOver={(e) => { if(dragItem.current) { e.preventDefault(); onItemDragOver(p.id,it.id); } }}
                  onDrop={() => onItemDrop(p.id,it.id)} onDragEnd={onItemDragEnd}>
                  <button className={`itemGrab${p.isDream && it.done ? " specialDoneGrab" : ""}`} title="드래그">
                    {p.isDream && it.done
                      ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : "⋮⋮"}
                  </button>
                  <input className="chk" type="checkbox" checked={it.done} onChange={() => toggleItem(p.id,it.id)}/>
                  <div className="itemMain">
                    <input className={`itemText${it.done ? " done" : ""}`} value={it.text}
                      onChange={(e) => updateItemText(p.id,it.id,e.target.value)}/>
                  </div>
                  <div className="itemMeta">{formatStamp(it.createdAt)}</div>
                  <button className="xBtn" onClick={() => setDeleteItemTarget({ panelId: p.id, itemId: it.id })}>×</button>
                </li>
              </React.Fragment>
            );
          })}
          {dropHint?.panelId===p.id && dropHint?.beforeItemId===null && <div className="dropLine"/>}
          <li className="endDropZone"
            onDragOver={(e) => { if(dragItem.current) { e.preventDefault(); onItemDragOver(p.id,null); } }}
            onDrop={() => { if(dragItem.current) onItemDrop(p.id,null); }}/>
        </ul>

        {p.isSpecial && (() => {
          const sum = extractPanelSum(p.items);
          if(sum===null) return null;
          return <div className="sumBar"><span className="sumLabel">합계</span><span className="sumValue">{formatNumber(sum)}</span></div>;
        })()}
        </> }
      </article>
    );
  };

  return (
    <main className="app">
      <TopNav current="main" titleValue={state.appTitle} mottoValue={state.motto}
        onChangeTitle={(v) => pushUndo({...state,appTitle:v})}
        onChangeMotto={(v) => pushUndo({...state,motto:v})}
        sidebarToggle={
          <button className="hamburgerBtn" onClick={() => setSidebarOpen((o) => !o)} aria-label="메뉴">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        }
      >
        <button className="iconBtn" onClick={doUndo} disabled={undo.length===0} title="되돌림">↶</button>
        <button className="primaryBtn" onClick={addPanel} title="패널 추가">P</button>
        <button className="primaryBtn" onClick={addSpecialPanel} title="스페셜 패널">S</button>
      </TopNav>

      <div className="appBody">
        <Sidebar categories={categories} activeCategoryId={state.activeCategoryId}
          panelCount={panelCount} latestText={latestText} sidebarOpen={sidebarOpen}
          sidebarWidth={sidebarWidth} onSidebarWidthChange={setSidebarWidth}
          onSelectCategory={(id) => { setActiveCategory(id); setSidebarOpen(false); }}
          onCreateCategory={addCategory} onDeleteCategory={deleteCategory}
          onRenameCategory={renameCategory} onClose={() => setSidebarOpen(false)} />

        <div className="mainContent" ref={mainContentRef}>
          <section className="panelRow" aria-label="Panels">
            {Array.from(expandedPanelSet).map((expandedId) => {
              const ep = visiblePanels.find((p) => p.id === expandedId);
              if (!ep) return null;
              return (
                <div key={expandedId} className="expandedPanelRow">
                  {renderPanelArticle(ep)}
                </div>
              );
            })}
            <div className="panelMasonry">
            {(() => {
              const nonExpanded = visiblePanels.filter((p) => !expandedPanelSet.has(p.id));
              const colArrays: typeof visiblePanels[] = Array.from({ length: colCount }, () => []);
              nonExpanded.forEach((p, i) => colArrays[i % colCount].push(p));
              return colArrays.map((colPanels, ci) => (
                <div key={ci} className="masonryCol">
                  {colPanels.map((p) => (
                <React.Fragment key={p.id}>
                  {renderPanelArticle(p)}
                </React.Fragment>
              ))}
                </div>
              ));
            })()}
            </div>
          </section>
        </div>
      </div>

      {dotsPanel && (
        <PanelDotsMenu panel={dotsPanel} categories={categories}
          onToggleCategory={(catId) => togglePanelCategory(dotsPanel.id, catId)}
          onToggleDream={() => togglePanelDream(dotsPanel.id)}
          onDelete={() => { setDeletePanelTarget(dotsPanel.id); setDotsMenuPanelId(null); }}
          onClose={() => setDotsMenuPanelId(null)}/>
      )}

      {deleteItemTarget && (
        <ConfirmDeleteModal
          message="이 항목을 삭제할까요?"
          onConfirm={() => { deleteItem(deleteItemTarget.panelId, deleteItemTarget.itemId); setDeleteItemTarget(null); }}
          onCancel={() => setDeleteItemTarget(null)}
        />
      )}

      {deletePanelTarget && (
        <ConfirmDeleteModal
          message="패널을 삭제하면 모든 항목이 사라집니다. 정말 삭제할까요?"
          onConfirm={() => { deletePanel(deletePanelTarget); setDeletePanelTarget(null); }}
          onCancel={() => setDeletePanelTarget(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
