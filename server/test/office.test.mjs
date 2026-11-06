// Office actions against a fake Switch server (gateway + agent bridge) and Telegram, in this process (helpers.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { writeFileSync, statSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { start as startServer, tmp, calls, fake, swDir, account, link } from "./helpers.mjs";

// The pre-v3 topic map: linking the group with this chat id adopts it (ads already has a Switch thread).
const topicsFile = join(swDir, "topics.json");
const TOPICS_FIXTURE = JSON.stringify({ chat_id: "-100", topics: { war_room: { name: "War Room", message_thread_id: 4, switch_thread_id: null }, ads: { name: "Ads", message_thread_id: 6, switch_thread_id: "sw_thread_ads" } } });
writeFileSync(topicsFile, TOPICS_FIXTURE);
fake.tg.topics.add(4).add(6); // those topics still exist in Telegram

const libFile = join(swDir, "library.json");
const LIBRARY_FIXTURE = JSON.stringify({ updatedAt: 1, librarian: "idle", shelves: [{ id: "general", label: "General", books: [
  { id: "gstack:qa", name: "qa", description: "QA", source: "gstack", path: "/skills/qa/SKILL.md", department: "general", why: "" },
] }] });
writeFileSync(libFile, LIBRARY_FIXTURE);

/** A server whose owner (s.cookie) has linked "Kratos D2C" (Switch room-1, chat -100) and it is ready. */
async function start(env = {}, { linked = true } = {}) {
  writeFileSync(topicsFile, TOPICS_FIXTURE);
  writeFileSync(libFile, LIBRARY_FIXTURE);
  const s = await startServer({ TOPICS_FILE: topicsFile, LIBRARY_FILE: libFile, ...env });
  if (!linked) return s;
  s.cookie = await account(s);
  s.ws = (await link(s, s.cookie, { headers: env.OBSERVER_TOKEN ? { authorization: `Bearer ${env.OBSERVER_TOKEN}` } : {} })).workspace;
  calls.length = 0;
  return s;
}
// As the office in a browser on this Mac: same-origin, so Origin = the server's own; signed in.
const post = (s, path, body, headers = {}) => fetch(s.base + path, { method: "POST", headers: { "content-type": "application/json", origin: s.base, cookie: s.cookie, ...headers }, body: JSON.stringify(body) });
const getJ = (s, path, headers = {}) => fetch(s.base + path, { headers: { cookie: s.cookie, ...headers } }).then((r) => r.json());
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
const browser = (s, extra = {}) => ({ "content-type": "application/json", origin: `http://127.0.0.1:${new URL(s.base).port}`, cookie: s.cookie, ...extra });

const STYLE = readFileSync(new URL("../../switch/TELEGRAM_STYLE.md", import.meta.url), "utf8").trim();
const hire = (o = {}) => ({ name: "Priya Shah", role: "Retention Lead", room: "ads", instructions: "Win back lapsed buyers.", skills: ["gstack:qa"], ...o });

test("guard (v3): office reads and writes need the workspace owner's session or ADMIN_TOKEN; loopback alone is not enough", async () => {
  let s = await start({ TRUST_LOOPBACK: "0", ADMIN_TOKEN: "adm" }); // as if every caller were remote
  try {
    for (const [path, body] of [["/api/command", { room: "war_room", text: "hi" }], ["/api/employees", hire()], ["/api/library/categorize", {}]]) {
      assert.equal((await post(s, path, body, { cookie: "" })).status, 401, path);
      assert.equal((await post(s, path, body, { cookie: "", authorization: "Bearer wrong" })).status, 401, path);
    }
    assert.equal((await post(s, "/api/command", { room: "war_room", text: "hi" })).status, 202, "owner's session");
    assert.equal((await post(s, "/api/command", { room: "war_room", text: "hi" }, { cookie: "", authorization: "Bearer adm" })).status, 202, "ADMIN_TOKEN");
    for (const path of ["/api/people", "/api/employees", "/api/library"]) {
      assert.equal((await fetch(s.base + path)).status, 401, path);
      assert.equal((await fetch(s.base + path, { headers: { cookie: s.cookie } })).status, 200, path);
    }
    const lib = await getJ(s, "/api/library");
    assert.ok(lib.shelves.flatMap((x) => x.books).every((b) => b.path === undefined), "paths hidden from non-loopback");
  } finally {
    await s.stop();
  }
  s = await start(); // TRUST_LOOPBACK on: a same-origin browser on this Mac without a session is still refused
  try {
    assert.equal((await post(s, "/api/command", { room: "war_room", text: "hi" }, { cookie: "" })).status, 401);
  } finally {
    await s.stop();
  }
});

test("host-wide actions (re-shelving the library): ADMIN_TOKEN, or the host owner in the office on this Mac", async () => {
  fake.chats["room-2"] = "-222";
  let s = await start({ ADMIN_TOKEN: "adm" }); // s.cookie = the first registered user = host owner
  try {
    const other = await account(s);
    await link(s, other, { room: "room-2" });
    let r = await post(s, "/api/library/categorize", {}, { cookie: other });
    assert.equal(r.status, 403, "a signed-in user who isn't the host owner");
    r = await post(s, "/api/library/categorize", {}, { cookie: s.cookie, "x-forwarded-for": "203.0.113.9" });
    assert.equal(r.status, 403, "the owner, but not from this Mac");
    r = await post(s, "/api/library/categorize", {});
    assert.equal(r.status, 202, "the owner in the office on this Mac");
  } finally {
    await s.stop();
  }
  s = await start({ ADMIN_TOKEN: "adm", OWNER_EMAIL: "boss@example.com" }, { linked: false });
  try {
    s.cookie = await account(s); // first user, but OWNER_EMAIL names someone else
    await link(s, s.cookie);
    assert.equal((await post(s, "/api/library/categorize", {})).status, 403);
    const boss = await account(s, "Boss@Example.com");
    fake.chats["room-3"] = "-333";
    await link(s, boss, { room: "room-3" });
    assert.equal((await post(s, "/api/library/categorize", {}, { cookie: boss })).status, 202);
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
      let r = await raw(s, "POST", path, { headers: { "content-type": "text/plain", origin: "https://evil.example", cookie: s.cookie }, body });
      assert.equal(r.status, 415, `text/plain ${path}`);
      r = await raw(s, "POST", path, { headers: browser(s, { origin: "https://evil.example" }), body });
      assert.equal(r.status, 403, `evil origin ${path}`);
      r = await raw(s, "POST", path, { headers: browser(s, { host: "evil.example:80", origin: "http://evil.example:80" }), body });
      assert.equal(r.status, 403, `rebound host ${path}`);
    }
    assert.equal((await raw(s, "POST", "/api/command", { headers: { "content-type": "application/json" }, body: { room: "war_room", text: "hi" } })).status, 401, "no session, no token");
    assert.equal((await raw(s, "POST", "/api/command", { headers: browser(s), body: { room: "war_room", text: "hi" } })).status, 202, "same-origin office");
    const vite = { "content-type": "application/json", host: "localhost:5173", origin: "http://localhost:5173", "x-forwarded-for": "127.0.0.1", cookie: s.cookie };
    assert.equal((await raw(s, "POST", "/api/command", { headers: vite, body: { room: "war_room", text: "hi" } })).status, 202, "vite dev proxy on this Mac");
    assert.equal((await raw(s, "POST", "/api/command", { headers: { "content-type": "application/json", host: "evil.example", authorization: "Bearer adm" }, body: { room: "war_room", text: "hi" } })).status, 202, "token clients: any host, no Origin");
    // reads that reveal local paths: not to a rebound Host
    let lib = JSON.parse((await raw(s, "GET", "/api/library", { headers: { host: "evil.example:80", cookie: s.cookie } })).body);
    assert.equal(lib.shelves[0].books[0].path, undefined, "rebound host sees no paths");
    lib = JSON.parse((await raw(s, "GET", "/api/library", { headers: { cookie: s.cookie } })).body);
    assert.equal(lib.shelves[0].books[0].path, "/skills/qa/SKILL.md", "the office on this Mac does");
  } finally {
    await s.stop();
  }
});

test("library paths: proxied readers count as this Mac only if every hop is loopback", async () => {
  const s = await start();
  try {
    const path = async (extra) => JSON.parse((await raw(s, "GET", "/api/library", { headers: { cookie: s.cookie, ...extra } })).body).shelves[0].books[0].path;
    assert.equal(await path({ "x-forwarded-for": "203.0.113.9" }), undefined, "remote client via vite --host");
    assert.equal(await path({ "x-forwarded-for": "127.0.0.1, 203.0.113.9" }), undefined, "spoofed loopback hop");
    assert.equal(await path({ forwarded: "for=203.0.113.9" }), undefined);
    assert.equal(await path({ "x-forwarded-for": "127.0.0.1", "x-forwarded-host": "192.168.1.5:5173" }), undefined, "LAN host via proxy");
    assert.equal(await path({ "x-forwarded-for": "::1" }), "/skills/qa/SKILL.md");
  } finally {
    await s.stop();
  }
});

test("validation: command and hire bodies", async () => {
  const s = await start();
  try {
    for (const b of [{ room: "nope", text: "hi" }, { room: "war_room", text: "" }, { room: "war_room", text: "   " }, { room: "war_room", text: "x".repeat(2001) }, { room: "war_room" }])
      assert.equal((await post(s, "/api/command", b)).status, 400, JSON.stringify(b).slice(0, 60));
    for (const b of [hire({ name: "" }), hire({ name: "!!!" }), hire({ role: undefined }), hire({ room: "x" }), hire({ instructions: "" }), hire({ color: "red" }), hire({ skills: "qa" }), hire({ skills: [1] }), hire({ skills: ["not-in-library"] }), hire({ name: "\u202e\u0000" }), hire({ name: "x".repeat(41) })])
      assert.equal((await post(s, "/api/employees", b)).status, 400, JSON.stringify(b).slice(0, 80));
    assert.equal((await getJ(s, "/api/employees")).length, 0);
    for (let i = 0; i < 12; i++) await post(s, "/api/command", { room: "nope", text: "x" });
    assert.equal((await post(s, "/api/command", { room: "war_room", text: "hi" })).status, 202, "invalid commands don't use up the rate limit");
  } finally {
    await s.stop();
  }
});

test("command: registers d2c-office once, posts to the workspace's room, addresses the room lead, threads by topic, rate limited", async () => {
  const credsFile = join(tmp(), "office.json");
  const s = await start({ SWITCH_OFFICE_CREDS: credsFile });
  try {
    let r = await post(s, "/api/command", { room: "war_room", text: "Plan the Diwali sale" });
    assert.equal(r.status, 202);
    assert.deepEqual(await r.json(), { ok: true, via: "switch:d2c-office", thread: "group" });
    const msg = calls.find((c) => c.path === "/agents/office-1/message");
    assert.deepEqual(msg.json, { room_id: "room-1", content: "#WarRoom @d2c-captain Plan the Diwali sale" }, "the workspace's Switch room; lead addressed; topic tag");
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
  const DATA_DIR = tmp();
  let s = await start({ DATA_DIR });
  const cookie = s.cookie;
  try {
    let r = await post(s, "/api/employees", hire({ emoji: "💌", color: "#112233" }));
    assert.equal(r.status, 201);
    const a = await r.json();
    assert.equal(a.id, "d2c-priya-shah");
    assert.equal(a.desk, "growth_pod#3", "d2c-ads, d2c-marketplaces, d2c-google sit at growth_pod#0-2");
    assert.equal(a.status, "active");
    assert.equal(a.switchAgentId, "sw-d2c-priya-shah");
    assert.equal(a.instructions, undefined);
    const create = calls.find((c) => c.method === "POST" && c.path === "/gateway/management/agents");
    assert.equal(create.json.controller_id, "c1", "the team lead's controller");
    assert.equal(create.json.desired_state, "running");
    const { instructions: _, ...def } = create.json.definition;
    assert.deepEqual(def, { provider: "claude", model: "team-model", advanced_config: { effort: "high" }, auto_mode: true, auto_approve: false, isolation: "shared", directory: "/repo" },
      "the team's provider settings; directory is the repo, not the lead's or the request's");
    assert.match(create.json.definition.instructions, /Win back lapsed buyers[\s\S]*gstack:qa[\s\S]*HOW YOU WRITE IN TELEGRAM[\s\S]*yours is Ads/);
    assert.ok(create.json.definition.instructions.includes(STYLE), "exact team Telegram style block");
    assert.deepEqual(calls.find((c) => c.path === "/gateway/agents/sw-d2c-priya-shah/addressing-policy").json, { policy: null }, "addressing: anyone");
    assert.deepEqual(calls.find((c) => c.path === "/gateway/rooms/room-1/agents").json, { agent_ids: ["sw-d2c-priya-shah"] });

    const b = await (await post(s, "/api/employees", hire())).json();
    assert.equal(b.id, "d2c-priya-shah-2");
    assert.equal(b.desk, "growth_pod#4");
    const hired = (await getJ(s, "/api/history")).filter((e) => e.type === "hired");
    assert.deepEqual(hired.map((e) => [e.speaker, e.room, e.meta.employee_id]), [["d2c-priya-shah", "ads", "d2c-priya-shah"], ["d2c-priya-shah-2", "ads", "d2c-priya-shah-2"]]);
    assert.match(hired[0].id, /^srv-/);
    assert.equal(hired[0].ws, s.ws.id);
  } finally {
    await s.stop();
  }
  s = await start({ DATA_DIR }, { linked: false });
  s.cookie = cookie;
  try {
    assert.deepEqual((await getJ(s, "/api/employees")).map((e) => e.id), ["d2c-priya-shah", "d2c-priya-shah-2"]);
    const people = await getJ(s, "/api/people");
    const p = people.find((x) => x.id === "d2c-priya-shah");
    assert.deepEqual([p.kind, p.zone, p.desk, p.emoji, p.color], ["agent", "growth_pod", "growth_pod#3", "💌", "#112233"]);
    assert.ok(people.some((x) => x.id === "d2c-captain"), "roster people included");
    assert.ok((await getJ(s, "/api/agents")).some((x) => x.id === "d2c-priya-shah"));
    assert.ok((await getJ(s, "/api/rooms")).find((x) => x.id === "ads").members.includes("d2c-priya-shah"));
  } finally {
    await s.stop();
  }
});

test("hiring fallback: no managed agents → one-agent template + 202 open_url", async () => {
  fake.managementDown = true;
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
    fake.managementDown = false;
    await s.stop();
  }
});

test("switch/TELEGRAM_STYLE.md is the block every team agent uses (no drift)", () => {
  const dir = new URL("../../switch/agents/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) assert.ok(readFileSync(new URL(f, dir), "utf8").includes(STYLE), f);
});

test("hiring limits, Switch-side name clashes, sanitising, firing", async () => {
  let s = await start({ HIRE_MAX: "2" });
  try {
    let r = await post(s, "/api/employees", hire({ name: "Taken\u0007", role: "Ops\nHelper\u202e", instructions: "Line 1\r\nLine 2\u0000" }));
    assert.equal(r.status, 201);
    const a = await r.json();
    assert.equal(a.id, "d2c-taken-2", "d2c-taken already exists in Switch");
    assert.equal(a.name, "Taken");
    assert.equal(a.role, "Ops Helper");
    assert.match(calls.find((c) => c.method === "POST" && c.path === "/gateway/management/agents").json.definition.instructions, /Line 1\nLine 2\n/);
    assert.equal((await post(s, "/api/employees", hire({ name: "B" }))).status, 201);
    r = await post(s, "/api/employees", hire({ name: "C" }));
    assert.equal(r.status, 429);
    assert.match((await r.json()).error, /office is full: 2/);

    // fire: removed from Switch, desk freed
    const del = (id, headers = {}) => fetch(`${s.base}/api/employees/${id}`, { method: "DELETE", headers: { "content-type": "application/json", origin: s.base, cookie: s.cookie, ...headers } });
    assert.equal((await del(a.id, { origin: "https://evil.example" })).status, 403);
    assert.equal((await del("d2c-nobody")).status, 404);
    assert.equal((await del(a.id)).status, 200);
    assert.ok(calls.some((c) => c.method === "DELETE" && c.path === "/gateway/management/agents/sw-d2c-taken-2"));
    assert.ok(calls.some((c) => c.method === "DELETE" && c.path === "/gateway/agents/sw-d2c-taken-2"));
    assert.deepEqual((await getJ(s, "/api/employees")).map((e) => e.id), ["d2c-b"]);
    r = await post(s, "/api/employees", hire({ name: "C" }));
    assert.equal(r.status, 201, "room again after firing");
    assert.equal((await r.json()).desk, "growth_pod#3", "the fired one's desk is free again");
    r = await post(s, "/api/employees", hire({ name: "D" }));
    assert.equal(r.status, 429, "3 hires in 10 minutes already");
  } finally {
    await s.stop();
  }
  s = await start(); // raw Switch errors stay in the server log
  fake.roomsBroken = true;
  try {
    const r = await post(s, "/api/command", { room: "war_room", text: "hi" });
    assert.equal(r.status, 502);
    assert.deepEqual(await r.json(), { error: "Switch refused the request" });
    assert.match(s.log(), /hunter2/);
  } finally {
    fake.roomsBroken = false;
    await s.stop();
  }
});

test("switch down: 503, nothing hired", async () => {
  const coreEnv = join(tmp(), "core.env");
  writeFileSync(coreEnv, readFileSync(join(swDir, "core.env")));
  const s = await start({ SWITCH_CORE_ENV: coreEnv });
  rmSync(coreEnv); // Switch Console's server stopped after the group was linked
  try {
    assert.equal((await post(s, "/api/command", { room: "war_room", text: "hi" })).status, 503);
    assert.equal((await post(s, "/api/employees", hire())).status, 503);
    assert.equal((await getJ(s, "/api/employees")).length, 0);
  } finally {
    await s.stop();
  }
});
