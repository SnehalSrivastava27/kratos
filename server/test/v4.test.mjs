// v4 (contracts/api.md): roster-driven topics + upgrades, learning topic threads, multi-agent hires, QA Lab API,
// KPIs, idempotent ingest, readiness, Switch/Telegram timeouts and retries, graceful shutdown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync, existsSync, statSync, utimesSync } from "node:fs";
import { start, tmp, calls, fake, post, get, getJson, account, link, ev, sleep, TEAM } from "./helpers.mjs";

const ADM = { authorization: "Bearer adm" };
const adminPost = (s, path, body) => post(s, path, body, ADM);
const adminGet = (s, path) => get(s, path, null, ADM);
const topicCalls = () => calls.filter((c) => c.path.endsWith("/createForumTopic")).map((c) => c.json.name);
const evAt = (o, room = "room-1") => post(evS, "/api/events", ev(o, room));
let evS; // the server evAt posts to
const command = (s, room, text) => post(s, "/api/command", { room, text }, { cookie: s.cookie });
const lastPost = () => calls.findLast((c) => c.path === "/agents/office-1/message" || c.path === "/agents/office-1/ops/post_message");

/** A server with ADMIN_TOKEN whose user (s.cookie) has linked room-1 (chat -100), ready. */
async function linked(env = {}) {
  const s = await start({ ADMIN_TOKEN: "adm", ...env });
  s.cookie = await account(s);
  s.ws = (await link(s, s.cookie)).workspace;
  evS = s;
  calls.length = 0;
  return s;
}

test("roster topics: a workspace linked under the old 6-topic roster gets Finance + QA Lab and the new agents on start, once", async () => {
  const DATA_DIR = tmp();
  let s = await start({ DATA_DIR });
  const cookie = await account(s);
  const w = (await link(s, cookie)).workspace;
  await s.stop();
  // turn it into a v3 workspace: 6 topics, no setup signature
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(join(DATA_DIR, "events.db"));
  const topics = JSON.parse(db.prepare("SELECT topics FROM workspaces WHERE id = ?").get(w.id).topics);
  delete topics.finance;
  delete topics.qa_lab;
  topics.ads.switchThreadId = "sw-ads-kept";
  db.prepare("UPDATE workspaces SET topics = ? WHERE id = ?").run(JSON.stringify(topics), w.id);
  db.prepare("DELETE FROM kv WHERE k LIKE 'setup:%'").run();
  db.close();

  calls.length = 0;
  s = await start({ DATA_DIR });
  try {
    let ws;
    for (let i = 0; i < 50; i++) {
      ws = (await getJson(s, "/api/workspaces", cookie))[0];
      if (ws.topics.qa_lab) break;
      await sleep(50);
    }
    assert.deepEqual(Object.keys(ws.topics), ["war_room", "analytics", "ads", "creators", "ops", "design", "finance", "qa_lab"]);
    assert.equal(ws.status, "ready", "stays ready while upgrading");
    assert.deepEqual(topicCalls(), ["Finance", "QA Lab"], "only the missing topics; existing ones kept (no duplicates)");
    const join = calls.findLast((c) => c.method === "POST" && c.path === `/gateway/rooms/room-1/agents`);
    assert.equal(join.json.agent_ids.length, TEAM.length + 1, "all 16 roster agents + observer");
    // the learned Switch thread of an existing topic survives the upgrade
    calls.length = 0;
    s.cookie = cookie;
    assert.equal((await command(s, "ads", "hi")).status, 202);
    assert.equal(lastPost().json.thread_id, "sw-ads-kept");
    // the next message doesn't set it up again
    calls.length = 0;
    evS = s;
    await evAt({ text: "hello" });
    await sleep(100);
    assert.equal(topicCalls().length, 0);
  } finally {
    await s.stop();
  }
});

test("roster topics: Telegram 429 on createForumTopic is retried after retry_after", async () => {
  fake.tg429 = 1;
  const s = await start();
  try {
    const cookie = await account(s);
    fake.chats["room-429"] = "-429";
    calls.length = 0;
    const st = await link(s, cookie, { room: "room-429" });
    assert.equal(Object.keys(st.workspace.topics).length, 8);
    assert.equal(topicCalls().length, 9, "one retried");
  } finally {
    fake.tg429 = 0;
    await s.stop();
  }
});

test("thread learning: an explicit #Topic tag, department votes, War Room correction, General reply chains ignored; commands then land in the topic", async () => {
  const s = await linked();
  try {
    // 1. before: no thread → General with a tag
    await command(s, "analytics", "numbers?");
    assert.equal(lastPost().json.content, "#Analytics @d2c-analyst numbers?");

    // 2. explicit: the founder sends "#Finance" inside the Finance topic
    let m = await (await evAt({ speaker: "founder", room: "war_room", text: "#Finance", meta: { switch_thread_id: "T-fin" } })).json();
    assert.equal(m.room, "finance", "the tag message itself is mapped");
    assert.equal((await (await evAt({ speaker: "founder", text: "later", meta: { switch_thread_id: "T-fin" } })).json()).room, "finance");

    // 3. votes: three analytics-department messages in one thread → Analytics (captain posting once doesn't stop it)
    await evAt({ speaker: "d2c-captain", room: "war_room", text: "@d2c-analyst go", meta: { switch_thread_id: "T-an" } });
    await evAt({ speaker: "d2c-analyst", room: "analytics", text: "on it", meta: { switch_thread_id: "T-an" } });
    await evAt({ speaker: "d2c-forecaster", room: "analytics", text: "forecast", meta: { switch_thread_id: "T-an" } });
    m = await (await evAt({ speaker: "d2c-insights", room: "war_room", text: "cohorts", meta: { switch_thread_id: "T-an" } })).json();
    assert.equal(m.room, "analytics");
    await command(s, "analytics", "numbers?");
    assert.deepEqual(lastPost().json, { body: "@d2c-analyst numbers?", thread_id: "T-an" }, "threaded now");

    // 4. a thread under a General message (reply chain) is never learned
    await evAt({ speaker: "founder", text: "top level", meta: { switch_message_id: "G1" } });
    for (const sp of ["d2c-ops", "d2c-ops", "d2c-logistics", "d2c-procurement"]) await evAt({ speaker: sp, text: "re", meta: { switch_thread_id: "G1" } });
    await command(s, "ops", "stock?");
    assert.match(lastPost().json.content, /^#Ops /, "Ops still unthreaded");

    // 5. War Room: the captain and two departments in one thread (corrects a wrong department guess)
    for (const sp of ["d2c-ads", "d2c-ads", "d2c-ads"]) await evAt({ speaker: sp, text: "x", meta: { switch_thread_id: "T-war" } });
    await evAt({ speaker: "d2c-captain", text: "plan", meta: { switch_thread_id: "T-war" } });
    m = await (await evAt({ speaker: "d2c-ops", text: "ok", meta: { switch_thread_id: "T-war" } })).json();
    assert.equal(m.room, "war_room");
    await command(s, "war_room", "go");
    assert.equal(lastPost().json.thread_id, "T-war");
    await command(s, "ads", "go");
    assert.match(lastPost().json.content, /^#Ads /, "the wrong Ads guess was cleared");

    // persisted: a restart keeps the learned threads (same DB)
    const ws = (await getJson(s, "/api/workspaces", s.cookie))[0];
    assert.equal(ws.topics.analytics.threadId > 0, true, "public shape unchanged: threadId only");
    assert.equal(ws.topics.analytics.switchThreadId, undefined);
  } finally {
    await s.stop();
  }
});

test("thread learning persists across a restart", async () => {
  const DATA_DIR = tmp();
  let s = await linked({ DATA_DIR });
  const cookie = s.cookie;
  await evAt({ speaker: "founder", text: "#QALab", meta: { switch_thread_id: "T-qa" } });
  await s.stop();
  s = await start({ ADMIN_TOKEN: "adm", DATA_DIR });
  try {
    calls.length = 0;
    const r = await adminPost(s, "/api/qa/ask", { agent: "d2c-analyst", text: "What was net revenue?" });
    assert.equal(r.status, 202);
    assert.equal((await r.json()).thread, "topic");
    assert.deepEqual(lastPost().json, { body: "@d2c-analyst What was net revenue?", thread_id: "T-qa" });
    void cookie;
  } finally {
    await s.stop();
  }
});

test("hires: finance department, reports_to a lead of the same department, QA Lab refused", async () => {
  const s = await linked();
  const hire = (o) => post(s, "/api/employees", { name: "Asha", role: "Accountant", room: "finance", instructions: "Reconcile.", ...o }, { cookie: s.cookie });
  try {
    for (const o of [{ reports_to: "d2c-analyst" }, { reports_to: "d2c-payroll" }, { reports_to: "nobody" }, { room: "qa_lab" }])
      assert.equal((await hire(o)).status, 400, JSON.stringify(o));
    let r = await hire({ reports_to: "d2c-finance" });
    assert.equal(r.status, 201);
    const e = await r.json();
    assert.deepEqual([e.room, e.reports_to, e.desk], ["finance", "d2c-finance", "finance_cabin#2"]);
    assert.match(calls.findLast((c) => c.path === "/gateway/management/agents").json.definition.instructions, /Report to @d2c-finance\./);
    const person = (await getJson(s, "/api/people", s.cookie)).find((p) => p.id === e.id);
    assert.equal(person.reports_to, "d2c-finance");
    assert.ok((await getJson(s, "/api/rooms", s.cookie)).find((x) => x.id === "finance").members.includes(e.id));
    r = await hire({ name: "Bo" });
    assert.equal((await r.json()).reports_to, null, "optional");
  } finally {
    await s.stop();
  }
});

test("QA Lab API: admin only, validation, posts to the QA Lab topic, replies after a time, rate limited", async () => {
  const s = await linked({ QA_PER_MIN: "3" });
  try {
    assert.equal((await post(s, "/api/qa/ask", { agent: "d2c-analyst", text: "hi" }, { cookie: s.cookie })).status, 401, "a session is not enough");
    assert.equal((await get(s, "/api/qa/replies", s.cookie)).status, 401);
    for (const b of [{ agent: "d2c-nope", text: "hi" }, { agent: "librarian", text: "hi" }, { agent: "d2c-analyst", text: "" }, { agent: "d2c-analyst", text: "x".repeat(1001) }, { text: "hi" }])
      assert.equal((await adminPost(s, "/api/qa/ask", b)).status, 400, JSON.stringify(b).slice(0, 60));
    assert.equal((await adminPost(s, "/api/qa/ask", { agent: "d2c-analyst", text: "hi", workspace: "ws_nope" })).status, 403);

    const before = Date.now() - 1;
    let r = await adminPost(s, "/api/qa/ask", { agent: "d2c-payroll", text: "Total salaries in October?" });
    assert.equal(r.status, 202);
    const a = await r.json();
    assert.equal(a.workspace, s.ws.id, "default: the only ready workspace");
    assert.ok(a.id && a.sentAt >= before);
    assert.equal(lastPost().json.content, "#QALab @d2c-payroll Total salaries in October?", "no QA Lab thread yet: General, tagged");

    // the topic gets its thread; replies come back through the observer
    await evAt({ speaker: "founder", text: "#QALab", meta: { switch_thread_id: "T-qa" } });
    await evAt({ speaker: "d2c-payroll", text: "₹18.4L", t: Date.now(), meta: { switch_thread_id: "T-qa" } });
    await evAt({ speaker: "d2c-analyst", text: "elsewhere", meta: { switch_thread_id: "T-other" } });
    r = await adminPost(s, "/api/qa/ask", { agent: "d2c-analyst", text: "AOV?" });
    assert.equal((await r.json()).thread, "topic");
    assert.deepEqual(lastPost().json, { body: "@d2c-analyst AOV?", thread_id: "T-qa" });
    let replies = await (await adminGet(s, `/api/qa/replies?after=${before}&agent=d2c-payroll`)).json();
    assert.deepEqual(replies.map((e) => [e.room, e.text]), [["qa_lab", "₹18.4L"]]);
    replies = await (await adminGet(s, `/api/qa/replies?after=${before}&workspace=${s.ws.id}`)).json();
    assert.deepEqual(replies.map((e) => e.text), ["#QALab", "₹18.4L"], "QA Lab topic only, oldest first");
    assert.deepEqual(await (await adminGet(s, `/api/qa/replies?after=${Date.now() + 1000}`)).json(), []);
    assert.equal((await adminGet(s, "/api/qa/replies?agent=d2c-nope")).status, 400);

    assert.equal((await adminPost(s, "/api/qa/ask", { agent: "d2c-analyst", text: "3" })).status, 202);
    assert.equal((await adminPost(s, "/api/qa/ask", { agent: "d2c-analyst", text: "4" })).status, 429);
  } finally {
    await s.stop();
  }
});

test("KPIs: v1 fallback from data/, v2 files when present, cached until a file changes; public", async () => {
  const dir = tmp();
  const s = await start({ KPI_DATA_DIR: dir });
  const s1 = await start();
  try {
    const v1 = await getJson(s1, "/api/kpis");
    assert.equal(v1.meta_roas, 3.12, "data/meta_campaigns.csv: 14.02L / 4.5L");
    assert.equal(v1.net_revenue, null);
    assert.deepEqual([v1.by_channel, v1.top_skus], [[], []]);

    writeFileSync(join(dir, "products.csv"), "sku,name,mrp\nSKU01,Vitamin C Serum,899\nSKU02,\"Sunscreen, SPF 50\",599\n");
    writeFileSync(join(dir, "orders.csv"), [
      "order_id,date,channel,region,city,warehouse,sku,qty,mrp,discount_pct,gross_revenue,net_revenue,payment,status,customer_id",
      "o1,2026-08-01,Website,West,Mumbai,Mumbai,SKU01,2,899,0,1798,1700,prepaid,delivered,c1",
      "o1,2026-08-01,Website,West,Mumbai,Mumbai,SKU02,1,599,0,599,500,prepaid,delivered,c1",
      "o2,2026-08-02,Amazon,North,Delhi,Delhi,SKU02,1,599,0,599,550,cod,rto,c2",
      "o3,2026-09-10,Amazon,North,Delhi,Delhi,SKU01,1,899,0,899,800,prepaid,delivered,c3",
      "o4,2026-10-31,Website,West,Pune,Mumbai,SKU01,1,899,0,899,850,cod,returned,c4",
      "o5,2026-10-31,Website,West,Pune,Mumbai,SKU01,1,899,0,899,850,cod,cancelled,c5",
    ].join("\n"));
    writeFileSync(join(dir, "meta_ads_daily.csv"), "date,campaign,adset,ad,creative_type,spend,impressions,clicks,add_to_cart,purchases,revenue\n2026-08-01,c,a,ad,video,1000,1,1,1,1,4000\n");
    writeFileSync(join(dir, "google_ads_daily.csv"), "date,campaign,type,spend,impressions,clicks,conversions,revenue\n2026-08-01,g,search,500,1,1,1,900\n");
    writeFileSync(join(dir, "pnl_monthly.csv"), "month,net_revenue,ebitda\n2026-10,1,-2500\n2026-08,1,9000\n");
    const k = await getJson(s, "/api/kpis");
    assert.deepEqual(k.window, { from: "2026-08-01", to: "2026-10-31" });
    assert.equal(k.orders, 4, "distinct, not cancelled");
    assert.equal(k.net_revenue, 3000, "delivered lines");
    assert.equal(k.aov, 1500);
    assert.equal(k.rto_pct, 25);
    assert.equal(k.return_pct, 25);
    assert.equal(k.meta_roas, 4);
    assert.equal(k.blended_roas, 2);
    assert.equal(k.ebitda_last_month, -2500);
    assert.deepEqual(k.by_channel, [{ channel: "Website", orders: 2, net_revenue: 2200, rto_pct: 0 }, { channel: "Amazon", orders: 2, net_revenue: 800, rto_pct: 50 }]);
    assert.deepEqual(k.top_skus, [{ sku: "SKU01", name: "Vitamin C Serum", units: 3, net_revenue: 2500 }, { sku: "SKU02", name: "Sunscreen, SPF 50", units: 1, net_revenue: 500 }]);
    assert.ok(k.updated > 0);

    writeFileSync(join(dir, "pnl_monthly.csv"), "month,net_revenue,ebitda\n2026-10,1,7777\n");
    utimesSync(join(dir, "pnl_monthly.csv"), new Date(), new Date(Date.now() + 5000));
    assert.equal((await getJson(s, "/api/kpis")).ebitda_last_month, 7777, "recomputed after the mtime changed");
  } finally {
    await s.stop();
    await s1.stop();
  }
});

test("idempotent ingest: the same Switch message delivered twice is stored and broadcast once", async () => {
  const s = await linked();
  try {
    const e = ev({ text: "once", meta: { switch_message_id: "m-42" } });
    const a = await post(s, "/api/events", e);
    assert.equal(a.status, 201);
    const b = await post(s, "/api/events", e);
    assert.equal(b.status, 200);
    const [ea, eb] = [await a.json(), await b.json()];
    assert.equal(ea.id, eb.id);
    assert.match(ea.id, /^sw-[0-9a-f]{24}$/);
    assert.deepEqual((await getJson(s, "/api/history", s.cookie)).map((x) => x.text), ["once"]);
    assert.equal((await post(s, "/api/events", ev({ text: "other room", meta: { switch_message_id: "m-42" } }, "room-x"))).status, 202, "ids are per Switch room");
  } finally {
    await s.stop();
  }
});

test("/api/ready: Switch reachability and workspace status (ids for ADMIN_TOKEN only)", async () => {
  const s = await linked();
  const off = await start({ SWITCH_CORE_ENV: "/nonexistent" });
  try {
    let r = await (await get(s, "/api/ready")).json();
    assert.deepEqual([r.ready, r.db, r.switch], [true, "ok", "ok"]);
    assert.deepEqual(r.workspaces, { ready: 1, linking: 0, needs_admin: 0 });
    assert.equal(r.workspace_status, undefined);
    r = await (await adminGet(s, "/api/ready")).json();
    assert.deepEqual(r.workspace_status, [{ id: s.ws.id, status: "ready", detail: null }]);
    const o = await get(off, "/api/ready");
    assert.equal(o.status, 200, "Switch down doesn't make the server unready");
    assert.equal((await o.json()).switch, "unconfigured");
  } finally {
    await s.stop();
    await off.stop();
  }
});

test("Switch calls: GETs retried on 503; a silent office stream times out as 503 instead of hanging", async () => {
  const s = await linked({ SWITCH_TIMEOUT_MS: "500" });
  try {
    fake.agentsFlaky = 2;
    const r = await post(s, "/api/employees", { name: "Flaky", role: "Tester", room: "ops", instructions: "x" }, { cookie: s.cookie });
    assert.equal(r.status, 201, "GET /gateway/agents failed twice, third try worked");
    assert.equal(fake.agentsFlaky, 0);

    await evAt({ speaker: "founder", text: "#Ops", meta: { switch_thread_id: "T-ops" } }); // threaded posts need the stream
    fake.streamSilent = true;
    const t0 = Date.now();
    const c = await command(s, "ops", "stock?");
    assert.equal(c.status, 503);
    assert.ok(Date.now() - t0 < 5000, "bounded by SWITCH_TIMEOUT_MS");
  } finally {
    fake.agentsFlaky = 0;
    fake.streamSilent = false;
    await s.stop();
  }
});

test("graceful shutdown: SIGTERM checkpoints the WAL into events.db", async () => {
  const DATA_DIR = tmp();
  const s = await linked({ DATA_DIR });
  for (let i = 0; i < 20; i++) await evAt({ text: `m${i}` });
  const wal = join(DATA_DIR, "events.db-wal");
  assert.ok(existsSync(wal) && statSync(wal).size > 0, "writes went to the WAL");
  await s.stop();
  assert.ok(!existsSync(wal) || statSync(wal).size === 0, "WAL flushed on shutdown");
});
