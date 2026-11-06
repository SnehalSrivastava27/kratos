import { useEffect, useState } from 'react';
import type { OfficeEvent } from '../shared/types';
import saleDemo from '../../../demo/feeds/sale-demo.json';

type Push = (e: OfficeEvent) => void;
type Source = (push: Push, reset: () => void) => () => void; // returns cleanup

const LOOP_GAP_MS = 5000;
const MAX_BACKOFF_MS = 5000;

/** Replays a feed using each event's `t` offset. Loops (reset + restart) when `loop` is true. Demo only. */
export function replaySource(feed: OfficeEvent[], loop: boolean): Source {
  return (push, reset) => {
    let timers: number[] = [];
    const run = () => {
      reset();
      timers = feed.map((e) => window.setTimeout(() => push(e), e.t));
      const end = (feed[feed.length - 1]?.t ?? 0) + LOOP_GAP_MS;
      if (loop) timers.push(window.setTimeout(run, end));
    };
    run();
    return () => timers.forEach(clearTimeout);
  };
}

export interface LiveOpts { ws?: string; onUnauthorized?: () => void }

/**
 * Live (contracts/api.md v3): the signed-in workspace's own events. WS /ws?ws=<id> (the session cookie
 * rides along), buffered while GET /api/history?ws=<id> loads, then history and the buffer. Reconnects
 * with backoff and re-sends history, so everything is deduped by id. Never falls back to the demo: a
 * quiet workspace stays empty. A 401 (session gone) calls onUnauthorized and stops.
 * Adapted from web/src/shared/live.ts (T8), scoped to a workspace.
 */
export function liveSource({ ws: wsId, onUnauthorized }: LiveOpts): Source {
  return (push) => {
    const q = wsId ? `ws=${encodeURIComponent(wsId)}` : '';
    const seen = new Set<string>();
    const emit = (e: OfficeEvent) => {
      if (seen.has(e.id)) return;
      seen.add(e.id);
      push(e);
    };
    let sock: WebSocket | null = null;
    let timer: number | undefined;
    let backoff = 500;
    let closed = false;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const s = (sock = new WebSocket(`${proto}://${location.host}/ws${q ? `?${q}` : ''}`));
      let buffer: OfficeEvent[] | null = [];
      s.onmessage = (m) => {
        let e: OfficeEvent;
        try { e = JSON.parse(m.data); } catch { return; }
        if (buffer) buffer.push(e); else emit(e);
      };
      s.onopen = async () => {
        backoff = 500;
        try {
          const r = await fetch(`/api/history?limit=200${q ? `&${q}` : ''}`, { credentials: 'include' });
          if (r.status === 401) {
            closed = true;
            s.close();
            onUnauthorized?.();
            return;
          }
          if (r.ok) for (const e of (await r.json()) as OfficeEvent[]) if (!closed) emit(e);
        } catch { /* no history: the stream still works */ }
        const b = buffer ?? [];
        buffer = null;
        if (!closed) b.forEach(emit);
      };
      s.onclose = () => {
        sock = null;
        if (closed) return;
        timer = window.setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      if (sock) { sock.onclose = null; sock.close(); }
    };
  };
}

/** `demo`: the scripted story on a loop (landing hero, explicit demo). Otherwise the workspace's live events. */
export function useEventFeed(demo: boolean, feed?: OfficeEvent[], live: LiveOpts = {}): OfficeEvent[] {
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const { ws, onUnauthorized } = live;
  useEffect(() => {
    const source = demo ? replaySource(feed ?? (saleDemo as OfficeEvent[]), true) : liveSource({ ws, onUnauthorized });
    setEvents([]);
    return source((e) => setEvents((prev) => [...prev, e]), () => setEvents([]));
  }, [demo, feed, ws, onUnauthorized]);
  return events;
}
