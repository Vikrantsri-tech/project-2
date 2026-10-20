import { useEffect, useRef, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { CursorPosition, Peer } from '@/lib/types';

const PRESENCE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
];

interface PresencePayload {
  userId: string;
  displayName: string;
  color: string;
  cursor?: CursorPosition;
  micOn?: boolean;
}

interface UsePresenceOptions {
  roomId: string;
  userId: string | undefined;
  displayName: string;
  enabled?: boolean;
}

interface UsePresenceReturn {
  peers: Peer[];
  myColor: string;
  updateCursor: (cursor: CursorPosition | undefined) => void;
  setMicOn: (on: boolean) => void;
}

function pickColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

export function usePresence({ roomId, userId, displayName, enabled = true }: UsePresenceOptions): UsePresenceReturn {
  const [peers, setPeers] = useState<Peer[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cursorRef = useRef<CursorPosition | undefined>(undefined);
  const micRef = useRef<boolean>(false);
  const colorRef = useRef<string>(pickColor(userId ?? 'anon'));

  const broadcastState = useCallback(() => {
    if (!userId) return;
    channelRef.current?.track({
      userId,
      displayName,
      color: colorRef.current,
      cursor: cursorRef.current,
      micOn: micRef.current,
    } satisfies PresencePayload);
  }, [userId, displayName]);

  const updateCursor = useCallback((cursor: CursorPosition | undefined) => {
    cursorRef.current = cursor;
    broadcastState();
  }, [broadcastState]);

  const setMicOn = useCallback((on: boolean) => {
    micRef.current = on;
    broadcastState();
  }, [broadcastState]);

  useEffect(() => {
    if (!enabled || !userId) return;

    const channel = supabase.channel(`presence-${roomId}`, {
      config: { presence: { key: userId } },
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, PresencePayload[]>;
        const next: Peer[] = Object.values(state)
          .flat()
          .filter((p) => p.userId !== userId)
          .map((p) => ({
            userId: p.userId,
            displayName: p.displayName,
            color: p.color,
            cursor: p.cursor,
            micOn: p.micOn,
            lastSeen: Date.now(),
          }));
        setPeers(next);
      })
      .on('broadcast', { event: 'cursor' }, (raw: unknown) => {
        const msg = raw as { payload?: PresencePayload };
        const p = msg.payload;
        if (!p || !userId || p.userId === userId) return;
        setPeers((prev) => {
          const idx = prev.findIndex((peer) => peer.userId === p.userId);
          const updated: Peer = {
            userId: p.userId,
            displayName: p.displayName,
            color: p.color,
            cursor: p.cursor,
            micOn: p.micOn,
            lastSeen: Date.now(),
          };
          if (idx === -1) return [...prev, updated];
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          broadcastState();
        }
      });

    const heartbeat = setInterval(broadcastState, 10000);

    return () => {
      clearInterval(heartbeat);
      channel.unsubscribe();
      channelRef.current = null;
      setPeers([]);
    };
  }, [roomId, userId, enabled, broadcastState]);

  return { peers, myColor: colorRef.current, updateCursor, setMicOn };
}
