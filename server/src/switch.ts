// Talks to the LOCAL Switch server that Switch Console runs, two ways:
//  - as the Console admin (gateway session, credentials read from Console's run dir, like scripts/switch-up.sh),
//    to register agents, place hires on Console's controller and join them to the team room;
//  - as "d2c-office", a passive Switch agent, to post the founder's office commands into the room.
// Credentials are read from disk and never logged or returned.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { log } from "./log.js";

const env = process.env;
const CORE_ENV = env.SWITCH_CORE_ENV || join(homedir(), "Library/Application Support/switchdash/local-switch-server/native/run/switch-core.env");
export const OFFICE_AGENT = "d2c-office";

/** `message` is safe to show the caller; `detail` (what Switch actually answered) is for the server log only. */
export class SwitchError extends Error {
  constructor(public status: number, message: string, public detail?: string) {
    super(message);
  }
}
const UNREACHABLE = "Switch is not running or unreachable";

function coreEnv(): Record<string, string> {
  if (!existsSync(CORE_ENV)) throw new SwitchError(503, "no local Switch server (start it in Switch Console)");
  const out: Record<string, string> = {};
  for (const line of readFileSync(CORE_ENV, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
const base = () => `http://127.0.0.1:${coreEnv().SERVER_PORT}`;

const TIMEOUT = Number(env.SWITCH_TIMEOUT_MS) || 15_000;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Backoff with full jitter: attempt 0 → up to `base` ms, doubling. */
export const backoff = (attempt: number, base = 250) => sleep(Math.random() * base * 2 ** attempt);

async function call1(url: string, init: RequestInit & { json?: unknown } = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { accept: "application/json", ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((e) => {
    throw new SwitchError(503, UNREACHABLE, e.cause?.code ?? e.message);
  });
  const text = await res.text().catch((e) => {
    throw new SwitchError(503, UNREACHABLE, `body: ${e.cause?.code ?? e.message}`);
  });
  const where = `${init.method ?? "GET"} ${new URL(url).pathname}`;
  if (!res.ok) throw new SwitchError(res.status, "Switch refused the request", `${where} → ${res.status}: ${text.slice(0, 200)}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new SwitchError(502, "Switch refused the request", `${where} → not JSON: ${text.slice(0, 80)}`);
  }
}
/** One Switch HTTP call with a timeout. Reads (GET) are retried twice on unreachable / 429 / 5xx; writes never
 *  are (a lost answer to a POST may still have posted). */
async function call(url: string, init: RequestInit & { json?: unknown } = {}) {
  const retries = (init.method ?? "GET") === "GET" ? 2 : 0;
  for (let i = 0; ; i++) {
    try {
      return await call1(url, init);
    } catch (e) {
      const st = e instanceof SwitchError ? e.status : 0;
      if (i >= retries || !(st === 429 || st >= 500)) throw e;
      await backoff(i + 1);
    }
  }
}

/** GET {switch}/health, for /api/ready: "ok", "down", or "unconfigured" (no local Switch server). Cached 10 s. */
type Health = "ok" | "down" | "unconfigured";
let health: { at: number; v: Promise<Health>; last?: Health } | null = null;
/** Stale-while-revalidate: after the first probe, readiness checks never wait on a slow Switch. */
export function switchHealth(): Promise<Health> {
  if (health && Date.now() - health.at < 10_000) return health.v;
  const probe = async () => {
    let url: string;
    try {
      url = `${base()}/health`;
    } catch {
      return "unconfigured" as const;
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    await res?.body?.cancel().catch(() => {});
    return res?.ok ? ("ok" as const) : ("down" as const);
  };
  const prev = health;
  const v = probe();
  health = { at: Date.now(), v, last: prev?.last };
  const h = health;
  void v.then((x) => (h.last = x));
  return prev?.last ? Promise.resolve(prev.last) : v;
}

// ---- admin gateway (cookie session, re-login once on 401) ----
let cookie = "";
async function login() {
  const e = coreEnv();
  const res = await fetch(`${base()}/gateway/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: e.GATEWAY_ADMIN_EMAIL, password: e.GATEWAY_ADMIN_PASSWORD }), signal: AbortSignal.timeout(TIMEOUT),
  }).catch((err) => {
    throw new SwitchError(503, UNREACHABLE, err.cause?.code ?? err.message);
  });
  await res.body?.cancel().catch(() => {});
  if (!res.ok) throw new SwitchError(502, "Switch refused the request", `admin login → ${res.status}`);
  cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
export async function gw(method: string, path: string, json?: unknown): Promise<any> {
  if (!cookie) await login();
  try {
    return await call(`${base()}/gateway${path}`, { method, json, headers: { cookie } });
  } catch (e) {
    if (!(e instanceof SwitchError) || e.status !== 401) throw e;
    await login();
    return call(`${base()}/gateway${path}`, { method, json, headers: { cookie } });
  }
}

/** The Telegram chat id behind a Switch room (null until Switch has one). */
export async function roomChatId(roomId: string): Promise<string | null> {
  const r = await gw("GET", `/rooms/${encodeURIComponent(roomId)}`);
  return r?.external_channel_id ? String(r.external_channel_id) : null;
}
/** Joins the Switch agents with these names (the ones that exist) to a room. Returns the names joined. */
export async function joinAgents(roomId: string, names: string[]): Promise<string[]> {
  const found = (await switchAgents()).filter((a) => names.includes(a.name));
  if (found.length) await gw("POST", `/rooms/${encodeURIComponent(roomId)}/agents`, { agent_ids: found.map((a) => a.id) });
  return found.map((a) => a.name);
}
export const joinRoom = (roomId: string, agentId: string) => gw("POST", `/rooms/${roomId}/agents`, { agent_ids: [agentId] });

// ---- d2c-office: passive agent that posts office commands ----
type Creds = { env: { SWITCH_AGENT_ID: string; SWITCH_API_ENDPOINT: string; SWITCH_API_TOKEN: string } };

/** Registers d2c-office (passive, owner-only, so nobody can make it act) unless its key is on disk. A lost key
 *  is recovered by re-registering with overwrite (the key is only shown once). */
async function officeCreds(file: string, roomId: string): Promise<Creds> {
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const reg = await gw("POST", "/agents/register", {
    agent_type: "claude-code", name: OFFICE_AGENT, description: "The founder's office console (D2C Agent HQ). Posts commands; never replies.",
    options: { channels_enabled: false }, icon_url: null, display_name: null, overwrite: true,
  });
  const ownerOnly = { rules: [{ rooms: "*", room_groups: "*", users: [], agents: [], owner: true, owner_agents: false, platform: false }] };
  await gw("PUT", `/agents/${reg.id}/addressing-policy`, { policy: ownerOnly });
  await joinRoom(roomId, reg.id);
  const creds: Creds = { env: { SWITCH_AGENT_ID: reg.id, SWITCH_API_ENDPOINT: base(), SWITCH_API_TOKEN: reg.api_key } };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(creds, null, 2), { mode: 0o600 });
  log.info("registered switch agent", { name: OFFICE_AGENT, id: reg.id });
  return creds;
}

/** Posts `body` into the team room as d2c-office. Top level: `POST /agents/{id}/message` (needs no connection).
 *  Threaded under `threadId` (a Switch message id, i.e. a forum topic): ops need an open connection, so open the
 *  event stream just long enough to connect_to_room + post_message, then close it. */
export async function postAsOffice(o: { credsFile: string; roomId: string; body: string; threadId?: string | null }) {
  const roomId = o.roomId;
  const creds = await officeCreds(o.credsFile, roomId);
  const { SWITCH_AGENT_ID: id, SWITCH_API_ENDPOINT: ep, SWITCH_API_TOKEN: token } = creds.env;
  const agent = `${ep.replace(/\/$/, "")}/agents/${id}`;
  const auth = { authorization: `Bearer ${token}` };
  const send = async (): Promise<{ event_id?: string }> => {
    if (!o.threadId) return call(`${agent}/message`, { method: "POST", json: { room_id: roomId, content: o.body }, headers: auth });
    const connection = randomUUID();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT); // a stream that never says connection_state must not hang the request
    try {
      const q = new URLSearchParams({ connection_id: connection, scope: "single", filter: "addressed", start_from: "head", client: OFFICE_AGENT });
      const res = await fetch(`${agent}/events?${q}`, { headers: { ...auth, accept: "text/event-stream" }, signal: ac.signal }).catch((e) => {
        throw new SwitchError(503, UNREACHABLE, ac.signal.aborted ? "stream open timed out" : e.cause?.code ?? e.message);
      });
      if (!res.ok || !res.body) throw new SwitchError(res.status, "Switch refused the request", `stream open → ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (let buf = ""; !buf.includes("connection_state"); ) {
        const { value, done } = await reader.read().catch(() => {
          throw new SwitchError(503, UNREACHABLE, "stream timed out before connection_state");
        });
        if (done) throw new SwitchError(502, "Switch refused the request", "stream closed before connection_state");
        buf += dec.decode(value, { stream: true });
      }
      clearTimeout(timer);
      const op = (name: string, json: unknown) => call(`${agent}/ops/${name}`, { method: "POST", json, headers: { ...auth, "x-switch-connection-id": connection } });
      await op("connect_to_room", { room_id: roomId, include_general_instructions: false });
      return (await op("post_message", { body: o.body, thread_id: o.threadId }))?.result;
    } finally {
      clearTimeout(timer);
      ac.abort();
    }
  };
  try {
    return await send();
  } catch (e) {
    if (!(e instanceof SwitchError) || e.status !== 403) throw e;
    await joinRoom(roomId, id); // removed from the room since: rejoin once
    return send();
  }
}

// ---- hiring ----
export type HireSpec = { id: string; displayName: string; description: string; instructions: string; directory: string };
type Definition = { provider: string; model: string | null; advanced_config: Record<string, unknown>; auto_mode: boolean; auto_approve: boolean; isolation: string; directory: string | null; instructions: string };
const TEAM_LEAD = "d2c-captain";
/** Coding agent behind every team agent and hire: any Switch provider (claude, codex, opencode). */
export const TEAM_PROVIDER = process.env.TEAM_PROVIDER || "claude";
/** Model for every agent and hire, passed verbatim to the provider. Claude defaults to Haiku (cost); other providers use their own default. */
export const TEAM_MODEL: string | null = process.env.TEAM_MODEL || (TEAM_PROVIDER === "claude" ? "claude-haiku-5-5" : null);
/** Hard tool limits for every team agent and hire (switch/lockdown.json): tool allowlist + auto mode off, so anything
 *  the repo's .claude/settings.json doesn't allow waits for a human. Applied on top of the lead's settings, never copied from them. */
const LOCKDOWN: { advanced_config: Record<string, unknown>; auto_mode: boolean; auto_approve: boolean } =
  JSON.parse(readFileSync(new URL("../../switch/lockdown.json", import.meta.url), "utf8"));

/** Creates the agent on Console's own controller (Switch "managed agents"), so Console runs its Claude Code
 *  session like the rest of the team: no click needed. Model is TEAM_MODEL (Haiku). Provider settings (provider, advanced config,
 *  isolation) are copied from the team lead the Console template created, with LOCKDOWN on top; only the
 *  instructions differ, and the working directory is always the repo (`h.directory`), never the request's. */
export async function createManagedAgent(h: HireSpec): Promise<string> {
  const managed: { name: string; controller_id: string | null; definition: Definition }[] = await gw("GET", "/management/agents");
  const lead = managed.find((a) => a.name === TEAM_LEAD);
  const controllers: { id: string; kind: string; state: string }[] = await gw("GET", "/management/controllers");
  const online = controllers.filter((c) => c.state === "online");
  const ctl = online.find((c) => c.id === lead?.controller_id) ?? online.find((c) => c.kind === "console");
  if (!ctl) throw new SwitchError(503, "Switch Console is not running on this Mac");
  const base: Definition = lead?.definition ?? { provider: "claude", model: null, advanced_config: {}, auto_mode: true, auto_approve: false, isolation: "shared", directory: null, instructions: "" };
  const res = await gw("POST", "/management/agents", {
    name: h.id, description: h.description, display_name: h.displayName, icon_url: null, controller_id: ctl.id, desired_state: "running",
    definition: {
      provider: process.env.TEAM_PROVIDER || base.provider, model: TEAM_MODEL, advanced_config: { ...base.advanced_config, ...LOCKDOWN.advanced_config },
      auto_mode: LOCKDOWN.auto_mode, auto_approve: LOCKDOWN.auto_approve, isolation: base.isolation, directory: h.directory, instructions: h.instructions,
    },
  });
  return res.agent_id;
}

/** Fires a hire: stop managing it (Console stops its session), then delete the Switch agent. */
export async function removeAgent(agentId: string) {
  await gw("DELETE", `/management/agents/${agentId}`).catch((e) => {
    if (!(e instanceof SwitchError) || e.status !== 404) throw e; // not managed (template fallback)
  });
  await gw("DELETE", `/agents/${agentId}`).catch((e) => {
    if (!(e instanceof SwitchError) || e.status !== 404) throw e;
  });
}

/** Fallback when managed agents are unavailable: a one-agent template a human opens in Console. Returns its id. */
export async function storeHireTemplate(h: HireSpec, roomName: string): Promise<string> {
  // JSON is valid YAML, so no YAML writer is needed.
  const content = JSON.stringify({
    version: 1,
    params: { directory: { type: "directory", default: h.directory }, team_room: { type: "room", default: [roomName] } },
    agents: [{ name: h.id, description: h.description, addressing: "anyone" /* scoped by activate() once created (syncPending) */, provider: TEAM_PROVIDER, model: TEAM_MODEL, location: "local", directory: "{directory}", join: ["{team_room}"], instructions: h.instructions }],
  }, null, 2);
  const t = await gw("POST", "/templates", { name: `Hire: ${h.displayName} (${h.id})`, description: h.description, kind: "group", content });
  return t.id;
}

/** Who may address a team agent (docs internals/identity-and-access#addressing-policy). Replaces the legacy open
 *  `policy: null`, under which anyone in any room could address it, and so answer its permission requests:
 *  1. anyone, people and agents, in our team rooms. The founder talks from Telegram without a linked Switch account,
 *     which only `users: "*"` admits;
 *  2. anywhere else, only agents (and the owner): d2c-finance creates the agents-only "Finance desk" at run time, so
 *     its id can't be listed up front. People outside our rooms get Switch's visible refusal.
 *  `platform` stays false, as under the open policy. scripts/switch-up.sh writes the same shape. */
export const teamPolicy = (rooms: string[]) => ({
  rules: [
    { rooms, room_groups: "*", users: "*", agents: "*", owner: true, owner_agents: true, platform: false },
    { rooms: "*", room_groups: "*", users: [], agents: "*", owner: true, owner_agents: true, platform: false },
  ],
});
/** Scopes these agents' addressing to `roomIds` plus the team rooms their policy already names (rooms only grow:
 *  one team serves every linked group). An agent already on that policy is left alone. */
let scoping: Promise<unknown> = Promise.resolve();
export function scopeAddressing(agentIds: string[], roomIds: string[]): Promise<void> {
  // One at a time: two links (or a link during startup) must not read the same old rooms list and drop each other's room.
  const next = scoping.then(() => scopeNow(agentIds, roomIds));
  scoping = next.catch(() => {});
  return next;
}
async function scopeNow(agentIds: string[], roomIds: string[]) {
  const all: { id: string; addressing_policy?: { rules?: { rooms?: unknown }[] } | null }[] = await gw("GET", "/agents");
  for (const id of agentIds) {
    const cur = all.find((a) => a.id === id)?.addressing_policy;
    const had = cur?.rules?.[0]?.rooms;
    const policy = teamPolicy([...new Set([...(Array.isArray(had) ? had : []), ...roomIds])].sort());
    if (JSON.stringify(cur) !== JSON.stringify(policy)) await gw("PUT", `/agents/${id}/addressing-policy`, { policy });
  }
}

/** Team addressing (teamPolicy), then join the room. */
export async function activate(agentId: string, roomId: string) {
  await scopeAddressing([agentId], [roomId]);
  await joinRoom(roomId, agentId);
}

/** Waits until Switch reports the agent "live" in the room (Console's controller is watching it): a new connection
 *  starts at the agent's newest event (switch:bridges/agent/api/handlers.py:766-829), so a message sent before
 *  then never reaches it. Gives up after `ms` (false); errors count as "not yet". */
export async function waitLive(agentId: string, roomId: string, ms: number, every = 2000): Promise<boolean> {
  for (const end = Date.now() + ms; ; await sleep(every)) {
    const a = await gw("GET", `/agents/${encodeURIComponent(agentId)}`).catch(() => null);
    if (a?.rooms?.some((r: { room_id: string; status: string }) => r.room_id === roomId && r.status === "live")) return true;
    if (Date.now() >= end) return false;
  }
}

export async function findAgent(name: string): Promise<string | null> {
  return (await switchAgents()).find((a) => a.name === name)?.id ?? null;
}
export const switchAgents = (): Promise<{ id: string; name: string }[]> => gw("GET", "/agents");
