import type { OfficeEvent } from './types';

const MAX_BACKOFF_MS = 5000;

/**
 * Live feed from the event server: opens WS /ws, buffers its messages while GET /api/history
 * loads, then emits history followed by the buffer. Reconnects with backoff (0.5s → 5s) and
 * re-sends history on every reconnect, so callers must dedupe by id (that also covers the
 * history/buffer overlap). `onLink(up)` reports the socket opening/closing. Returns a close function.
 */
export function connectLive(
  onEvent: (e: OfficeEvent) => void,
  onLink: (up: boolean) => void = () => {},
  historyLimit = 200,
): () => void {
  let ws: WebSocket | null = null;
  let timer: number | undefined;
  let backoff = 500;
  let closed = false;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const sock = (ws = new WebSocket(`${proto}://${location.host}/ws`));
    let buffer: OfficeEvent[] | null = [];
    let wasOpen = false;
    sock.onmessage = (m) => {
      let e: OfficeEvent;
      try { e = JSON.parse(m.data); } catch { return; } // ignore malformed frame
      if (buffer) buffer.push(e); else onEvent(e);
    };
    sock.onopen = async () => {
      wasOpen = true;
      backoff = 500;
      onLink(true);
      try {
        const res = await fetch(`/api/history?limit=${historyLimit}`);
        if (res.ok) for (const e of (await res.json()) as OfficeEvent[]) if (!closed) onEvent(e);
      } catch { /* no history: the live stream still works */ }
      const b = buffer ?? [];
      buffer = null;
      if (!closed) b.forEach(onEvent);
    };
    sock.onclose = () => {
      ws = null;
      if (wasOpen) onLink(false);
      if (closed) return;
      timer = window.setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };
  }

  connect();
  return () => {
    closed = true;
    clearTimeout(timer);
    if (ws) { ws.onclose = null; ws.close(); }
  };
}
