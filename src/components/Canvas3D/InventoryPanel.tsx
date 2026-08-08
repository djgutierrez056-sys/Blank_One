import { useEffect, useRef, useState } from 'react';
import { CATALOG, CATEGORIES } from '../../data/catalog';

/** The full catalog, opened while walking (pauses/unlocks the mouse — see
 * Scene3D's "I" key handling). Click an item to place it immediately at
 * wherever you were last aiming; hover an item and press 1-9 to put it on
 * that hotbar slot instead, for quick access without reopening this. */
export function InventoryPanel({
  hotbar,
  onPick,
  onAssignSlot,
  onClose,
}: {
  hotbar: string[];
  onPick: (catalogId: string) => void;
  onAssignSlot: (slot: number, catalogId: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  hoveredRef.current = hovered;
  const items = CATALOG.filter((c) => c.category === category && c.category !== 'Doors & Windows');

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        onClose();
        return;
      }
      if (!hoveredRef.current) return;
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 9) onAssignSlot(n - 1, hoveredRef.current);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [onAssignSlot, onClose]);

  return (
    <div className="pointer-events-auto absolute inset-8 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Inventory</h2>
          <p className="text-xs text-slate-400">Click an item to place it &middot; hover + press 1-9 to assign a hotbar slot &middot; Esc to close</p>
        </div>
        <button onClick={onClose} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          ✕
        </button>
      </div>

      <div className="flex items-center gap-1.5 border-b border-slate-200 px-4 py-2">
        <span className="mr-1 text-xs text-slate-500">Hotbar:</span>
        {hotbar.map((catalogId, i) => {
          const entry = CATALOG.find((c) => c.id === catalogId);
          return (
            <div
              key={i}
              title={entry?.name}
              style={entry ? { backgroundColor: entry.color } : undefined}
              className="flex h-8 w-8 flex-col items-center justify-center rounded border border-slate-300 bg-slate-50 text-[9px] text-slate-700"
            >
              <span className="font-semibold drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">{i + 1}</span>
            </div>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-40 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50 py-2">
          {CATEGORIES.filter((c) => c !== 'Doors & Windows').map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-2 text-left text-sm ${c === category ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid flex-1 auto-rows-min grid-cols-6 gap-3 overflow-y-auto p-4">
          {items.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onPick(entry.id)}
              onMouseEnter={() => setHovered(entry.id)}
              onMouseLeave={() => setHovered((h) => (h === entry.id ? null : h))}
              title={entry.name}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center shadow-sm hover:border-blue-300 hover:shadow ${
                hovered === entry.id ? 'border-blue-400 ring-1 ring-blue-300' : 'border-slate-200 bg-white'
              }`}
            >
              <span className="h-10 w-10 rounded" style={{ backgroundColor: entry.color }} />
              <span className="line-clamp-1 text-[11px] text-slate-600">{entry.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
