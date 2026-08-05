import { create } from 'zustand';
import type { Entity, FurnitureItem, Project, Room, TextLabel, ToolMode, Wall } from './types';
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
    walls: [],
    texts: [],
    scale: 20, // px per foot
    gridSnap: 0.5, // feet
    showLabels: true,
  };
}

interface HistoryState {
  past: Project[];
  future: Project[];
}

type EntityChanges = Partial<Room> & Partial<FurnitureItem> & Partial<Wall> & Partial<TextLabel>;

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
    walls: p.walls.map((w) => ({ ...w })),
    texts: p.texts.map((t) => ({ ...t })),
  };
}

function findEntities(project: Project, ids: string[]): Entity[] {
  const idSet = new Set(ids);
  return [
    ...project.rooms.filter((r) => idSet.has(r.id)),
    ...project.items.filter((i) => idSet.has(i.id)),
    ...project.walls.filter((w) => idSet.has(w.id)),
    ...project.texts.filter((t) => idSet.has(t.id)),
  ];
}

function mapCollections(
  project: Project,
  idSet: Set<string>,
  transform: <T extends Entity>(e: T) => T
): Project {
  return {
    ...project,
    rooms: project.rooms.map((r) => (idSet.has(r.id) ? transform(r) : r)),
    items: project.items.map((i) => (idSet.has(i.id) ? transform(i) : i)),
    walls: project.walls.map((w) => (idSet.has(w.id) ? transform(w) : w)),
    texts: project.texts.map((t) => (idSet.has(t.id) ? transform(t) : t)),
  };
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    walls: project.walls ?? [],
    texts: project.texts ?? [],
    rooms: project.rooms.map((r) => ({
      ...r,
      labelX: r.labelX ?? r.width / 2,
      labelY: r.labelY ?? r.height / 2,
    })),
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

  setCanvasSize: (size) => set({ canvasSize: size }),
  setTool: (tool) =>
    set({ tool, selectedIds: tool === 'select' ? get().selectedIds : [] }),

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
      project: { ...s.project, rooms: [...s.project.rooms, room] },
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
      project: { ...s.project, walls: [...s.project.walls, wall] },
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
      project: { ...s.project, texts: [...s.project.texts, text] },
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
      project: mapCollections(s.project, new Set([id]), (e) => ({ ...e, ...changes })),
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
        walls: s.project.walls.filter((w) => !idSet.has(w.id)),
        texts: s.project.texts.filter((t) => !idSet.has(t.id)),
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
      const newWalls: Wall[] = [];
      const newTexts: TextLabel[] = [];
      for (const e of clipboard) {
        const id = makeId(e.kind);
        newIds.push(id);
        const offsetEntity = { ...e, id, x: e.x + PASTE_OFFSET, y: e.y + PASTE_OFFSET };
        if (e.kind === 'room') newRooms.push(offsetEntity as Room);
        else if (e.kind === 'item') newItems.push(offsetEntity as FurnitureItem);
        else if (e.kind === 'wall') newWalls.push(offsetEntity as Wall);
        else newTexts.push(offsetEntity as TextLabel);
      }
      return {
        project: {
          ...s.project,
          rooms: [...s.project.rooms, ...newRooms],
          items: [...s.project.items, ...newItems],
          walls: [...s.project.walls, ...newWalls],
          texts: [...s.project.texts, ...newTexts],
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
      project: mapCollections(project, idSet, (e) => ({ ...e, rotation: e.rotation + deltaDeg })),
    }));
    persist(get().project);
  },

  nudgeSelected: (dx, dy) => {
    const { project, selectedIds } = get();
    if (selectedIds.length === 0) return;
    get().beginChange();
    const idSet = new Set(selectedIds);
    set(() => ({
      project: mapCollections(project, idSet, (e) => ({ ...e, x: e.x + dx, y: e.y + dy })),
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
