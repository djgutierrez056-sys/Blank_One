import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { usePlannerStore } from '../state/store';
import type { ChatMessage, Project } from '../state/types';

// Supabase's "anon" key is designed to be embedded in client-side code —
// it's not a secret. Row Level Security policies on the `rooms` table are
// what actually control who can read/write, not this key.
const SUPABASE_URL = 'https://pazxsmmpenrdhkvvxxvq.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhenhzbW1wZW5yZGhrdnZ4eHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMjYxMzQsImV4cCI6MjEwMTcwMjEzNH0.36_m1mM9Kqe-yaAonfk_4RUc5FjdxYZYVNzwFPKp-50';

interface RoomRow {
  id: string;
  project: Project;
  updated_at?: string;
}

const CURSOR_THROTTLE_MS = 80;
const PUSH_DEBOUNCE_MS = 400;
const CURSOR_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
const ADJECTIVES = ['Swift', 'Calm', 'Bright', 'Quiet', 'Bold', 'Sunny', 'Cozy', 'Merry'];
const ANIMALS = ['Otter', 'Fox', 'Owl', 'Wren', 'Lynx', 'Finch', 'Hare', 'Robin'];

// The generated Database types aren't worth maintaining for a single table —
// we type our own read/write shapes (RoomRow) at the call sites instead and
// let `.from()` stay loosely typed (it defaults to `never` row types without
// a Database generic).
let supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!supabase) supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabase;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function roomsTable(): any {
  return getSupabase().from('rooms');
}

function pickColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

function randomGuestName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${a} ${b}`;
}

const clientId = Math.random().toString(36).slice(2, 10);
const clientColor = pickColor(clientId);
let clientName = randomGuestName();

export function getClientId() {
  return clientId;
}

export function getClientName() {
  return clientName;
}

export function setClientName(name: string) {
  clientName = name.trim().slice(0, 24) || randomGuestName();
}

export function generateRoomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

let channel: RealtimeChannel | null = null;
let currentRoomId: string | null = null;
let applyingRemote = false;
let unsubscribeStore: (() => void) | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pruneInterval: ReturnType<typeof setInterval> | null = null;
let lastCursorSentAt = 0;

function applyRemote(project: Project) {
  applyingRemote = true;
  usePlannerStore.getState().applyRemoteProject(project);
  applyingRemote = false;
}

export async function joinRoom(roomId: string): Promise<void> {
  if (currentRoomId === roomId) return;
  await leaveRoom();
  currentRoomId = roomId;
  const sb = getSupabase();
  usePlannerStore.setState({ collabStatus: 'connecting', chatMessages: [] });

  try {
    const { data, error } = await roomsTable().select('*').eq('id', roomId).maybeSingle();
    if (error) throw error;
    const row = data as RoomRow | null;
    if (row?.project) {
      applyRemote(row.project);
    } else {
      const { error: insertError } = await roomsTable().upsert({ id: roomId, project: usePlannerStore.getState().project });
      if (insertError) throw insertError;
    }
  } catch (err) {
    console.error('Failed to join room', err);
    usePlannerStore.getState().setCollabStatus('error');
    currentRoomId = null;
    return;
  }

  const ch = sb.channel(`room:${roomId}`, { config: { broadcast: { self: false } } });

  ch.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
    (payload) => {
      const next = (payload.new as { project?: Project })?.project;
      if (next) applyRemote(next);
    }
  );

  ch.on('broadcast', { event: 'cursor' }, ({ payload }) => {
    const p = payload as { clientId: string; x: number; y: number; name: string; color: string };
    if (p.clientId === clientId) return;
    usePlannerStore.getState().setRemoteCursor(p.clientId, { x: p.x, y: p.y, name: p.name, color: p.color });
  });

  ch.on('broadcast', { event: 'leave' }, ({ payload }) => {
    const p = payload as { clientId: string };
    usePlannerStore.getState().removeRemoteCursor(p.clientId);
  });

  ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
    const p = payload as ChatMessage;
    if (p.clientId === clientId) return;
    usePlannerStore.getState().addChatMessage(p);
    usePlannerStore.getState().setRemoteCursorBubble(p.clientId, p.text);
  });

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') usePlannerStore.getState().setCollabStatus('connected');
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') usePlannerStore.getState().setCollabStatus('error');
  });

  channel = ch;
  pruneInterval = setInterval(() => {
    usePlannerStore.getState().pruneStaleCursors(6000);
    usePlannerStore.getState().pruneExpiredBubbles();
  }, 1500);

  unsubscribeStore = usePlannerStore.subscribe((state, prev) => {
    if (applyingRemote || state.project === prev.project) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      roomsTable()
        .update({ project: state.project, updated_at: new Date().toISOString() })
        .eq('id', roomId)
        .then(({ error }: { error: unknown }) => {
          if (error) console.error('Failed to push project update', error);
        });
    }, PUSH_DEBOUNCE_MS);
  });
}

export async function leaveRoom(): Promise<void> {
  if (!currentRoomId) return;
  channel?.send({ type: 'broadcast', event: 'leave', payload: { clientId } });
  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (pruneInterval) {
    clearInterval(pruneInterval);
    pruneInterval = null;
  }
  if (channel) {
    getSupabase().removeChannel(channel);
    channel = null;
  }
  currentRoomId = null;
  usePlannerStore.getState().setCollabStatus('idle');
  usePlannerStore.getState().clearRemoteCursors();
}

export function getCurrentRoomId(): string | null {
  return currentRoomId;
}

export function broadcastCursor(x: number, y: number): void {
  if (!channel) return;
  const now = Date.now();
  if (now - lastCursorSentAt < CURSOR_THROTTLE_MS) return;
  lastCursorSentAt = now;
  channel.send({ type: 'broadcast', event: 'cursor', payload: { clientId, x, y, name: clientName, color: clientColor } });
}

export function sendChatMessage(text: string): void {
  const trimmed = text.trim();
  if (!trimmed || !channel) return;
  const message: ChatMessage = {
    id: `${clientId}_${Date.now()}`,
    clientId,
    name: clientName,
    color: clientColor,
    text: trimmed.slice(0, 240),
    ts: Date.now(),
  };
  usePlannerStore.getState().addChatMessage(message);
  usePlannerStore.getState().setLocalBubble(message.text);
  channel.send({ type: 'broadcast', event: 'chat', payload: message });
}

export function getShareUrl(roomId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  return url.toString();
}
