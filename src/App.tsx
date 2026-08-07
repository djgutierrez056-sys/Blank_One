import { useEffect } from 'react';
import { PlanCanvas } from './components/Canvas/PlanCanvas';
import { CatalogPanel } from './components/Sidebar/CatalogPanel';
import { PropertiesPanel } from './components/Sidebar/PropertiesPanel';
import { Toolbar } from './components/Toolbar/Toolbar';
import { PageTabs } from './components/Toolbar/PageTabs';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { joinRoom } from './lib/collab';

function App() {
  useKeyboardShortcuts();

  useEffect(() => {
    const roomId = new URLSearchParams(window.location.search).get('room');
    if (roomId) joinRoom(roomId);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-100">
      <Toolbar />
      <PageTabs />
      <div className="flex min-h-0 flex-1">
        <CatalogPanel />
        <main className="min-w-0 flex-1">
          <PlanCanvas />
        </main>
        <PropertiesPanel />
      </div>
    </div>
  );
}

export default App;
