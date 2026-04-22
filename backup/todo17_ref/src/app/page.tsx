"use client";
/* Paulsvee To do — v16 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { addDoneTaskToTrash } from "@/store/trashStore";
import { loadCategories, saveCategories, createCategory, type Category } from "@/store/categoryStore";
import TopNav from "@/components/TopNav";

// ─── JS Masonry 컬럼 훅 ────────────────────────────────────────────────────────
function useColumnCount(): number {
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 760) setCols(1);
      else if (w < 1100) setCols(2);
      else if (w < 1600) setCols(3);
      else if (w < 2000) setCols(4);
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
};

type AppState = {
  version: 4; appTitle: string; motto: string;
  activeCategoryId: string; panels: Panel[];
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "paulsvee_todo_v4";

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
    if (m) { const n = parseInt(m[1].replace(/,/g,""),10); if(!isNaN(n)){ total += item.done ? -n : n; found = true; } }
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
    const panelsIn: Panel[] = Array.isArray(data.panels)
      ? data.panels.map((p: any) => p ? migratePanel(p) : null).filter(Boolean) as Panel[]
      : [];
    return { version: 4, appTitle, motto, activeCategoryId, panels: panelsIn };
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

function useDebouncedSave(state: AppState) {
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current)); } catch {}
    }, 220);
    return () => window.clearTimeout(t);
  }, [state]);
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

// ─── PanelDotsMenu (다중 카테고리 버튼 토글) ──────────────────────────────────
function PanelDotsMenu({ panel, categories, onToggleCategory, onDelete, onClose }: {
  panel: Panel; categories: Category[];
  onToggleCategory: (catId: string) => void;
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
function Sidebar({ categories, activeCategoryId, panelCount, sidebarOpen,
  onSelectCategory, onCreateCategory, onDeleteCategory, onRenameCategory, onClose,
}: {
  categories: Category[]; activeCategoryId: string; panelCount: (id: string) => number;
  sidebarOpen: boolean;
  onSelectCategory: (id: string) => void; onCreateCategory: (name: string) => void;
  onDeleteCategory: (id: string) => void; onRenameCategory: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  return (
    <>
      {sidebarOpen && <div className="sidebarDim" onClick={onClose} />}
      <div className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <button className={`sidebarItem${activeCategoryId==="all"?" active":""}`}
          onClick={() => { onSelectCategory("all"); onClose(); }}>
          <span style={{ fontSize:14,color:activeCategoryId==="all"?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.30)" }}>·</span>
          <span style={{ flex:1 }}>All</span>
          <span className="sidebarCount">{panelCount("all")}</span>
        </button>

        {categories.length > 0 && <div className="sidebarDivider" />}

        {categories.map((cat) => {
          const count = panelCount(cat.id);
          const isActive = activeCategoryId === cat.id;
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
              <span style={{ fontSize:14,color:isActive?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.30)" }}>·</span>
              <span style={{ flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{cat.name}</span>
              {count > 0 && <span className="sidebarCount">{count}</span>}
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
      <button className="secondaryBtn" onClick={() => { onAdd(v); setV(""); }}>추가</button>
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

  const dragPanelId = useRef<string | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const colCount = useColumnCount();
  const dragItem    = useRef<{ panelId: string; itemId: string } | null>(null);
  const [dropHint, setDropHint] = useState<{ panelId: string; beforeItemId: string | null } | null>(null);
  const specialInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const loaded = safeParseState(localStorage.getItem(STORAGE_KEY)) || tryMigrateFromV3();
    if (loaded) setState(loaded);
    setCategories(loadCategories("main"));
    setHydrated(true);
  }, []);

  useDebouncedSave(state);

  useEffect(() => {
    if (hydrated) document.title = state.appTitle || "To do";
  }, [state.appTitle, hydrated]);

  const showToast = useCallback((msg: string, ms = 1200) => {
    setToast(msg); window.setTimeout(() => setToast(null), ms);
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
    saveCategories(next, "main");
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
    // 체크(done 여부 무관) → 항상 휴지통으로 이동
    addDoneTaskToTrash({ id:it.id, title:it.text, categoryId:p.id, categoryName:p.title, originPanelTitle:p.title, createdAt:new Date(it.createdAt).toISOString(), doneAt:new Date().toISOString() });
    pushUndo({ ...state, panels: panels.map((px) => px.id===panelId ? { ...px, items:px.items.filter((x) => x.id!==itemId) } : px) });
    showToast("휴지통으로 이동", 900);
  };

  const deleteItem = (panelId: string, itemId: string) => {
    pushUndo({ ...state, panels: panels.map((p) => p.id===panelId ? { ...p, items:p.items.filter((it) => it.id!==itemId) } : p) });
    showToast("항목 삭제됨 (되돌림 가능)", 1400);
  };

  // ── DnD panels ─────────────────────────────────────────────────────────────
  const onPanelDragStart = (id: string) => { dragPanelId.current = id; };
  const onPanelDrop = (targetId: string) => {
    const fromId = dragPanelId.current; dragPanelId.current = null;
    if (!fromId || fromId===targetId) return;
    const fi = panels.findIndex((p) => p.id===fromId), ti = panels.findIndex((p) => p.id===targetId);
    if (fi<0||ti<0) return;
    const next = [...panels]; const [m] = next.splice(fi,1); next.splice(ti,0,m);
    pushUndo({ ...state, panels: next });
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
    : panels.filter((p) => p.categoryIds.includes(state.activeCategoryId))
        .sort((a, b) => (a.categoryAssignedAt ?? a.createdAt) - (b.categoryAssignedAt ?? b.createdAt));

  const panelCount = (id: string) => id === "all" ? panels.length : panels.filter((p) => p.categoryIds.includes(id)).length;
  const dotsPanel = dotsMenuPanelId ? panels.find((p) => p.id===dotsMenuPanelId) ?? null : null;

  if (!hydrated) return (
    <main className="app">
      <div className="topbar"><div className="titleBlock"><div className="skeletonTitle"/><div className="skeletonSub"/></div></div>
    </main>
  );

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
          panelCount={panelCount} sidebarOpen={sidebarOpen}
          onSelectCategory={(id) => { setActiveCategory(id); setSidebarOpen(false); }}
          onCreateCategory={addCategory} onDeleteCategory={deleteCategory}
          onRenameCategory={renameCategory} onClose={() => setSidebarOpen(false)} />

        <div className="mainContent" ref={mainContentRef}>
          <section className="panelRow" aria-label="Panels">
            {(() => {
              const colArrays: typeof visiblePanels[] = Array.from({ length: colCount }, () => []);
              visiblePanels.forEach((p, i) => colArrays[i % colCount].push(p));
              return colArrays.map((colPanels, ci) => (
                <div key={ci} className="masonryCol">
                  {colPanels.map((p) => {
                    const catNames = p.categoryIds
                      .map((cid) => categories.find((c) => c.id===cid)?.name)
                      .filter(Boolean) as string[];
                    return (
                <article key={p.id} className="panel"
                  style={{ ["--panel" as any]: p.color, ...(p.bgImage ? {
                    backgroundImage:`linear-gradient(180deg,rgba(0,0,0,0.62),rgba(0,0,0,0.62)),url(${p.bgImage})`,
                    backgroundSize:"cover",backgroundPosition:"center",backgroundRepeat:"no-repeat"
                  } : {}) }}
                  onDragOver={(e) => e.preventDefault()} onDrop={() => onPanelDrop(p.id)}
                >
                  <header className="panelHeader">
                    <div className="panelTitleWrap">
                      {/* dot 클릭 → color picker 트리거 */}
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
                      <div style={{ minWidth:0 }}>
                        <input className="panelTitle" value={p.title} onChange={(e) => renamePanel(p.id,e.target.value)}/>
                        {catNames.length > 0 && (
                          <div className="panelCatBadge" style={{ marginTop:1 }}>
                            {catNames.join(" / ")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="panelRight">
                      <button className="grabBtn" draggable onDragStart={() => onPanelDragStart(p.id)} title="패널 이동">⠿</button>
                      <button className="dotsBtn" onClick={() => setDotsMenuPanelId(p.id)} title="패널 옵션">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <circle cx="5" cy="12" r="1.8" fill="currentColor"/>
                          <circle cx="12" cy="12" r="1.8" fill="currentColor"/>
                          <circle cx="19" cy="12" r="1.8" fill="currentColor"/>
                        </svg>
                      </button>
                    </div>
                  </header>

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
                          <li className={`item${it.done?" done":""}`} draggable
                            onDragStart={() => onItemDragStart(p.id,it.id)}
                            onDragOver={(e) => { e.preventDefault(); onItemDragOver(p.id,it.id); }}
                            onDrop={() => onItemDrop(p.id,it.id)} onDragEnd={onItemDragEnd}>
                            <button className="itemGrab" title="드래그">
                              {"⋮⋮"}
                            </button>
                            <input className="chk" type="checkbox" checked={it.done} onChange={() => toggleItem(p.id,it.id)}/>
                            <div className="itemMain">
                              <input className={`itemText${it.done?" done":""}`} value={it.text}
                                onChange={(e) => updateItemText(p.id,it.id,e.target.value)}/>
                            </div>
                            <div className="itemMeta">{formatStamp(it.createdAt)}</div>
                            <button className="xBtn" onClick={() => deleteItem(p.id,it.id)}>×</button>
                          </li>
                        </React.Fragment>
                      );
                    })}
                    {dropHint?.panelId===p.id && dropHint?.beforeItemId===null && <div className="dropLine"/>}
                    <li className="endDropZone"
                      onDragOver={(e) => { e.preventDefault(); onItemDragOver(p.id,null); }}
                      onDrop={() => onItemDrop(p.id,null)}/>
                  </ul>

                  {p.isSpecial && (() => {
                    const sum = extractPanelSum(p.items);
                    if(sum===null) return null;
                    return <div className="sumBar"><span className="sumLabel">합계</span><span className="sumValue">{formatNumber(sum)}</span></div>;
                  })()}
                </article>
              );
            })}
                </div>
              ));
            })()}
          </section>
        </div>
      </div>

      {dotsPanel && (
        <PanelDotsMenu panel={dotsPanel} categories={categories}
          onToggleCategory={(catId) => togglePanelCategory(dotsPanel.id, catId)}
          onDelete={() => deletePanel(dotsPanel.id)}
          onClose={() => setDotsMenuPanelId(null)}/>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
