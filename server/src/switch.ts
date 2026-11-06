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

export class SwitchError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

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

async function call(url: string, init: RequestInit & { json?: unknown } = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { accept: "application/json", ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => {
    throw new SwitchError(503, `Switch unreachable: ${e.cause?.code ?? e.message}`);
  });
  const text = await res.text();
  if (!res.ok) throw new SwitchError(res.status, `Switch ${init.method ?? "GET"} ${new URL(url).pathname} → ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// ---- admin gateway (cookie session, re-login once on 401) ----
let cookie = "";
async function login() {
  const e = coreEnv();
  const res = await fetch(`${base()}/gateway/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: e.GATEWAY_ADMIN_EMAIL, password: e.GATEWAY_ADMIN_PASSWORD }), signal: AbortSignal.timeout(15_000),
  }).catch((err) => {
    throw new SwitchError(503, `Switch unreachable: ${err.cause?.code ?? err.message}`);
  });
  if (!res.ok) throw new SwitchError(502, `Switch admin login failed (${res.status})`);
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

/** The Switch room for the team's Telegram group: matched by chat id (observer/topics.json), else by name. */
export async function teamRoomId(chatId: string | undefined, name: string): Promise<string> {
  const rooms: { id: string; name: string; external_channel_id?: string | null }[] = await gw("GET", "/rooms");
  const byChat = chatId && (await Promise.all(rooms.filter((r) => r.name === name).map((r) => gw("GET", `/rooms/${r.id}`)))).find((r) => String(r.external_channel_id) === chatId);
  const room = byChat || rooms.find((r) => r.name === name || r.name.endsWith(`: ${name}`));
  if (!room) throw new SwitchError(503, `Switch room "${name}" not found (add the bot to the Telegram group)`);
  return room.id;
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
export async function postAsOffice(o: { credsFile: string; chatId?: string; roomName: string; body: string; threadId?: string | null }) {
  const roomId = await teamRoomId(o.chatId, o.roomName);
  const creds = await officeCreds(o.credsFile, roomId);
  const { SWITCH_AGENT_ID: id, SWITCH_API_ENDPOINT: ep, SWITCH_API_TOKEN: token } = creds.env;
  const agent = `${ep.replace(/\/$/, "")}/agents/${id}`;
  const auth = { authorization: `Bearer ${token}` };
  const send = async (): Promise<{ event_id?: string }> => {
    if (!o.threadId) return call(`${agent}/message`, { method: "POST", json: { room_id: roomId, content: o.body }, headers: auth });
    const connection = randomUUID();
    const ac = new AbortController();
    try {
      const q = new URLSearchParams({ connection_id: connection, scope: "single", filter: "addressed", start_from: "head", client: OFFICE_AGENT });
      const res = await fetch(`${agent}/events?${q}`, { headers: { ...auth, accept: "text/event-stream" }, signal: ac.signal });
      if (!res.ok || !res.body) throw new SwitchError(res.status, `Switch stream open → ${res.status}`);
      const reader = res.body.getReader();
      for (let buf = ""; !buf.includes("connection_state"); ) {
        const { value, done } = await reader.read();
        if (done) throw new SwitchError(502, "Switch stream closed before connection_state");
        buf += new TextDecoder().decode(value);
      }
      const op = (name: string, json: unknown) => call(`${agent}/ops/${name}`, { method: "POST", json, headers: { ...auth, "x-switch-connection-id": connection } });
      await op("connect_to_room", { room_id: roomId, include_general_instructions: false });
      return (await op("post_message", { body: o.body, thread_id: o.threadId }))?.result;
    } finally {
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

/** Creates the agent on Console's own controller (Switch "managed agents"), so Console runs its Claude Code
 *  session like the rest of the team: no click needed. Returns its Switch id. */
export async function createManagedAgent(h: HireSpec): Promise<string> {
  const controllers: { id: string; kind: string; state: string }[] = await gw("GET", "/management/controllers");
  const ctl = controllers.find((c) => c.kind === "console" && c.state === "online") ?? controllers.find((c) => c.state === "online");
  if (!ctl) throw new SwitchError(503, "no online Switch Console controller on this Mac");
  const res = await gw("POST", "/management/agents", {
    name: h.id, description: h.description, display_name: h.displayName, icon_url: null, controller_id: ctl.id, desired_state: "running",
    definition: { provider: "claude", model: null, advanced_config: {}, instructions: h.instructions, auto_mode: true, auto_approve: false, directory: h.directory, isolation: "shared" },
  });
  return res.agent_id;
}

/** Fallback when managed agents are unavailable: a one-agent template a human opens in Console. Returns its id. */
export async function storeHireTemplate(h: HireSpec, roomName: string): Promise<string> {
  // JSON is valid YAML, so no YAML writer is needed.
  const content = JSON.stringify({
    version: 1,
    params: { directory: { type: "directory", default: h.directory }, team_room: { type: "room", default: [roomName] } },
    agents: [{ name: h.id, description: h.description, addressing: "anyone", provider: "claude", location: "local", directory: "{directory}", join: ["{team_room}"], instructions: h.instructions }],
  }, null, 2);
  const t = await gw("POST", "/templates", { name: `Hire: ${h.displayName} (${h.id})`, description: h.description, kind: "group", content });
  return t.id;
}

/** Open addressing (anyone in the room, people and agents), like the team, then join the room. */
export async function activate(agentId: string, roomId: string) {
  await gw("PUT", `/agents/${agentId}/addressing-policy`, { policy: null });
  await joinRoom(roomId, agentId);
}

export async function findAgent(name: string): Promise<string | null> {
  const agents: { id: string; name: string }[] = await gw("GET", "/agents");
  return agents.find((a) => a.name === name)?.id ?? null;
}
