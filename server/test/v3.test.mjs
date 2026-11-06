// v3 (contracts/api.md): accounts, sessions, link codes, linking through the observer, needs_admin, isolation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import WebSocket from "ws";
import { start, tmp, calls, fake, post, get, getJson, account, link, waitState, ev, sleep } from "./helpers.mjs";

const PW = "correct horse battery";
const cookieOf = (r) => r.headers.get("set-cookie")?.split(";")[0];
const sendCode = (s, code, room, extra = {}) =>
  post(s, "/api/events", { t: Date.now(), room: "war_room", speaker: "founder", type: "message", text: `here: ${code}`, meta: { switch_room_id: room, room_name: "Telegram: Shop", ...extra } });
const connect = async (s, cookie) => (await post(s, "/api/workspaces/connect", {}, { cookie })).json();

test("accounts: signup, me, logout, login, wrong password, validation, duplicate email, cookie flags", async () => {
  const s = await start();
  try {
    let r = await post(s, "/api/auth/signup", { email: "  Ana@Example.COM ", password: PW, name: "Ana" });
    assert.equal(r.status, 201);
    const { user } = await r.json();
    assert.deepEqual([user.email, user.name], ["ana@example.com", "Ana"]);
    assert.equal(user.pass, undefined);
    const setCookie = r.headers.get("set-cookie");
    assert.match(setCookie, /^hq_session=[\w-]{43}; HttpOnly; SameSite=Lax; Path=\/; Max-Age=2592000$/, "no Secure over plain http");
    const cookie = cookieOf(r);

    let me = await getJson(s, "/api/auth/me", cookie);
    assert.equal(me.user.id, user.id);
    assert.deepEqual(me.workspaces, []);
    assert.equal((await get(s, "/api/auth/me")).status, 401);
    assert.equal((await get(s, "/api/auth/me", "hq_session=nope")).status, 401);

    r = await post(s, "/api/auth/logout", {}, { cookie });
    assert.equal(r.status, 204);
    assert.match(r.headers.get("set-cookie"), /^hq_session=; .*Max-Age=0/);
    assert.equal((await get(s, "/api/auth/me", cookie)).status, 401, "session deleted server-side");
    assert.equal((await post(s, "/api/auth/logout", {}, { cookie })).status, 401);

    r = await post(s, "/api/auth/login", { email: "ana@example.com", password: "wrong password!" });
    assert.equal(r.status, 401);
    const generic = (await r.json()).error;
    r = await post(s, "/api/auth/login", { email: "nobody@example.com", password: PW });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error, generic, "same error for unknown email and wrong password");
    r = await post(s, "/api/auth/login", { email: "ANA@example.com", password: PW });
    assert.equal(r.status, 200);
    me = await getJson(s, "/api/auth/me", cookieOf(r));
    assert.equal(me.user.id, user.id);

    assert.equal((await post(s, "/api/auth/signup", { email: "ana@example.com", password: PW })).status, 409);
    for (const b of [{ email: "nope", password: PW }, { email: "a@b.co", password: "short" }, { email: "a@b.co" }]) // (5 signups a minute per IP)
      assert.equal((await post(s, "/api/auth/signup", b)).status, 400, JSON.stringify(b));

    // Secure: behind a TLS proxy on this host (X-Forwarded-Proto from loopback)
    r = await post(s, "/api/auth/login", { email: "ana@example.com", password: PW }, { "x-forwarded-proto": "https" });
    assert.match(r.headers.get("set-cookie"), /; Secure$/);
  } finally {
    await s.stop();
  }
});

test("login rate limit: 5 a minute per IP + email, then 429", async () => {
  const s = await start();
  try {
    await account(s, "rl@example.com");
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await post(s, "/api/auth/login", { email: "rl@example.com", password: "wrong password!" })).status);
    assert.deepEqual(codes, [401, 401, 401, 401, 401, 429]);
    assert.equal((await post(s, "/api/auth/login", { email: "rl@example.com", password: PW })).status, 429, "even the right password, for a minute");
    assert.equal((await post(s, "/api/auth/login", { email: "other@example.com", password: "wrong password!" })).status, 401, "other emails unaffected");
  } finally {
    await s.stop();
  }
});

test("CSRF guard on auth and connect POSTs: JSON only, own Origin, local Host", async () => {
  const s = await start();
  const port = new URL(s.base).port;
  const raw = (path, headers) =>
    new Promise((resolve, reject) => {
      const r = request({ host: "127.0.0.1", port, method: "POST", path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => (res.resume(), resolve(res.statusCode)));
      r.on("error", reject);
      r.end(JSON.stringify({ email: "x@example.com", password: PW }));
    });
  try {
    for (const path of ["/api/auth/signup", "/api/auth/login", "/api/auth/logout", "/api/workspaces/connect"]) {
      assert.equal(await raw(path, { "content-type": "text/plain" }), 415, path);
      assert.equal(await raw(path, { "content-type": "application/json", origin: "https://evil.example" }), 403, path);
      assert.equal(await raw(path, { "content-type": "application/json", host: "evil.example", origin: "http://evil.example" }), 403, path);
    }
  } finally {
    await s.stop();
  }
  const pub = await start({ OFFICE_ORIGINS: "https://hq.example.com" }); // a public deployment
  try {
    const r = await fetch(pub.base + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json", origin: "https://hq.example.com" }, body: JSON.stringify({ email: "p@example.com", password: PW }) });
    assert.equal(r.status, 201, "configured origin");
  } finally {
    await pub.stop();
  }
});

test("codes: 6 digits, status, a new code voids the old one, expiry, single use, 5 an hour", async () => {
  const s = await start({ LINK_CODE_TTL_MS: "400" });
  try {
    const cookie = await account(s);
    assert.equal((await post(s, "/api/workspaces/connect", {})).status, 401);
    assert.deepEqual(await getJson(s, "/api/workspaces/connect/status", cookie), { state: "expired", detail: "no code yet" });
    const first = await connect(s, cookie);
    assert.match(first.code, /^\d{6}$/);
    assert.equal(first.botUsername, "kratosd2c_bot");
    assert.ok(first.expiresAt > Date.now());
    assert.equal((await getJson(s, "/api/workspaces/connect/status", cookie)).state, "waiting");
    const second = await connect(s, cookie);
    assert.equal((await (await sendCode(s, first.code, "room-a")).json()).linked, false, "the older code was voided");
    await sleep(500);
    assert.equal((await getJson(s, "/api/workspaces/connect/status", cookie)).state, "expired");
    assert.equal((await (await sendCode(s, second.code, "room-a")).json()).linked, false, "expired");

    const s2 = await start();
    try {
      const c2 = await account(s2);
      const { code } = await connect(s2, c2);
      fake.chats["room-b"] = "-200";
      assert.equal((await (await sendCode(s2, code, "room-b")).json()).linked, true);
      const other = await account(s2);
      assert.equal((await (await sendCode(s2, code, "room-c")).json()).linked, false, "single use");
      await waitState(s2, c2, "ready");
      for (let i = 0; i < 4; i++) assert.equal((await post(s2, "/api/workspaces/connect", {}, { cookie: c2 })).status, 200);
      assert.equal((await post(s2, "/api/workspaces/connect", {}, { cookie: c2 })).status, 429, "5 an hour");
      assert.equal((await post(s2, "/api/workspaces/connect", {}, { cookie: other })).status, 200, "per user");
    } finally {
      await s2.stop();
    }
  } finally {
    await s.stop();
  }
});

test("linking via the observer: Bot API checks, 6 topics, agents joined, ready; idempotent; scoped history", async () => {
  const s = await start();
  try {
    const cookie = await account(s);
    const { code } = await connect(s, cookie);
    fake.chats["room-k"] = "-300";
    calls.length = 0;
    const r = await sendCode(s, code, "room-k");
    assert.equal(r.status, 202);
    assert.deepEqual(await r.json(), { ok: true, stored: false, linked: true });
    const st = await waitState(s, cookie, "ready");
    const w = st.workspace;
    assert.deepEqual([w.name, w.switchRoomId, w.chatId, w.status], ["Shop", "room-k", "-300", "ready"]);
    assert.deepEqual(Object.keys(w.topics), ["war_room", "analytics", "ads", "creators", "ops", "design"]);
    assert.ok(Object.values(w.topics).every((t) => Number.isInteger(t.threadId) && Object.keys(t).length === 1));
    const tg = calls.filter((c) => c.path.startsWith("/bot"));
    assert.ok(tg.every((c) => !c.path.includes("getUpdates")), "never polls");
    assert.deepEqual(tg.filter((c) => c.path.endsWith("/createForumTopic")).map((c) => c.json.name), ["War Room", "Analytics", "Ads", "Creators", "Ops", "Design"]);
    assert.deepEqual(tg.find((c) => c.path.endsWith("/getChatMember")).json, { chat_id: "-300", user_id: 123 });
    assert.deepEqual(calls.find((c) => c.method === "POST" && c.path === "/gateway/rooms/room-k/agents").json, { agent_ids: ["obs"] }, "the room watcher let the observer in first");
    const join = calls.findLast((c) => c.method === "POST" && c.path === "/gateway/rooms/room-k/agents");
    assert.deepEqual(join.json.agent_ids.sort(), ["obs", "x1", "x2", "x3", "x4", "x5", "x6"], "6 team agents + observer (d2c-office joins on its first command)");
    assert.ok(!s.log().includes("tg-secret"), "bot token never logged");

    const me = await getJson(s, "/api/auth/me", cookie);
    assert.deepEqual(me.workspaces.map((x) => x.id), [w.id]);
    assert.deepEqual((await getJson(s, "/api/workspaces", cookie)).map((x) => x.id), [w.id]);

    // messages from the room now belong to the workspace; no new topics on later setups
    calls.length = 0;
    const msg = await (await post(s, "/api/events", ev({ text: "first real message" }, "room-k"))).json();
    assert.equal(msg.ws, w.id);
    assert.deepEqual((await getJson(s, "/api/history", cookie)).map((e) => e.text), ["first real message"], "the code message itself was never stored");
    assert.deepEqual((await getJson(s, `/api/history?ws=${w.id}`, cookie)).map((e) => e.id), [msg.id]);
    assert.equal(calls.filter((c) => c.path.endsWith("/createForumTopic")).length, 0);
  } finally {
    await s.stop();
  }
});

test("needs_admin: not a forum / bot not admin → needs_admin with a reason; fixed → ready on the next message", async () => {
  const s = await start();
  fake.tg.admin = false;
  fake.tg.forum = false;
  try {
    const cookie = await account(s);
    fake.chats["room-n"] = "-400";
    const st = await link(s, cookie, { room: "room-n", want: "needs_admin" });
    assert.match(st.detail, /Topics on/);
    assert.match(st.detail, /admin with "Manage topics"/);
    assert.equal(st.workspace.status, "needs_admin");
    assert.equal(calls.filter((c) => c.path.endsWith("/createForumTopic") && c.json.chat_id === "-400").length, 0);
    fake.tg.admin = true;
    fake.tg.forum = true;
    assert.equal((await post(s, "/api/events", ev({ text: "done, try again" }, "room-n"))).status, 201);
    assert.equal((await waitState(s, cookie, "ready")).workspace.status, "ready");
  } finally {
    fake.tg.admin = true;
    fake.tg.forum = true;
    await s.stop();
  }
});

test("isolation: user B can't read A's history/rooms/ws, can't use A's ws id, can't claim A's room or chat", async () => {
  const s = await start({ ADMIN_TOKEN: "adm" });
  try {
    const a = await account(s);
    const wa = (await link(s, a)).workspace; // room-1, chat -100
    const b = await account(s);
    fake.chats["room-2"] = "-222";
    const wb = (await link(s, b, { room: "room-2" })).workspace;
    await post(s, "/api/events", ev({ text: "A secret" }));
    await post(s, "/api/events", ev({ text: "B note" }, "room-2"));

    assert.deepEqual((await getJson(s, "/api/history", a)).map((e) => e.text), ["A secret"]);
    assert.deepEqual((await getJson(s, "/api/history", b)).map((e) => e.text), ["B note"]);
    for (const path of ["/api/history", "/api/rooms", "/api/rooms/ops/events", "/api/agents", "/api/people", "/api/employees", "/api/library"])
      assert.equal((await get(s, `${path}?ws=${wa.id}`, b)).status, 403, path);
    assert.equal((await post(s, `/api/command?ws=${wa.id}`, { room: "war_room", text: "hi" }, { cookie: b })).status, 403);
    assert.ok((await getJson(s, "/api/rooms", b)).every((r) => r.count === 0 || r.last.text === "B note"));
    assert.deepEqual((await (await get(s, `/api/history?ws=${wa.id}`, null, { authorization: "Bearer adm" })).json()).map((e) => e.text), ["A secret"], "admin");

    // WebSocket: B can't open A's workspace, and B's socket never gets A's events
    const refused = await new Promise((r) => {
      const sock = new WebSocket(`ws://127.0.0.1:${s.port}/ws?ws=${wa.id}`, { headers: { cookie: b } });
      sock.on("unexpected-response", (_q, res) => r(res.statusCode));
      sock.on("open", () => r("open"));
    });
    assert.equal(refused, 403);
    const got = { a: [], b: [] };
    const socks = await Promise.all(Object.entries({ a, b }).map(([k, cookie]) => new Promise((r) => {
      const sock = new WebSocket(`ws://127.0.0.1:${s.port}/ws`, { headers: { cookie } });
      sock.on("message", (m) => got[k].push(JSON.parse(m).text));
      sock.on("open", () => r(sock));
    })));
    await post(s, "/api/events", ev({ text: "A live" }));
    await post(s, "/api/events", ev({ text: "B live" }, "room-2"));
    await sleep(200);
    assert.deepEqual(got, { a: ["A live"], b: ["B live"] });
    socks.forEach((x) => x.close());

    // B can't claim A's room, nor A's Telegram chat through another Switch room
    let { code } = await connect(s, b);
    assert.equal((await sendCode(s, code, "room-1")).status, 201, "a message in A's room is A's");
    let st = await getJson(s, "/api/workspaces/connect/status", b);
    assert.equal(st.state, "waiting");
    assert.match(st.detail, /already linked to another account/);
    assert.equal((await (await sendCode(s, code, "room-3", { chat_id: "-100" })).json()).linked, false);
    assert.deepEqual((await getJson(s, "/api/workspaces", b)).map((w) => w.id), [wb.id]);
    assert.deepEqual((await getJson(s, "/api/workspaces", a)).map((w) => w.id), [wa.id]);
    // A's code in A's own (already linked) room just confirms it
    ({ code } = await connect(s, a));
    await sendCode(s, code, "room-1");
    st = await getJson(s, "/api/workspaces/connect/status", a);
    assert.deepEqual([st.state, st.workspace.id], ["ready", wa.id]);
  } finally {
    await s.stop();
  }
});

test("migration: a pre-v3 events.db is hidden until the Kratos D2C group is linked, then adopted with its topics", async () => {
  const DATA_DIR = tmp();
  const { DatabaseSync } = await import("node:sqlite");
  const old = new DatabaseSync(join(DATA_DIR, "events.db"));
  old.exec(`CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, room TEXT NOT NULL, speaker TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE employees (id TEXT PRIMARY KEY, json TEXT NOT NULL);`);
  old.prepare("INSERT INTO events (id, room, speaker, json) VALUES (?, ?, ?, ?)").run("old-1", "ops", "d2c-ops", JSON.stringify({ id: "old-1", t: 1, room: "ops", speaker: "d2c-ops", type: "message", text: "from before v3" }));
  old.close();
  const topicsFile = join(DATA_DIR, "topics.json");
  writeFileSync(topicsFile, JSON.stringify({ chat_id: "-777", topics: { war_room: { name: "War Room", message_thread_id: 4, switch_thread_id: "sw-war" } } }));
  fake.tg.topics.add(4);
  const s = await start({ DATA_DIR, TOPICS_FILE: topicsFile, ADMIN_TOKEN: "adm" });
  try {
    const stranger = await account(s);
    fake.chats["room-s"] = "-555";
    await link(s, stranger, { room: "room-s" });
    assert.deepEqual(await getJson(s, "/api/history", stranger), [], "another group doesn't get the legacy events");
    const founder = await account(s);
    fake.chats["room-kd"] = "-777";
    const w = (await link(s, founder, { room: "room-kd" })).workspace;
    assert.equal(w.topics.war_room.threadId, 4, "existing topic kept");
    const hist = await getJson(s, "/api/history", founder);
    assert.deepEqual(hist.map((e) => [e.id, e.ws]), [["old-1", w.id]]);
    // the old Switch thread id still maps messages to their topic
    const m = await (await post(s, "/api/events", ev({ room: "ops", meta: { switch_thread_id: "sw-war" } }, "room-kd"))).json();
    assert.deepEqual([m.room, m.meta.thread_id], ["war_room", 4]);
  } finally {
    await s.stop();
  }
});
