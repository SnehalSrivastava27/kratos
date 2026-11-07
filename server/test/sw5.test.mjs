// SW5: GET /api/roi (Switch ROI + Trust) and the opt-in POST /api/roi/budgets. A small fake Switch in front of the
// shared one (helpers.mjs): it answers the tenant usage / budgets / trust routes and forwards everything else.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { start, tmp, post, account, link, getJson, get, ev, upstream } from "./helpers.mjs";

const T = "00000000-0000-0000-0000-000000000000";
const roi = { calls: [], usage: [], usageFor: null /* (since, until) => rows */, budgets: [], trust: null, mode: "ok" /* ok | down | forbidden */, created: [] };
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
    if (path === `/gateway/tenants/${T}/usage`) {
      const q = new URL(req.url, "http://x").searchParams;
      return ok(roi.usageFor ? roi.usageFor(Date.parse(q.get("since")), Date.parse(q.get("until"))) : roi.usage);
    }
    if (path === `/gateway/tenants/${T}/budgets` && req.method === "POST") {
      const b = { id: `b${roi.created.length + 1}`, ...JSON.parse(body), spent: 0, exhausted: false };
      return roi.created.push(JSON.parse(body)), roi.budgets.push(b), ok(b, 201);
    }
    if (path === `/gateway/tenants/${T}/budgets`) return ok(roi.budgets);
    const one = path.match(new RegExp(`^/gateway/tenants/${T}/budgets/([\\w-]+)$`));
    if (one) {
      const i = roi.budgets.findIndex((b) => b.id === one[1]);
      if (i < 0) return ok({ detail: "Budget not found" }, 404);
      if (req.method === "PUT") return Object.assign(roi.budgets[i], JSON.parse(body)), ok(roi.budgets[i]);
      if (req.method === "DELETE") return roi.budgets.splice(i, 1), res.writeHead(204), res.end();
    }
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
const reset = (o = {}) => Object.assign(roi, { calls: [], usage: [], usageFor: null, budgets: [], trust: null, mode: "ok", created: [] }, o);

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
    const qs = roi.calls.filter((c) => c.url.includes("/usage")).map((c) => new URL(c.url, "http://x").searchParams);
    assert.ok(qs.every((q) => /(Z|[+-]\d\d:\d\d)$/.test(q.get("since")) && /(Z|[+-]\d\d:\d\d)$/.test(q.get("until"))), "tz-aware bounds");
    assert.ok(qs.some((q) => Date.parse(q.get("until")) - Date.parse(q.get("since")) === 6 * 3_600_000), "the window");
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
    assert.deepEqual(roi.created, [{ agent_id: "x3", metric: "turns", model: "", amount_limit: 200, period_hours: 24 }], "model \"\" = every model (switch-core BudgetCreateRequest.model is a str)");
    const other = await account(s);
    const ws2 = (await link(s, other, { room: "old", chat: "-5" })).workspace;
    assert.equal((await post(s, `/api/roi/budgets?ws=${ws2.id}`, body, { cookie: other })).status, 403);
    assert.equal(roi.created.length, 1);
  } finally {
    await s.stop();
  }
});

// ---- ROI2: caps, forecast, budgets CRUD, the five analyses, pricing, telemetry ----
const send = (s, method, path, body, cookie, headers = {}) =>
  fetch(s.base + path, { method, headers: { "content-type": "application/json", origin: s.base, cookie, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const H = 3_600_000;

test("roi caps: owner-only JSON writes, stored, forecast (burn rate, days to cap, ok/warn/over) in /api/roi", async () => {
  // $1.00 of Haiku output in every window Switch is asked about (so month to date is $1.00 too)
  reset({ usage: [u("d2c-captain", "turns", 10), u("d2c-captain", "output_tokens", 2_000_000, "claude-haiku-5-5")] });
  const s = await boot();
  try {
    const owner = await account(s);
    const ws = (await link(s, owner)).workspace;
    const path = `/api/roi/caps?ws=${ws.id}`;
    assert.equal((await send(s, "POST", path, { agent: "d2c-captain", usd: 1.1 }, owner, { "content-type": "text/plain" })).status, 415, "JSON only");
    assert.equal((await send(s, "POST", path, { agent: "d2c-captain", usd: 1.1 }, owner, { origin: "https://evil.example" })).status, 403, "origin check");
    assert.equal((await send(s, "POST", path, { agent: "d2c-captain", usd: 0 }, owner)).status, 400);
    assert.equal((await send(s, "POST", path, { agent: "rm -rf /", usd: 5 }, owner)).status, 400);
    assert.equal((await send(s, "POST", path, { agent: "d2c-captain", usd: 5, enforce: true }, owner)).status, 400, "enforcement needs ROI_BUDGETS=on");
    const set = await send(s, "POST", path, { agent: "d2c-captain", usd: 1.1 }, owner);
    assert.equal(set.status, 200, await set.clone().text());
    assert.equal((await set.json()).mirrored, null);

    const other = await account(s);
    const ws2 = (await link(s, other, { room: "old", chat: "-5" })).workspace;
    assert.equal((await send(s, "POST", `/api/roi/caps?ws=${ws2.id}`, { agent: "d2c-captain", usd: 1 }, other)).status, 403, "only the host owner");
    assert.equal((await send(s, "DELETE", `/api/roi/caps?ws=${ws2.id}`, { agent: "d2c-captain" }, other)).status, 403);

    const r = await getJson(s, `/api/roi?ws=${ws.id}`, owner);
    assert.equal(r.canEdit, true);
    const cap = r.spend.agents.find((a) => a.agent === "d2c-captain");
    const now = new Date(), day = now.getUTCDate(), dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    assert.equal(cap.mtdUsd, 1);
    assert.equal(cap.costPerTurn, 0.1);
    assert.equal(cap.cap.capUsd, 1.1);
    assert.equal(cap.cap.status, "warn", "91% of the cap: Near cap");
    assert.equal(cap.cap.burnPerDay, Math.round((1 / day) * 1e4) / 1e4);
    assert.equal(cap.cap.projectedUsd, Math.round((dim / day) * 1e4) / 1e4);
    assert.equal(cap.cap.daysToCap, Math.round(0.1 * day * 10) / 10);
    assert.deepEqual(r.spend.capSummary, { ok: 0, warn: 1, over: 0, none: 0 });
    assert.equal(r.spend.months.length, 3);
    assert.ok(r.spend.trend.length >= 7, "daily trend");
    assert.ok(r.spend.trend.every((d) => d.costUsd === 1));
    assert.equal(cap.sessions24h, 1, "one run of active hours");
    assert.equal(cap.costPerSession, 24, "24 hourly reads at $1 each, one session");

    assert.equal((await send(s, "POST", path, { agent: "d2c-captain", usd: 0.5 }, owner)).status, 200, "edit = set again");
    assert.equal((await getJson(s, `/api/roi?ws=${ws.id}`, owner)).spend.agents.find((a) => a.agent === "d2c-captain").cap.status, "over");
    assert.equal((await send(s, "DELETE", path, { agent: "d2c-captain" }, owner)).status, 200);
    assert.equal((await send(s, "DELETE", path, { agent: "d2c-captain" }, owner)).status, 404);
    assert.equal((await getJson(s, `/api/roi?ws=${ws.id}`, owner)).spend.agents.find((a) => a.agent === "d2c-captain").cap.status, "none");
    assert.ok(roi.calls.every((c) => c.method === "GET"), "caps alone never write to Switch");
  } finally {
    await s.stop();
  }
});

test("roi budgets CRUD + enforced caps: off → 404 for every write; on → create, update, delete; a cap mirrors to a turns budget", async () => {
  reset({ usage: [u("d2c-ads", "turns", 20), u("d2c-ads", "output_tokens", 400_000, "claude-haiku-5-5")] }); // $0.20, $0.01/turn
  let s = await boot();
  try {
    const owner = await account(s);
    const ws = (await link(s, owner)).workspace;
    assert.equal((await send(s, "PUT", `/api/roi/budgets/b1?ws=${ws.id}`, { amount_limit: 5, period_hours: 24 }, owner)).status, 404);
    assert.equal((await send(s, "DELETE", `/api/roi/budgets/b1?ws=${ws.id}`, undefined, owner)).status, 404);
    assert.equal((await getJson(s, `/api/roi?ws=${ws.id}`, owner)).budgetsEnabled, false);
  } finally {
    await s.stop();
  }
  s = await boot({ ROI_BUDGETS: "on" });
  try {
    const owner = await account(s);
    const ws = (await link(s, owner)).workspace;
    const q = `?ws=${ws.id}`;
    const made = await send(s, "POST", `/api/roi/budgets${q}`, { agent: "d2c-ads", metric: "output_tokens", model: "claude-haiku-5-5", amount_limit: 1000, period_hours: 24 }, owner);
    assert.equal(made.status, 201);
    const id = (await made.json()).id;
    assert.equal((await send(s, "POST", `/api/roi/budgets${q}`, { agent: "d2c-ads", metric: "turns", model: "claude-haiku-5-5", amount_limit: 9, period_hours: 24 }, owner)).status, 400, "no model on turns");
    assert.equal((await send(s, "PUT", `/api/roi/budgets/${id}${q}`, { amount_limit: 0, period_hours: 24 }, owner)).status, 400);
    assert.equal((await send(s, "PUT", `/api/roi/budgets/${id}${q}`, { amount_limit: 2000, period_hours: 48 }, owner, { "content-type": "text/plain" })).status, 415);
    const up = await send(s, "PUT", `/api/roi/budgets/${id}${q}`, { amount_limit: 2000, period_hours: 48 }, owner);
    assert.equal(up.status, 200);
    assert.deepEqual([roi.budgets[0].amount_limit, roi.budgets[0].period_hours], [2000, 48]);
    assert.equal((await getJson(s, `/api/roi${q}`, owner)).budgets[0].amount_limit, 2000);
    assert.equal((await send(s, "DELETE", `/api/roi/budgets/${id}${q}`, undefined, owner)).status, 200);
    assert.equal(roi.budgets.length, 0);
    assert.equal((await send(s, "DELETE", `/api/roi/budgets/${id}${q}`, undefined, owner)).status, 502, "Switch's 404, as a generic error");

    // an enforced cap: $1 at $0.01/turn → a 100-turn budget over 720 h; clearing the cap deletes it
    const cap = await send(s, "POST", `/api/roi/caps${q}`, { agent: "d2c-ads", usd: 1, enforce: true }, owner);
    assert.equal(cap.status, 200, await cap.clone().text());
    assert.deepEqual((await cap.json()).mirrored, { budgetId: roi.budgets[0].id, turns: 100 });
    assert.deepEqual(roi.created.at(-1), { agent_id: "x3", metric: "turns", model: "", amount_limit: 100, period_hours: 720 });
    assert.equal((await send(s, "POST", `/api/roi/caps${q}`, { agent: "d2c-ads", usd: 2, enforce: true }, owner)).status, 200);
    assert.equal(roi.budgets.length, 1, "re-set updates the same budget");
    assert.equal(roi.budgets[0].amount_limit, 200);
    assert.equal((await send(s, "DELETE", `/api/roi/caps${q}`, { agent: "d2c-ads" }, owner)).status, 200);
    assert.equal(roi.budgets.length, 0, "mirrored budget removed with the cap");
    const other = await account(s);
    const ws2 = (await link(s, other, { room: "old", chat: "-5" })).workspace;
    assert.equal((await send(s, "PUT", `/api/roi/budgets/b9?ws=${ws2.id}`, { amount_limit: 5, period_hours: 24 }, other)).status, 403);
  } finally {
    await s.stop();
  }
});

test("roi improvements: each of the five analyses fires on crafted usage, with a saving and an action", async () => {
  const now = Date.now(), burstHour = Math.floor(now / H) * H - 3 * H;
  const base = [
    // captain: Haiku, 30 turns, re-reads 100K cached tokens a turn (context_cache_waste, re-read flavour)
    u("d2c-captain", "turns", 30), u("d2c-captain", "cache_read_tokens", 3_000_000, "claude-haiku-5-5"), u("d2c-captain", "output_tokens", 6_000, "claude-haiku-5-5"),
    // design: Opus (model_optimizer), low cache hit rate (context_cache_waste, hit-rate flavour), wordy (verbosity)
    u("d2c-design", "turns", 10), u("d2c-design", "input_tokens", 400_000, "claude-opus-5-5"), u("d2c-design", "cache_write_tokens", 200_000, "claude-opus-5-5"),
    u("d2c-design", "cache_read_tokens", 100_000, "claude-opus-5-5"), u("d2c-design", "output_tokens", 40_000, "claude-opus-5-5"),
    // influencers: 12 turns, only acks posted (tool_bloat), and a duplicate post (retry_loop_waste)
    u("d2c-influencers", "turns", 12), u("d2c-influencers", "output_tokens", 2_400, "claude-haiku-5-5"), u("d2c-influencers", "cache_read_tokens", 600_000, "claude-haiku-5-5"),
    u("d2c-ops", "turns", 5), u("d2c-ops", "output_tokens", 1_000, "claude-haiku-5-5"),
  ];
  reset({
    usageFor: (since, until) => {
      if (until - since === H) return since === burstHour ? [u("d2c-ops", "turns", 8)] : []; // ops: an 8-turn burst, no post
      return base;
    },
  });
  const s = await boot();
  try {
    const owner = await account(s);
    const ws = (await link(s, owner)).workspace;
    const posts = [
      ["d2c-influencers", "confirmed"], ["d2c-influencers", "ok"], ["d2c-influencers", "Shortlist: 4 creators, ₹1.2L total, briefs pinned"],
      ["d2c-influencers", "Shortlist: 4 creators, ₹1.2L total, briefs pinned"], ["d2c-captain", "Plan v1 is in the War Room doc"], ["d2c-design", "Hero banner: /gallery/hero.html"],
    ];
    for (const [speaker, text] of posts) assert.equal((await post(s, "/api/events", ev({ room: "war_room", speaker, text }))).status, 201);
    const r = await getJson(s, `/api/roi?ws=${ws.id}`, owner);
    const by = (kind, agent) => r.improvements.find((i) => i.kind === kind && i.agent === agent);
    for (const [kind, agent] of [["context_cache_waste", "d2c-captain"], ["context_cache_waste", "d2c-design"], ["model_optimizer", "d2c-design"], ["verbosity", "d2c-design"],
      ["tool_bloat", "d2c-influencers"], ["retry_loop_waste", "d2c-influencers"], ["retry_loop_waste", "d2c-ops"]]) {
      const i = by(kind, agent);
      assert.ok(i, `${kind} for ${agent}: ${JSON.stringify(r.improvements.map((x) => [x.kind, x.agent]))}`);
      assert.ok(i.savingUsd30d > 0, `${kind} ${agent} saving`);
      assert.ok(i.finding && i.action && ["High", "Medium", "Low"].includes(i.confidence));
    }
    // model_optimizer: Opus tokens re-priced at Haiku. Opus 400K*4 + 200K*5 + 100K*0.2 + 40K*20 = $3.42; Haiku 400K*0.1 + 200K*0.125 + 100K*0.01 + 40K*0.5 = $0.086; x30 (24 h window)
    assert.equal(by("model_optimizer", "d2c-design").savingUsd30d, Math.round((3.42 - 0.086) * 30 * 1e4) / 1e4);
    assert.equal(by("retry_loop_waste", "d2c-ops").data.burstTurns, 8);
    assert.equal(by("retry_loop_waste", "d2c-influencers").data.duplicatePosts, 1);
    assert.match(by("verbosity", "d2c-design").finding, /Yes/);
    const design = r.rows.find((x) => x.agent === "d2c-design");
    assert.equal(design.files, 1, "a gallery file it produced counts as a deliverable");
    assert.equal(design.deliverables, 2);
    assert.ok(r.totals.deliverablesPerUsd > 0);
    assert.ok(!by("model_optimizer", "d2c-captain"), "already on Haiku: no model finding");
  } finally {
    await s.stop();
  }
});

test("roi pricing + telemetry: an unknown model is flagged unpriced (not a quiet $0); trust reports OTel on/off, never the key", async () => {
  reset({ usage: [u("d2c-ads", "turns", 3), u("d2c-ads", "output_tokens", 1_000_000, "claude-mystery-9"), u("d2c-ads", "output_tokens", 1_000_000, "claude-haiku-5-5")] });
  const dir = tmp();
  mkdirSync(join(dir, ".claude"));
  const s = await boot({ AGENT_DIR: dir });
  try {
    const owner = await account(s);
    const ws = (await link(s, owner)).workspace;
    let r = await getJson(s, `/api/roi?ws=${ws.id}`, owner);
    const ads = r.rows.find((x) => x.agent === "d2c-ads");
    assert.equal(ads.unpriced, true);
    assert.deepEqual(ads.unpricedModels, ["claude-mystery-9"]);
    assert.equal(ads.costUsd, 0.5, "only the priced half");
    assert.deepEqual(r.totals.unpriced, ["claude-mystery-9"]);
    assert.equal(r.pricing.source, "switch/pricing.json");
    assert.equal(r.pricing.perMTok["claude-haiku-5-5"].output, 0.5);
    assert.equal(r.trust.telemetry, "off");

    writeFileSync(join(dir, ".claude/settings.local.json"), JSON.stringify({ env: {
      CLAUDE_CODE_ENABLE_TELEMETRY: "1", OTEL_EXPORTER_OTLP_ENDPOINT: "https://api.switchagents.ai/agent/otel",
      OTEL_RESOURCE_ATTRIBUTES: "gen_ai.agent.name=kratos-team", OTEL_EXPORTER_OTLP_HEADERS: "Authorization=ApiKey sk_live_SECRET123" } }));
    r = await getJson(s, `/api/roi?ws=${ws.id}`, owner);
    assert.deepEqual([r.trust.telemetry, r.trust.endpointHost, r.trust.agentName, r.trust.keySet, r.trust.contentLogged], ["on", "api.switchagents.ai", "kratos-team", true, false]);
    assert.doesNotMatch(JSON.stringify(r), /SECRET123/);
  } finally {
    await s.stop();
  }
});
