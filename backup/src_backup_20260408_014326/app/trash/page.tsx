"use client";

/* Paulsvee To do — Trash v15 (사이드바 카테고리 필터) */

import React, { useEffect, useRef, useState, useCallback } from "react";
import TopNav from "@/components/TopNav";
import type { TrashPanel } from "@/types/trashPanel";
import type { DoneTask } from "@/types/doneTask";

const STORAGE_KEY_TRASH = "paulsvee_todo_trash_v1";
const DEFAULT_PANEL_COLOR = "#7c98ff";

const formatStampIso = (iso: string) => {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}.${dd} ${hh}:${mi}`;
};

function loadFromStorage(): TrashPanel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRASH);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.panels)) return [];
    const legacy = new Set(["#9ca3af", "#6b7280", "#4b5563"]);
    return data.panels.map((p: any): TrashPanel | null => {
      if (!p) return null;
      const items: DoneTask[] = (Array.isArray(p.items) ? p.items : [])
        .map((t: any): DoneTask | null => {
          if (!t) return null;
          return {
            id: typeof t.id === "string" ? t.id : crypto.randomUUID(),
            title: typeof t.title === "string" ? t.title : "",
            createdAt: typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString(),
            doneAt: typeof t.doneAt === "string" ? t.doneAt : new Date().toISOString(),
            categoryName: typeof t.categoryName === "string" ? t.categoryName : "",
            originPanelTitle: typeof t.originPanelTitle === "string" ? t.originPanelTitle : "",
          };
        }).filter(Boolean) as DoneTask[];
      const rawColor = typeof p.color === "string" ? p.color : DEFAULT_PANEL_COLOR;
      return {
        id: typeof p.id === "string" ? p.id : crypto.randomUUID(),
        title: typeof p.title === "string" ? p.title : "000000-000000",
        fromDate: typeof p.fromDate === "string" ? p.fromDate : (items[0]?.createdAt ?? new Date().toISOString()),
        toDate: typeof p.toDate === "string" ? p.toDate : (items[0]?.createdAt ?? new Date().toISOString()),
        color: legacy.has(rawColor.toLowerCase()) ? DEFAULT_PANEL_COLOR : rawColor,
        items,
        isCollapsed: !!p.isCollapsed,
        isTitleCustom: !!p.isTitleCustom,
      };
    }).filter(Boolean) as TrashPanel[];
  } catch { return []; }
}

function saveToStorage(panels: TrashPanel[]) {
  try { localStorage.setItem(STORAGE_KEY_TRASH, JSON.stringify({ panels })); } catch {}
}

export default function TrashPage() {
  const [hydrated, setHydrated] = useState(false);
  const [panels, setPanels] = useState<TrashPanel[]>([]);
  const [undo, setUndo] = useState<TrashPanel[][]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string>("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setPanels(loadFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(panels);
  }, [panels, hydrated]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 900);
  }, []);

  const pushUndo = useCallback((next: TrashPanel[]) => {
    setUndo((prev) => [panels, ...prev].slice(0, 20));
    setPanels(next);
  }, [panels]);

  const doUndo = () => {
    setUndo((prev) => {
      if (!prev.length) return prev;
      const [top, ...rest] = prev;
      setPanels(top);
      showToast("되돌림 완료");
      return rest;
    });
  };

  const setPanelTitle = (id: string, title: string) =>
    pushUndo(panels.map((p) => p.id === id ? { ...p, title, isTitleCustom: true } : p));

  const setPanelColor = (id: string, color: string) =>
    setPanels((prev) => prev.map((p) => p.id === id ? { ...p, color } : p));

  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const toggleCollapse = (id: string) =>
    pushUndo(panels.map((p) => p.id === id ? { ...p, isCollapsed: !p.isCollapsed } : p));

  const deleteItem = (panelId: string, itemId: string) => {
    const next = panels
      .map((p) => p.id === panelId ? { ...p, items: p.items.filter((it) => it.id !== itemId) } : p)
      .filter((p) => p.items.length > 0);
    pushUndo(next);
    showToast("삭제됨 (되돌림 가능)");
  };

  if (!hydrated) return (
    <main className="app">
      <div className="topbar"><div className="titleBlock"><div className="skeletonTitle"/><div className="skeletonSub"/></div></div>
    </main>
  );

  // ── 카테고리 목록: 모든 패널의 아이템에서 categoryName 수집
  const allItems = panels.flatMap((p) => p.items);
  const catMap = new Map<string, number>();
  for (const it of allItems) {
    const name = it.categoryName?.trim();
    if (name) catMap.set(name, (catMap.get(name) ?? 0) + 1);
  }
  const catList = [...catMap.entries()].sort((a, b) => b[1] - a[1]);
  const totalItems = allItems.length;

  // ── 필터링된 패널
  const visiblePanels: TrashPanel[] =
    activeCat === "all"
      ? panels
      : panels
          .map((p) => ({
            ...p,
            items: p.items.filter((it) => (it.categoryName?.trim() ?? "") === activeCat),
          }))
          .filter((p) => p.items.length > 0);

  return (
    <main className="app">
      <TopNav
        current="trash"
        titleValue="휴지통"
        mottoValue="완료된 업무 히스토리 (삭제 아님)"
        titleReadOnly mottoReadOnly
        onChangeTitle={() => {}} onChangeMotto={() => {}}
        sidebarToggle={
          <button
            className="hamburgerBtn trashHamburger"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="카테고리 메뉴"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        }
      >
        <button className="iconBtn" onClick={doUndo} disabled={undo.length === 0} title="되돌림" aria-label="Undo">↶</button>
      </TopNav>

      <div className="appBody">
        {/* 모바일 딤 오버레이 */}
        {sidebarOpen && (
          <div
            className="sidebarDim"
            style={{ display: "block" }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── 사이드바 ── */}
        <nav className={`sidebar${sidebarOpen ? " open" : ""}`} aria-label="카테고리 필터">
          <button
            className={`sidebarItem${activeCat === "all" ? " active" : ""}`}
            onClick={() => { setActiveCat("all"); setSidebarOpen(false); }}
          >
            <span>· 전체</span>
            <span className="sidebarCount">{totalItems}</span>
          </button>

          {catList.length > 0 && <div className="sidebarDivider" />}

          {catList.map(([name, count]) => (
            <button
              key={name}
              className={`sidebarItem${activeCat === name ? " active" : ""}`}
              onClick={() => { setActiveCat(name); setSidebarOpen(false); }}
            >
              <span>· {name}</span>
              <span className="sidebarCount">{count}</span>
            </button>
          ))}

          {catList.length === 0 && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", padding: "6px 10px", margin: 0 }}>
              카테고리 없음
            </p>
          )}
        </nav>

        {/* ── 메인 콘텐츠 ── */}
        <div className="mainContent">
          <section className="panelRow trashPanelRow" aria-label="Trash panels">
            {visiblePanels.length === 0 ? (
              <article className="panel trashPanel" style={{ ["--panel" as any]: DEFAULT_PANEL_COLOR }}>
                <header className="panelHeader">
                  <div className="panelTitleWrap">
                    <span className="dot" />
                    <input className="panelTitle" value="완료 기록 없음" readOnly />
                  </div>
                  <div className="panelRight">
                    <span className="itemMeta" style={{ opacity: 0.7 }}>
                      {activeCat === "all" ? "아직 이동된 항목이 없어요." : `'${activeCat}' 항목 없음`}
                    </span>
                  </div>
                </header>
              </article>
            ) : visiblePanels.map((p) => {
              const sorted = [...p.items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              return (
                <article key={p.id} className="panel trashPanel" style={{ ["--panel" as any]: p.color }}>
                  <header className="panelHeader">
                    <div className="panelTitleWrap">
                      {/* dot 클릭 → color picker */}
                      <div className="dotColorWrap" title="클릭해서 색상 변경"
                        onClick={() => colorInputRefs.current[p.id]?.click()}>
                        <span className="dot" />
                        <input
                          type="color"
                          className="dotColorInput"
                          value={p.color}
                          ref={(el) => { colorInputRefs.current[p.id] = el; }}
                          onChange={(e) => setPanelColor(p.id, e.target.value)}
                        />
                      </div>
                      <input
                        className="panelTitle"
                        value={p.title}
                        onChange={(e) => setPanelTitle(p.id, e.target.value)}
                        style={{ fontSize: 14, fontWeight: 700 }}
                      />
                    </div>
                    <div className="panelRight">
                      <button
                        className="iconBtn"
                        type="button"
                        title={p.isCollapsed ? "펼치기" : "접기"}
                        onClick={() => toggleCollapse(p.id)}
                      >
                        {p.isCollapsed ? "▾" : "▴"}
                      </button>
                      <span className="itemMeta" style={{ opacity: 0.85 }}>{p.items.length}개</span>
                    </div>
                  </header>

                  <div className="panelTools" />

                  {!p.isCollapsed && (
                    <ul className="list">
                      {sorted.map((it, idx) => (
                        <li key={`${p.id}-${it.id}-${idx}`} className="item">
                          <button className="itemGrab" aria-label="history">•</button>
                          <div className="itemMain">
                            <input
                              className="itemText"
                              value={`${sorted.length - idx}. ${it.title}`}
                              readOnly
                            />
                            {/* 전체 보기일 때만 카테고리 표시 */}
                            {activeCat === "all" && it.categoryName && (
                              <span className="trashItemCat">{it.categoryName}</span>
                            )}
                          </div>
                          <div className="itemMeta">{formatStampIso(it.createdAt)}</div>
                          <button
                            className="xBtn"
                            type="button"
                            title="완료 기록 삭제"
                            onClick={() => deleteItem(p.id, it.id)}
                          >×</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </section>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
