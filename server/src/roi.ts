// Switch ROI (what every agent costs and delivers) and Switch Trust (guardrails), for GET /api/roi and its write routes.
// Cost comes from Switch's own usage counters (GET /gateway/tenants/{id}/usage, owner/admin only, summed over whole UTC
// hours; switch-core 0.31.0 gateway/tenants.py:647), priced with switch/pricing.json, joined with what each agent
// delivered in this workspace (our event store). The pure maths is in roi-calc.ts.
// Everything fails soft: if Switch can't answer, the payload says source "unavailable" and why, never a 500.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gw, switchAgents, SwitchError } from "./switch.js";
import { kvGet, kvSet, type OfficeEvent } from "./store.js";
import { mergePrices, groupUsage, perAgent, teamTotal, forecast, improvements, sessionsIn, round, DEFAULT_PRICES, type Prices, type UsageRow } from "./roi-calc.js";

export const PRICES = DEFAULT_PRICES;
const HOUR = 3_600_000;

// ---- pricing: switch/pricing.json over the list prices (read each time: it's small, and edits apply at once) ----
export function loadPricing(root: string) {
  try {
    const m = mergePrices(JSON.parse(readFileSync(join(root, "switch/pricing.json"), "utf8")));
    if (m.errors.length) console.warn("[roi] switch/pricing.json: skipped invalid entries:", m.errors.join(", "));
    return { ...m, source: "switch/pricing.json" };
  } catch {
    return { prices: { ...DEFAULT_PRICES }, negotiated: [] as string[], errors: [] as string[], source: "list prices" };
  }
}

// ---- telemetry: is Claude Code OTel → Switch Trust wired into the agents' settings? (scripts/trust-otel.py) ----
/** Reads the agents' `.claude/settings.local.json` env. Reports on/off, the endpoint host and agent name; never the key. */
export function telemetry(agentDir: string) {
  try {
    const e = JSON.parse(readFileSync(join(agentDir, ".claude/settings.local.json"), "utf8"))?.env ?? {};
    const endpoint = String(e.OTEL_EXPORTER_OTLP_ENDPOINT ?? "");
    if (e.CLAUDE_CODE_ENABLE_TELEMETRY !== "1" || !endpoint) return { telemetry: "off" as const };
    return {
      telemetry: "on" as const, endpointHost: URL.parse(endpoint)?.host ?? "?",
      agentName: /gen_ai\.agent\.name=([^,]+)/.exec(String(e.OTEL_RESOURCE_ATTRIBUTES ?? ""))?.[1] ?? null,
      contentLogged: Object.keys(e).some((k) => k.startsWith("OTEL_LOG_") && e[k] && e[k] !== "0"),
      keySet: /Authorization=ApiKey \S/.test(String(e.OTEL_EXPORTER_OTLP_HEADERS ?? "")),
    };
  } catch {
    return { telemetry: "off" as const };
  }
}

// ---- our own guardrails (read from the repo, once) ----
let guard: ReturnType<typeof readGuardrails> | null = null;
function readGuardrails(root: string) {
  const lock = JSON.parse(readFileSync(join(root, "switch/lockdown.json"), "utf8"));
  const dir = join(root, "switch/agents");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
  const safety = files.filter((f) => /^SAFETY \(before anything else/m.test(readFileSync(join(dir, f), "utf8"))).length;
  let injection: string | null = null;
  try {
    injection = readFileSync(join(root, "evals/reports/latest.md"), "utf8").match(/safety (\d+\/\d+)/)?.[1] ?? null;
  } catch {}
  return {
    lockdown: { tools: lock.advanced_config?.tools ?? [], autoMode: !!lock.auto_mode, autoApprove: !!lock.auto_approve },
    approvalRequired: true, // the Captain runs the Finance gate, then asks the founder once before anything ships
    safetyBlock: { agents: safety, of: files.length },
    injectionRefusals: injection, // evals: prompt-injection / secret-exfiltration asks refused
  };
}

/** Switch's reason as a sentence the panel can show (never Switch's raw answer). */
function why(e: unknown): string {
  if (!(e instanceof SwitchError)) return "Switch answered something unexpected";
  if (e.status === 403) return "the Switch admin account is not an owner/admin of this tenant";
  if (e.status === 401) return "Switch refused the admin login";
  if (e.status === 404) return "this Switch has no usage API (older than 0.31.0)";
  return e.message;
}

// ---- usage reads: closed intervals are cached (Switch sums whole hours, so a past window never changes) ----
const tenantId = async () => encodeURIComponent(String((await gw("GET", "/tenants/current"))?.id ?? ""));
const usageCache = new Map<string, UsageRow[]>();
async function usage(tid: string, since: Date, until: Date): Promise<UsageRow[]> {
  const key = `${tid}|${since.toISOString()}|${until.toISOString()}`;
  const hit = usageCache.get(key);
  if (hit) return hit;
  const q = new URLSearchParams({ since: since.toISOString(), until: until.toISOString() });
  const rows = await gw("GET", `/tenants/${tid}/usage?${q}`);
  const out = Array.isArray(rows) ? (rows as UsageRow[]) : [];
  // a turn's tokens are counted when it ends: only cache windows that closed over 2 h ago
  if (until.getTime() < Date.now() - 2 * HOUR) {
    if (usageCache.size >= 500) usageCache.delete(usageCache.keys().next().value!);
    usageCache.set(key, out);
  }
  return out;
}
/** Runs the reads at most 6 at a time (one local Switch; no need to hammer it). */
async function pool<T>(jobs: (() => Promise<T>)[], n = 6): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (i < jobs.length) {
      const j = i++;
      try {
        out[j] = await jobs[j]();
      } catch (e) {
        i = jobs.length; // one failed: stop the rest
        throw e;
      }
    }
  }));
  return out;
}
const utcDay = (t: number) => new Date(Math.floor(t / 86_400_000) * 86_400_000);
const monthStart = (d: Date, back = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));

// ---- monthly caps (advisory, like Switch Trust's; kv "roi:caps") ----
type Cap = { usd: number; setAt: string; budgetId?: string | null };
export const readCaps = (): Record<string, Cap> => {
  try {
    return JSON.parse(kvGet("roi:caps") ?? "{}");
  } catch {
    return {};
  }
};
const AGENT = /^d2c-[\w-]{1,40}$/;

export type RoiCtx = { root: string; agentDir: string; hours: number; events: OfficeEvent[]; docs: { by?: unknown; t?: unknown }[]; allowed: boolean; budgetsOn: boolean; now?: Date };
/** GET /api/roi. `allowed`: usage is tenant-wide (every workspace's agents), so only the host owner / admin sees it. */
export async function roi(c: RoiCtx) {
  const until = c.now ?? new Date();
  const since = new Date(until.getTime() - c.hours * HOUR);
  let g0 = guard; // switch/ and evals/ aren't in the Docker image: fall back instead of a 500 (and don't cache the fallback)
  if (!g0) {
    try { g0 = guard = readGuardrails(c.root); }
    catch { g0 = { lockdown: { tools: [], autoMode: false, autoApprove: false }, approvalRequired: true, safetyBlock: { agents: 0, of: 0 }, injectionRefusals: null }; }
  }
  const pricing = loadPricing(c.root);
  const base = {
    window: { since: since.toISOString(), until: until.toISOString(), hours: c.hours },
    pricing: { estimate: true, source: pricing.source, perMTok: pricing.prices, negotiated: pricing.negotiated },
    canEdit: c.allowed, budgetsEnabled: c.budgetsOn,
  };
  const trust = c.allowed
    ? await gw("GET", "/trust-settings").then(
        (t) => ({ switchTrust: t?.enabled ? "enabled" : "disabled", endpoint: String(t?.endpoint ?? ""), policySet: !!t?.policy_id, keySet: !!t?.has_api_key }),
        (e) => ({ switchTrust: "unavailable", reason: why(e) }),
      )
    : { switchTrust: "unavailable", reason: "only the host owner sees Switch settings" };
  const trustOut = { ...trust, ...g0, ...telemetry(c.agentDir) };
  const empty = { rows: [], totals: null, recommendations: [], improvements: [], spend: null, budgets: [], trust: trustOut };
  if (!c.allowed) return { source: "unavailable", reason: "Switch usage covers every workspace's agents: only the host owner sees it", ...base, ...empty };

  try {
    const tid = await tenantId();
    const prices = pricing.prices;
    // trend: one call per UTC day (at least 7, the window's days, at most 30); retry bursts: one per hour, last 24 h.
    const days = Math.min(30, Math.max(7, Math.ceil(c.hours / 24)));
    const today = utcDay(until.getTime()).getTime();
    const dayStarts = Array.from({ length: days }, (_, i) => today - (days - 1 - i) * 86_400_000);
    const hourStart = Math.floor(until.getTime() / HOUR) * HOUR - 23 * HOUR;
    const months = [2, 1].map((b) => [monthStart(until, b), monthStart(until, b - 1)] as const);
    const jobs: (() => Promise<UsageRow[]>)[] = [
      () => usage(tid, since, until),
      () => usage(tid, monthStart(until), until),
      ...months.map(([a, b]) => () => usage(tid, a, b)),
      ...dayStarts.map((d) => () => usage(tid, new Date(d), new Date(Math.min(d + 86_400_000, until.getTime())))),
      ...Array.from({ length: 24 }, (_, h) => () => usage(tid, new Date(hourStart + h * HOUR), new Date(hourStart + (h + 1) * HOUR))),
    ];
    // allSettled for budgets: a failed budgets call never fails the panel.
    const [all, b] = await Promise.all([pool(jobs), gw("GET", `/tenants/${tid}/budgets`).catch(() => [])]);
    const [win, mtd, m2, m1] = all;
    const dayRows = all.slice(4, 4 + days), hourRows = all.slice(4 + days);
    const g = groupUsage(win, c.events, c.docs, since.getTime(), prices);

    const turnsByHour = new Map<string, number[]>();
    hourRows.forEach((rows, h) => {
      for (const [agent, s] of perAgent(rows, prices).agents) (turnsByHour.get(agent) ?? turnsByHour.set(agent, new Array(24).fill(0)).get(agent)!)[h] = s.turns;
    });
    const last24 = new Map<string, number>();
    for (const rows of hourRows) for (const [agent, s] of perAgent(rows, prices).agents) last24.set(agent, (last24.get(agent) ?? 0) + s.costUsd);

    // spend views: month to date (with cap + forecast), the two months before, $/turn, $/work session (last 24 h)
    const caps = readCaps();
    const mtdA = perAgent(mtd, prices).agents, m2A = perAgent(m2, prices).agents, m1A = perAgent(m1, prices).agents;
    const names = [...new Set([...mtdA.keys(), ...m1A.keys(), ...m2A.keys(), ...g.rows.map((r) => r.agent), ...Object.keys(caps)])];
    const agents = names.map((agent) => {
      const s = mtdA.get(agent);
      const spent = s?.costUsd ?? 0, sessions = sessionsIn(turnsByHour.get(agent) ?? []);
      return {
        agent, mtdUsd: round(spent), mtdTurns: s?.turns ?? 0, costPerTurn: s?.turns ? round(spent / s.turns, 5) : null,
        months: [m2A.get(agent)?.costUsd ?? 0, m1A.get(agent)?.costUsd ?? 0, spent].map((v) => round(v)),
        sessions24h: sessions, costPerSession: sessions ? round((last24.get(agent) ?? 0) / sessions) : null,
        unpriced: s?.unpriced ?? [], cap: forecast(spent, until, caps[agent]?.usd ?? null), budgetId: caps[agent]?.budgetId ?? null,
      };
    }).sort((a, b) => b.mtdUsd - a.mtdUsd || a.agent.localeCompare(b.agent));
    const capped = agents.filter((a) => a.cap.capUsd);
    const mtdTotal = teamTotal(mtd, prices);
    const spend = {
      monthLabels: months.map(([a]) => a.toISOString().slice(0, 7)).concat(until.toISOString().slice(0, 7)),
      months: [teamTotal(m2, prices), teamTotal(m1, prices), mtdTotal],
      mtd: { ...mtdTotal, forecast: forecast(mtdTotal.costUsd, until, capped.length ? capped.reduce((s, a) => s + a.cap.capUsd!, 0) : null) },
      trend: dayRows.map((rows, i) => ({ day: new Date(dayStarts[i]).toISOString().slice(0, 10), ...teamTotal(rows, prices) })),
      capSummary: { ok: capped.filter((a) => a.cap.status === "ok").length, warn: capped.filter((a) => a.cap.status === "warn").length, over: capped.filter((a) => a.cap.status === "over").length, none: agents.length - capped.length },
      agents,
    };
    const imp = improvements(g.rows, c.events, since.getTime(), c.hours, prices, { turnsByHour, hours: 24, hourStart });
    return { source: "switch", ...base, ...g, improvements: imp, spend, budgets: Array.isArray(b) ? b : [], trust: trustOut };
  } catch (e) {
    console.warn("[roi] Switch usage unavailable:", e instanceof SwitchError ? `${e.status} ${e.message}` : String(e));
    return { source: "unavailable", reason: why(e), ...base, ...empty };
  }
}

// ---- Rooms budgets (switch-core, enforced at delivery; only with ROI_BUDGETS=on) ----
const METRICS = ["messages", "turns", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens"];
const limits = (body: any) => {
  const limit = Number(body?.amount_limit), period = Number(body?.period_hours);
  if (!Number.isInteger(limit) || limit < 1 || limit > Number.MAX_SAFE_INTEGER) throw new SwitchError(400, "amount_limit: a whole number >= 1");
  if (!Number.isInteger(period) || period < 1 || period > 24 * 366) throw new SwitchError(400, "period_hours: 1–8784");
  return { amount_limit: limit, period_hours: period };
};
const budgetId = (id: string) => {
  if (!/^[\w-]{1,64}$/.test(id)) throw new SwitchError(400, "budget id");
  return encodeURIComponent(id);
};
async function agentId(agent: string) {
  const found = (await switchAgents()).find((a) => a.name === agent);
  if (!found) throw new SwitchError(404, `no Switch agent named ${agent}`);
  return found.id;
}
/** POST /api/roi/budgets: a per-agent cap. A reached cap stops the agent until the period turns over (switch-core
 *  budgets.py). Body: { agent, metric, amount_limit, period_hours, model? } (model only on token metrics). */
export async function createBudget(body: any, root: string) {
  const agent = typeof body?.agent === "string" ? body.agent : "";
  const metric = String(body?.metric ?? "");
  if (!AGENT.test(agent)) throw new SwitchError(400, "agent: a d2c-* agent name");
  if (!METRICS.includes(metric)) throw new SwitchError(400, `metric: one of ${METRICS.join(", ")}`);
  const lim = limits(body);
  const model = body?.model == null || body.model === "" ? "" : String(body.model);
  if (model && !loadPricing(root).prices[model]) throw new SwitchError(400, "model: a known model id, or omit it");
  if (model && (metric === "turns" || metric === "messages")) throw new SwitchError(400, "model: only on token metrics");
  const id = await agentId(agent);
  return gw("POST", `/tenants/${await tenantId()}/budgets`, { agent_id: id, metric, model, ...lim }).catch((e) => {
    throw e instanceof SwitchError && e.status === 409 ? new SwitchError(409, "a budget for this agent, metric and model already exists: edit that one") : e;
  });
}
/** PUT /api/roi/budgets/{id}: new limit and period (what a budget covers is fixed in Switch). */
export const updateBudget = async (id: string, body: any) => gw("PUT", `/tenants/${await tenantId()}/budgets/${budgetId(id)}`, limits(body));
/** DELETE /api/roi/budgets/{id}. */
export const deleteBudget = async (id: string) => (await gw("DELETE", `/tenants/${await tenantId()}/budgets/${budgetId(id)}`), { ok: true });

// ---- caps: POST / DELETE /api/roi/caps (host owner) ----
/** Sets an advisory monthly cap in USD. `enforce: true` (needs ROI_BUDGETS=on) also mirrors it to a Rooms `turns` budget
 *  over 720 h: limit = cap / the agent's month-to-date $/turn, so the cap becomes something Switch can count. */
export async function setCap(body: any, budgetsOn: boolean, root: string) {
  const agent = typeof body?.agent === "string" ? body.agent : "";
  const usd = Number(body?.usd);
  if (!AGENT.test(agent)) throw new SwitchError(400, "agent: a d2c-* agent name");
  if (!Number.isFinite(usd) || usd <= 0 || usd > 100_000) throw new SwitchError(400, "usd: a monthly cap above 0 (USD)");
  const caps = readCaps();
  const cap: Cap = { usd: round(usd, 2), setAt: new Date().toISOString(), budgetId: caps[agent]?.budgetId ?? null };
  let mirrored: { budgetId: string; turns: number } | null = null;
  if (body?.enforce === true) {
    if (!budgetsOn) throw new SwitchError(400, "enforce: needs ROI_BUDGETS=on on the office server");
    const tid = await tenantId();
    const now = new Date();
    const s = perAgent(await usage(tid, monthStart(now), now), loadPricing(root).prices).agents.get(agent);
    if (!s?.turns || !s.costUsd) throw new SwitchError(400, "enforce: no priced turns this month to convert the cap into turns yet");
    const turns = Math.max(1, Math.floor(usd / (s.costUsd / s.turns)));
    const id = await agentId(agent);
    const list: any[] = await gw("GET", `/tenants/${tid}/budgets`).catch(() => []);
    const existing = (Array.isArray(list) ? list : []).find((x) => x.agent_id === id && x.metric === "turns" && !x.model);
    const res = existing
      ? await gw("PUT", `/tenants/${tid}/budgets/${budgetId(String(existing.id))}`, { amount_limit: turns, period_hours: 720 })
      : await gw("POST", `/tenants/${tid}/budgets`, { agent_id: id, metric: "turns", model: "", amount_limit: turns, period_hours: 720 });
    cap.budgetId = String(res?.id ?? existing?.id ?? "") || null;
    mirrored = cap.budgetId ? { budgetId: cap.budgetId, turns } : null;
  }
  caps[agent] = cap;
  kvSet("roi:caps", JSON.stringify(caps));
  return { agent, cap, mirrored };
}
/** Removes a cap; with ROI_BUDGETS=on its mirrored Rooms budget goes too. */
export async function clearCap(body: any, budgetsOn: boolean) {
  const agent = typeof body?.agent === "string" ? body.agent : "";
  if (!AGENT.test(agent)) throw new SwitchError(400, "agent: a d2c-* agent name");
  const caps = readCaps();
  const cap = caps[agent];
  if (!cap) throw new SwitchError(404, `no cap for ${agent}`);
  let budgetLeft: string | null = null;
  if (cap.budgetId) {
    if (budgetsOn) await deleteBudget(cap.budgetId).catch((e) => { if (!(e instanceof SwitchError && e.status === 404)) throw e; });
    else budgetLeft = cap.budgetId; // can't touch budgets with the flag off: say so instead
  }
  delete caps[agent];
  kvSet("roi:caps", JSON.stringify(caps));
  return { agent, cleared: true, budgetLeft };
}
