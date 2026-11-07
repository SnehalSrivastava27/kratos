// SW5: Switch ROI (what every agent costs and delivers) and Switch Trust (guardrails), for GET /api/roi.
// Cost comes from Switch's own usage counters (GET /gateway/tenants/{id}/usage, owner/admin only, hourly buckets;
// switch-core 0.31.0 gateway/tenants.py:647), joined with what each agent posted in this workspace (our event store).
// Everything fails soft: if Switch can't answer, the payload says source "unavailable" and why, never a 500.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gw, switchAgents, SwitchError, OFFICE_AGENT } from "./switch.js";
import type { OfficeEvent } from "./store.js";

/** Anthropic list prices, USD per million tokens (claude-api skill, cached 2026-10-06). Cache writes at the 5-minute
 *  rate (1.25x input); Haiku 5.5 at its <=100K-prompt card. An estimate: Switch counts tokens, not dollars. */
export const PRICES: Record<string, { input: number; output: number; cache_read: number; cache_write: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cache_read: 0.2, cache_write: 5 },
};
const TOKEN_METRICS = { input_tokens: "input", output_tokens: "output", cache_read_tokens: "cache_read", cache_write_tokens: "cache_write" } as const;
/** Not team agents: our own passive console and observer (they post, never take turns). */
const NOT_TEAM = new Set([OFFICE_AGENT, "d2c-observer"]);

export type UsageRow = { metric: string; client_id: string | null; client_name: string | null; client_type: string | null; model: string | null; amount: number };
type Tokens = { input: number; output: number; cache_read: number; cache_write: number };
export type RoiRow = {
  agent: string; models: string[]; turns: number; switchMessages: number; tokens: Tokens;
  costUsd: number; unpriced: boolean; posted: number; docs: number; deliverables: number; costPerDeliverable: number | null; turnShare: number;
};

const zero = (): Tokens => ({ input: 0, output: 0, cache_read: 0, cache_write: 0 });
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/** Groups Switch usage by team agent (d2c-*) and joins what each one posted/pinned in the window. */
export function groupUsage(usage: UsageRow[], events: OfficeEvent[], docs: { by?: unknown; t?: unknown }[], since: number) {
  const rows = new Map<string, RoiRow>();
  const other = { turns: 0, costUsd: 0 };
  const byModel: Record<string, number> = {}; // team cost per model
  const row = (agent: string) => {
    let r = rows.get(agent);
    if (!r) rows.set(agent, (r = { agent, models: [], turns: 0, switchMessages: 0, tokens: zero(), costUsd: 0, unpriced: false, posted: 0, docs: 0, deliverables: 0, costPerDeliverable: null, turnShare: 0 }));
    return r;
  };
  const team = (u: UsageRow) => u.client_type === "agent" && !!u.client_name?.startsWith("d2c-") && !NOT_TEAM.has(u.client_name);
  for (const u of usage) {
    const amount = Number(u.amount) || 0;
    const kind = TOKEN_METRICS[u.metric as keyof typeof TOKEN_METRICS];
    const price = u.model ? PRICES[u.model] : undefined;
    const cost = kind && price ? (amount * price[kind]) / 1e6 : 0;
    if (!team(u)) {
      if (u.metric === "turns") other.turns += amount;
      other.costUsd += cost;
      continue;
    }
    const r = row(u.client_name!);
    if (u.metric === "turns") r.turns += amount;
    else if (u.metric === "messages") r.switchMessages += amount;
    else if (kind) {
      r.tokens[kind] += amount;
      r.costUsd += cost;
      if (u.model && cost) byModel[u.model] = (byModel[u.model] ?? 0) + cost;
      if (!price && amount) r.unpriced = true;
      if (u.model && amount && !r.models.includes(u.model)) r.models.push(u.model);
    }
  }
  for (const e of events) {
    if (e.t < since || !e.speaker.startsWith("d2c-") || NOT_TEAM.has(e.speaker) || e.type === "hired" || e.type === "working") continue;
    row(e.speaker).posted++;
  }
  for (const d of docs) if (typeof d.by === "string" && rows.has(d.by) && Number(d.t) >= since) row(d.by).docs++;

  const all = [...rows.values()];
  const turns = all.reduce((s, r) => s + r.turns, 0);
  for (const r of all) {
    r.deliverables = r.posted + r.docs;
    r.costUsd = round(r.costUsd);
    r.costPerDeliverable = r.deliverables ? round(r.costUsd / r.deliverables) : null;
    r.turnShare = turns ? round(r.turns / turns, 3) : 0;
  }
  all.sort((a, b) => b.costUsd - a.costUsd || b.turns - a.turns || a.agent.localeCompare(b.agent));
  const totals = {
    turns, costUsd: round(all.reduce((s, r) => s + r.costUsd, 0)), deliverables: all.reduce((s, r) => s + r.deliverables, 0),
    tokens: all.reduce((t, r) => ({ input: t.input + r.tokens.input, output: t.output + r.tokens.output, cache_read: t.cache_read + r.tokens.cache_read, cache_write: t.cache_write + r.tokens.cache_write }), zero()),
    byModel: Object.fromEntries(Object.entries(byModel).map(([m, v]) => [m, round(v)])),
    other: { turns: other.turns, costUsd: round(other.costUsd) },
  };
  return { rows: all, totals, recommendations: recommend(all, byModel) };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
/** One or two plain, data-backed suggestions. ponytail: three fixed rules; add more when someone acts on these. */
export function recommend(rows: RoiRow[], byModel: Record<string, number>): string[] {
  const out: string[] = [];
  const top = [...rows].sort((a, b) => b.turns - a.turns)[0];
  if (top && top.turnShare >= 0.3 && rows.length > 1) {
    const t = top.tokens, tin = t.input + t.cache_read + t.cache_write;
    const reread = tin ? t.cache_read / tin : 0;
    out.push(`${top.agent} uses ${pct(top.turnShare)} of all turns (${top.turns})` +
      (reread >= 0.8 ? `; ${pct(reread)} of what it reads is the cached chat it re-reads every turn. Fewer wake-ups (one ask per plan, no "confirmed" replies) cut it most.` : ". Check it isn't woken for messages that need no reply."));
  }
  const total = Object.values(byModel).reduce((a, b) => a + b, 0);
  const big = Object.entries(byModel).filter(([m]) => m !== "claude-haiku-5-5").sort((a, b) => b[1] - a[1])[0];
  if (big && total && big[1] / total >= 0.25) {
    const who = rows.filter((r) => r.models.includes(big[0])).map((r) => r.agent);
    out.push(`${pct(big[1] / total)} of the estimated cost is ${big[0]} (${who.slice(0, 3).join(", ")}${who.length > 3 ? ` +${who.length - 3}` : ""}), ` +
      `about ${Math.round((PRICES[big[0]]?.input ?? 1) / PRICES["claude-haiku-5-5"].input)}x Haiku per token: keep every team agent on claude-haiku-5-5 in Console.`);
  }
  const idle = rows.find((r) => r.turns >= 3 && r.deliverables === 0);
  if (out.length < 2 && idle) out.push(`${idle.agent} took ${idle.turns} turns and posted nothing here: check its addressing or retire it.`);
  return out.slice(0, 2);
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

export type RoiCtx = { root: string; hours: number; events: OfficeEvent[]; docs: { by?: unknown; t?: unknown }[]; allowed: boolean };
/** GET /api/roi. `allowed`: usage is tenant-wide (every workspace's agents), so only the host owner / admin sees it. */
export async function roi(c: RoiCtx) {
  const until = new Date();
  const since = new Date(until.getTime() - c.hours * 3_600_000);
  guard ??= readGuardrails(c.root);
  const base = { window: { since: since.toISOString(), until: until.toISOString(), hours: c.hours }, pricing: { estimate: true, perMTok: PRICES } };

  const trust = c.allowed
    ? await gw("GET", "/trust-settings").then(
        (t) => ({ switchTrust: t?.enabled ? "enabled" : "disabled", endpoint: String(t?.endpoint ?? ""), policySet: !!t?.policy_id, keySet: !!t?.has_api_key }),
        (e) => ({ switchTrust: "unavailable", reason: why(e) }),
      )
    : { switchTrust: "unavailable", reason: "only the host owner sees Switch settings" };
  const trustOut = { ...trust, ...guard };
  if (!c.allowed) return { source: "unavailable", reason: "Switch usage covers every workspace's agents: only the host owner sees it", ...base, rows: [], totals: null, recommendations: [], budgets: [], trust: trustOut };

  try {
    const tenant = await gw("GET", "/tenants/current");
    const id = encodeURIComponent(String(tenant?.id ?? ""));
    const q = new URLSearchParams({ since: since.toISOString(), until: until.toISOString() });
    const [usage, budgets] = await Promise.all([gw("GET", `/tenants/${id}/usage?${q}`), gw("GET", `/tenants/${id}/budgets`).catch(() => [])]);
    const g = groupUsage(Array.isArray(usage) ? usage : [], c.events, c.docs, since.getTime());
    return { source: "switch", ...base, ...g, budgets: Array.isArray(budgets) ? budgets : [], trust: trustOut };
  } catch (e) {
    return { source: "unavailable", reason: why(e), ...base, rows: [], totals: null, recommendations: [], budgets: [], trust: trustOut };
  }
}

const METRICS = ["messages", "turns", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens"];
/** POST /api/roi/budgets (only with ROI_BUDGETS=on): a per-agent cap. A reached cap stops the agent until the period
 *  turns over (switch-core budgets.py), so this is off by default. Body: { agent, metric, amount_limit, period_hours, model? }. */
export async function createBudget(body: any) {
  const agent = typeof body?.agent === "string" ? body.agent : "";
  const metric = String(body?.metric ?? "");
  const limit = Number(body?.amount_limit), period = Number(body?.period_hours);
  if (!/^d2c-[\w-]{1,40}$/.test(agent)) throw new SwitchError(400, "agent: a d2c-* agent name");
  if (!METRICS.includes(metric)) throw new SwitchError(400, `metric: one of ${METRICS.join(", ")}`);
  if (!Number.isInteger(limit) || limit < 1) throw new SwitchError(400, "amount_limit: a whole number >= 1");
  if (!Number.isInteger(period) || period < 1 || period > 24 * 366) throw new SwitchError(400, "period_hours: 1–8784");
  const model = body?.model == null ? null : String(body.model);
  if (model !== null && !PRICES[model]) throw new SwitchError(400, "model: a known model id, or omit it");
  const found = (await switchAgents()).find((a) => a.name === agent);
  if (!found) throw new SwitchError(404, `no Switch agent named ${agent}`);
  const tenant = await gw("GET", "/tenants/current");
  return gw("POST", `/tenants/${encodeURIComponent(String(tenant?.id ?? ""))}/budgets`, { agent_id: found.id, metric, model, amount_limit: limit, period_hours: period });
}
