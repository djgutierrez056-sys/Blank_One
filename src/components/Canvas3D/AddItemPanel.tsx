import { useState } from 'react';
import { CATALOG, CATEGORIES } from '../../data/catalog';

/** A compact floating catalog for adding items while in the 3D view (the
 * normal sidebar catalog is hidden there). Picking an entry drops it at the
 * scene's center; the caller selects it immediately afterward so the Move
 * gizmo is ready for the user to drag it into place. */
export function AddItemPanel({ onPick, onClose }: { onPick: (catalogId: string) => void; onClose: () => void }) {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const items = CATALOG.filter((c) => c.category === category && c.category !== 'Doors & Windows');

  return (
    <div className="pointer-events-auto absolute left-3 top-3 flex w-72 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-sm font-semibold text-slate-700">Add Item</span>
        <button onClick={onClose} className="rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          ✕
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 py-1.5">
        {CATEGORIES.filter((c) => c !== 'Doors & Windows').map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded px-2 py-1 text-xs ${c === category ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto p-2.5">
        {items.map((entry) => (
          <button
            key={entry.id}
            onClick={() => onPick(entry.id)}
            title={entry.name}
            className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-1.5 text-center shadow-sm hover:border-blue-300 hover:shadow"
          >
            <span className="h-9 w-9 rounded" style={{ backgroundColor: entry.color }} />
            <span className="line-clamp-1 text-[10px] text-slate-600">{entry.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
