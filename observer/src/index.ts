// D2C Agent HQ observer: a silent Switch agent that forwards every room message to the office.
// Protocol: Switch docs/official/internals/agent-protocol.md (SSE down, HTTP up). Read-only:
// it never calls post_message. See ../README.md and contracts/switch-protocol-notes.md.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const HERE = new URL("../", import.meta.url).pathname;
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

export type Creds = { agentId: string; apiEndpoint: string; token: string };
export type Config = {
  server: string;
  credentials: string;
  unknownSpeaker: string | null;
  ignoreSpeakers: string[];
  speakers: Record<string, string>;
  rooms: Record<string, string>;
};
type Frame = { event: string; data: string; id?: string };

export function loadConfig(): Config {
  const cfg: Config = readJson(HERE + "config.json");
  if (process.env.OFFICE_URL) cfg.server = process.env.OFFICE_URL;
  return cfg;
}

// Env wins; otherwise the file Switch Console writes into the agent's directory
// (`.switch/agents/<name>.json`, shape `{env: {SWITCH_AGENT_ID, SWITCH_API_ENDPOINT, SWITCH_API_TOKEN}}`).
export function loadCreds(cfg: Config): Creds {
  const env = process.env.SWITCH_API_TOKEN ? process.env : readJson(HERE + cfg.credentials).env;
  const creds = { agentId: env.SWITCH_AGENT_ID, apiEndpoint: env.SWITCH_API_ENDPOINT, token: env.SWITCH_API_TOKEN };
  if (!creds.agentId || !creds.apiEndpoint || !creds.token) throw new Error("missing SWITCH_AGENT_ID / SWITCH_API_ENDPOINT / SWITCH_API_TOKEN");
  return creds;
}

// ---- mapping ----
const norm = (s: string) => s.trim().replace(/^@/, "").toLowerCase();
const roster = readJson(HERE + "../contracts/roster.json") as {
  people: { id: string; name: string }[];
  rooms: { id: string; label: string }[];
};

export function makeMapper(cfg: Config) {
  const speakers = new Map<string, string>();
  for (const p of roster.people) speakers.set(norm(p.id), p.id).set(norm(p.name), p.id);
  for (const [k, v] of Object.entries(cfg.speakers)) speakers.set(norm(k), v);
  const ignored = new Set(cfg.ignoreSpeakers.map(norm));
  const rooms = new Map(Object.entries(cfg.rooms).map(([k, v]) => [norm(k), v]));
  const ids = roster.people.map((p) => p.id);

  return {
    speaker(name: string): string | null | "ignore" {
      if (ignored.has(norm(name))) return "ignore";
      const hit = speakers.get(norm(name));
      if (hit) return hit;
      console.warn(`[observer] unknown speaker "${name}"` + (cfg.unknownSpeaker ? ` → ${cfg.unknownSpeaker} (add it to config.speakers)` : ", skipped"));
      return cfg.unknownSpeaker;
    },
    room(id: string, name: string | undefined): string | null {
      const n = norm(name ?? "");
      const hit = rooms.get(norm(id)) ?? rooms.get(n) ?? roster.rooms.find((r) => n.includes(r.label.toLowerCase()))?.id;
      if (!hit) console.warn(`[observer] unknown room ${id} "${name ?? "?"}", skipped (add it to config.rooms)`);
      return hit ?? null;
    },
    targets: (text: string) => ids.filter((id) => text.toLowerCase().includes("@" + id)),
  };
}

// ponytail: keyword heuristic; order matters (captain's final "Finance approved… please approve" is approval_needed).
export function inferType(text: string): string {
  if (/please approve|approve\?|your approval|for approval|awaiting approval|sign[- ]?off/i.test(text)) return "approval_needed";
  if (/push(ing)? back|over budget|over the budget|❌|\bcut\b/i.test(text)) return "pushback";
  if (/\bapproved\b|✅/i.test(text)) return "approved";
  return "message";
}

// ---- SSE ----
async function* sse(body: ReadableStream<Uint8Array>): AsyncGenerator<Frame> {
  let buf = "";
  const dec = new TextDecoder();
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true }).replace(/\r/g, "");
    for (let i; (i = buf.indexOf("\n\n")) >= 0; ) {
      const f: Frame = { event: "message", data: "" };
      for (const line of buf.slice(0, i).split("\n")) {
        if (line.startsWith(":")) continue; // keepalive comment
        const c = line.indexOf(":");
        const k = c < 0 ? line : line.slice(0, c);
        const v = c < 0 ? "" : line.slice(c + 1).replace(/^ /, "");
        if (k === "event") f.event = v;
        else if (k === "data") f.data += (f.data ? "\n" : "") + v;
        else if (k === "id") f.id = v;
      }
      buf = buf.slice(i + 2);
      if (f.data) yield f;
    }
  }
}

// ---- run ----
export async function run(creds: Creds, cfg: Config): Promise<never> {
  const base = `${creds.apiEndpoint.replace(/\/$/, "")}/agents/${creds.agentId}`;
  const auth = { Authorization: `Bearer ${creds.token}` };
  const connectionId = randomUUID(); // reused across reconnects (protocol: connection outlives socket)
  const map = makeMapper(cfg);
  const roomNames = new Map<string, string>();
  let cursor = 0;
  let stream: AbortController | null = null;

  const call = (path: string, body: object) =>
    fetch(`${base}/${path}`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", "X-Switch-Connection-Id": connectionId },
      body: JSON.stringify(body),
    });

  async function refreshRooms() {
    try {
      const res = await call("ops/list_rooms", {});
      const { result } = (await res.json()) as { result: { room_id: string; name: string }[] };
      for (const r of result) roomNames.set(r.room_id, r.name);
    } catch (e) {
      console.warn("[observer] list_rooms failed:", String(e));
    }
  }

  // Heartbeat every 2 s (TTL 6 s). 404/409 = reopen the stream, not back off.
  setInterval(async () => {
    if (!stream) return;
    try {
      const res = await call("connection/beat", { connection_id: connectionId, cursor });
      if (res.status === 404 || res.status === 409) stream?.abort();
    } catch {}
  }, 2000);

  async function onMessage(ev: any) {
    const p = ev.payload ?? {};
    const text = String(p.body ?? "").trim();
    if (!text) return;
    if (!roomNames.has(ev.room_id)) await refreshRooms();
    const room = map.room(ev.room_id, roomNames.get(ev.room_id));
    const speaker = map.speaker(String(p.on_behalf_of ?? p.sender_name ?? p.sender ?? ""));
    if (!room || !speaker || speaker === "ignore") return;
    const targets = map.targets(text).filter((t) => t !== speaker);
    const office = { t: Number(p.timestamp) || Date.now(), room, speaker, type: inferType(text), text, ...(targets.length ? { meta: { targets } } : {}) };
    try {
      const res = await fetch(`${cfg.server}/api/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(office) });
      console.log(`[observer] ${res.status} ${room} ${speaker} ${office.type}: ${text.split("\n")[0].slice(0, 60)}`);
    } catch (e) {
      console.warn("[observer] office server unreachable:", String(e));
    }
  }

  for (;;) {
    const ac = (stream = new AbortController());
    try {
      const q = new URLSearchParams({ connection_id: connectionId, scope: "all", filter: "all", start_from: "head", client: "d2c-observer", client_version: "0.1.0" });
      const res = await fetch(`${base}/events?${q}`, {
        headers: { ...auth, Accept: "text/event-stream", ...(cursor ? { "Last-Event-ID": String(cursor) } : {}) },
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream open ${res.status}: ${await res.text()}`);
      for await (const f of sse(res.body)) {
        if (f.id) cursor = Number(f.id) || cursor;
        let data: any;
        try { data = JSON.parse(f.data); } catch { console.warn("[observer] bad frame", f.event, f.data.slice(0, 80)); continue; }
        if (f.event === "connection_state") {
          console.log(`[observer] connected ${data.connection_id} scope=${data.scope} filter=${data.filter} rooms=${(data.rooms ?? []).length}`);
          await refreshRooms();
        } else if (f.event === "subscription_changed") await refreshRooms();
        else if (f.event === "evicted") throw new Error(`evicted: ${data.reason}`);
        else if (f.event === "gap") console.warn("[observer] gap", data.reason);
        else if (f.event === "message") await onMessage(data);
      }
      throw new Error("stream ended");
    } catch (e) {
      if (!ac.signal.aborted) console.warn("[observer]", String(e), "— reconnecting");
    }
    stream = null;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

if (import.meta.main) {
  const cfg = loadConfig();
  run(loadCreds(cfg), cfg);
}
