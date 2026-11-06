// Integration tests: each server runs as a real process (tsx, src/) on a random port with its own DATA_DIR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import WebSocket from "ws";
import { start, tmp, post, get, getJson, account, link, ev } from "./helpers.mjs";

/** A user with a ready workspace on Switch room-1: { cookie, ws }. */
async function owner(s) {
  const cookie = await account(s);
  const st = await link(s, cookie);
  return { cookie, ws: st.workspace.id };
}
const wsOpen = (s, cookie, q = "") => new WebSocket(`ws://127.0.0.1:${s.port}/ws${q}`, { headers: cookie ? { cookie } : {} });

test("validation: bad events → 400, bad JSON → 400, oversized → 413, ids replaced", async () => {
  const s = await start();
  try {
    let r = await post(s, "/api/events", { ...ev(), room: "nope" });
    assert.equal(r.status, 400);
    assert.ok((await r.json()).details.length);
    assert.equal((await post(s, "/api/events", "{not json")).status, 400);
    assert.equal((await post(s, "/api/events", { ...ev(), text: "x".repeat(70_000) })).status, 413);
    await owner(s);
    r = await post(s, "/api/events", { ...ev(), id: "x@99999999999999", ws: "ws_forged" });
    assert.equal(r.status, 201);
    const stored = await r.json();
    assert.match(stored.id, /^srv-/);
    assert.notEqual(stored.ws, "ws_forged", "ws is the server's, never the caller's");
    r = await post(s, "/api/events", ev({}, "room-unlinked"));
    assert.equal(r.status, 202, "a room with no workspace: link attempt only");
    assert.equal((await r.json()).stored, false);
  } finally {
    await s.stop();
  }
});

test("auth: OBSERVER_TOKEN guards /api/events, ADMIN_TOKEN guards replay, reads need a session", async () => {
  const s = await start({ OBSERVER_TOKEN: "obs-secret", ADMIN_TOKEN: "admin-secret" });
  try {
    assert.equal((await post(s, "/api/events", ev())).status, 401);
    assert.equal((await post(s, "/api/events", ev(), { authorization: "Bearer wrong" })).status, 401);
    assert.equal((await post(s, "/api/events", ev(), { authorization: "Bearer obs-secret" })).status, 202);
    assert.equal((await post(s, "/api/replay", {})).status, 401);
    assert.equal((await post(s, "/api/replay/stop", {}, { authorization: "Bearer obs-secret" })).status, 401);
    assert.equal((await post(s, "/api/replay/stop", {}, { authorization: "Bearer admin-secret" })).status, 200);
    for (const path of ["/api/history", "/api/rooms", "/api/rooms/ops/events", "/api/agents", "/api/people", "/api/employees", "/api/library"])
      assert.equal((await fetch(s.base + path)).status, 401, `${path} needs a session`);
    for (const path of ["/api/health", "/api/ready", "/api/roster", "/api/gallery", "/gallery/hero.html"]) assert.equal((await fetch(s.base + path)).status, 200, `${path} is public`);
    assert.equal((await get(s, "/api/history", null, { authorization: "Bearer admin-secret" })).status, 404, "admin, but no workspace yet");
  } finally {
    await s.stop();
  }
  const open = await start(); // no ADMIN_TOKEN set: replay is still closed (never open, even in dev)
  try {
    assert.equal((await post(open, "/api/replay", {})).status, 401);
  } finally {
    await open.stop();
  }
});

test("rate limit → 429", async () => {
  const s = await start({ RATE_LIMIT_PER_MIN: "3" });
  try {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await post(s, "/api/events", ev())).status);
    assert.deepEqual(codes, [202, 202, 202, 429]);
  } finally {
    await s.stop();
  }
});

test("WS: no cookie → rejected, foreign Origin → rejected, client cap", async () => {
  const s = await start({ MAX_WS_CLIENTS: "1", ADMIN_TOKEN: "adm" });
  try {
    const { cookie, ws } = await owner(s);
    const refused = (sock) => new Promise((r) => { sock.on("unexpected-response", (_q, res) => r(res.statusCode)); sock.on("open", () => r("open")); });
    assert.equal(await refused(wsOpen(s)), 401, "no session");
    assert.equal(await refused(wsOpen(s, "hq_session=forged")), 401, "unknown session");
    assert.equal(await refused(new WebSocket(`ws://127.0.0.1:${s.port}/ws`, { headers: { cookie, origin: "https://evil.example" } })), 403);
    const admin = new WebSocket(`ws://127.0.0.1:${s.port}/ws?ws=${ws}`, { headers: { authorization: "Bearer adm" } });
    assert.equal(await refused(admin), "open", "ADMIN_TOKEN");
    admin.close();
    await new Promise((r) => admin.on("close", r));

    const a = wsOpen(s, cookie);
    await new Promise((r) => a.on("open", r));
    const b = wsOpen(s, cookie);
    const code = await new Promise((r) => b.on("close", r));
    assert.equal(code, 1013);
    assert.equal(a.readyState, WebSocket.OPEN);
    a.close();
  } finally {
    await s.stop();
  }
});

test("rate limit: bad tokens are limited, a valid token is not", async () => {
  const s = await start({ RATE_LIMIT_PER_MIN: "2", OBSERVER_TOKEN: "obs" });
  try {
    const bad = [];
    for (let i = 0; i < 3; i++) bad.push((await post(s, "/api/events", ev(), { authorization: "Bearer nope" })).status);
    assert.deepEqual(bad, [401, 401, 429]);
    for (let i = 0; i < 5; i++) assert.equal((await post(s, "/api/events", ev(), { authorization: "Bearer obs" })).status, 202);
  } finally {
    await s.stop();
  }
});

test("production refuses to start without tokens unless ALLOW_OPEN=1", async () => {
  await assert.rejects(start({ NODE_ENV: "production", OBSERVER_TOKEN: "x" }), /exited 1/);
  const s = await start({ NODE_ENV: "production", ALLOW_OPEN: "1" });
  await s.stop();
  const t = await start({ NODE_ENV: "production", OBSERVER_TOKEN: "a", ADMIN_TOKEN: "b" });
  assert.equal((await fetch(t.base + "/api/ready")).status, 200);
  await t.stop();
  // DATA_DIR is a file, so the DB can't open → memory fallback → not ready in production
  const f = await start({ NODE_ENV: "production", ALLOW_OPEN: "1", DATA_DIR: new URL(import.meta.url).pathname });
  assert.equal((await (await fetch(f.base + "/api/health")).json()).db, "memory");
  assert.equal((await fetch(f.base + "/api/ready")).status, 503);
  await f.stop();
});

test("persistence: history, room events and the session survive a restart", async () => {
  const DATA_DIR = tmp();
  let s = await start({ DATA_DIR });
  const { cookie, ws } = await owner(s);
  const created = await (await post(s, "/api/events", ev({ room: "design", speaker: "d2c-design", text: "persist me", meta: { thread_id: 42 } }))).json();
  assert.equal(created.ws, ws);
  await s.stop();
  s = await start({ DATA_DIR });
  try {
    const hist = await getJson(s, "/api/history", cookie);
    assert.ok(hist.some((e) => e.id === created.id), "in /api/history after restart");
    const room = await getJson(s, "/api/rooms/design/events?limit=10", cookie);
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
    const { cookie } = await owner(s);
    await post(s, "/api/events", ev({ room: "analytics", speaker: "d2c-captain", type: "assign", text: "forecast", meta: { targets: ["d2c-analyst"] } }));
    await post(s, "/api/events", ev({ room: "ops", speaker: "d2c-ops", type: "approval_needed", text: "please approve" }));
    await post(s, "/api/events", ev({ room: "ops", speaker: "d2c-ops", type: "message", text: "waiting" }));

    const rooms = await getJson(s, "/api/rooms", cookie);
    assert.equal(rooms.length, 6);
    const fin = rooms.find((r) => r.id === "ops");
    assert.equal(fin.count, 2);
    assert.equal(fin.last.text, "waiting");
    assert.equal(fin.group, "Kratos D2C");
    assert.equal(fin.topic, "Ops");
    assert.deepEqual(fin.members.sort(), ["d2c-captain", "d2c-ops", "founder"]);
    assert.equal(rooms.find((r) => r.id === "war_room").members.length, 8); // founder + 6 department agents + librarian
    assert.equal(rooms.find((r) => r.id === "ads").last, null);

    const agents = Object.fromEntries((await getJson(s, "/api/agents", cookie)).map((a) => [a.id, a]));
    assert.equal(agents["d2c-captain"].state, "working");
    assert.equal(agents["d2c-captain"].room, "analytics");
    assert.equal(agents["d2c-analyst"].state, "working");
    assert.equal(agents["d2c-ops"].state, "waiting");
    assert.equal(agents["d2c-ops"].last.text, "waiting");
    assert.equal(agents["d2c-ads"].state, "idle");

    assert.equal((await get(s, "/api/rooms/nope/events", cookie)).status, 404);
    for (const q of ["1.5", "-3", "abc", "1e9", "Infinity"]) {
      assert.equal((await get(s, `/api/rooms/ops/events?limit=${q}`, cookie)).status, 200, `room limit=${q}`);
      assert.equal((await get(s, `/api/history?limit=${q}`, cookie)).status, 200, `history limit=${q}`);
    }
    assert.equal((await getJson(s, "/api/rooms/ops/events?limit=1.5", cookie)).length, 1);
    const gal = await (await fetch(s.base + "/api/gallery")).json();
    assert.ok(gal.length >= 1 && !gal.some((g) => g.name === "index.json"));
    assert.equal(gal[0].name, "hero.html");
    assert.match(gal[0].title, /Festive Sale/);
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
  const s = await start({ ADMIN_TOKEN: "adm" });
  try {
    const { cookie, ws: wsId } = await owner(s);
    const bad = wsOpen(s, cookie);
    await new Promise((r) => bad.on("open", r));
    bad._socket.write(Buffer.from([0xff, 0x80, 0, 0, 0, 0])); // RSV2/RSV3 + reserved opcode
    await new Promise((r) => bad.on("close", r));
    const big = wsOpen(s, cookie);
    big.on("error", () => {});
    await new Promise((r) => big.on("open", r));
    big.send("x".repeat(10_000)); // > maxPayload
    assert.equal(await new Promise((r) => big.on("close", r)), 1009);
    assert.ok((await fetch(s.base + "/api/health")).ok, "server alive");

    const ws = wsOpen(s, cookie, `?ws=${wsId}`);
    await new Promise((r) => ws.on("open", r));
    const got = [];
    ws.on("message", (m) => got.push(JSON.parse(m)));
    const r = await post(s, "/api/replay", { feed: "sale-demo", speed: 100, ws: wsId }, { authorization: "Bearer adm" });
    const { events } = await r.json();
    for (let i = 0; i < 50 && got.length < events; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(got.length, events);
    assert.match(got[0].id, /^evt-\d+@\d+$/);
    assert.equal(got[0].ws, wsId);
    ws.close();
  } finally {
    await s.stop();
  }
});

const DIST = new URL("../../web/dist/", import.meta.url);
test("security headers: gallery is sandboxed, built site has CSP + asset caching", async (t) => {
  const s = await start();
  try {
    const g = await fetch(s.base + "/gallery/hero.html");
    assert.equal(g.status, 200);
    assert.equal(g.headers.get("x-content-type-options"), "nosniff");
    assert.match(g.headers.get("content-security-policy"), /^sandbox allow-scripts;/);

    if (!existsSync(new URL("index.html", DIST))) return t.skip("web/dist not built (npm run build)");
    const page = await fetch(s.base + "/office");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    const csp = page.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    // wasm-unsafe-eval lets three.js' meshopt decoder compile WebAssembly; plain eval stays blocked.
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'(;|$)/);
    assert.match(csp, /https:\/\/fonts\.googleapis\.com/);
    assert.match(csp, /https:\/\/fonts\.gstatic\.com/);
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.equal(page.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.equal(page.headers.get("cache-control"), "no-cache");
    assert.equal(page.headers.get("strict-transport-security"), null);
    const https = await fetch(s.base + "/office", { headers: { "x-forwarded-proto": "https" } });
    assert.match(https.headers.get("strict-transport-security"), /max-age=31536000/);
    const asset = readdirSync(new URL("assets/", DIST)).find((f) => f.endsWith(".js"));
    const a = await fetch(`${s.base}/assets/${asset}`);
    assert.equal(a.status, 200);
    assert.equal(a.headers.get("cache-control"), "public, max-age=31536000, immutable");
  } finally {
    await s.stop();
  }
});
