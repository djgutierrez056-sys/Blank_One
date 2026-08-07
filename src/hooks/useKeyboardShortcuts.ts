import { useEffect } from 'react';
import { usePlannerStore } from '../state/store';

export function useKeyboardShortcuts() {
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const store = usePlannerStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        store.copy();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        store.paste();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        store.duplicateSelected();
        return;
      }
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        store.setZoom(store.zoom * 1.15);
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        store.setZoom(store.zoom / 1.15);
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        store.setZoom(1);
        return;
      }
      if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        store.toggleLockSelected();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelected();
        return;
      }
      if (e.key.toLowerCase() === 'r') {
        store.rotateSelected(e.shiftKey ? -15 : 15);
        return;
      }
      if (e.key.toLowerCase() === 'v' && !mod) {
        store.setTool('select');
        return;
      }
      if (e.key === 'Escape') {
        store.clearSelection();
        store.setTool('select');
        return;
      }
      const step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        store.nudgeSelected(-step, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        store.nudgeSelected(step, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        store.nudgeSelected(0, -step);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        store.nudgeSelected(0, step);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
