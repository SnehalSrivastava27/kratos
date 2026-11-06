import { useEffect, useState } from 'react';
import type { OfficeEvent } from '../shared/types';
import sampleFeed from '../../../contracts/sample-feed.json';

type Push = (e: OfficeEvent) => void;
type Source = (push: Push, reset: () => void) => () => void; // returns cleanup

const LOOP_GAP_MS = 5000;

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

// ponytail: T8 adds wsSource(url) here — open WebSocket('/ws'), JSON.parse each message, push(). Same Source shape.

export function useEventFeed(mode: 'live' | 'autoplay', feed?: OfficeEvent[]): OfficeEvent[] {
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  useEffect(() => {
    // live: replay once until the WebSocket source lands (T8); autoplay: loop forever, no server.
    const source = replaySource(feed ?? (sampleFeed as OfficeEvent[]), mode === 'autoplay');
    return source((e) => setEvents((prev) => [...prev, e]), () => setEvents([]));
  }, [mode, feed]);
  return events;
}
