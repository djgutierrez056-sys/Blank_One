import { useEffect } from 'react';
import { WALL_TEXTURES } from './textures';

export interface Paint {
  color?: string;
  texture?: string;
}

const PALETTE: string[] = [
  '#d9d4c8', // default
  '#f4f1ea',
  '#e8e2d0',
  '#dce3d5',
  '#cfe0e8',
  '#e3d3cf',
  '#d8c9e0',
  '#f0d9a8',
  '#c9b79c',
  '#a9a29a',
  '#6b7280',
  '#3f3f46',
];

/** Pick a wall color/texture to hold, then walk up to any wall in Build Mode
 * and left-click it to paint that room's walls with it — no properties
 * panel needed. Opened with P while building (pauses/unlocks the mouse). */
export function PaintPanel({
  current,
  onPick,
  onClose,
}: {
  current: Paint | null;
  onPick: (paint: Paint | null) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [onClose]);

  return (
    <div className="pointer-events-auto absolute inset-x-8 top-8 mx-auto flex max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Paint</h2>
          <p className="text-xs text-slate-400">Pick a color or texture, then left-click any wall to apply it &middot; Esc to close</p>
        </div>
        <button onClick={onClose} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500">Color</p>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((color) => (
              <button
                key={color}
                title={color}
                onClick={() => onPick({ color, texture: current?.texture })}
                style={{ backgroundColor: color }}
                className={`h-8 w-8 rounded-full border-2 ${
                  current?.color === color ? 'border-blue-500' : 'border-slate-200'
                }`}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-500">Texture</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onPick({ color: current?.color, texture: undefined })}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                !current?.texture ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              None
            </button>
            {WALL_TEXTURES.map((t) => (
              <button
                key={t.id}
                onClick={() => onPick({ color: current?.color, texture: t.id })}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  current?.texture === t.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => onPick(null)}
          className="self-start rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
        >
          Put brush away
        </button>
      </div>
    </div>
  );
}
