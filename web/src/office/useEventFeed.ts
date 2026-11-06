import { useEffect, useState } from 'react';
import type { OfficeEvent } from '../shared/types';
import { connectLive } from '../shared/live';
import saleDemo from '../../../demo/feeds/sale-demo.json';

type Push = (e: OfficeEvent) => void;
type Source = (push: Push, reset: () => void) => () => void; // returns cleanup

const LOOP_GAP_MS = 5000;
const FALLBACK_MS = 3000; // live: no server events by then → replay the feed locally

/** Replays a feed using each event's `t` offset. Loops (reset + restart) when `loop` is true. */
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

/**
 * Live: /api/history + /ws via connectLive. Until the first live event arrives (server down, or no
 * replay running) the feed loops locally so the office never blanks; the first live event takes over.
 * Server replay ids are `<feed id>@<run>` (run increases per loop): a newer run resets the scene,
 * events from older runs are dropped, and everything is deduped by id (history is re-sent on reconnect).
 */
export function wsSource(fallback: OfficeEvent[]): Source {
  return (push, reset) => {
    const seen = new Set<string>();
    let run = 0;
    let stopLocal: (() => void) | null = null;
    const timer = window.setTimeout(() => (stopLocal = replaySource(fallback, true)(push, reset)), FALLBACK_MS);
    const close = connectLive((e) => {
      const at = e.id.lastIndexOf('@');
      const r = at < 0 ? 0 : Number(e.id.slice(at + 1)) || 0;
      if (seen.has(e.id) || (r && r < run)) return;
      clearTimeout(timer);
      if (stopLocal || r > run) {
        stopLocal?.();
        stopLocal = null;
        seen.clear();
        reset();
      }
      if (r) run = r;
      seen.add(e.id);
      push(e);
    });
    return () => { clearTimeout(timer); stopLocal?.(); close(); };
  };
}

export function useEventFeed(mode: 'live' | 'autoplay', feed?: OfficeEvent[]): OfficeEvent[] {
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  useEffect(() => {
    // live: server feed with local fallback; autoplay: loop forever, no server.
    const f = feed ?? (saleDemo as OfficeEvent[]);
    const source = mode === 'live' ? wsSource(f) : replaySource(f, true);
    return source((e) => setEvents((prev) => [...prev, e]), () => setEvents([]));
  }, [mode, feed]);
  return events;
}
