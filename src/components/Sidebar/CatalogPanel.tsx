import { useState } from 'react';
import { CATALOG, CATEGORIES } from '../../data/catalog';
import { usePlannerStore } from '../../state/store';
import { FurnitureIcon } from '../Canvas/FurnitureIcon';
import { Stage, Layer } from 'react-konva';

function CatalogThumb({ catalogId, color }: { catalogId: string; color: string }) {
  return (
    <Stage width={44} height={44} listening={false}>
      <Layer>
        <FurnitureIcon catalogId={catalogId} width={38} height={38} color={color} />
      </Layer>
    </Stage>
  );
}

export function CatalogPanel() {
  const addItemFromCatalog = usePlannerStore((s) => s.addItemFromCatalog);
  const viewCenter = usePlannerStore((s) => s.viewCenter);
  const [openCategory, setOpenCategory] = useState<string>(CATEGORIES[0]);

  return (
    <div className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">Furniture Catalog</h2>
        <p className="mt-0.5 text-xs text-slate-400">Click or drag onto the plan</p>
      </div>
      {CATEGORIES.map((category) => {
        const items = CATALOG.filter((c) => c.category === category);
        const isOpen = openCategory === category;
        return (
          <div key={category} className="border-b border-slate-200">
            <button
              onClick={() => setOpenCategory(isOpen ? '' : category)}
              className="flex w-full items-center justify-between px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500 hover:bg-slate-100"
            >
              {category}
              <span className="text-slate-400">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && (
              <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                {items.map((entry) => (
                  <button
                    key={entry.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/catalog-id', entry.id)}
                    onClick={() => addItemFromCatalog(entry.id, viewCenter.x, viewCenter.y)}
                    title={`${entry.name} (${entry.width}' x ${entry.height}')`}
                    className="flex flex-col items-center rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm transition hover:border-blue-300 hover:shadow"
                  >
                    <CatalogThumb catalogId={entry.id} color={entry.color} />
                    <span className="mt-1 line-clamp-1 text-[10px] text-slate-600">{entry.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
