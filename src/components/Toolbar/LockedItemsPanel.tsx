import { getActivePage, usePlannerStore } from '../../state/store';
import type { Entity } from '../../state/types';

const KIND_LABEL: Record<Entity['kind'], string> = {
  room: 'Room',
  item: 'Furniture',
  wall: 'Wall',
  text: 'Text',
};

export function LockedItemsPanel() {
  const lockedPanelOpen = usePlannerStore((s) => s.lockedPanelOpen);
  const setLockedPanelOpen = usePlannerStore((s) => s.setLockedPanelOpen);
  const activePage = usePlannerStore((s) => getActivePage(s.project));
  const select = usePlannerStore((s) => s.select);
  const updateEntity = usePlannerStore((s) => s.updateEntity);

  if (!lockedPanelOpen) return null;

  const lockedEntities: Entity[] = [
    ...activePage.rooms,
    ...activePage.items,
    ...activePage.walls,
    ...activePage.texts,
  ].filter((e) => e.locked);

  return (
    <div className="absolute right-3 top-3 z-10 flex w-64 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-semibold text-slate-700">Locked Items ({lockedEntities.length})</span>
        <button onClick={() => setLockedPanelOpen(false)} className="text-slate-400 hover:text-slate-600" title="Close">
          ×
        </button>
      </div>
      <div className="flex max-h-72 flex-col overflow-y-auto">
        {lockedEntities.length === 0 && <p className="px-3 py-3 text-xs text-slate-400">Nothing locked on this page.</p>}
        {lockedEntities.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 last:border-0">
            <button
              onClick={() => select([e.id])}
              title="Select"
              className="min-w-0 flex-1 truncate text-left text-xs text-slate-700 hover:text-blue-600"
            >
              <span className="text-slate-400">{KIND_LABEL[e.kind]}:</span> {e.label || '(untitled)'}
            </button>
            <button
              onClick={() => updateEntity(e.id, { locked: false }, { commit: true })}
              title="Unlock"
              className="shrink-0 rounded px-2 py-0.5 text-xs text-amber-600 hover:bg-amber-50"
            >
              Unlock
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
