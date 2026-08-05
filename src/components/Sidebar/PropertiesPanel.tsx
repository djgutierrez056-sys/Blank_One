import { usePlannerStore } from '../../state/store';
import type { FurnitureItem, Room } from '../../state/types';

function NumberField({
  label,
  value,
  onCommit,
  step = 0.1,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
        onChange={(e) => onCommit(Number(e.target.value))}
        className="w-full rounded border border-slate-300 px-2 py-1 text-right text-xs"
      />
    </label>
  );
}

export function PropertiesPanel() {
  const project = usePlannerStore((s) => s.project);
  const selectedIds = usePlannerStore((s) => s.selectedIds);
  const updateEntity = usePlannerStore((s) => s.updateEntity);

  const room = project.rooms.find((r) => selectedIds.length === 1 && r.id === selectedIds[0]);
  const item = project.items.find((i) => selectedIds.length === 1 && i.id === selectedIds[0]);
  const entity = room ?? item;

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
  const commit = (changes: Partial<Room> & Partial<FurnitureItem>) => updateEntity(entity.id, changes, { commit: true });

  return (
    <div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4">
      <h2 className="text-sm font-semibold text-slate-700">{room ? 'Room' : 'Furniture'}</h2>

      <label className="flex flex-col gap-1 text-xs text-slate-600">
        Label
        <input
          type="text"
          value={entity.label}
          onChange={(e) => updateEntity(entity.id, { label: e.target.value }, { commit: true })}
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        />
      </label>

      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <NumberField label="X (ft)" value={entity.x / scale} onCommit={(v) => commit({ x: v * scale })} />
        <NumberField label="Y (ft)" value={entity.y / scale} onCommit={(v) => commit({ y: v * scale })} />
        <NumberField label="Width (ft)" value={entity.width / scale} onCommit={(v) => commit({ width: Math.max(0.2, v) * scale })} />
        <NumberField label="Height (ft)" value={entity.height / scale} onCommit={(v) => commit({ height: Math.max(0.2, v) * scale })} />
        <NumberField label="Rotation" value={entity.rotation} step={1} onCommit={(v) => commit({ rotation: v })} />
      </div>

      <label className="flex items-center justify-between text-xs text-slate-600">
        {room ? 'Fill Color' : 'Color'}
        <input
          type="color"
          value={room ? room.fill : (item as FurnitureItem).color}
          onChange={(e) =>
            updateEntity(entity.id, room ? { fill: e.target.value } : { color: e.target.value }, {
              commit: true,
            })
          }
          className="h-7 w-14 cursor-pointer rounded border border-slate-300"
        />
      </label>

      {room && (
        <NumberField
          label="Wall (in)"
          value={room.wallThickness * (12 / scale)}
          step={0.5}
          onCommit={(v) => commit({ wallThickness: (v / 12) * scale })}
        />
      )}
    </div>
  );
}
