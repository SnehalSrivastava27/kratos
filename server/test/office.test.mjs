// Office actions against a fake Switch server (gateway + agent bridge) running in this process.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { mkdtempSync, rmSync, writeFileSync, statSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CWD = new URL("..", import.meta.url);
const dirs = [];
const procs = new Set();
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "hq-office-"));
  dirs.push(d);
  return d;
};

// ---- fake Switch ----
const calls = [];
let managementDown = false;
const sw = createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const json = body ? JSON.parse(body) : null;
  calls.push({ method: req.method, path: req.url, json, headers: req.headers });
  const ok = (b, status = 200, h = {}) => (res.writeHead(status, { "content-type": "application/json", ...h }), res.end(JSON.stringify(b)));
  const r = `${req.method} ${req.url.split("?")[0]}`;
  if (r === "POST /gateway/auth/login") return ok({ email: "a", role: "admin" }, 200, { "set-cookie": "sid=s1; Path=/" });
  if (req.url.startsWith("/gateway") && req.headers.cookie !== "sid=s1") return ok({ detail: "no session" }, 401);
  if (r === "GET /gateway/rooms") return ok([{ id: "old", name: "Kratos D2C" }, { id: "room-1", name: "Kratos D2C" }]);
  if (r === "GET /gateway/rooms/old") return ok({ id: "old", name: "Kratos D2C", external_channel_id: "-5" });
  if (r === "GET /gateway/rooms/room-1") return ok({ id: "room-1", name: "Kratos D2C", external_channel_id: "-100" });
  if (r === "POST /gateway/agents/register") return ok({ id: "office-1", api_key: "secret-key" });
  if (/^PUT \/gateway\/agents\/[\w-]+\/addressing-policy$/.test(r)) return ok({});
  if (r === "POST /gateway/rooms/room-1/agents") return ok({});
  if (r === "GET /gateway/management/controllers") return ok([{ id: "c1", kind: "console", state: "online" }]);
  if (r === "POST /gateway/management/agents") return managementDown ? ok({ detail: "Not Found" }, 404) : ok({ agent_id: `sw-${json.name}` }, 201);
  if (r === "POST /gateway/templates") return ok({ id: "tpl-1" }, 201);
  if (r === "POST /agents/office-1/message") return ok({ ok: true, event_id: "e1" });
  if (r === "GET /agents/office-1/events") {
    res.writeHead(200, { "content-type": "text/event-stream" });
    return res.write("event: connection_state\ndata: {}\n\n"); // stays open until the client aborts
  }
  if (r === "POST /agents/office-1/ops/connect_to_room") return ok({ result: {} });
  if (r === "POST /agents/office-1/ops/post_message") return ok({ result: { event_id: "e2" } });
  ok({ detail: "unexpected " + r }, 418);
});
await new Promise((r) => sw.listen(0, "127.0.0.1", r));
const swDir = tmp();
writeFileSync(join(swDir, "core.env"), `SERVER_PORT=${sw.address().port}\nGATEWAY_ADMIN_EMAIL=a@x\nGATEWAY_ADMIN_PASSWORD='pw'\n`);
const topicsFile = join(swDir, "topics.json");
writeFileSync(topicsFile, JSON.stringify({ chat_id: "-100", topics: { war_room: { name: "War Room", message_thread_id: 4, switch_thread_id: null }, ads: { name: "Ads", message_thread_id: 6, switch_thread_id: "sw_thread_ads" } } }));

const libFile = join(swDir, "library.json");
writeFileSync(libFile, JSON.stringify({ updatedAt: 1, librarian: "idle", shelves: [{ id: "general", label: "General", books: [
  { id: "gstack:qa", name: "qa", description: "QA", source: "gstack", path: "/skills/qa/SKILL.md", department: "general", why: "" },
] }] }));

after(() => {
  for (const p of procs) p.kill("SIGKILL");
  sw.closeAllConnections();
  sw.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function start(env = {}) {
  const proc = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: CWD,
    env: {
      ...process.env, PORT: "0", OBSERVER_TOKEN: "", ADMIN_TOKEN: "", NODE_ENV: "", ALLOW_OPEN: "", TRUST_LOOPBACK: "", DATA_DIR: tmp(),
      SWITCH_CORE_ENV: join(swDir, "core.env"), SWITCH_OFFICE_CREDS: join(tmp(), "office.json"), TOPICS_FILE: topicsFile, AGENT_DIR: "/repo",
      LIBRARY_FILE: libFile, CLAUDE_BIN: "/usr/bin/false", ...env,
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
      if (m) resolve({ base: `http://127.0.0.1:${m[1]}`, log: () => buf, stop: () => new Promise((r) => { proc.removeAllListeners("exit"); proc.on("exit", r); proc.kill("SIGTERM"); procs.delete(proc); }) });
    });
  });
}
// As the office in a browser on this Mac: same-origin, so Origin = the server's own.
const post = (s, path, body, headers = {}) => fetch(s.base + path, { method: "POST", headers: { "content-type": "application/json", origin: s.base, ...headers }, body: JSON.stringify(body) });
/** Raw HTTP so Host/Origin/X-Forwarded-* can be set exactly as a browser or proxy would. */
function raw(s, method, path, { headers = {}, body } = {}) {
  const port = new URL(s.base).port;
  return new Promise((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    r.on("error", reject);
    r.end(body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body));
  });
}
const browser = (s, extra = {}) => ({ "content-type": "application/json", origin: `http://127.0.0.1:${new URL(s.base).port}`, ...extra });

const STYLE = readFileSync(new URL("../../switch/TELEGRAM_STYLE.md", import.meta.url), "utf8").trim();
const hire = (o = {}) => ({ name: "Priya Shah", role: "Retention Lead", room: "ads", instructions: "Win back lapsed buyers.", skills: ["gstack:qa"], ...o });

test("guard: office writes need loopback or ADMIN_TOKEN, never open; reads stay open", async () => {
  let s = await start({ TRUST_LOOPBACK: "0", ADMIN_TOKEN: "adm" }); // as if every caller were remote
  try {
    for (const [path, body] of [["/api/command", { room: "war_room", text: "hi" }], ["/api/employees", hire()], ["/api/library/categorize", {}]]) {
      assert.equal((await post(s, path, body)).status, 401, path);
      assert.equal((await post(s, path, body, { authorization: "Bearer wrong" })).status, 401, path);
    }
    assert.equal((await post(s, "/api/command", { room: "war_room", text: "hi" }, { authorization: "Bearer adm" })).status, 202);
    for (const path of ["/api/people", "/api/employees", "/api/library"]) assert.equal((await fetch(s.base + path)).status, 200, path);
    const lib = await (await fetch(s.base + "/api/library")).json();
    assert.ok(lib.shelves.flatMap((x) => x.books).every((b) => b.path === undefined), "paths hidden from non-loopback");
  } finally {
    await s.stop();
  }
  s = await start({ TRUST_LOOPBACK: "0" }); // no ADMIN_TOKEN set: still closed
  try {
    assert.equal((await post(s, "/api/command", { room: "war_room", text: "hi" })).status, 401);
  } finally {
    await s.stop();
  }
});

test("CSRF + DNS rebinding (TRUST_LOOPBACK on, the default): writes need JSON, a local Host and a local Origin", async () => {
  const s = await start({ ADMIN_TOKEN: "adm" });
  try {
    const writes = [["/api/command", { room: "war_room", text: "hi" }], ["/api/employees", hire()], ["/api/library/categorize", {}], ["/api/replay", {}], ["/api/replay/stop", {}]];
    for (const [path, body] of writes) {
      // a cross-site "simple" form/fetch POST: no preflight, text/plain
      let r = await raw(s, "POST", path, { headers: { "content-type": "text/plain", origin: "https://evil.example" }, body });
      assert.equal(r.status, 415, `text/plain ${path}`);
      r = await raw(s, "POST", path, { headers: browser(s, { origin: "https://evil.example" }), body });
      assert.equal(r.status, 403, `evil origin ${path}`);
      r = await raw(s, "POST", path, { headers: browser(s, { host: "evil.example:80", origin: "http://evil.example:80" }), body });
      assert.equal(r.status, 403, `rebound host ${path}`);
    }
    assert.equal((await raw(s, "POST", "/api/command", { headers: { "content-type": "application/json" }, body: { room: "war_room", text: "hi" } })).status, 401, "loopback without Origin is not a browser: needs the token");
    assert.equal((await raw(s, "POST", "/api/command", { headers: browser(s), body: { room: "war_room", text: "hi" } })).status, 202, "same-origin office");
    const vite = { "content-type": "application/json", host: "localhost:5173", origin: "http://localhost:5173", "x-forwarded-for": "127.0.0.1" };
    assert.equal((await raw(s, "POST", "/api/command", { headers: vite, body: { room: "war_room", text: "hi" } })).status, 202, "vite dev proxy on this Mac");
    assert.equal((await raw(s, "POST", "/api/command", { headers: { "content-type": "application/json", host: "evil.example", authorization: "Bearer adm" }, body: { room: "war_room", text: "hi" } })).status, 202, "token clients: any host, no Origin");
    // reads that reveal local paths: not to a rebound Host
    let lib = JSON.parse((await raw(s, "GET", "/api/library", { headers: { host: "evil.example:80" } })).body);
    assert.equal(lib.shelves[0].books[0].path, undefined, "rebound host sees no paths");
    lib = JSON.parse((await raw(s, "GET", "/api/library")).body);
    assert.equal(lib.shelves[0].books[0].path, "/skills/qa/SKILL.md", "the office on this Mac does");
  } finally {
    await s.stop();
  }
});

test("proxied requests are not loopback-trusted unless every hop is this Mac", async () => {
  const s = await start();
  try {
    const cmd = (extra) => raw(s, "POST", "/api/command", { headers: browser(s, extra), body: { room: "war_room", text: "hi" } }).then((r) => r.status);
    assert.equal(await cmd({ "x-forwarded-for": "203.0.113.9" }), 401, "remote client via vite --host");
    assert.equal(await cmd({ "x-forwarded-for": "127.0.0.1, 203.0.113.9" }), 401, "spoofed loopback hop");
    assert.equal(await cmd({ forwarded: "for=203.0.113.9" }), 401);
    assert.equal(await cmd({ "x-forwarded-for": "127.0.0.1", "x-forwarded-host": "192.168.1.5:5173" }), 401, "LAN host via proxy");
    assert.equal(await cmd({ "x-forwarded-for": "::1" }), 202);
    const lib = JSON.parse((await raw(s, "GET", "/api/library", { headers: { "x-forwarded-for": "203.0.113.9" } })).body);
    assert.equal(lib.shelves[0].books[0].path, undefined, "no paths to proxied remote readers");
  } finally {
    await s.stop();
  }
});

test("validation: command and hire bodies", async () => {
  const s = await start();
  try {
    for (const b of [{ room: "nope", text: "hi" }, { room: "war_room", text: "" }, { room: "war_room", text: "   " }, { room: "war_room", text: "x".repeat(2001) }, { room: "war_room" }])
      assert.equal((await post(s, "/api/command", b)).status, 400, JSON.stringify(b).slice(0, 60));
    for (const b of [hire({ name: "" }), hire({ name: "!!!" }), hire({ role: undefined }), hire({ room: "x" }), hire({ instructions: "" }), hire({ color: "red" }), hire({ skills: "qa" }), hire({ skills: [1] })])
      assert.equal((await post(s, "/api/employees", b)).status, 400, JSON.stringify(b).slice(0, 80));
    assert.equal((await fetch(s.base + "/api/employees").then((r) => r.json())).length, 0);
  } finally {
    await s.stop();
  }
});

test("command: registers d2c-office once, posts to the team room, addresses the room lead, threads by topic, rate limited", async () => {
  calls.length = 0;
  const credsFile = join(tmp(), "office.json");
  const s = await start({ SWITCH_OFFICE_CREDS: credsFile });
  try {
    let r = await post(s, "/api/command", { room: "war_room", text: "Plan the Diwali sale" });
    assert.equal(r.status, 202);
    assert.deepEqual(await r.json(), { ok: true, via: "switch:d2c-office", thread: "group" });
    const msg = calls.find((c) => c.path === "/agents/office-1/message");
    assert.deepEqual(msg.json, { room_id: "room-1", content: "#WarRoom @d2c-captain Plan the Diwali sale" }, "room picked by chat id; lead addressed; topic tag");
    assert.equal(msg.headers.authorization, "Bearer secret-key");
    assert.equal(statSync(credsFile).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(credsFile, "utf8")).env.SWITCH_AGENT_ID, "office-1");
    assert.ok(!s.log().includes("secret-key"), "key never logged");

    r = await post(s, "/api/command", { room: "ads", text: "@d2c-analyst numbers please" });
    assert.equal(r.status, 202);
    assert.equal((await r.json()).thread, "topic");
    const op = calls.find((c) => c.path === "/agents/office-1/ops/post_message");
    assert.deepEqual(op.json, { body: "@d2c-analyst numbers please", thread_id: "sw_thread_ads" }, "named agent kept, no lead added, threaded");
    assert.ok(op.headers["x-switch-connection-id"]);
    assert.equal(calls.filter((c) => c.path === "/gateway/agents/register").length, 1, "registered once");

    for (let i = 0; i < 8; i++) assert.equal((await post(s, "/api/command", { room: "ops", text: `go ${i}` })).status, 202);
    assert.equal((await post(s, "/api/command", { room: "ops", text: "one too many" })).status, 429);
  } finally {
    await s.stop();
  }
});

test("hiring: managed agent on Console's controller, unique ids, desks, hired event, persisted", async () => {
  calls.length = 0;
  const DATA_DIR = tmp();
  let s = await start({ DATA_DIR });
  try {
    let r = await post(s, "/api/employees", hire({ emoji: "💌", color: "#112233" }));
    assert.equal(r.status, 201);
    const a = await r.json();
    assert.equal(a.id, "d2c-priya-shah");
    assert.equal(a.desk, "growth_pod#1", "d2c-ads sits at growth_pod#0");
    assert.equal(a.status, "active");
    assert.equal(a.switchAgentId, "sw-d2c-priya-shah");
    assert.equal(a.instructions, undefined);
    const create = calls.find((c) => c.path === "/gateway/management/agents");
    assert.equal(create.json.controller_id, "c1");
    assert.equal(create.json.desired_state, "running");
    assert.equal(create.json.definition.directory, "/repo");
    assert.equal(create.json.definition.provider, "claude");
    assert.match(create.json.definition.instructions, /Win back lapsed buyers[\s\S]*gstack:qa[\s\S]*HOW YOU WRITE IN TELEGRAM[\s\S]*yours is Ads/);
    assert.ok(create.json.definition.instructions.includes(STYLE), "exact team Telegram style block");
    assert.deepEqual(calls.find((c) => c.path === "/gateway/agents/sw-d2c-priya-shah/addressing-policy").json, { policy: null }, "addressing: anyone");
    assert.deepEqual(calls.find((c) => c.path === "/gateway/rooms/room-1/agents").json, { agent_ids: ["sw-d2c-priya-shah"] });

    const b = await (await post(s, "/api/employees", hire())).json();
    assert.equal(b.id, "d2c-priya-shah-2");
    assert.equal(b.desk, "growth_pod#2");
    const hired = (await (await fetch(s.base + "/api/history")).json()).filter((e) => e.type === "hired");
    assert.deepEqual(hired.map((e) => [e.speaker, e.room, e.meta.employee_id]), [["d2c-priya-shah", "ads", "d2c-priya-shah"], ["d2c-priya-shah-2", "ads", "d2c-priya-shah-2"]]);
    assert.match(hired[0].id, /^srv-/);
  } finally {
    await s.stop();
  }
  s = await start({ DATA_DIR });
  try {
    assert.deepEqual((await (await fetch(s.base + "/api/employees")).json()).map((e) => e.id), ["d2c-priya-shah", "d2c-priya-shah-2"]);
    const people = await (await fetch(s.base + "/api/people")).json();
    const p = people.find((x) => x.id === "d2c-priya-shah");
    assert.deepEqual([p.kind, p.zone, p.desk, p.emoji, p.color], ["agent", "growth_pod", "growth_pod#1", "💌", "#112233"]);
    assert.ok(people.some((x) => x.id === "d2c-captain"), "roster people included");
    assert.ok((await (await fetch(s.base + "/api/agents")).json()).some((x) => x.id === "d2c-priya-shah"));
    assert.ok((await (await fetch(s.base + "/api/rooms")).json()).find((x) => x.id === "ads").members.includes("d2c-priya-shah"));
  } finally {
    await s.stop();
  }
});

test("hiring fallback: no managed agents → one-agent template + 202 open_url", async () => {
  managementDown = true;
  const s = await start();
  try {
    const r = await post(s, "/api/employees", hire({ name: "Dev" }));
    assert.equal(r.status, 202);
    const { employee, action } = await r.json();
    assert.equal(employee.status, "pending_console");
    assert.equal(employee.switchAgentId, null);
    assert.deepEqual(action, { kind: "open_url", url: "switchdash://open/template/tpl-1", label: "Finish in Switch Console" });
    const tpl = JSON.parse(calls.findLast((c) => c.path === "/gateway/templates").json.content);
    assert.equal(tpl.agents[0].name, "d2c-dev");
    assert.equal(tpl.agents[0].addressing, "anyone");
  } finally {
    managementDown = false;
    await s.stop();
  }
});

test("switch/TELEGRAM_STYLE.md is the block every team agent uses (no drift)", () => {
  const dir = new URL("../../switch/agents/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) assert.ok(readFileSync(new URL(f, dir), "utf8").includes(STYLE), f);
});

test("switch down: 503, nothing hired", async () => {
  const s = await start({ SWITCH_CORE_ENV: join(swDir, "missing.env") });
  try {
    assert.equal((await post(s, "/api/command", { room: "war_room", text: "hi" })).status, 503);
    assert.equal((await post(s, "/api/employees", hire())).status, 503);
    assert.equal((await (await fetch(s.base + "/api/employees")).json()).length, 0);
  } finally {
    await s.stop();
  }
});
