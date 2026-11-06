// Shared test kit: the server as a real process (tsx, src/) on a random port, against a fake Switch server
// (gateway + agent bridge) and a fake Telegram Bot API in this process. Accounts and workspace linking helpers.
import { after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs = [];
const procs = new Set();
export function tmp() {
  const d = mkdtempSync(join(tmpdir(), "hq-test-"));
  dirs.push(d);
  return d;
}

// ---- fake Switch + Telegram ----
export const calls = [];
export const fake = {
  managementDown: false, roomsBroken: false /* every gateway call → 500 */,
  agentsFlaky: 0 /* the next N GET /gateway/agents → 503 */, agentsMissing: [] /* names left out of GET /gateway/agents */,
  tgEditError: null /* editForumTopic answers { ok: false, description } with HTTP 500 */, tgDelay: 0 /* ms before each Bot API answer */, tg429: 0 /* the next N createForumTopic → 429 */, streamSilent: false /* office SSE never says connection_state */,
  notLive: false /* GET /gateway/agents/{id} never shows the agent live in a room */,
  chats: { "room-1": "-100", old: "-5" }, // Switch room → Telegram chat id
  obsRooms: [] /* the observer's list_rooms result */, obsFrames: [] /* message payloads its stream sends after connection_state */,
  tg: { ok: true, forum: true, admin: true, type: "supergroup", topics: new Set(), next: 100 },
};
import { readFileSync } from "node:fs";
const ROSTER = JSON.parse(readFileSync(new URL("../../contracts/roster.json", import.meta.url), "utf8"));
/** Every roster Switch agent (16: not the Librarian), as the fake Switch registers them: x1, x2, … in roster order. */
export const TEAM = ROSTER.people.filter((p) => p.kind === "agent" && p.id !== "librarian").map((p) => p.id);
const sw = createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const json = body ? JSON.parse(body) : null;
  calls.push({ method: req.method, path: req.url, json, headers: req.headers });
  const ok = (b, status = 200, h = {}) => (res.writeHead(status, { "content-type": "application/json", ...h }), res.end(JSON.stringify(b)));
  const r = `${req.method} ${req.url.split("?")[0]}`;
  // Telegram Bot API
  const tg = r.match(/^POST \/bot([^/]+)\/(\w+)$/);
  if (tg) {
    const t = fake.tg;
    if (fake.tgDelay) await new Promise((r) => setTimeout(r, fake.tgDelay));
    if (tg[2] === "editForumTopic" && fake.tgEditError) return ok({ ok: false, error_code: 500, description: fake.tgEditError }, 500);
    if (tg[1] !== "123:tg-secret") return ok({ ok: false, description: "Unauthorized" }, 401);
    if (tg[2] === "getChat") return ok(t.ok ? { ok: true, result: { id: json.chat_id, type: t.type, is_forum: t.forum } } : { ok: false, description: "Bad Request: chat not found" });
    if (tg[2] === "getChatMember") return ok({ ok: true, result: t.admin ? { status: "administrator", can_manage_topics: true } : { status: "member" } });
    if (tg[2] === "createForumTopic" && fake.tg429 > 0) return fake.tg429--, ok({ ok: false, error_code: 429, description: "Too Many Requests: retry after 1", parameters: { retry_after: 1 } }, 429);
    if (tg[2] === "createForumTopic") return t.topics.add(++t.next), ok({ ok: true, result: { message_thread_id: t.next, name: json.name } });
    if (tg[2] === "editForumTopic") return ok(t.topics.has(json.message_thread_id) ? { ok: false, description: "Bad Request: TOPIC_NOT_MODIFIED" } : { ok: false, description: "Bad Request: TOPIC_ID_INVALID" });
    return ok({ ok: false, description: "unexpected " + tg[2] }, 418);
  }
  if (r === "GET /health") return ok({ status: "ok" });
  if (r === "POST /gateway/auth/login") return ok({ email: "a", role: "admin" }, 200, { "set-cookie": "sid=s1; Path=/" });
  if (req.url.startsWith("/gateway") && req.headers.cookie !== "sid=s1") return ok({ detail: "no session" }, 401);
  if (fake.roomsBroken) return ok({ detail: "db password=hunter2 exploded" }, 500);
  if (r === "GET /gateway/rooms") return ok(Object.keys(fake.chats).map((id) => ({ id, name: "Kratos D2C", bridge_type: "telegram" })));
  const room = r.match(/^GET \/gateway\/rooms\/([\w-]+)$/);
  if (room) return ok({ id: room[1], name: "Kratos D2C", external_channel_id: fake.chats[room[1]] ?? null });
  if (/^POST \/gateway\/rooms\/[\w-]+\/agents$/.test(r)) return ok({});
  if (r === "POST /gateway/agents/register") return ok({ id: "office-1", api_key: "secret-key" });
  if (/^PUT \/gateway\/agents\/[\w-]+\/addressing-policy$/.test(r)) return ok({});
  if (r === "GET /gateway/management/controllers") return ok([{ id: "c0", kind: "console", state: "online" }, { id: "c1", kind: "console", state: "online" }]);
  if (r === "GET /gateway/management/agents") return ok([{ name: "d2c-captain", controller_id: "c1", definition: {
    provider: "claude", model: "team-model", advanced_config: { effort: "high" }, auto_mode: true, auto_approve: false, isolation: "shared", directory: "/somewhere-else", instructions: "captain" } }]);
  if (r === "GET /gateway/agents" && fake.agentsFlaky > 0) return fake.agentsFlaky--, ok({ detail: "busy" }, 503);
  if (r === "GET /gateway/agents") return ok([...TEAM.map((n, i) => ({ id: `x${i + 1}`, name: n })).filter((a) => !fake.agentsMissing.includes(a.name)), { id: "xt", name: "d2c-taken" }, { id: "obs", name: "d2c-observer" }]);
  if (/^GET \/gateway\/agents\/[\w-]+$/.test(r)) return ok({ id: r.split("/").pop(), rooms: [{ room_id: "room-1", status: fake.notLive ? "no_session" : "live" }] });
  if (/^DELETE \/gateway\/(management\/)?agents\/[\w-]+$/.test(r)) return ok({ ok: true });
  if (r === "POST /gateway/management/agents") return fake.managementDown ? ok({ detail: "Not Found" }, 404) : ok({ agent_id: `sw-${json.name}` }, 201);
  if (r === "POST /gateway/templates") return ok({ id: "tpl-1" }, 201);
  if (r === "POST /agents/office-1/message") return ok({ ok: true, event_id: "e1" });
  if (r === "GET /agents/office-1/events") {
    res.writeHead(200, { "content-type": "text/event-stream" });
    return res.write(fake.streamSilent ? ": keepalive\n\n" : "event: connection_state\ndata: {}\n\n"); // stays open until the client aborts
  }
  // the observer (agent "obs"): one SSE stream with fake.obsFrames, list_rooms, heartbeat
  if (r === "GET /agents/obs/events") {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("event: connection_state\ndata: {}\n\n");
    fake.obsFrames.forEach((f, i) => res.write(`event: message\nid: ${i + 1}\ndata: ${JSON.stringify({ type: "message", sequence: i + 1, ...f })}\n\n`));
    return; // stays open until the client aborts
  }
  if (r === "POST /agents/obs/ops/list_rooms") return ok({ result: fake.obsRooms });
  if (r === "POST /agents/obs/connection/beat") return ok({});
  if (r === "POST /agents/office-1/ops/connect_to_room") return ok({ result: {} });
  if (r === "POST /agents/office-1/ops/post_message") return ok({ result: { event_id: "e2" } });
  ok({ detail: "unexpected " + r }, 418);
});
await new Promise((r) => sw.listen(0, "127.0.0.1", r));
export const swDir = tmp();
export const upstream = `http://127.0.0.1:${sw.address().port}`;
writeFileSync(join(swDir, "core.env"), `SERVER_PORT=${sw.address().port}\nGATEWAY_ADMIN_EMAIL=a@x\nGATEWAY_ADMIN_PASSWORD='pw'\n`);

after(() => {
  for (const p of procs) p.kill("SIGKILL");
  sw.closeAllConnections();
  sw.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Starts the server; resolves with { base, port, stop, log } once it logs "listening". */
export function start(env = {}) {
  const proc = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env, PORT: "0", OBSERVER_TOKEN: "", ADMIN_TOKEN: "", NODE_ENV: "", ALLOW_OPEN: "", TRUST_LOOPBACK: "", TRUST_PROXY: "", DATA_DIR: tmp(),
      FLY_APP_NAME: "", OFFICE_ORIGINS: "", SWITCH_CORE_ENV: join(swDir, "core.env"), SWITCH_OFFICE_CREDS: join(tmp(), "office.json"),
      TELEGRAM_API: upstream, TELEGRAM_BOT_TOKEN: "123:tg-secret", ENV_FILE: join(swDir, "no.env"), TOPICS_FILE: join(swDir, "no-topics.json"),
      AGENT_DIR: "/repo", CLAUDE_BIN: "/usr/bin/false", ROOM_WATCH_MS: "3600000", ...env,
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  procs.add(proc);
  return new Promise((resolve, reject) => {
    let buf = "";
    proc.on("exit", (c) => reject(new Error(`server exited ${c}\n${buf}`)));
    proc.stdout.on("data", (d) => {
      buf += d;
      const m = buf.match(/"msg":"listening","port":(\d+)/);
      if (!m) return;
      const base = `http://127.0.0.1:${m[1]}`;
      const stop = () => new Promise((r) => { proc.removeAllListeners("exit"); proc.on("exit", r); proc.kill("SIGTERM"); procs.delete(proc); });
      resolve({ base, port: m[1], stop, log: () => buf });
    });
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A same-origin browser POST (JSON, Origin = the server's own), with the session cookie if given. */
export const post = (s, path, body, headers = {}) =>
  fetch(s.base + path, { method: "POST", headers: { "content-type": "application/json", origin: s.base, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
export const get = (s, path, cookie, headers = {}) => fetch(s.base + path, { headers: { ...(cookie ? { cookie } : {}), ...headers } });
export const getJson = async (s, path, cookie) => {
  const r = await get(s, path, cookie);
  assert.equal(r.status, 200, `${path} → ${r.status}`);
  return r.json();
};

/** Signs up; returns "hq_session=…" for the cookie header. */
export async function account(s, email = `u${Math.random().toString(36).slice(2)}@example.com`, password = "correct horse battery") {
  const r = await post(s, "/api/auth/signup", { email, password, name: "Test" });
  assert.equal(r.status, 201, await r.clone().text());
  return r.headers.get("set-cookie").split(";")[0];
}

/** An observer event from Switch room `room` (default: the linked test room). */
export const ev = (o = {}, room = "room-1") => ({
  t: Date.now(), room: "ops", speaker: "d2c-ops", type: "message", text: "hi", ...o, meta: { switch_room_id: room, room_name: "Telegram: Kratos D2C", ...o.meta },
});

/** Issues a code and sends it from Switch room `room`, as the observer would; waits for `want` (default ready).
 *  Returns the connect status (with .workspace). */
export async function link(s, cookie, { room = "room-1", chat, want = "ready", headers = {} } = {}) {
  const { code } = await (await post(s, "/api/workspaces/connect", {}, { cookie })).json();
  const meta = { switch_room_id: room, room_name: "Telegram: Kratos D2C", ...(chat ? { chat_id: chat } : {}) };
  const r = await post(s, "/api/events", { t: Date.now(), room: "war_room", speaker: "founder", type: "message", text: `link ${code}`, meta }, headers);
  assert.equal(r.status, 202);
  return waitState(s, cookie, want);
}
export async function waitState(s, cookie, want) {
  let st;
  for (let i = 0; i < 50; i++) {
    st = await getJson(s, "/api/workspaces/connect/status", cookie);
    if (st.state === want) return st;
    await sleep(50);
  }
  assert.fail(`connect status ${JSON.stringify(st)}, want ${want}`);
}
