// Integration tests: each server runs as a real process (tsx, src/) on a random port with its own DATA_DIR.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const CWD = new URL("..", import.meta.url);
const dirs = [];
const procs = new Set();
after(() => {
  for (const p of procs) p.kill("SIGKILL");
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function tmp() {
  const d = mkdtempSync(join(tmpdir(), "hq-test-"));
  dirs.push(d);
  return d;
}

/** Starts the server; resolves with { base, port, stop } once it logs "listening". */
function start(env = {}) {
  const proc = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: CWD,
    env: { ...process.env, PORT: "0", OBSERVER_TOKEN: "", ADMIN_TOKEN: "", DATA_DIR: tmp(), FLY_APP_NAME: "", ...env },
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

const ev = (o = {}) => ({ t: Date.now(), room: "ops", speaker: "d2c-ops", type: "message", text: "hi", ...o });
const post = (base, path, body, headers = {}) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("validation: bad events → 400, bad JSON → 400, oversized → 413, ids replaced", async () => {
  const s = await start();
  try {
    let r = await post(s.base, "/api/events", { ...ev(), room: "nope" });
    assert.equal(r.status, 400);
    assert.ok((await r.json()).details.length);
    assert.equal((await post(s.base, "/api/events", "{not json")).status, 400);
    assert.equal((await post(s.base, "/api/events", { ...ev(), text: "x".repeat(70_000) })).status, 413);
    r = await post(s.base, "/api/events", { ...ev(), id: "x@99999999999999" });
    assert.equal(r.status, 201);
    assert.match((await r.json()).id, /^srv-/);
  } finally {
    await s.stop();
  }
});

test("auth: OBSERVER_TOKEN guards /api/events, ADMIN_TOKEN guards replay", async () => {
  const s = await start({ OBSERVER_TOKEN: "obs-secret", ADMIN_TOKEN: "admin-secret" });
  try {
    assert.equal((await post(s.base, "/api/events", ev())).status, 401);
    assert.equal((await post(s.base, "/api/events", ev(), { authorization: "Bearer wrong" })).status, 401);
    assert.equal((await post(s.base, "/api/events", ev(), { authorization: "Bearer obs-secret" })).status, 201);
    assert.equal((await post(s.base, "/api/replay", {})).status, 401);
    assert.equal((await post(s.base, "/api/replay/stop", {}, { authorization: "Bearer obs-secret" })).status, 401);
    assert.equal((await post(s.base, "/api/replay/stop", {}, { authorization: "Bearer admin-secret" })).status, 200);
    assert.equal((await fetch(s.base + "/api/history")).status, 200, "reads stay open");
  } finally {
    await s.stop();
  }
});

test("rate limit → 429 and WS client cap", async () => {
  const s = await start({ RATE_LIMIT_PER_MIN: "3", MAX_WS_CLIENTS: "1" });
  try {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await post(s.base, "/api/events", ev())).status);
    assert.deepEqual(codes, [201, 201, 201, 429]);

    const url = `ws://127.0.0.1:${s.port}/ws`;
    const a = new WebSocket(url);
    await new Promise((r) => a.on("open", r));
    const b = new WebSocket(url);
    const code = await new Promise((r) => b.on("close", r));
    assert.equal(code, 1013);
    assert.equal(a.readyState, WebSocket.OPEN);
    a.close();
  } finally {
    await s.stop();
  }
});

test("persistence: history and room events survive a restart", async () => {
  const DATA_DIR = tmp();
  let s = await start({ DATA_DIR });
  const created = await (await post(s.base, "/api/events", ev({ room: "design", speaker: "d2c-design", text: "persist me", meta: { thread_id: 42 } }))).json();
  await s.stop();
  s = await start({ DATA_DIR });
  try {
    const hist = await (await fetch(s.base + "/api/history")).json();
    assert.ok(hist.some((e) => e.id === created.id), "in /api/history after restart");
    const room = await (await fetch(s.base + "/api/rooms/design/events?limit=10")).json();
    assert.deepEqual(room.map((e) => e.id), [created.id]);
    assert.equal(room[0].meta.thread_id, 42);
    const health = await (await fetch(s.base + "/api/health")).json();
    assert.equal(health.db, "ok");
    assert.match(health.version, /^\d+\.\d+\.\d+/);
  } finally {
    await s.stop();
  }
});

test("rooms and agents are derived from events", async () => {
  const s = await start();
  try {
    await post(s.base, "/api/events", ev({ room: "analytics", speaker: "d2c-captain", type: "assign", text: "forecast", meta: { targets: ["d2c-analyst"] } }));
    await post(s.base, "/api/events", ev({ room: "ops", speaker: "d2c-ops", type: "approval_needed", text: "please approve" }));
    await post(s.base, "/api/events", ev({ room: "ops", speaker: "d2c-ops", type: "message", text: "waiting" }));

    const rooms = await (await fetch(s.base + "/api/rooms")).json();
    assert.equal(rooms.length, 6);
    const fin = rooms.find((r) => r.id === "ops");
    assert.equal(fin.count, 2);
    assert.equal(fin.last.text, "waiting");
    assert.equal(fin.group, "Kratos D2C");
    assert.equal(fin.topic, "Ops");
    assert.deepEqual(fin.members.sort(), ["d2c-captain", "d2c-ops", "founder"]);
    assert.equal(rooms.find((r) => r.id === "war_room").members.length, 7);
    assert.equal(rooms.find((r) => r.id === "ads").last, null);

    const agents = Object.fromEntries((await (await fetch(s.base + "/api/agents")).json()).map((a) => [a.id, a]));
    assert.equal(agents["d2c-captain"].state, "working");
    assert.equal(agents["d2c-captain"].room, "analytics");
    assert.equal(agents["d2c-analyst"].state, "working");
    assert.equal(agents["d2c-ops"].state, "waiting");
    assert.equal(agents["d2c-ops"].last.text, "waiting");
    assert.equal(agents["d2c-ads"].state, "idle");

    assert.equal((await fetch(s.base + "/api/rooms/nope/events")).status, 404);
    assert.ok(Array.isArray(await (await fetch(s.base + "/api/gallery")).json()));
  } finally {
    await s.stop();
  }
});

test("path traversal → 403", async () => {
  const s = await start();
  try {
    for (const p of ["/gallery/..%2fcontracts%2froster.json", "/gallery/..%2f..%2fserver%2fpackage.json"]) assert.equal((await fetch(s.base + p)).status, 403, p);
  } finally {
    await s.stop();
  }
});

test("malformed or oversized WS frames drop that client, not the server; replay streams over WS", async () => {
  const s = await start();
  try {
    const url = `ws://127.0.0.1:${s.port}/ws`;
    const bad = new WebSocket(url);
    await new Promise((r) => bad.on("open", r));
    bad._socket.write(Buffer.from([0xff, 0x80, 0, 0, 0, 0])); // RSV2/RSV3 + reserved opcode
    await new Promise((r) => bad.on("close", r));
    const big = new WebSocket(url);
    big.on("error", () => {});
    await new Promise((r) => big.on("open", r));
    big.send("x".repeat(10_000)); // > maxPayload
    assert.equal(await new Promise((r) => big.on("close", r)), 1009);
    assert.ok((await fetch(s.base + "/api/health")).ok, "server alive");

    const ws = new WebSocket(url);
    await new Promise((r) => ws.on("open", r));
    const got = [];
    ws.on("message", (m) => got.push(JSON.parse(m)));
    const r = await post(s.base, "/api/replay", { feed: "sale-demo", speed: 100 });
    const { events } = await r.json();
    for (let i = 0; i < 50 && got.length < events; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(got.length, events);
    assert.match(got[0].id, /^evt-\d+@\d+$/);
    ws.close();
  } finally {
    await s.stop();
  }
});

test("security headers on static responses", async () => {
  const s = await start();
  try {
    const r = await fetch(s.base + "/api/health");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.ok(r.headers.get("referrer-policy"));
    assert.equal((await fetch(s.base + "/api/ready")).status, 200);
  } finally {
    await s.stop();
  }
});
