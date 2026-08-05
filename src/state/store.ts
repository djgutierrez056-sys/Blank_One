import { create } from 'zustand';
import type { Entity, FurnitureItem, Project, Room, ToolMode } from './types';
import { getCatalogEntry } from '../data/catalog';
import { loadFromLocalStorage, saveToLocalStorage } from '../utils/persistence';

const HISTORY_LIMIT = 50;
const PASTE_OFFSET = 20;

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function emptyProject(): Project {
  return {
    name: 'Untitled Plan',
    rooms: [],
    items: [],
    scale: 20, // px per foot
    gridSnap: 0.5, // feet
    showLabels: true,
  };
}

interface HistoryState {
  past: Project[];
  future: Project[];
}

interface PlannerState extends HistoryState {
  project: Project;
  selectedIds: string[];
  tool: ToolMode;
  clipboard: Entity[];
  canvasSize: { width: number; height: number };
  dropCascade: number;

  setCanvasSize: (size: { width: number; height: number }) => void;
  setTool: (tool: ToolMode) => void;
  select: (ids: string[]) => void;
  toggleSelect: (id: string, additive: boolean) => void;
  clearSelection: () => void;

  beginChange: () => void;
  addRoom: (partial?: Partial<Room>) => string;
  addItemFromCatalog: (catalogId: string, x: number, y: number) => string;
  updateEntity: (id: string, changes: Partial<Room> & Partial<FurnitureItem>, opts?: { commit?: boolean }) => void;
  deleteSelected: () => void;

  copy: () => void;
  paste: () => void;
  duplicateSelected: () => void;
  rotateSelected: (deltaDeg: number) => void;
  nudgeSelected: (dx: number, dy: number) => void;

  undo: () => void;
  redo: () => void;

  setProject: (project: Project) => void;
  newProject: () => void;
  setGridSnap: (feet: number) => void;
  setShowLabels: (show: boolean) => void;
  renameProject: (name: string) => void;
}

function cloneProject(p: Project): Project {
  return {
    ...p,
    rooms: p.rooms.map((r) => ({ ...r })),
    items: p.items.map((i) => ({ ...i })),
  };
}

function findEntities(project: Project, ids: string[]): Entity[] {
  const idSet = new Set(ids);
  return [
    ...project.rooms.filter((r) => idSet.has(r.id)),
    ...project.items.filter((i) => idSet.has(i.id)),
  ];
}

const initialProject = loadFromLocalStorage() ?? emptyProject();

export const usePlannerStore = create<PlannerState>((set, get) => ({
  project: initialProject,
  selectedIds: [],
  tool: 'select',
  clipboard: [],
  past: [],
  future: [],
  canvasSize: { width: 800, height: 600 },
  dropCascade: 0,

  setCanvasSize: (size) => set({ canvasSize: size }),
  setTool: (tool) => set({ tool, selectedIds: tool === 'draw-room' ? [] : get().selectedIds }),

  select: (ids) => set({ selectedIds: ids }),
  toggleSelect: (id, additive) =>
    set((s) => {
      if (!additive) return { selectedIds: [id] };
      const has = s.selectedIds.includes(id);
      return { selectedIds: has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] };
    }),
  clearSelection: () => set({ selectedIds: [] }),

  beginChange: () => {
    const { project, past } = get();
    const next = [...past, cloneProject(project)].slice(-HISTORY_LIMIT);
    set({ past: next, future: [] });
  },

  addRoom: (partial) => {
    get().beginChange();
    const id = makeId('room');
    const room: Room = {
      id,
      kind: 'room',
      x: 100,
      y: 100,
      width: 200,
      height: 160,
      rotation: 0,
      label: 'Room',
      fill: '#eef2e6',
      wallThickness: 6,
      ...partial,
    };
    set((s) => ({
      project: { ...s.project, rooms: [...s.project.rooms, room] },
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
      project: { ...s.project, items: [...s.project.items, item] },
      selectedIds: [id],
      dropCascade: s.dropCascade + 1,
    }));
    persist(get().project);
    return id;
  },

  updateEntity: (id, changes, opts) => {
    if (opts?.commit) get().beginChange();
    set((s) => ({
      project: {
        ...s.project,
        rooms: s.project.rooms.map((r) => (r.id === id ? { ...r, ...(changes as Partial<Room>) } : r)),
        items: s.project.items.map((i) => (i.id === id ? { ...i, ...(changes as Partial<FurnitureItem>) } : i)),
      },
    }));
    persist(get().project);
  },

  deleteSelected: () => {
    const { selectedIds } = get();
    if (selectedIds.length === 0) return;
    get().beginChange();
    const idSet = new Set(selectedIds);
    set((s) => ({
      project: {
        ...s.project,
        rooms: s.project.rooms.filter((r) => !idSet.has(r.id)),
        items: s.project.items.filter((i) => !idSet.has(i.id)),
      },
      selectedIds: [],
    }));
    persist(get().project);
  },

  copy: () => {
    const { project, selectedIds } = get();
    set({ clipboard: findEntities(project, selectedIds).map((e) => ({ ...e })) });
  },

  paste: () => {
    const { clipboard } = get();
    if (clipboard.length === 0) return;
    get().beginChange();
    const newIds: string[] = [];
    set((s) => {
      const newRooms: Room[] = [];
      const newItems: FurnitureItem[] = [];
      for (const e of clipboard) {
        const id = makeId(e.kind === 'room' ? 'room' : 'item');
        newIds.push(id);
        if (e.kind === 'room') {
          newRooms.push({ ...e, id, x: e.x + PASTE_OFFSET, y: e.y + PASTE_OFFSET });
        } else {
          newItems.push({ ...e, id, x: e.x + PASTE_OFFSET, y: e.y + PASTE_OFFSET });
        }
      }
      return {
        project: {
          ...s.project,
          rooms: [...s.project.rooms, ...newRooms],
          items: [...s.project.items, ...newItems],
        },
        selectedIds: newIds,
      };
    });
    persist(get().project);
  },

  duplicateSelected: () => {
    get().copy();
    get().paste();
  },

  rotateSelected: (deltaDeg) => {
    const { project, selectedIds } = get();
    if (selectedIds.length === 0) return;
    get().beginChange();
    const idSet = new Set(selectedIds);
    set(() => ({
      project: {
        ...project,
        rooms: project.rooms.map((r) => (idSet.has(r.id) ? { ...r, rotation: r.rotation + deltaDeg } : r)),
        items: project.items.map((i) => (idSet.has(i.id) ? { ...i, rotation: i.rotation + deltaDeg } : i)),
      },
    }));
    persist(get().project);
  },

  nudgeSelected: (dx, dy) => {
    const { project, selectedIds } = get();
    if (selectedIds.length === 0) return;
    get().beginChange();
    const idSet = new Set(selectedIds);
    set(() => ({
      project: {
        ...project,
        rooms: project.rooms.map((r) => (idSet.has(r.id) ? { ...r, x: r.x + dx, y: r.y + dy } : r)),
        items: project.items.map((i) => (idSet.has(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i)),
      },
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

  setProject: (project) => {
    set({ project, past: [], future: [], selectedIds: [] });
    persist(project);
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
