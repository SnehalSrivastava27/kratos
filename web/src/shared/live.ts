import type { OfficeEvent } from './types';

const MAX_BACKOFF_MS = 5000;

/**
 * Live feed from the event server: GET /api/history, then WS /ws. Reconnects with backoff
 * (0.5s → 5s) and re-fetches history on every reconnect, so callers must dedupe by id.
 * Returns a close function.
 */
export function connectLive(onEvent: (e: OfficeEvent) => void, historyLimit = 200): () => void {
  let ws: WebSocket | null = null;
  let timer: number | undefined;
  let backoff = 500;
  let closed = false;

  const retry = () => {
    if (closed) return;
    timer = window.setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  };

  async function connect() {
    try {
      const res = await fetch(`/api/history?limit=${historyLimit}`);
      if (!res.ok) throw new Error(`history ${res.status}`);
      for (const e of (await res.json()) as OfficeEvent[]) if (!closed) onEvent(e);
    } catch {
      return retry(); // server down: try again later
    }
    if (closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => (backoff = 500);
    ws.onmessage = (m) => {
      try { onEvent(JSON.parse(m.data)); } catch { /* ignore malformed frame */ }
    };
    ws.onclose = () => { ws = null; retry(); };
  }

  connect();
  return () => {
    closed = true;
    clearTimeout(timer);
    if (ws) { ws.onclose = null; ws.close(); }
  };
}
