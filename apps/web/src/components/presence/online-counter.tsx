'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * Live "players online" counter (master_plan §2S). Joins a Supabase Realtime presence channel while
 * the tab is VISIBLE and shows the number of distinct viewers. No database rows, no Vercel functions,
 * no polling - the WebSocket is browser-to-Supabase, so it does not touch the metered database egress
 * or Vercel invocations.
 *
 * Privacy: the presence key is an opaque, random per-browser id (never the user id) and the payload
 * carries nothing. Others can see how many are online, never who. Multiple tabs in one browser share
 * the key and count once. Fail-safe: if Realtime is unavailable or the count is 0, it renders nothing
 * (never a lonely "0 online" or an error).
 */
function stableKey(): string {
  try {
    const existing = localStorage.getItem('vp:presence-key');
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem('vp:presence-key', fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

export function OnlineCounter() {
  const [count, setCount] = useState<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let active = true;
    const key = stableKey();
    const supabase = createClient();

    const connect = () => {
      if (channelRef.current) return;
      const channel = supabase.channel('online-players', {
        config: { presence: { key } },
      });
      channel
        .on('presence', { event: 'sync' }, () => {
          if (!active) return;
          setCount(Object.keys(channel.presenceState()).length);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void channel.track({ t: Date.now() });
        });
      channelRef.current = channel;
    };

    const disconnect = () => {
      const channel = channelRef.current;
      if (!channel) return;
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') connect();
      else disconnect();
    };

    if (document.visibilityState === 'visible') connect();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      disconnect();
    };
  }, []);

  if (count === null || count < 1) return null;

  return (
    <span
      className="border-border/70 bg-surface/70 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 shadow-sm backdrop-blur-md"
      title={`${count} ${count === 1 ? 'player' : 'players'} viewing VouchPlay now`}
      aria-label={`${count} ${count === 1 ? 'player' : 'players'} viewing VouchPlay now`}
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-foreground text-xs font-semibold tabular-nums">{count}</span>
      <span className="text-foreground-muted text-xs">online</span>
    </span>
  );
}
