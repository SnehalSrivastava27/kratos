// D2C Agent HQ observer: a silent Switch agent that forwards every room message to the office server, tagged with
// its Switch room (meta.switch_room_id / room_name / chat_id / switch_thread_id). The server decides which workspace
// (if any) the room belongs to and which topic → department it is (contracts/api.md v3).
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
  /** Optional fixed room → department map (room name or id → RoomId); otherwise the server maps by topic. */
  rooms: Record<string, string>;
};
type Frame = { event: string; data: string; id?: string };

export function loadConfig(): Config {
  const cfg: Config = readJson(HERE + "config.json");
  cfg.server = (process.env.SERVER_URL || process.env.OFFICE_URL || cfg.server).replace(/\/$/, "");
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

// Office server auth: OBSERVER_TOKEN must match the server's OBSERVER_TOKEN (unset = open dev server).
export const officeHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  ...(process.env.OBSERVER_TOKEN ? { authorization: `Bearer ${process.env.OBSERVER_TOKEN}` } : {}),
});

/** fetch with a timeout: no call to Switch or the office may hang the observer. */
const TIMEOUT = Number(process.env.OBSERVER_TIMEOUT_MS) || 10_000;
const fetchT = (url: string, init: RequestInit = {}) => fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT) });
/** Exponential backoff with jitter (half fixed, half random), capped. */
export const backoffMs = (attempt: number, base = 1000, cap = 30_000) => {
  const d = Math.min(cap, base * 2 ** attempt);
  return d / 2 + Math.random() * (d / 2);
};

// Office delivery: FIFO, one POST at a time, so order is kept. 429/5xx/network error → retry the head
// with backoff + jitter (1 s → 30 s); other statuses (200 duplicate, 201, 202, 400, 401) are final. Full outbox
// drops the oldest. A retried POST that had in fact arrived is harmless: the server dedupes by switch_message_id.
const OUTBOX_MAX = 500;
const outbox: { url: string; body: string; label: string }[] = [];
let draining = false;
export function sendToOffice(server: string, event: object, label: string) {
  if (outbox.length >= OUTBOX_MAX) console.warn("[observer] outbox full, dropped:", outbox.shift()!.label);
  outbox.push({ url: `${server}/api/events`, body: JSON.stringify(event), label });
  if (!draining) void drainOutbox();
}
async function drainOutbox() {
  draining = true;
  for (let attempt = 0; outbox.length; ) {
    const job = outbox[0];
    let status = 0;
    try {
      const res = await fetchT(job.url, { method: "POST", headers: officeHeaders(), body: job.body });
      status = res.status;
      await res.body?.cancel().catch(() => {});
    } catch (e) {
      console.warn("[observer] office server unreachable:", String(e));
    }
    if (status && status !== 429 && status < 500) {
      outbox.shift();
      attempt = 0;
      console.log(`[observer] ${status} ${job.label}`);
      continue;
    }
    const wait = backoffMs(attempt++);
    console.warn(`[observer] ${status || "no response"}, retry in ${(wait / 1000).toFixed(1)}s (${outbox.length} queued)`);
    await new Promise((r) => setTimeout(r, wait));
  }
  draining = false;
}

// ---- mapping ----
const norm = (s: string) => s.trim().replace(/^@/, "").toLowerCase();
const roster = readJson(HERE + "../contracts/roster.json") as {
  people: { id: string; name: string; topic?: string }[];
  rooms: { id: string; label: string }[];
};

// People hired from the office (GET /api/people beyond roster.json), refreshed by run().
const hired = new Set<string>();
export async function refreshHired(server: string) {
  try {
    const res = await fetchT(`${server}/api/people`, { headers: officeHeaders() }); // needs OBSERVER_TOKEN (v3)
    if (!res.ok) return;
    const people = (await res.json()) as { id: string }[];
    for (const p of people) hired.add(p.id);
  } catch {}
}
export const isHired = (name: string) => hired.has(name.trim().replace(/^@/, "").toLowerCase());

export function makeMapper(cfg: Config) {
  const speakers = new Map<string, string>();
  for (const p of roster.people) speakers.set(norm(p.id), p.id).set(norm(p.name), p.id);
  for (const [k, v] of Object.entries(cfg.speakers)) speakers.set(norm(k), v);
  const ignored = new Set(cfg.ignoreSpeakers.map(norm));
  const rooms = new Map(Object.entries(cfg.rooms ?? {}).map(([k, v]) => [norm(k), v]));
  const ids = roster.people.map((p) => p.id);
  const byLabel = (label: string) => roster.rooms.find((r) => norm(r.label) === norm(label))?.id;

  return {
    /** Whether `name` maps without falling back to unknownSpeaker. */
    knows: (name: string) => ignored.has(norm(name)) || speakers.has(norm(name)) || hired.has(norm(name)),
    speaker(name: string): string | null | "ignore" {
      if (ignored.has(norm(name))) return "ignore";
      const hit = speakers.get(norm(name)) ?? (hired.has(norm(name)) ? norm(name) : undefined);
      if (hit) return hit;
      console.warn(`[observer] unknown speaker "${name}"` + (cfg.unknownSpeaker ? ` → ${cfg.unknownSpeaker} (add it to config.speakers)` : ", skipped"));
      return cfg.unknownSpeaker;
    },
    /** A placeholder department: config.rooms, else the speaker's home department, else war_room. The server
     *  replaces it with the workspace's topic when the Switch thread is a known topic. */
    room(id: string, name: string | undefined, speaker: string): string {
      const hit = rooms.get(norm(id)) ?? rooms.get(norm(name ?? ""));
      if (hit) return hit;
      const home = roster.people.find((p) => p.id === speaker)?.topic;
      return (home && byLabel(home)) || "war_room";
    },
    targets: (text: string) => [...new Set([...ids, ...hired])].filter((id) => text.toLowerCase().includes("@" + id)),
  };
}

// ponytail: keyword heuristic; order matters (captain's final "Finance approved… please approve" is approval_needed).
export function inferType(text: string): string {
  if (/please approve|approve\?|your approval|for approval|awaiting approval|sign[- ]?off/i.test(text)) return "approval_needed";
  if (/push(ing)? back|over budget|over the budget|❌|\bcut\b/i.test(text)) return "pushback";
  if (/\bapproved\b|✅/i.test(text)) return "approved";
  return "message";
}

/** Switch announces an agent's room-document change in the room, from that agent, as
 *  "📄 created|updated room document “<name>”." / "🗑 deleted room document “<name>”."
 *  (switch_core/bridges/agent/protocol/agent_core.py request_room_document_*). The Switch document id is not on the
 *  stream, so `id` is the name without its version ("Festive sale plan — v2" → "festive-sale-plan"). */
export function switchDocument(text: string): { id: string; title: string; version?: number; action: string } | null {
  const m = text.match(/^(?:\u{1F4C4}|\u{1F5D1}\uFE0F?)\s*(created|updated|deleted) room document \u201c(.+)\u201d\.?$/u);
  if (!m) return null;
  const title = m[2].trim();
  const v = title.match(/\bv(\d+)\s*$/i);
  const id = title.replace(/[\s\u2014\u2013-]*\bv\d+\s*$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";
  return { id, title, ...(v ? { version: Number(v[1]) } : {}), action: m[1] };
}
/** Switch announces a role change from the agent itself: "🎭 assumed the `ops-oncall` role." / "🎭 released the
 *  `ops-oncall` role." (switch_core/bridges/agent/protocol/agent_core.py _post_role_change_notice, assume/release_room_role). */
export function switchRole(text: string): { role: string; action: "assumed" | "released" } | null {
  const m = text.match(/^\u{1F3AD}\s*(assumed|released) the `([^`]+)` role\.?$/u);
  return m ? { role: m[2], action: m[1] as "assumed" | "released" } : null;
}
/** The Captain's daily brief (server/src/brief.ts asks for it; title "🎯 **Morning brief, 7 Nov**", docs/switch/12-feature-survey.md). */
export const isMorningBrief = (speaker: string, text: string) => speaker === "d2c-captain" && /^(?:\u{1F3AF}|\u2600\uFE0F?)\s*\*\*Morning brief/u.test(text);

/** The team room a private "Finance desk" room belongs to: its description carries `team_room:<id>`
 *  (switch/agents/d2c-finance.md). Desk rooms are agents-only (internal_only), never on Telegram. */
export const deskTeamRoom = (description?: string | null) => description?.match(/\bteam_room:([\w-]+)/)?.[1];

// ---- SSE ----
/** SSE frames; `onData` is called for every chunk (keepalives too), for the idle watchdog. */
async function* sse(body: ReadableStream<Uint8Array>, onData: () => void = () => {}): AsyncGenerator<Frame> {
  let buf = "";
  const dec = new TextDecoder();
  for await (const chunk of body) {
    onData();
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
/** `taken_over` is final (docs internals/agent-connection): another open took our connection id, and reopening would
 * take it back, so two clients would trade it forever. Seen as an `evicted {code}` frame or a beat 409 `{detail:{code}}`. */
export class TakenOver extends Error {}
export const isTakenOver = (x: any) => x?.code === "taken_over" || x?.detail?.code === "taken_over";

export async function run(creds: Creds, cfg: Config): Promise<never> {
  const base = `${creds.apiEndpoint.replace(/\/$/, "")}/agents/${creds.agentId}`;
  const auth = { Authorization: `Bearer ${creds.token}` };
  const connectionId = randomUUID(); // reused across reconnects (protocol: connection outlives socket)
  const map = makeMapper(cfg);
  const roomNames = new Map<string, { name: string; chatId?: string; team?: string }>();
  let cursor = 0;
  let stream: AbortController | null = null;

  const call = (path: string, body: object) =>
    fetchT(`${base}/${path}`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", "X-Switch-Connection-Id": connectionId },
      body: JSON.stringify(body),
    });

  async function refreshRooms() {
    try {
      const res = await call("ops/list_rooms", {});
      const { result } = (await res.json()) as { result: { room_id: string; name: string; description?: string | null; external_channel_id?: string | number | null }[] };
      for (const r of result) {
        const team = deskTeamRoom(r.description);
        roomNames.set(r.room_id, { name: r.name, ...(r.external_channel_id ? { chatId: String(r.external_channel_id) } : {}), ...(team ? { team } : {}) });
      }
    } catch (e) {
      console.warn("[observer] list_rooms failed:", String(e));
    }
  }

  // Heartbeat every 2 s (TTL 6 s). 404/409 = reopen the stream, not back off; 409 taken_over = stop.
  const beat = setInterval(async () => {
    if (!stream) return;
    try {
      const res = await call("connection/beat", { connection_id: connectionId, cursor });
      if (res.status === 409 && isTakenOver(await res.json().catch(() => null))) stream?.abort(new TakenOver("beat refused: taken_over"));
      else if (res.status === 404 || res.status === 409) stream?.abort();
    } catch {}
  }, 2000);

  async function onMessage(ev: any) {
    const p = ev.payload ?? {};
    const text = String(p.body ?? "").trim();
    if (!text) return;
    if (!roomNames.has(ev.room_id)) await refreshRooms();
    const name = String(p.on_behalf_of ?? p.sender_name ?? p.sender ?? "");
    // Someone we don't know yet may have just been hired: ask the office now, so their first words aren't "founder".
    if (!map.knows(name)) await refreshHired(cfg.server);
    const speaker = map.speaker(name);
    if (!speaker || speaker === "ignore") return;
    const info = roomNames.get(ev.room_id);
    const room = map.room(ev.room_id, info?.name, speaker);
    const targets = map.targets(text).filter((t) => t !== speaker);
    // A Finance desk message is a private agent-to-agent note: filed under its team room (so the server finds the
    // workspace), with no thread (it is in no Telegram topic) and always a plain message (a nudge is not a pushback).
    const desk = info?.team;
    const meta = {
      ...(targets.length ? { targets } : {}),
      ...(desk ? { private: true, ...(targets[0] ? { to: targets[0] } : {}), desk_room_id: String(ev.room_id) } : {}),
      switch_room_id: desk ?? String(ev.room_id),
      ...(info?.name && !desk ? { room_name: info.name } : {}),
      ...(info?.chatId && !desk ? { chat_id: info.chatId } : {}),
      ...(p.thread_id && !desk ? { switch_thread_id: String(p.thread_id) } : {}),
      ...(p.message_id ? { switch_message_id: String(p.message_id) } : {}), // the server dedupes on it
    };
    const doc = desk ? null : switchDocument(text);
    if (doc) Object.assign(meta, { switch_document: doc });
    const role = desk || !speaker.startsWith("d2c-") ? null : switchRole(text); // only agents assume roles; a human typing it is just text
    if (role) Object.assign(meta, { switch_role: role });
    if (!desk && isMorningBrief(speaker, text)) Object.assign(meta, { kind: "morning_brief" });
    const office = { t: Number(p.timestamp) || Date.now(), room, speaker, type: desk ? "message" : doc ? "artifact" : inferType(text), text, meta };
    sendToOffice(cfg.server, office, `${room} ${speaker} ${office.type}: ${text.split("\n")[0].slice(0, 60)}`);
  }

  // Reconnects resume from the last SSE id (Last-Event-ID). Waits grow with jitter (1 s → 30 s) while the stream
  // keeps failing, and reset once a stream has stayed up for a minute. A stream silent for longer than IDLE_MS
  // (Switch sends a keepalive every 15 s) is presumed dead and reopened.
  const IDLE_MS = Number(process.env.OBSERVER_IDLE_MS) || 45_000;
  try { for (let attempt = 0; ; ) {
    const ac = (stream = new AbortController());
    const opened = Date.now();
    let idle: NodeJS.Timeout | undefined;
    const touch = () => {
      clearTimeout(idle);
      idle = setTimeout(() => ac.abort(new Error("stream idle")), IDLE_MS);
    };
    try {
      const q = new URLSearchParams({ connection_id: connectionId, scope: "all", filter: "all", start_from: "head", client: "d2c-observer", client_version: "0.1.0" });
      touch();
      const res = await fetch(`${base}/events?${q}`, {
        headers: { ...auth, Accept: "text/event-stream", ...(cursor ? { "Last-Event-ID": String(cursor) } : {}) },
        signal: ac.signal,
      });
      if (res.status === 410) console.error("[observer] Switch answered 410 to the SSE stream: it moved to the WebSocket transport (contracts/switch-protocol-notes.md §3)");
      if (!res.ok || !res.body) throw new Error(`stream open ${res.status}: ${(await res.text()).slice(0, 200)}`);
      for await (const f of sse(res.body, touch)) {
        if (f.id) cursor = Number(f.id) || cursor;
        let data: any;
        try { data = JSON.parse(f.data); } catch { console.warn("[observer] bad frame", f.event, f.data.slice(0, 80)); continue; }
        if (f.event === "connection_state") {
          console.log(`[observer] connected ${data.connection_id} scope=${data.scope} filter=${data.filter} rooms=${(data.rooms ?? []).length}`);
          await refreshRooms();
        } else if (f.event === "subscription_changed") await refreshRooms();
        else if (f.event === "evicted") throw new (isTakenOver(data) ? TakenOver : Error)(`evicted ${data.code}: ${data.reason}`);
        else if (f.event === "gap") console.warn("[observer] gap", data.reason);
        else if (f.event === "message") await onMessage(data);
      }
      throw new Error("stream ended");
    } catch (e) {
      const fatal = e instanceof TakenOver ? e : ac.signal.reason instanceof TakenOver ? ac.signal.reason : null;
      if (fatal) throw fatal;
      const why = ac.signal.aborted ? String(ac.signal.reason ?? "aborted") : String(e);
      console.warn("[observer]", why, "— reconnecting");
    } finally {
      clearTimeout(idle);
    }
    stream = null;
    if (Date.now() - opened > 60_000) attempt = 0;
    await new Promise((r) => setTimeout(r, backoffMs(attempt++)));
  } } finally {
    clearInterval(beat);
  }
}

if (import.meta.main) {
  // Nothing in here may kill the observer: log and keep going (the stream loop reconnects on its own).
  process.on("unhandledRejection", (e) => console.error("[observer] unhandled rejection:", e));
  const cfg = loadConfig();
  // …except taken_over: another observer holds our connection. Exit non-zero so a supervisor notices; don't retry.
  run(loadCreds(cfg), cfg).catch((e) => {
    console.error(`[observer] FATAL ${e instanceof Error ? e.message : e}; not reconnecting`);
    process.exit(3);
  });
}
