import { useState } from 'react';
import { usePlannerStore } from '../../state/store';

export function PageTabs() {
  const pages = usePlannerStore((s) => s.project.pages);
  const activePageId = usePlannerStore((s) => s.project.activePageId);
  const setActivePage = usePlannerStore((s) => s.setActivePage);
  const addPage = usePlannerStore((s) => s.addPage);
  const deletePage = usePlannerStore((s) => s.deletePage);
  const renamePage = usePlannerStore((s) => s.renamePage);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  function commitRename() {
    if (editingId) renamePage(editingId, draftName.trim() || 'Page');
    setEditingId(null);
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 py-1">
      {pages.map((page) => {
        const isActive = page.id === activePageId;
        const isEditing = editingId === page.id;
        return (
          <div
            key={page.id}
            className={`group flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs ${
              isActive ? 'bg-white font-medium text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {isEditing ? (
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="w-24 rounded border border-blue-300 px-1 text-xs"
              />
            ) : (
              <button
                onClick={() => setActivePage(page.id)}
                onDoubleClick={() => {
                  setEditingId(page.id);
                  setDraftName(page.name);
                }}
                title="Click to switch, double-click to rename"
              >
                {page.name}
              </button>
            )}
            {pages.length > 1 && isActive && !isEditing && (
              <button
                onClick={() => {
                  if (confirm(`Delete "${page.name}"? This removes everything on it.`)) deletePage(page.id);
                }}
                title="Delete page"
                className="text-slate-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={addPage}
        title="Add page"
        className="ml-1 shrink-0 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600"
      >
        + Page
      </button>
    </div>
  );
}
