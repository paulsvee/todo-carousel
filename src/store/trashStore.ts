import type { TrashPanel } from "@/types/trashPanel";
import type { DoneTask } from "@/types/doneTask";

const STORAGE_KEY_TRASH = "paulsvee_todo_trash_v1";
const MAX_ITEMS_PER_PANEL = 30;
export const DEFAULT_PANEL_COLOR = "#7c98ff";

function canUse() { return typeof window !== "undefined"; }

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function yymmdd(iso: string) {
  const d = new Date(iso);
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}
function autoTitle(f: string, t: string) { return `${yymmdd(f)}-${yymmdd(t)}`; }
function minIso(a: string, b: string) { return new Date(a).getTime() <= new Date(b).getTime() ? a : b; }
function maxIso(a: string, b: string) { return new Date(a).getTime() >= new Date(b).getTime() ? a : b; }

// ✅ addDoneTaskToTrash — localStorage 직접 읽고 쓰기 (싱글톤 없음)
export function addDoneTaskToTrash(doneTask: DoneTask) {
  if (!canUse()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRASH);
    const data = safeParse<any>(raw);
    const panels: TrashPanel[] = Array.isArray(data?.panels) ? data.panels : [];

    const basisIso = doneTask.createdAt || doneTask.doneAt;
    let current = panels[0];

    if (!current || current.items.length >= MAX_ITEMS_PER_PANEL) {
      current = {
        id: crypto.randomUUID(),
        title: autoTitle(basisIso, basisIso),
        fromDate: basisIso, toDate: basisIso,
        color: DEFAULT_PANEL_COLOR,
        items: [], isCollapsed: false, isTitleCustom: false,
      };
      panels.unshift(current);
    }

    current.fromDate = minIso(current.fromDate, basisIso);
    current.toDate   = maxIso(current.toDate,   basisIso);
    if (!current.isTitleCustom) current.title = autoTitle(current.fromDate, current.toDate);
    current.items.push(doneTask);

    localStorage.setItem(STORAGE_KEY_TRASH, JSON.stringify({ panels }));
  } catch {}
}
