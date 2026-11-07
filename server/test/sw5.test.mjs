// SW5: GET /api/roi (Switch ROI + Trust) and the opt-in POST /api/roi/budgets. A small fake Switch in front of the
// shared one (helpers.mjs): it answers the tenant usage / budgets / trust routes and forwards everything else.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { start, tmp, post, account, link, getJson, get, ev, upstream } from "./helpers.mjs";

const T = "00000000-0000-0000-0000-000000000000";
const roi = { calls: [], usage: [], budgets: [], trust: null, mode: "ok" /* ok | down | forbidden */, created: [] };
const u = (client_name, metric, amount, model = "", client_type = "agent") => ({ metric, client_id: `id-${client_name}`, client_name, client_type, model, amount });
const front = createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const path = req.url.split("?")[0];
  const ok = (b, status = 200) => (res.writeHead(status, { "content-type": "application/json" }), res.end(JSON.stringify(b)));
  if (path.startsWith("/gateway/tenants") || path === "/gateway/trust-settings") {
    roi.calls.push({ method: req.method, url: req.url, json: body ? JSON.parse(body) : null });
    if (roi.mode === "down") return ok({ detail: "db password=hunter2 exploded" }, 500);
    if (path === "/gateway/tenants/current") return ok({ id: T, slug: "default", name: "Default", role: "owner", administers: true });
    if (path === "/gateway/trust-settings") return ok(roi.trust ?? { endpoint: "https://api.switchagents.ai", policy_id: null, has_api_key: false, api_key_last4: null, enabled: false });
    if (roi.mode === "forbidden") return ok({ detail: "Not authorized for this tenant" }, 403);
    if (path === `/gateway/tenants/${T}/usage`) return ok(roi.usage);
    if (path === `/gateway/tenants/${T}/budgets` && req.method === "POST") return roi.created.push(JSON.parse(body)), ok({ id: "b1", ...JSON.parse(body), spent: 0, exhausted: false }, 201);
    if (path === `/gateway/tenants/${T}/budgets`) return ok(roi.budgets);
    return ok({ detail: "Not Found" }, 404);
  }
  // everything else: the shared fake Switch
  const r = await fetch(upstream + req.url, { method: req.method, headers: { ...req.headers, host: undefined }, body: body || undefined });
  const h = { "content-type": r.headers.get("content-type") ?? "application/json" };
  const sc = r.headers.getSetCookie();
  if (sc.length) h["set-cookie"] = sc;
  res.writeHead(r.status, h);
  res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((r) => front.listen(0, "127.0.0.1", r));
after(() => (front.closeAllConnections(), front.close()));
const coreEnv = join(tmp(), "core.env");
writeFileSync(coreEnv, `SERVER_PORT=${front.address().port}\nGATEWAY_ADMIN_EMAIL=a@x\nGATEWAY_ADMIN_PASSWORD='pw'\n`);
const boot = (env = {}) => start({ SWITCH_CORE_ENV: coreEnv, MORNING_BRIEF: "off", ...env });
const reset = (o = {}) => Object.assign(roi, { calls: [], usage: [], budgets: [], trust: null, mode: "ok", created: [] }, o);

test("roi: Switch usage grouped per d2c agent, priced as an estimate, joined with what each one posted", async () => {
  reset({
    usage: [
      u("d2c-captain", "turns", 40), u("d2c-captain", "messages", 30),
      u("d2c-captain", "cache_read_tokens", 4_000_000, "claude-haiku-5-5"), u("d2c-captain", "cache_write_tokens", 100_000, "claude-haiku-5-5"),
      u("d2c-captain", "input_tokens", 5_000, "claude-haiku-5-5"), u("d2c-captain", "output_tokens", 20_000, "claude-haiku-5-5"),
      u("d2c-ads", "turns", 10), u("d2c-ads", "output_tokens", 10_000, "claude-opus-5-5"), u("d2c-ads", "cache_read_tokens", 1_000_000, "claude-opus-5-5"),
      u("d2c-office", "messages", 9), // our console: not a team agent
      u("switch-buddy-admin", "turns", 1), u(null, "turns", 1, "", null), // not ours: "other"
    ],
    budgets: [{ id: "b9", agent_id: "id-d2c-ads", agent_name: "d2c-ads", metric: "turns", model: null, amount_limit: 100, period_hours: 24, spent: 10, resets_at: "2026-11-08T00:00:00Z", exhausted: false }],
  });
  const s = await boot();
  try {
    const cookie = await account(s); // first account: the host owner
    const ws = (await link(s, cookie)).workspace;
    for (const text of ["plan v1", "final plan"]) assert.equal((await post(s, "/api/events", ev({ room: "war_room", speaker: "d2c-captain", text }))).status, 201);
    const r = await getJson(s, `/api/roi?ws=${ws.id}&hours=6`, cookie);
    assert.equal(r.source, "switch");
    assert.equal(r.window.hours, 6);
    const q = new URL(roi.calls.find((c) => c.url.includes("/usage")).url, "http://x").searchParams;
    assert.match(q.get("since"), /(Z|[+-]\d\d:\d\d)$/, "tz-aware bounds");
    assert.equal(Date.parse(q.get("until")) - Date.parse(q.get("since")), 6 * 3_600_000);
    assert.deepEqual(r.rows.map((x) => x.agent), ["d2c-ads", "d2c-captain"], "most expensive first; d2c-office and strangers left out");
    const cap = r.rows.find((x) => x.agent === "d2c-captain");
    // 4M*0.01 + 0.1M*0.125 + 5k*0.1 + 20k*0.5, per million
    assert.equal(cap.costUsd, 0.04 + 0.0125 + 0.0005 + 0.01);
    assert.deepEqual([cap.turns, cap.switchMessages, cap.posted, cap.deliverables, cap.models], [40, 30, 2, 2, ["claude-haiku-5-5"]]);
    assert.equal(cap.costPerDeliverable, 0.0315);
    assert.equal(cap.turnShare, 0.8);
    const ads = r.rows.find((x) => x.agent === "d2c-ads");
    assert.equal(ads.costUsd, 0.2 + 0.2);
    assert.equal(ads.costPerDeliverable, null, "posted nothing: no ratio");
    assert.equal(r.totals.turns, 50);
    assert.deepEqual(r.totals.other, { turns: 2, costUsd: 0 });
    assert.equal(r.pricing.estimate, true);
    assert.match(r.recommendations[0], /^d2c-captain uses 80% of all turns \(40\); 97% of what it reads is the cached chat/);
    assert.match(r.recommendations[1], /claude-opus-5-5 \(d2c-ads\)/);
    assert.equal(r.budgets[0].agent_name, "d2c-ads");
    assert.equal(r.trust.switchTrust, "disabled");
    assert.equal(r.trust.approvalRequired, true);
    assert.equal(r.trust.lockdown.autoMode, false);
    assert.ok(r.trust.lockdown.tools.includes("Read"));
    assert.ok(r.trust.safetyBlock.agents >= 1 && r.trust.safetyBlock.agents <= r.trust.safetyBlock.of);
    assert.equal((await get(s, `/api/roi?ws=${ws.id}`)).status, 401, "needs the session");
    assert.ok(roi.calls.every((c) => c.method === "GET"), "read only");
  } finally {
    await s.stop();
  }
});

test("roi: Switch down → 200 with source unavailable (no 500, no Switch detail); trust still shows our guardrails", async () => {
  reset();
  const s = await boot({ SWITCH_TIMEOUT_MS: "2000" });
  try {
    const cookie = await account(s);
    const ws = (await link(s, cookie)).workspace;
    roi.mode = "down";
    const res = await get(s, `/api/roi?ws=${ws.id}`, cookie);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.doesNotMatch(text, /hunter2/);
    const r = JSON.parse(text);
    assert.equal(r.source, "unavailable");
    assert.match(r.reason, /Switch/);
    assert.deepEqual([r.rows, r.totals, r.budgets], [[], null, []]);
    assert.equal(r.trust.switchTrust, "unavailable");
    assert.equal(r.trust.lockdown.autoMode, false);
  } finally {
    await s.stop();
  }
});

test("roi: a non-admin Switch login (403 on usage) and a non-owner account both fall back softly", async () => {
  reset({ mode: "forbidden", trust: { endpoint: "https://api.switchagents.ai", policy_id: "pol_1", has_api_key: true, api_key_last4: "abcd", enabled: true } });
  const s = await boot();
  try {
    const owner = await account(s);
    const ws = (await link(s, owner)).workspace;
    const r = await getJson(s, `/api/roi?ws=${ws.id}`, owner);
    assert.equal(r.source, "unavailable");
    assert.match(r.reason, /owner\/admin/);
    assert.equal(r.trust.switchTrust, "enabled");
    assert.doesNotMatch(JSON.stringify(r), /abcd/, "no key digits");

    reset();
    const other = await account(s);
    const ws2 = (await link(s, other, { room: "old", chat: "-5" })).workspace;
    const r2 = await getJson(s, `/api/roi?ws=${ws2.id}`, other);
    assert.equal(r2.source, "unavailable");
    assert.match(r2.reason, /host owner/);
    assert.equal(roi.calls.length, 0, "Switch is not even asked");
  } finally {
    await s.stop();
  }
});

test("roi budgets: off by default (404); with ROI_BUDGETS=on only the owner, validated, agent id resolved", async () => {
  reset();
  let s = await boot();
  const body = { agent: "d2c-ads", metric: "turns", amount_limit: 200, period_hours: 24 };
  try {
    const cookie = await account(s);
    const ws = (await link(s, cookie)).workspace;
    assert.equal((await post(s, `/api/roi/budgets?ws=${ws.id}`, body, { cookie })).status, 404);
    assert.equal(roi.created.length, 0);
  } finally {
    await s.stop();
  }
  s = await boot({ ROI_BUDGETS: "on" });
  try {
    const owner = await account(s);
    const ws = (await link(s, owner)).workspace;
    assert.equal((await post(s, `/api/roi/budgets?ws=${ws.id}`, { ...body, metric: "dollars" }, { cookie: owner })).status, 400);
    assert.equal((await post(s, `/api/roi/budgets?ws=${ws.id}`, { ...body, agent: "rm -rf" }, { cookie: owner })).status, 400);
    const r = await post(s, `/api/roi/budgets?ws=${ws.id}`, body, { cookie: owner });
    assert.equal(r.status, 201, await r.clone().text());
    assert.deepEqual(roi.created, [{ agent_id: "x3", metric: "turns", model: null, amount_limit: 200, period_hours: 24 }]);
    const other = await account(s);
    const ws2 = (await link(s, other, { room: "old", chat: "-5" })).workspace;
    assert.equal((await post(s, `/api/roi/budgets?ws=${ws2.id}`, body, { cookie: other })).status, 403);
    assert.equal(roi.created.length, 1);
  } finally {
    await s.stop();
  }
});
