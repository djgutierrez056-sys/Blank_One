import { create } from 'zustand';
import type { ChatMessage, Entity, FurnitureItem, Page, Project, Room, TextLabel, ToolMode, Wall } from './types';
import { getCatalogEntry } from '../data/catalog';
import { loadFromLocalStorage, saveToLocalStorage } from '../utils/persistence';

const HISTORY_LIMIT = 50;
const DUPLICATE_OFFSET = 20;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3;

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function emptyPage(name: string): Page {
  return { id: makeId('page'), name, rooms: [], items: [], walls: [], texts: [] };
}

export function emptyProject(): Project {
  const page = emptyPage('Page 1');
  return {
    name: 'Untitled Plan',
    pages: [page],
    activePageId: page.id,
    scale: 20, // px per foot
    gridSnap: 0.5, // feet
    showLabels: true,
  };
}

export function getActivePage(project: Project): Page {
  return project.pages.find((p) => p.id === project.activePageId) ?? project.pages[0];
}

interface HistoryState {
  past: Project[];
  future: Project[];
}

type EntityChanges = Partial<Room> & Partial<FurnitureItem> & Partial<Wall> & Partial<TextLabel>;

export interface ChatBubble {
  text: string;
  expiresAt: number;
}

export interface RemoteCursor {
  x: number;
  y: number;
  name: string;
  color: string;
  updatedAt: number;
  bubble?: ChatBubble;
}

export type CollabStatus = 'idle' | 'connecting' | 'connected' | 'error';

const CHAT_MESSAGE_LIMIT = 100;
const CHAT_BUBBLE_DURATION_MS = 5000;

interface PlannerState extends HistoryState {
  project: Project;
  selectedIds: string[];
  tool: ToolMode;
  clipboard: Entity[];
  canvasSize: { width: number; height: number };
  dropCascade: number;
  zoom: number;
  cursorPos: { x: number; y: number } | null;
  viewCenter: { x: number; y: number };
  collabStatus: CollabStatus;
  remoteCursors: Record<string, RemoteCursor>;
  chatMessages: ChatMessage[];
  chatOpen: boolean;
  localBubble: ChatBubble | null;
  lockedPanelOpen: boolean;
  view3D: boolean;

  setCanvasSize: (size: { width: number; height: number }) => void;
  setTool: (tool: ToolMode) => void;
  select: (ids: string[]) => void;
  toggleSelect: (id: string, additive: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  setZoom: (zoom: number) => void;
  setCursorPos: (pos: { x: number; y: number } | null) => void;
  setViewCenter: (pos: { x: number; y: number }) => void;
  setCollabStatus: (status: CollabStatus) => void;
  setRemoteCursor: (clientId: string, cursor: Omit<RemoteCursor, 'updatedAt' | 'bubble'>) => void;
  setRemoteCursorBubble: (clientId: string, text: string) => void;
  removeRemoteCursor: (clientId: string) => void;
  clearRemoteCursors: () => void;
  pruneStaleCursors: (maxAgeMs: number) => void;
  pruneExpiredBubbles: () => void;
  applyRemoteProject: (project: Project) => void;
  addChatMessage: (message: ChatMessage) => void;
  setChatOpen: (open: boolean) => void;
  setLocalBubble: (text: string) => void;
  toggleLockSelected: () => void;
  setLockedPanelOpen: (open: boolean) => void;
  setView3D: (on: boolean) => void;

  beginChange: () => void;
  addRoom: (partial?: Partial<Room>) => string;
  addWall: (partial: Partial<Wall>) => string;
  addText: (x: number, y: number) => string;
  addItemFromCatalog: (catalogId: string, x: number, y: number) => string;
  updateEntity: (id: string, changes: EntityChanges, opts?: { commit?: boolean }) => void;
  deleteSelected: () => void;

  copy: () => void;
  paste: () => void;
  duplicateSelected: () => void;
  rotateSelected: (deltaDeg: number) => void;
  nudgeSelected: (dx: number, dy: number) => void;

  undo: () => void;
  redo: () => void;

  addPage: () => void;
  deletePage: (id: string) => void;
  renamePage: (id: string, name: string) => void;
  setActivePage: (id: string) => void;

  setProject: (project: Project) => void;
  newProject: () => void;
  setGridSnap: (feet: number) => void;
  setShowLabels: (show: boolean) => void;
  renameProject: (name: string) => void;
}

function clonePage(p: Page): Page {
  return {
    ...p,
    rooms: p.rooms.map((r) => ({ ...r })),
    items: p.items.map((i) => ({ ...i })),
    walls: p.walls.map((w) => ({ ...w })),
    texts: p.texts.map((t) => ({ ...t })),
  };
}

function cloneProject(p: Project): Project {
  return { ...p, pages: p.pages.map(clonePage) };
}

function findEntities(page: Page, ids: string[]): Entity[] {
  const idSet = new Set(ids);
  return [
    ...page.rooms.filter((r) => idSet.has(r.id)),
    ...page.items.filter((i) => idSet.has(i.id)),
    ...page.walls.filter((w) => idSet.has(w.id)),
    ...page.texts.filter((t) => idSet.has(t.id)),
  ];
}

function mapCollections(page: Page, idSet: Set<string>, transform: <T extends Entity>(e: T) => T): Page {
  return {
    ...page,
    rooms: page.rooms.map((r) => (idSet.has(r.id) ? transform(r) : r)),
    items: page.items.map((i) => (idSet.has(i.id) ? transform(i) : i)),
    walls: page.walls.map((w) => (idSet.has(w.id) ? transform(w) : w)),
    texts: page.texts.map((t) => (idSet.has(t.id) ? transform(t) : t)),
  };
}

/** Replace the active page in a project via an updater function. */
function updateActivePage(project: Project, updater: (page: Page) => Page): Project {
  const activeId = project.activePageId;
  return {
    ...project,
    pages: project.pages.map((p) => (p.id === activeId ? updater(p) : p)),
  };
}

function normalizeProject(raw: Project | (Omit<Project, 'pages' | 'activePageId'> & Partial<Page>)): Project {
  let project = raw as Project;

  // Migrate legacy single-page projects (rooms/items/walls/texts directly on the project).
  if (!Array.isArray(project.pages)) {
    const legacy = raw as unknown as { rooms?: Room[]; items?: FurnitureItem[]; walls?: Wall[]; texts?: TextLabel[] };
    const page = emptyPage('Page 1');
    page.rooms = legacy.rooms ?? [];
    page.items = legacy.items ?? [];
    page.walls = legacy.walls ?? [];
    page.texts = legacy.texts ?? [];
    project = { ...(raw as Project), pages: [page], activePageId: page.id };
  }

  return {
    ...project,
    pages: project.pages.map((page) => ({
      ...page,
      walls: page.walls ?? [],
      texts: page.texts ?? [],
      rooms: page.rooms.map((r) => ({
        ...r,
        labelX: r.labelX ?? r.width / 2,
        labelY: r.labelY ?? r.height / 2,
      })),
    })),
    activePageId: project.pages.some((p) => p.id === project.activePageId) ? project.activePageId : project.pages[0].id,
  };
}

const initialProject = normalizeProject(loadFromLocalStorage() ?? emptyProject());

export const usePlannerStore = create<PlannerState>((set, get) => ({
  project: initialProject,
  selectedIds: [],
  tool: 'select',
  clipboard: [],
  past: [],
  future: [],
  canvasSize: { width: 800, height: 600 },
  dropCascade: 0,
  zoom: 1,
  cursorPos: null,
  viewCenter: { x: 400, y: 300 },
  collabStatus: 'idle',
  remoteCursors: {},
  chatMessages: [],
  chatOpen: false,
  localBubble: null,
  lockedPanelOpen: false,
  view3D: false,

  setCanvasSize: (size) => set({ canvasSize: size }),
  setTool: (tool) => set({ tool, selectedIds: tool === 'select' ? get().selectedIds : [] }),

  select: (ids) => set({ selectedIds: ids }),
  toggleSelect: (id, additive) =>
    set((s) => {
      if (!additive) return { selectedIds: [id] };
      const has = s.selectedIds.includes(id);
      return { selectedIds: has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] };
    }),
  clearSelection: () => set({ selectedIds: [] }),
  selectAll: () => {
    const page = getActivePage(get().project);
    set({
      tool: 'select',
      selectedIds: [
        ...page.rooms.map((r) => r.id),
        ...page.items.map((i) => i.id),
        ...page.walls.map((w) => w.id),
        ...page.texts.map((t) => t.id),
      ],
    });
  },
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  setCursorPos: (pos) => set({ cursorPos: pos }),
  setViewCenter: (pos) => set({ viewCenter: pos }),
  setCollabStatus: (status) => set({ collabStatus: status }),
  setRemoteCursor: (clientId, cursor) =>
    set((s) => ({
      remoteCursors: {
        ...s.remoteCursors,
        [clientId]: { ...cursor, updatedAt: Date.now(), bubble: s.remoteCursors[clientId]?.bubble },
      },
    })),
  setRemoteCursorBubble: (clientId, text) =>
    set((s) => {
      const existing = s.remoteCursors[clientId];
      if (!existing) return {};
      return {
        remoteCursors: {
          ...s.remoteCursors,
          [clientId]: { ...existing, bubble: { text, expiresAt: Date.now() + CHAT_BUBBLE_DURATION_MS } },
        },
      };
    }),
  removeRemoteCursor: (clientId) =>
    set((s) => {
      const next = { ...s.remoteCursors };
      delete next[clientId];
      return { remoteCursors: next };
    }),
  clearRemoteCursors: () => set({ remoteCursors: {} }),
  pruneStaleCursors: (maxAgeMs) =>
    set((s) => {
      const now = Date.now();
      const next: Record<string, RemoteCursor> = {};
      for (const [id, cursor] of Object.entries(s.remoteCursors)) {
        if (now - cursor.updatedAt <= maxAgeMs) next[id] = cursor;
      }
      return { remoteCursors: next };
    }),
  pruneExpiredBubbles: () =>
    set((s) => {
      const now = Date.now();
      const next: Record<string, RemoteCursor> = {};
      for (const [id, cursor] of Object.entries(s.remoteCursors)) {
        next[id] = cursor.bubble && cursor.bubble.expiresAt <= now ? { ...cursor, bubble: undefined } : cursor;
      }
      const localBubble = s.localBubble && s.localBubble.expiresAt <= now ? null : s.localBubble;
      return { remoteCursors: next, localBubble };
    }),
  applyRemoteProject: (project) => {
    set({ project: normalizeProject(project) });
    persist(get().project);
  },
  addChatMessage: (message) =>
    set((s) => ({ chatMessages: [...s.chatMessages, message].slice(-CHAT_MESSAGE_LIMIT) })),
  setChatOpen: (open) => set({ chatOpen: open }),
  setLocalBubble: (text) => set({ localBubble: { text, expiresAt: Date.now() + CHAT_BUBBLE_DURATION_MS } }),
  toggleLockSelected: () => {
    const { project, selectedIds } = get();
    if (selectedIds.length === 0) return;
    get().beginChange();
    const idSet = new Set(selectedIds);
    const page = getActivePage(project);
    const anyUnlocked = findEntities(page, selectedIds).some((e) => !e.locked);
    set(() => ({
      project: updateActivePage(project, (p) => mapCollections(p, idSet, (e) => ({ ...e, locked: anyUnlocked }))),
    }));
    persist(get().project);
  },
  setLockedPanelOpen: (open) => set({ lockedPanelOpen: open }),
  setView3D: (on) => set({ view3D: on }),

  beginChange: () => {
    const { project, past } = get();
    const next = [...past, cloneProject(project)].slice(-HISTORY_LIMIT);
    set({ past: next, future: [] });
  },

  addRoom: (partial) => {
    get().beginChange();
    const id = makeId('room');
    const width = partial?.width ?? 200;
    const height = partial?.height ?? 160;
    const room: Room = {
      id,
      kind: 'room',
      x: 100,
      y: 100,
      width,
      height,
      rotation: 0,
      label: '',
      labelX: width / 2,
      labelY: height / 2,
      fill: '#eef2e6',
      wallThickness: 6,
      ...partial,
    };
    set((s) => ({
      project: updateActivePage(s.project, (page) => ({ ...page, rooms: [...page.rooms, room] })),
      selectedIds: [id],
    }));
    persist(get().project);
    return id;
  },

  addWall: (partial) => {
    get().beginChange();
    const id = makeId('wall');
    const wall: Wall = {
      id,
      kind: 'wall',
      x: 0,
      y: 0,
      width: 100,
      height: 8,
      rotation: 0,
      color: '#9aa0ab',
      label: 'Wall',
      ...partial,
    };
    set((s) => ({
      project: updateActivePage(s.project, (page) => ({ ...page, walls: [...page.walls, wall] })),
      selectedIds: [id],
    }));
    persist(get().project);
    return id;
  },

  addText: (x, y) => {
    get().beginChange();
    const id = makeId('text');
    const text: TextLabel = {
      id,
      kind: 'text',
      x,
      y,
      width: 160,
      height: 28,
      rotation: 0,
      text: 'Text',
      fontSize: 16,
      color: '#1f2430',
      label: 'Text',
    };
    set((s) => ({
      project: updateActivePage(s.project, (page) => ({ ...page, texts: [...page.texts, text] })),
      selectedIds: [id],
    }));
    persist(get().project);
    return id;
  },

  addItemFromCatalog: (catalogId, x, y) => {
    const entry = getCatalogEntry(catalogId);
    if (!entry) return '';
    get().beginChange();
    const { scale } = get().project;
    const cascade = get().dropCascade % 8;
    const offset = cascade * 16;
    const id = makeId('item');
    const item: FurnitureItem = {
      id,
      kind: 'item',
      catalogId,
      x: x - (entry.width * scale) / 2 + offset,
      y: y - (entry.height * scale) / 2 + offset,
      width: entry.width * scale,
      height: entry.height * scale,
      rotation: 0,
      color: entry.color,
      label: entry.name,
    };
    set((s) => ({
      project: updateActivePage(s.project, (page) => ({ ...page, items: [...page.items, item] })),
      selectedIds: [id],
      dropCascade: s.dropCascade + 1,
    }));
    persist(get().project);
    return id;
  },

  updateEntity: (id, changes, opts) => {
    if (opts?.commit) get().beginChange();
    set((s) => ({
      project: updateActivePage(s.project, (page) =>
        mapCollections(page, new Set([id]), (e) => (e.locked && !('locked' in changes) ? e : { ...e, ...changes }))
      ),
    }));
    persist(get().project);
  },

  deleteSelected: () => {
    const { selectedIds, project } = get();
    if (selectedIds.length === 0) return;
    const page = getActivePage(project);
    const idSet = new Set(findEntities(page, selectedIds).filter((e) => !e.locked).map((e) => e.id));
    if (idSet.size === 0) return;
    get().beginChange();
    set((s) => ({
      project: updateActivePage(s.project, (p) => ({
        ...p,
        rooms: p.rooms.filter((r) => !idSet.has(r.id)),
        items: p.items.filter((i) => !idSet.has(i.id)),
        walls: p.walls.filter((w) => !idSet.has(w.id)),
        texts: p.texts.filter((t) => !idSet.has(t.id)),
      })),
      selectedIds: s.selectedIds.filter((sid) => !idSet.has(sid)),
    }));
    persist(get().project);
  },

  copy: () => {
    const { project, selectedIds } = get();
    set({ clipboard: findEntities(getActivePage(project), selectedIds).map((e) => ({ ...e })) });
  },

  paste: () => {
    const { clipboard, cursorPos } = get();
    if (clipboard.length === 0) return;
    get().beginChange();

    let dx = DUPLICATE_OFFSET;
    let dy = DUPLICATE_OFFSET;
    if (cursorPos) {
      const minX = Math.min(...clipboard.map((e) => e.x));
      const minY = Math.min(...clipboard.map((e) => e.y));
      const maxX = Math.max(...clipboard.map((e) => e.x + e.width));
      const maxY = Math.max(...clipboard.map((e) => e.y + e.height));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      dx = cursorPos.x - centerX;
      dy = cursorPos.y - centerY;
    }

    const newIds: string[] = [];
    set((s) => {
      const newRooms: Room[] = [];
      const newItems: FurnitureItem[] = [];
      const newWalls: Wall[] = [];
      const newTexts: TextLabel[] = [];
      for (const e of clipboard) {
        const id = makeId(e.kind);
        newIds.push(id);
        const offsetEntity = { ...e, id, x: e.x + dx, y: e.y + dy };
        if (e.kind === 'room') newRooms.push(offsetEntity as Room);
        else if (e.kind === 'item') newItems.push(offsetEntity as FurnitureItem);
        else if (e.kind === 'wall') newWalls.push(offsetEntity as Wall);
        else newTexts.push(offsetEntity as TextLabel);
      }
      return {
        project: updateActivePage(s.project, (page) => ({
          ...page,
          rooms: [...page.rooms, ...newRooms],
          items: [...page.items, ...newItems],
          walls: [...page.walls, ...newWalls],
          texts: [...page.texts, ...newTexts],
        })),
        selectedIds: newIds,
      };
    });
    persist(get().project);
  },

  duplicateSelected: () => {
    const { project, selectedIds } = get();
    if (selectedIds.length === 0) return;
    get().beginChange();
    const clip = findEntities(getActivePage(project), selectedIds).map((e) => ({ ...e }));
    const newIds: string[] = [];
    set((s) => {
      const newRooms: Room[] = [];
      const newItems: FurnitureItem[] = [];
      const newWalls: Wall[] = [];
      const newTexts: TextLabel[] = [];
      for (const e of clip) {
        const id = makeId(e.kind);
        newIds.push(id);
        const offsetEntity = { ...e, id, x: e.x + DUPLICATE_OFFSET, y: e.y + DUPLICATE_OFFSET };
        if (e.kind === 'room') newRooms.push(offsetEntity as Room);
        else if (e.kind === 'item') newItems.push(offsetEntity as FurnitureItem);
        else if (e.kind === 'wall') newWalls.push(offsetEntity as Wall);
        else newTexts.push(offsetEntity as TextLabel);
      }
      return {
        project: updateActivePage(s.project, (page) => ({
          ...page,
          rooms: [...page.rooms, ...newRooms],
          items: [...page.items, ...newItems],
          walls: [...page.walls, ...newWalls],
          texts: [...page.texts, ...newTexts],
        })),
        selectedIds: newIds,
      };
    });
    persist(get().project);
  },

  rotateSelected: (deltaDeg) => {
    const { selectedIds } = get();
    if (selectedIds.length === 0) return;
    get().beginChange();
    const idSet = new Set(selectedIds);
    set((s) => ({
      project: updateActivePage(s.project, (page) =>
        mapCollections(page, idSet, (e) => (e.locked ? e : { ...e, rotation: e.rotation + deltaDeg }))
      ),
    }));
    persist(get().project);
  },

  nudgeSelected: (dx, dy) => {
    const { selectedIds } = get();
    if (selectedIds.length === 0) return;
    get().beginChange();
    const idSet = new Set(selectedIds);
    set((s) => ({
      project: updateActivePage(s.project, (page) =>
        mapCollections(page, idSet, (e) => (e.locked ? e : { ...e, x: e.x + dx, y: e.y + dy }))
      ),
    }));
    persist(get().project);
  },

  undo: () => {
    const { past, project, future } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      project: previous,
      past: past.slice(0, -1),
      future: [cloneProject(project), ...future].slice(0, HISTORY_LIMIT),
      selectedIds: [],
    });
    persist(previous);
  },

  redo: () => {
    const { future, project, past } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      project: next,
      future: future.slice(1),
      past: [...past, cloneProject(project)].slice(-HISTORY_LIMIT),
      selectedIds: [],
    });
    persist(next);
  },

  addPage: () => {
    get().beginChange();
    const { project } = get();
    const page = emptyPage(`Page ${project.pages.length + 1}`);
    set((s) => ({
      project: { ...s.project, pages: [...s.project.pages, page], activePageId: page.id },
      selectedIds: [],
    }));
    persist(get().project);
  },

  deletePage: (id) => {
    const { project } = get();
    if (project.pages.length <= 1) return;
    get().beginChange();
    set((s) => {
      const pages = s.project.pages.filter((p) => p.id !== id);
      const activePageId = s.project.activePageId === id ? pages[0].id : s.project.activePageId;
      return { project: { ...s.project, pages, activePageId }, selectedIds: [] };
    });
    persist(get().project);
  },

  renamePage: (id, name) => {
    get().beginChange();
    set((s) => ({
      project: { ...s.project, pages: s.project.pages.map((p) => (p.id === id ? { ...p, name } : p)) },
    }));
    persist(get().project);
  },

  setActivePage: (id) => {
    set((s) => ({ project: { ...s.project, activePageId: id }, selectedIds: [] }));
  },

  setProject: (project) => {
    set({ project: normalizeProject(project), past: [], future: [], selectedIds: [] });
    persist(get().project);
  },

  newProject: () => {
    const project = emptyProject();
    set({ project, past: [], future: [], selectedIds: [] });
    persist(project);
  },

  setGridSnap: (feet) => {
    set((s) => ({ project: { ...s.project, gridSnap: feet } }));
    persist(get().project);
  },

  setShowLabels: (show) => {
    set((s) => ({ project: { ...s.project, showLabels: show } }));
    persist(get().project);
  },

  renameProject: (name) => {
    set((s) => ({ project: { ...s.project, name } }));
    persist(get().project);
  },
}));

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(project: Project) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveToLocalStorage(project), 300);
}
