import { useRef } from 'react';
import { getActivePage, usePlannerStore } from '../../state/store';
import { exportProject, importProjectFile } from '../../utils/persistence';
import { ShareButton } from './ShareButton';

function Button({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
        active ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''} border border-slate-200`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-slate-200" />;
}

export function Toolbar() {
  const tool = usePlannerStore((s) => s.tool);
  const setTool = usePlannerStore((s) => s.setTool);
  const undo = usePlannerStore((s) => s.undo);
  const redo = usePlannerStore((s) => s.redo);
  const past = usePlannerStore((s) => s.past);
  const future = usePlannerStore((s) => s.future);
  const copy = usePlannerStore((s) => s.copy);
  const paste = usePlannerStore((s) => s.paste);
  const duplicateSelected = usePlannerStore((s) => s.duplicateSelected);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const rotateSelected = usePlannerStore((s) => s.rotateSelected);
  const toggleLockSelected = usePlannerStore((s) => s.toggleLockSelected);
  const selectAll = usePlannerStore((s) => s.selectAll);
  const clearSelection = usePlannerStore((s) => s.clearSelection);
  const selectedIds = usePlannerStore((s) => s.selectedIds);
  const activePage = usePlannerStore((s) => getActivePage(s.project));
  const collabStatus = usePlannerStore((s) => s.collabStatus);
  const chatOpen = usePlannerStore((s) => s.chatOpen);
  const setChatOpen = usePlannerStore((s) => s.setChatOpen);
  const lockedPanelOpen = usePlannerStore((s) => s.lockedPanelOpen);
  const setLockedPanelOpen = usePlannerStore((s) => s.setLockedPanelOpen);
  const view3D = usePlannerStore((s) => s.view3D);
  const setView3D = usePlannerStore((s) => s.setView3D);
  const walkMode = usePlannerStore((s) => s.walkMode);
  const setWalkMode = usePlannerStore((s) => s.setWalkMode);
  const project = usePlannerStore((s) => s.project);
  const setProject = usePlannerStore((s) => s.setProject);
  const newProject = usePlannerStore((s) => s.newProject);
  const renameProject = usePlannerStore((s) => s.renameProject);
  const setGridSnap = usePlannerStore((s) => s.setGridSnap);
  const setWallScale = usePlannerStore((s) => s.setWallScale);
  const setShowLabels = usePlannerStore((s) => s.setShowLabels);
  const clipboardLength = usePlannerStore((s) => s.clipboard.length);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasSelection = selectedIds.length > 0;
  const allEntities = [...activePage.rooms, ...activePage.items, ...activePage.walls, ...activePage.texts];
  const selectedEntities = allEntities.filter((e) => selectedIds.includes(e.id));
  const allSelectedLocked = hasSelection && selectedEntities.every((e) => e.locked);
  const lockedCount = allEntities.filter((e) => e.locked).length;

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importProjectFile(file);
      setProject(imported);
    } catch {
      alert('Could not read that file — is it a valid Room Planner JSON export?');
    }
    e.target.value = '';
  }

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <input
        value={project.name}
        onChange={(e) => renameProject(e.target.value)}
        className="w-40 rounded border border-transparent px-2 py-1 text-sm font-semibold text-slate-800 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
      />
      <Divider />

      {!view3D && (
        <>
          <Button title="Select tool (V)" active={tool === 'select'} onClick={() => setTool('select')}>
            Select
          </Button>
          <Button
            title="Select everything on this page (Ctrl+A)"
            onClick={hasSelection ? clearSelection : selectAll}
            disabled={!hasSelection && allEntities.length === 0}
          >
            {hasSelection ? 'Deselect' : 'Select All'}
          </Button>
          <Button title="Draw room (click-drag on canvas)" active={tool === 'draw-room'} onClick={() => setTool('draw-room')}>
            + Room
          </Button>
          <Button title="Draw a wall / divider (click-drag on canvas, any angle)" active={tool === 'draw-wall'} onClick={() => setTool('draw-wall')}>
            + Wall
          </Button>
          <Button title="Place a text label (click on canvas)" active={tool === 'place-text'} onClick={() => setTool('place-text')}>
            + Text
          </Button>
          <Divider />

          <Button title="Undo (Ctrl+Z)" onClick={undo} disabled={past.length === 0}>
            Undo
          </Button>
          <Button title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={future.length === 0}>
            Redo
          </Button>
          <Divider />

          <Button title="Copy (Ctrl+C)" onClick={copy} disabled={!hasSelection}>
            Copy
          </Button>
          <Button title="Paste (Ctrl+V)" onClick={paste} disabled={clipboardLength === 0}>
            Paste
          </Button>
          <Button title="Duplicate (Ctrl+D)" onClick={duplicateSelected} disabled={!hasSelection}>
            Duplicate
          </Button>
          <Button title="Rotate 15°" onClick={() => rotateSelected(15)} disabled={!hasSelection}>
            Rotate ⟳
          </Button>
          <Button title="Delete (Del)" onClick={deleteSelected} disabled={!hasSelection}>
            Delete
          </Button>
          <Button
            title={allSelectedLocked ? 'Unlock selection (Ctrl+L)' : 'Lock selection so it can\'t be moved (Ctrl+L)'}
            active={allSelectedLocked}
            onClick={toggleLockSelected}
            disabled={!hasSelection}
          >
            {allSelectedLocked ? 'Unlock' : 'Lock'}
          </Button>
          <Button
            title="Show what's locked on this page"
            active={lockedPanelOpen}
            onClick={() => setLockedPanelOpen(!lockedPanelOpen)}
            disabled={lockedCount === 0 && !lockedPanelOpen}
          >
            🔒 {lockedCount}
          </Button>
          <Divider />
        </>
      )}

      <label className="flex items-center gap-1 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={project.showLabels}
          onChange={(e) => setShowLabels(e.target.checked)}
        />
        Labels
      </label>
      <label className="flex items-center gap-1 text-xs text-slate-500">
        Snap
        <select
          value={project.gridSnap}
          onChange={(e) => setGridSnap(Number(e.target.value))}
          className="rounded border border-slate-300 px-1 py-0.5 text-xs"
        >
          <option value={0}>Off</option>
          <option value={0.25}>3"</option>
          <option value={0.5}>6"</option>
          <option value={1}>1'</option>
        </select>
      </label>

      <div className="flex-1" />

      {view3D && (
        <>
          <label title="Scales wall/door/window height and the player character to match oversized furniture, without moving anything" className="flex items-center gap-1 text-xs text-slate-500">
            Scale
            <select
              value={project.wallScale ?? 1}
              onChange={(e) => setWallScale(Number(e.target.value))}
              className="rounded border border-slate-300 px-1 py-1 text-xs"
            >
              {[0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4].map((v) => (
                <option key={v} value={v}>
                  {v}x
                </option>
              ))}
            </select>
          </label>
          <Button
            title={walkMode ? 'Exit walkthrough (Esc)' : 'Walk through this plan in first person'}
            active={walkMode}
            onClick={() => setWalkMode(!walkMode)}
          >
            {walkMode ? 'Exit Walk' : 'Walk'}
          </Button>
        </>
      )}
      <Button
        title={view3D ? 'Back to the 2D floor plan' : 'View this plan in 3D'}
        active={view3D}
        onClick={() => setView3D(!view3D)}
      >
        {view3D ? '2D' : '3D'}
      </Button>
      <Divider />

      <ShareButton />
      {collabStatus === 'connected' && (
        <Button title="Toggle chat" active={chatOpen} onClick={() => setChatOpen(!chatOpen)}>
          Chat
        </Button>
      )}
      <Divider />

      <Button
        title="Start a new blank plan"
        onClick={() => {
          if (confirm('Start a new plan? Unsaved changes to the current plan will be lost (unless exported).')) {
            newProject();
          }
        }}
      >
        New
      </Button>
      <Button title="Export plan as a JSON file" onClick={() => exportProject(project)}>
        Export
      </Button>
      <Button title="Import a plan JSON file" onClick={() => fileInputRef.current?.click()}>
        Import
      </Button>
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
    </div>
  );
}
