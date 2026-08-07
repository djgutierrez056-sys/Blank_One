import { useEffect, useRef, useState } from 'react';
import { usePlannerStore } from '../../state/store';
import { getClientId, sendChatMessage } from '../../lib/collab';

export function ChatPanel() {
  const chatOpen = usePlannerStore((s) => s.chatOpen);
  const setChatOpen = usePlannerStore((s) => s.setChatOpen);
  const messages = usePlannerStore((s) => s.chatMessages);
  const collabStatus = usePlannerStore((s) => s.collabStatus);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const clientId = getClientId();

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, chatOpen]);

  if (collabStatus !== 'connected' || !chatOpen) return null;

  function handleSend() {
    if (!draft.trim()) return;
    sendChatMessage(draft);
    setDraft('');
  }

  return (
    <div className="absolute bottom-3 left-3 z-10 flex w-72 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-semibold text-slate-700">Chat</span>
        <button onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-slate-600" title="Close chat">
          ×
        </button>
      </div>
      <div ref={listRef} className="flex max-h-56 flex-col gap-1.5 overflow-y-auto px-3 py-2">
        {messages.length === 0 && <p className="text-xs text-slate-400">No messages yet — say hi!</p>}
        {messages.map((m) => (
          <div key={m.id} className="text-xs leading-snug">
            <span className="font-semibold" style={{ color: m.color }}>
              {m.clientId === clientId ? 'You' : m.name}
            </span>
            <span className="text-slate-600">: {m.text}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 border-t border-slate-200 p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder="Message..."
          maxLength={240}
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={handleSend}
          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          Send
        </button>
      </div>
    </div>
  );
}
