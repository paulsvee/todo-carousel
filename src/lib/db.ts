import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = process.env.VERCEL === "1"
  ? path.join("/tmp", "todo-carousel")
  : path.join(process.cwd(), "data");
const DB_PATH  = path.join(DATA_DIR, "todo-carousel.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── 테이블 생성 ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    mode       TEXT PRIMARY KEY,        -- 'main' | 'dream'
    app_title  TEXT NOT NULL DEFAULT '',
    motto      TEXT NOT NULL DEFAULT '',
    active_category_id TEXT NOT NULL DEFAULT 'all',
    expanded_panel_id  TEXT,
    collapsed_panel_ids TEXT NOT NULL DEFAULT '[]',
    sidebar_width INTEGER NOT NULL DEFAULT 240,
    version    INTEGER NOT NULL DEFAULT 4
  );

  CREATE TABLE IF NOT EXISTS panels (
    id                   TEXT PRIMARY KEY,
    mode                 TEXT NOT NULL,  -- 'main' | 'dream'
    title                TEXT NOT NULL,
    color                TEXT NOT NULL DEFAULT '#888888',
    created_at           INTEGER NOT NULL,
    category_assigned_at INTEGER,
    is_special           INTEGER NOT NULL DEFAULT 0,
    bg_image             TEXT,
    sort_order           INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS panel_categories (
    panel_id    TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL,
    PRIMARY KEY (panel_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS todo_items (
    id         TEXT PRIMARY KEY,
    panel_id   TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    mode       TEXT NOT NULL,  -- 'main' | 'dream'
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_panels_mode       ON panels(mode);
  CREATE INDEX IF NOT EXISTS idx_todo_items_panel  ON todo_items(panel_id);
  CREATE INDEX IF NOT EXISTS idx_categories_mode   ON categories(mode);
`);

const appStateColumns = new Set(
  (db.prepare("PRAGMA table_info(app_state)").all() as { name: string }[]).map((row) => row.name)
);

if (!appStateColumns.has("expanded_panel_id")) {
  db.exec("ALTER TABLE app_state ADD COLUMN expanded_panel_id TEXT");
}
if (!appStateColumns.has("collapsed_panel_ids")) {
  db.exec("ALTER TABLE app_state ADD COLUMN collapsed_panel_ids TEXT NOT NULL DEFAULT '[]'");
}
if (!appStateColumns.has("sidebar_width")) {
  db.exec("ALTER TABLE app_state ADD COLUMN sidebar_width INTEGER NOT NULL DEFAULT 240");
}

const PUBLIC_MAIN_SEED = {
  appTitle: "할 일",
  motto: "함께 쓰는 공용 체크리스트",
  categories: ["오늘 할 일", "콘텐츠", "사이트 관리", "공부", "정리와 회복"],
  panels: [
    { title: "오늘", color: "#4a90d9", catIdx: 0, items: ["오늘 가장 중요한 일 세 가지 확인", "급한 메시지 먼저 정리", "일정과 마감 확인", "끝낸 일 체크", "내일 첫 작업 하나 정하기"] },
    { title: "콘텐츠 큐", color: "#B388FF", catIdx: 1, items: ["짧은 메모 초안 쓰기", "참고할 문장이나 링크 모으기", "제목과 요약 다듬기", "모바일에서 읽기 편한지 확인", "오래된 초안 보관하기"] },
    { title: "사이트 점검", color: "#00BCD4", catIdx: 2, items: ["주요 페이지 열어 레이아웃 확인", "버튼과 링크 작동 확인", "배포 상태 확인", "콘솔 에러 확인", "다음 개선점 하나 기록"] },
    { title: "공부 루틴", color: "#00E676", catIdx: 3, items: ["집중해서 한 단락 읽기", "배운 점 세 가지 적기", "나중에 볼 질문 하나 남기기", "어제 메모 다시 보기", "아이디어 하나를 실행 항목으로 바꾸기"] },
    { title: "리셋", color: "#FFD180", catIdx: 4, items: ["물 마시기", "일어나서 몸 풀기", "책상 위 정리", "잠깐 걷기", "안 쓰는 탭 닫기"] },
  ],
};

function uuid() {
  return Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

function resetPublicMainSeed() {
  const now = Date.now();
  const cats = PUBLIC_MAIN_SEED.categories.map((name, index) => ({
    id: uuid(),
    name,
    createdAt: now + index,
  }));

  const insertCat = db.prepare("INSERT INTO categories (id, mode, name, created_at) VALUES (?, 'main', ?, ?)");
  const insertPanel = db.prepare(`INSERT INTO panels (id, mode, title, color, created_at, category_assigned_at, is_special, sort_order) VALUES (?, 'main', ?, ?, ?, ?, 0, ?)`);
  const insertPanelCat = db.prepare("INSERT INTO panel_categories (panel_id, category_id) VALUES (?, ?)");
  const insertItem = db.prepare(`INSERT INTO todo_items (id, panel_id, text, done, created_at, sort_order) VALUES (?, ?, ?, 0, ?, ?)`);

  db.transaction(() => {
    db.prepare("DELETE FROM todo_items WHERE panel_id IN (SELECT id FROM panels WHERE mode = 'main')").run();
    db.prepare("DELETE FROM panel_categories WHERE panel_id IN (SELECT id FROM panels WHERE mode = 'main')").run();
    db.prepare("DELETE FROM panels WHERE mode = 'main'").run();
    db.prepare("DELETE FROM categories WHERE mode = 'main'").run();
    db.prepare("DELETE FROM app_state WHERE mode = 'main'").run();

    for (const c of cats) insertCat.run(c.id, c.name, c.createdAt);

    db.prepare(`INSERT INTO app_state (mode, app_title, motto, active_category_id, sidebar_width, version) VALUES ('main', ?, ?, 'all', 240, 4)`)
      .run(PUBLIC_MAIN_SEED.appTitle, PUBLIC_MAIN_SEED.motto);

    PUBLIC_MAIN_SEED.panels.forEach((p, pi) => {
      const panelId = uuid();
      insertPanel.run(panelId, p.title, p.color, now + pi * 100, now + pi * 100, pi);
      insertPanelCat.run(panelId, cats[p.catIdx].id);
      p.items.forEach((text, ii) => insertItem.run(uuid(), panelId, text, now + pi * 100 + ii, ii));
    });
  })();
}

function isPublicMainSeedIntact(): boolean {
  const { state, categories } = readState("main");
  if (!state || state.appTitle !== PUBLIC_MAIN_SEED.appTitle || state.motto !== PUBLIC_MAIN_SEED.motto) {
    return false;
  }
  if (categories.map((category) => category.name).join("|") !== PUBLIC_MAIN_SEED.categories.join("|")) {
    return false;
  }
  if (state.panels.length !== PUBLIC_MAIN_SEED.panels.length) {
    return false;
  }

  return PUBLIC_MAIN_SEED.panels.every((expectedPanel, index) => {
    const panel = state.panels[index];
    return panel?.title === expectedPanel.title &&
      panel.items.map((item) => item.text).join("|") === expectedPanel.items.join("|");
  });
}

export function ensurePublicSeed(mode: "main" | "dream") {
  if (process.env.VERCEL !== "1" || mode !== "main") return;
  if (!isPublicMainSeedIntact()) resetPublicMainSeed();
}


function seedIfEmpty() {
  const existing = db.prepare("SELECT app_title, motto FROM app_state WHERE mode = 'main'").get() as
    | { app_title: string; motto: string }
    | undefined;
  const shouldRefreshPublicSeed =
    process.env.VERCEL === "1" &&
    existing?.app_title === "To do" &&
    existing?.motto === "Common work queue.";

  if (existing && !shouldRefreshPublicSeed) return;
  resetPublicMainSeed();
}

seedIfEmpty();

export default db;

// ─── 타입 ────────────────────────────────────────────────────────────────────

export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
};

export type Panel = {
  id: string;
  title: string;
  color: string;
  createdAt: number;
  categoryIds: string[];
  categoryAssignedAt: number | null;
  isSpecial: boolean;
  bgImage: string | null;
  items: TodoItem[];
};

export type Category = {
  id: string;
  name: string;
  createdAt: number;
};

export type AppState = {
  version: number;
  appTitle: string;
  motto: string;
  activeCategoryId: string;
  layout: {
    expandedPanelIdsByCategory: Record<string, string[]>;
    collapsedPanelIds: string[];
    sidebarWidth: number;
  };
  panels: Panel[];
};

// ─── 헬퍼: 전체 AppState 읽기 ───────────────────────────────────────────────

export function readState(mode: "main" | "dream"): {
  state: AppState | null;
  categories: Category[];
} {
  const row = db
    .prepare("SELECT * FROM app_state WHERE mode = ?")
    .get(mode) as {
      app_title: string;
      motto: string;
      active_category_id: string;
      expanded_panel_id: string | null;
      collapsed_panel_ids: string | null;
      sidebar_width: number | null;
      version: number;
    } | undefined;

  if (!row) return { state: null, categories: [] };

  const panels = readPanels(mode);
  const categories = readCategories(mode);

  return {
    state: {
      version: row.version,
      appTitle: row.app_title,
      motto: row.motto,
      activeCategoryId: row.active_category_id,
      layout: {
        expandedPanelIdsByCategory: (() => {
          if (!row.expanded_panel_id) return {};
          try {
            const parsed = JSON.parse(row.expanded_panel_id);
            if (Array.isArray(parsed)) {
              return {
                all: parsed.filter((id): id is string => typeof id === "string"),
              };
            }
            if (parsed && typeof parsed === "object") {
              return Object.fromEntries(
                Object.entries(parsed).map(([catId, ids]) => [
                  catId,
                  Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [],
                ])
              );
            }
            return {};
          } catch {
            return { all: [row.expanded_panel_id] };
          }
        })(),
        collapsedPanelIds: (() => {
          try {
            const parsed = JSON.parse(row.collapsed_panel_ids ?? "[]");
            return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
          } catch {
            return [];
          }
        })(),
        sidebarWidth: typeof row.sidebar_width === "number" ? row.sidebar_width : 240,
      },
      panels,
    },
    categories,
  };
}

export function readPanels(mode: "main" | "dream"): Panel[] {
  const panelRows = db
    .prepare("SELECT * FROM panels WHERE mode = ? ORDER BY sort_order ASC, created_at ASC")
    .all(mode) as {
      id: string; title: string; color: string; created_at: number;
      category_assigned_at: number | null; is_special: number; bg_image: string | null;
    }[];

  return panelRows.map((p) => {
    const categoryIds = (
      db.prepare("SELECT category_id FROM panel_categories WHERE panel_id = ?").all(p.id) as { category_id: string }[]
    ).map((r) => r.category_id);

    const items = (
      db
        .prepare("SELECT * FROM todo_items WHERE panel_id = ? ORDER BY sort_order ASC, created_at ASC")
        .all(p.id) as { id: string; text: string; done: number; created_at: number }[]
    ).map((i) => ({
      id: i.id,
      text: i.text,
      done: i.done === 1,
      createdAt: i.created_at,
    }));

    return {
      id: p.id,
      title: p.title,
      color: p.color,
      createdAt: p.created_at,
      categoryIds,
      categoryAssignedAt: p.category_assigned_at,
      isSpecial: p.is_special === 1,
      bgImage: p.bg_image,
      items,
    };
  });
}

export function readCategories(mode: "main" | "dream"): Category[] {
  return (
    db.prepare("SELECT * FROM categories WHERE mode = ? ORDER BY created_at ASC").all(mode) as {
      id: string; name: string; created_at: number;
    }[]
  ).map((c) => ({ id: c.id, name: c.name, createdAt: c.created_at }));
}

// ─── 헬퍼: 전체 AppState 저장 (upsert) ──────────────────────────────────────

export function writeState(
  mode: "main" | "dream",
  state: AppState,
  categories: Category[]
): void {
  const layout = state.layout ?? {
    expandedPanelIdsByCategory: {},
    collapsedPanelIds: [],
    sidebarWidth: 240,
  };

  const txn = db.transaction(() => {
    // app_state upsert
    db.prepare(`
      INSERT INTO app_state (mode, app_title, motto, active_category_id, expanded_panel_id, collapsed_panel_ids, sidebar_width, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mode) DO UPDATE SET
        app_title          = excluded.app_title,
        motto              = excluded.motto,
        active_category_id = excluded.active_category_id,
        expanded_panel_id  = excluded.expanded_panel_id,
        collapsed_panel_ids = excluded.collapsed_panel_ids,
        sidebar_width      = excluded.sidebar_width,
        version            = excluded.version
    `).run(
      mode,
      state.appTitle,
      state.motto,
      state.activeCategoryId,
      JSON.stringify(layout.expandedPanelIdsByCategory ?? {}),
      JSON.stringify(layout.collapsedPanelIds ?? []),
      layout.sidebarWidth ?? 240,
      state.version
    );

    // 기존 패널 목록 (DB에 있는 것)
    const existingPanelIds = new Set(
      (db.prepare("SELECT id FROM panels WHERE mode = ?").all(mode) as { id: string }[]).map((r) => r.id)
    );
    const incomingPanelIds = new Set(state.panels.map((p) => p.id));

    // 삭제된 패널 제거 (CASCADE로 items/categories도 삭제됨)
    for (const id of existingPanelIds) {
      if (!incomingPanelIds.has(id)) {
        db.prepare("DELETE FROM panels WHERE id = ?").run(id);
      }
    }

    // 패널 upsert
    state.panels.forEach((p, idx) => {
      db.prepare(`
        INSERT INTO panels (id, mode, title, color, created_at, category_assigned_at, is_special, bg_image, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title                = excluded.title,
          color                = excluded.color,
          category_assigned_at = excluded.category_assigned_at,
          is_special           = excluded.is_special,
          bg_image             = excluded.bg_image,
          sort_order           = excluded.sort_order
      `).run(p.id, mode, p.title, p.color, p.createdAt, p.categoryAssignedAt ?? null, p.isSpecial ? 1 : 0, p.bgImage ?? null, idx);

      // panel_categories: 기존 삭제 후 재삽입
      db.prepare("DELETE FROM panel_categories WHERE panel_id = ?").run(p.id);
      for (const cid of p.categoryIds) {
        db.prepare("INSERT OR IGNORE INTO panel_categories (panel_id, category_id) VALUES (?, ?)").run(p.id, cid);
      }

      // todo_items: 기존 삭제 후 재삽입
      db.prepare("DELETE FROM todo_items WHERE panel_id = ?").run(p.id);
      p.items.forEach((item, iIdx) => {
        db.prepare(`
          INSERT INTO todo_items (id, panel_id, text, done, created_at, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(item.id, p.id, item.text, item.done ? 1 : 0, item.createdAt, iIdx);
      });
    });

    // categories upsert
    const existingCatIds = new Set(
      (db.prepare("SELECT id FROM categories WHERE mode = ?").all(mode) as { id: string }[]).map((r) => r.id)
    );
    const incomingCatIds = new Set(categories.map((c) => c.id));

    for (const id of existingCatIds) {
      if (!incomingCatIds.has(id)) {
        db.prepare("DELETE FROM categories WHERE id = ?").run(id);
      }
    }

    for (const c of categories) {
      db.prepare(`
        INSERT INTO categories (id, mode, name, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name
      `).run(c.id, mode, c.name, c.createdAt);
    }
  });

  txn();
}
