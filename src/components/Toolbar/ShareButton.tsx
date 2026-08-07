import { useState } from 'react';
import { usePlannerStore } from '../../state/store';
import { generateRoomId, getCurrentRoomId, getShareUrl, joinRoom } from '../../lib/collab';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Not shared — working locally',
  connecting: 'Connecting…',
  connected: 'Live',
  error: 'Connection error',
};

const STATUS_COLOR: Record<string, string> = {
  idle: 'bg-slate-300',
  connecting: 'bg-amber-400',
  connected: 'bg-emerald-500',
  error: 'bg-red-500',
};

export function ShareButton() {
  const collabStatus = usePlannerStore((s) => s.collabStatus);
  const remoteCount = usePlannerStore((s) => Object.keys(s.remoteCursors).length);
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    let roomId = getCurrentRoomId();
    if (!roomId) {
      roomId = generateRoomId();
      window.history.replaceState(null, '', `?room=${roomId}`);
      await joinRoom(roomId);
    }
    try {
      await navigator.clipboard.writeText(getShareUrl(roomId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link to invite someone:', getShareUrl(roomId));
    }
  }

  return (
    <div className="flex items-center gap-2">
      {collabStatus !== 'idle' && (
        <span className="flex items-center gap-1.5 text-xs text-slate-500" title={STATUS_LABEL[collabStatus]}>
          <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[collabStatus]}`} />
          {collabStatus === 'connected' ? `Live${remoteCount > 0 ? ` · ${remoteCount} other${remoteCount > 1 ? 's' : ''}` : ''}` : STATUS_LABEL[collabStatus]}
        </span>
      )}
      <button
        onClick={handleShare}
        title="Copy a link that lets others view and edit this plan live"
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        {copied ? 'Link copied!' : 'Share'}
      </button>
    </div>
  );
}
