import { getActivePage, usePlannerStore } from '../../state/store';
import type { FurnitureItem, Room, TextLabel, Wall } from '../../state/types';

function NumberField({
  label,
  value,
  onCommit,
  step = 0.1,
  disabled,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
        onChange={(e) => onCommit(Number(e.target.value))}
        disabled={disabled}
        className="w-full rounded border border-slate-300 px-2 py-1 text-right text-xs disabled:bg-slate-100 disabled:text-slate-400"
      />
    </label>
  );
}

export function PropertiesPanel() {
  const project = usePlannerStore((s) => s.project);
  const activePage = usePlannerStore((s) => getActivePage(s.project));
  const selectedIds = usePlannerStore((s) => s.selectedIds);
  const updateEntity = usePlannerStore((s) => s.updateEntity);
  const toggleLockSelected = usePlannerStore((s) => s.toggleLockSelected);

  const room = activePage.rooms.find((r) => selectedIds.length === 1 && r.id === selectedIds[0]);
  const item = activePage.items.find((i) => selectedIds.length === 1 && i.id === selectedIds[0]);
  const wall = activePage.walls.find((w) => selectedIds.length === 1 && w.id === selectedIds[0]);
  const text = activePage.texts.find((t) => selectedIds.length === 1 && t.id === selectedIds[0]);
  const entity = room ?? item ?? wall ?? text;

  if (selectedIds.length === 0) {
    return (
      <div className="w-64 shrink-0 border-l border-slate-200 bg-slate-50 p-4 text-xs text-slate-400">
        Select an item or room to edit its properties.
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="w-64 shrink-0 border-l border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        {selectedIds.length} items selected.
      </div>
    );
  }

  const scale = project.scale;
  const commit = (changes: Partial<Room> & Partial<FurnitureItem> & Partial<Wall> & Partial<TextLabel>) =>
    updateEntity(entity.id, changes, { commit: true });

  const kindLabel = room ? 'Room' : wall ? 'Wall' : text ? 'Text' : 'Furniture';

  if (text) {
    return (
      <div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{kindLabel}</h2>
          <button
            onClick={toggleLockSelected}
            title={text.locked ? 'Unlock' : "Lock so it can't be moved"}
            className={`rounded px-2 py-1 text-xs ${text.locked ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:bg-slate-100'}`}
          >
            {text.locked ? '🔒 Locked' : '🔓'}
          </button>
        </div>

        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Text
          <textarea
            value={text.text}
            onChange={(e) => commit({ text: e.target.value })}
            rows={3}
            disabled={text.locked}
            className="resize-none rounded border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-100 disabled:text-slate-400"
          />
        </label>

        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <NumberField label="X (ft)" value={text.x / scale} onCommit={(v) => commit({ x: v * scale })} disabled={text.locked} />
          <NumberField label="Y (ft)" value={text.y / scale} onCommit={(v) => commit({ y: v * scale })} disabled={text.locked} />
          <NumberField
            label="Width (ft)"
            value={text.width / scale}
            onCommit={(v) => commit({ width: Math.max(0.5, v) * scale })}
            disabled={text.locked}
          />
          <NumberField
            label="Font size"
            value={text.fontSize}
            step={1}
            onCommit={(v) => commit({ fontSize: Math.max(6, v) })}
            disabled={text.locked}
          />
          <NumberField label="Rotation" value={text.rotation} step={1} onCommit={(v) => commit({ rotation: v })} disabled={text.locked} />
        </div>

        <label className="flex items-center justify-between text-xs text-slate-600">
          Text Color
          <input
            type="color"
            value={text.color}
            onChange={(e) => commit({ color: e.target.value })}
            disabled={text.locked}
            className="h-7 w-14 cursor-pointer rounded border border-slate-300 disabled:cursor-not-allowed"
          />
        </label>
      </div>
    );
  }

  return (
    <div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{kindLabel}</h2>
        <button
          onClick={toggleLockSelected}
          title={entity.locked ? 'Unlock' : "Lock so it can't be moved"}
          className={`rounded px-2 py-1 text-xs ${entity.locked ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:bg-slate-100'}`}
        >
          {entity.locked ? '🔒 Locked' : '🔓'}
        </button>
      </div>

      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Label
        <input
          type="text"
          value={entity.label}
          onChange={(e) => updateEntity(entity.id, { label: e.target.value }, { commit: true })}
          disabled={entity.locked}
          className="rounded border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-100 disabled:text-slate-400"
        />
      </label>

      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <NumberField label="X (ft)" value={entity.x / scale} onCommit={(v) => commit({ x: v * scale })} disabled={entity.locked} />
        <NumberField label="Y (ft)" value={entity.y / scale} onCommit={(v) => commit({ y: v * scale })} disabled={entity.locked} />
        <NumberField
          label={wall ? 'Length (ft)' : 'Width (ft)'}
          value={entity.width / scale}
          onCommit={(v) => commit({ width: Math.max(0.2, v) * scale })}
          disabled={entity.locked}
        />
        {wall ? (
          <NumberField
            label="Thickness (in)"
            value={(wall.height * 12) / scale}
            step={0.5}
            onCommit={(v) => commit({ height: Math.max(1, (v / 12) * scale) })}
            disabled={entity.locked}
          />
        ) : (
          <NumberField
            label="Height (ft)"
            value={entity.height / scale}
            onCommit={(v) => commit({ height: Math.max(0.2, v) * scale })}
            disabled={entity.locked}
          />
        )}
        <NumberField label="Rotation" value={entity.rotation} step={1} onCommit={(v) => commit({ rotation: v })} disabled={entity.locked} />
      </div>

      <label className="flex items-center justify-between text-xs text-slate-600">
        {room ? 'Fill Color' : wall ? 'Wall Color' : 'Color'}
        <input
          type="color"
          value={room ? room.fill : wall ? wall.color : (item as FurnitureItem).color}
          onChange={(e) =>
            updateEntity(
              entity.id,
              room ? { fill: e.target.value } : { color: e.target.value },
              { commit: true }
            )
          }
          disabled={entity.locked}
          className="h-7 w-14 cursor-pointer rounded border border-slate-300 disabled:cursor-not-allowed"
        />
      </label>

      {room && (
        <NumberField
          label="Wall (in)"
          value={room.wallThickness * (12 / scale)}
          step={0.5}
          onCommit={(v) => commit({ wallThickness: (v / 12) * scale })}
          disabled={entity.locked}
        />
      )}

      {item && item.catalogId === 'door' && (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => updateEntity(item.id, { flipped: !item.flipped }, { commit: true })}
            disabled={item.locked}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Flip swing ({item.flipped ? 'inward' : 'outward'})
          </button>
          <button
            onClick={() => updateEntity(item.id, { flippedX: !item.flippedX }, { commit: true })}
            disabled={item.locked}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Flip hinge ({item.flippedX ? 'right' : 'left'})
          </button>
          <p className="text-[11px] text-slate-400">Tip: double-click a door to flip swing, Shift+double-click to flip hinge.</p>
        </div>
      )}
    </div>
  );
}
