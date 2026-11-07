// Switch ROI, the pure part: price Switch's usage counters, group them per agent, forecast against monthly caps, and
// the five Improvements analyses (context_cache_waste, verbosity, model_optimizer, tool_bloat, retry_loop_waste).
// No I/O here: roi.ts fetches, this file counts. Every dollar is an estimate (Switch counts tokens, not money).
import type { OfficeEvent } from "./store.js";

export type Price = { input: number; output: number; cache_read: number; cache_write: number };
export type Prices = Record<string, Price>;
/** Anthropic list prices, USD per million tokens (claude-api skill, cached 2026-10-06). Cache writes at the 5-minute
 *  rate (1.25x input). Haiku 5.5 at its <=100K-token-prompt card; prompts over 100K bill 5x ($0.50 / $2.50 / $0.05 /
 *  $0.625), which Switch's counters can't see, so a long-chat estimate is a floor. switch/pricing.json overrides these. */
export const DEFAULT_PRICES: Prices = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cache_read: 0.2, cache_write: 5 },
};
export const CHEAP_MODEL = "claude-haiku-5-5";
const KINDS = ["input", "output", "cache_read", "cache_write"] as const;

/** Merges switch/pricing.json `{ models: { id: { input, output, cache_read, cache_write } } }` over the defaults, like
 *  the docs' Model pricing page: a changed price is "negotiated", a new model is priced, a bad entry is skipped. */
export function mergePrices(file: unknown): { prices: Prices; negotiated: string[]; errors: string[] } {
  const prices: Prices = { ...DEFAULT_PRICES }, negotiated: string[] = [], errors: string[] = [];
  const models = (file as { models?: unknown } | null)?.models;
  if (!models || typeof models !== "object") return { prices, negotiated, errors };
  for (const [id, p] of Object.entries(models as Record<string, any>)) {
    if (!/^[\w.:@-]{1,80}$/.test(id) || !KINDS.every((k) => Number.isFinite(p?.[k]) && p[k] >= 0)) {
      errors.push(id);
      continue;
    }
    const v = Object.fromEntries(KINDS.map((k) => [k, Math.round(p[k] * 1e4) / 1e4])) as Price;
    const d = DEFAULT_PRICES[id];
    if (!d || KINDS.some((k) => d[k] !== v[k])) negotiated.push(id);
    prices[id] = v;
  }
  return { prices, negotiated, errors };
}

export type UsageRow = { metric: string; client_id: string | null; client_name: string | null; client_type: string | null; model: string | null; amount: number };
export type Tokens = { input: number; output: number; cache_read: number; cache_write: number };
const TOKEN_METRICS: Record<string, keyof Tokens> = { input_tokens: "input", output_tokens: "output", cache_read_tokens: "cache_read", cache_write_tokens: "cache_write" };
const zero = (): Tokens => ({ input: 0, output: 0, cache_read: 0, cache_write: 0 });
export const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const costOf = (t: Tokens, p: Price) => KINDS.reduce((s, k) => s + t[k] * p[k], 0) / 1e6;

/** Not team agents: our own passive console and observer (they post, never take turns). */
const NOT_TEAM = new Set(["d2c-office", "d2c-observer"]);
export const isTeam = (name: unknown): name is string => typeof name === "string" && name.startsWith("d2c-") && !NOT_TEAM.has(name);

export type Spend = { turns: number; messages: number; costUsd: number; tokens: Tokens; byModel: Record<string, Tokens>; unpriced: string[] };
/** Usage rows → per team agent spend, plus everything else ("other"). Unknown models count tokens, add no dollars,
 *  and are listed in `unpriced` (never silently $0). */
export function perAgent(usage: UsageRow[], prices: Prices) {
  const agents = new Map<string, Spend>();
  const other = { turns: 0, costUsd: 0 };
  for (const u of usage) {
    const amount = Number(u.amount) || 0;
    const kind = TOKEN_METRICS[u.metric];
    const price = u.model ? prices[u.model] : undefined;
    const cost = kind && price ? (amount * price[kind]) / 1e6 : 0;
    if (u.client_type !== "agent" || !isTeam(u.client_name)) {
      if (u.metric === "turns") other.turns += amount;
      other.costUsd += cost;
      continue;
    }
    let a = agents.get(u.client_name);
    if (!a) agents.set(u.client_name, (a = { turns: 0, messages: 0, costUsd: 0, tokens: zero(), byModel: {}, unpriced: [] }));
    if (u.metric === "turns") a.turns += amount;
    else if (u.metric === "messages") a.messages += amount;
    else if (kind) {
      a.tokens[kind] += amount;
      a.costUsd += cost;
      if (u.model) (a.byModel[u.model] ??= zero())[kind] += amount;
      if (u.model && !price && amount && !a.unpriced.includes(u.model)) a.unpriced.push(u.model);
    }
  }
  return { agents, other };
}
export const teamTotal = (usage: UsageRow[], prices: Prices) => {
  const { agents } = perAgent(usage, prices);
  let costUsd = 0, turns = 0;
  for (const a of agents.values()) (costUsd += a.costUsd), (turns += a.turns);
  return { costUsd: round(costUsd), turns };
};

// ---- the value side: what each agent delivered in this workspace (our event store) ----
const ACK = /^\s*(ok(ay)?|noted|confirmed|got it|on it|ack(nowledged)?|thanks?( you)?|done|will do|roger|👍|✅)\b[\s.!,:-]*\S{0,40}$/i;
/** A post that carries no new information: a bare acknowledgement. */
export const isAck = (text: unknown) => typeof text === "string" && (ACK.test(text) || text.trim().length < 12);
const posts = (events: OfficeEvent[], since: number) =>
  events.filter((e) => e.t >= since && isTeam(e.speaker) && e.type !== "hired" && e.type !== "working" && e.type !== "command");
/** Files an agent produced: gallery links it posted (meta.artifact_url or a /gallery/… path in the text), distinct. */
function filesBy(events: OfficeEvent[], since: number) {
  const out = new Map<string, Set<string>>();
  for (const e of posts(events, since)) {
    const meta = e.meta as { artifact_url?: unknown } | undefined;
    const found = [typeof meta?.artifact_url === "string" ? meta.artifact_url : "", ...[...String(e.text ?? "").matchAll(/\/gallery\/[\w./-]+\.\w+/g)].map((m) => m[0])].filter(Boolean);
    for (const f of found) (out.get(e.speaker) ?? out.set(e.speaker, new Set()).get(e.speaker)!).add(f);
  }
  return out;
}

export type RoiRow = {
  agent: string; models: string[]; turns: number; switchMessages: number; tokens: Tokens; costUsd: number; unpriced: boolean; unpricedModels: string[];
  posted: number; acks: number; docs: number; files: number; deliverables: number; costPerDeliverable: number | null; deliverablesPerUsd: number | null;
  costPerTurn: number | null; turnShare: number; byModel: Record<string, Tokens>;
};
/** Window usage per team agent, joined with what each one posted / pinned / produced here. Deliverables = posts +
 *  pinned room documents + gallery files; ROI = deliverables per dollar. */
export function groupUsage(usage: UsageRow[], events: OfficeEvent[], docs: { by?: unknown; t?: unknown }[], since: number, prices: Prices) {
  const { agents, other } = perAgent(usage, prices);
  const rows = new Map<string, RoiRow>();
  const row = (agent: string) => {
    let r = rows.get(agent);
    if (!r) {
      const a = agents.get(agent) ?? { turns: 0, messages: 0, costUsd: 0, tokens: zero(), byModel: {}, unpriced: [] };
      rows.set(agent, (r = {
        agent, models: Object.keys(a.byModel), turns: a.turns, switchMessages: a.messages, tokens: a.tokens, costUsd: round(a.costUsd), unpriced: a.unpriced.length > 0, unpricedModels: a.unpriced,
        posted: 0, acks: 0, docs: 0, files: 0, deliverables: 0, costPerDeliverable: null, deliverablesPerUsd: null, costPerTurn: null, turnShare: 0, byModel: a.byModel,
      }));
    }
    return r;
  };
  for (const name of agents.keys()) row(name);
  for (const e of posts(events, since)) {
    const r = row(e.speaker);
    r.posted++;
    if (isAck(e.text)) r.acks++;
  }
  for (const d of docs) if (isTeam(d.by) && Number(d.t) >= since) row(d.by).docs++;
  for (const [agent, set] of filesBy(events, since)) row(agent).files = set.size;

  const all = [...rows.values()];
  const turns = all.reduce((s, r) => s + r.turns, 0);
  const byModel: Record<string, number> = {};
  for (const r of all) {
    r.deliverables = r.posted + r.docs + r.files;
    r.costPerDeliverable = r.deliverables && r.costUsd ? round(r.costUsd / r.deliverables) : r.deliverables ? 0 : null;
    r.deliverablesPerUsd = r.costUsd > 0 ? round(r.deliverables / r.costUsd, 1) : null;
    r.costPerTurn = r.turns ? round(r.costUsd / r.turns, 5) : null;
    r.turnShare = turns ? round(r.turns / turns, 3) : 0;
    for (const [m, t] of Object.entries(r.byModel)) if (prices[m]) byModel[m] = (byModel[m] ?? 0) + costOf(t, prices[m]);
  }
  all.sort((a, b) => b.costUsd - a.costUsd || b.turns - a.turns || a.agent.localeCompare(b.agent));
  const costUsd = round(all.reduce((s, r) => s + r.costUsd, 0));
  const deliverables = all.reduce((s, r) => s + r.deliverables, 0);
  const totals = {
    turns, costUsd, deliverables, deliverablesPerUsd: costUsd > 0 ? round(deliverables / costUsd, 1) : null, costPerTurn: turns ? round(costUsd / turns, 5) : null,
    tokens: all.reduce((t, r) => ({ input: t.input + r.tokens.input, output: t.output + r.tokens.output, cache_read: t.cache_read + r.tokens.cache_read, cache_write: t.cache_write + r.tokens.cache_write }), zero()),
    byModel: Object.fromEntries(Object.entries(byModel).map(([m, v]) => [m, round(v)])),
    unpriced: [...new Set(all.flatMap((r) => r.unpricedModels))],
    other: { turns: other.turns, costUsd: round(other.costUsd) },
  };
  return { rows: all, totals, recommendations: recommend(all, byModel, prices) };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
/** The panel's two headline sentences (the Improvements tab has the numbers). */
export function recommend(rows: RoiRow[], byModel: Record<string, number>, prices: Prices): string[] {
  const out: string[] = [];
  const top = [...rows].sort((a, b) => b.turns - a.turns)[0];
  if (top && top.turnShare >= 0.3 && rows.length > 1) {
    const t = top.tokens, tin = t.input + t.cache_read + t.cache_write;
    const reread = tin ? t.cache_read / tin : 0;
    out.push(`${top.agent} uses ${pct(top.turnShare)} of all turns (${top.turns})` +
      (reread >= 0.8 ? `; ${pct(reread)} of what it reads is the cached chat it re-reads every turn. Fewer wake-ups (one ask per plan, no "confirmed" replies) cut it most.` : ". Check it isn't woken for messages that need no reply."));
  }
  const total = Object.values(byModel).reduce((a, b) => a + b, 0);
  const big = Object.entries(byModel).filter(([m]) => m !== CHEAP_MODEL).sort((a, b) => b[1] - a[1])[0];
  if (big && total && big[1] / total >= 0.25) {
    const who = rows.filter((r) => r.models.includes(big[0])).map((r) => r.agent);
    out.push(`${pct(big[1] / total)} of the estimated cost is ${big[0]} (${who.slice(0, 3).join(", ")}${who.length > 3 ? ` +${who.length - 3}` : ""}), ` +
      `about ${Math.round((prices[big[0]]?.input ?? 1) / prices[CHEAP_MODEL].input)}x Haiku per token: keep every team agent on ${CHEAP_MODEL} in Console.`);
  }
  const idle = rows.find((r) => r.turns >= 3 && r.deliverables === 0);
  if (out.length < 2 && idle) out.push(`${idle.agent} took ${idle.turns} turns and posted nothing here: check its addressing or retire it.`);
  return out.slice(0, 2);
}

// ---- monthly caps + forecast (docs: switch-trust/cost/spending-and-caps#read-the-burn-rate) ----
export type CapStatus = "ok" | "warn" | "over" | "none";
/** Burn rate = month-to-date spend / days the month has run, including today (UTC). Status: under 80% of the cap
 *  ok ("Below cap"), 80% or more warn ("Near cap"), 100% or more over. Days to cap = what's left / burn rate. */
export function forecast(spentUsd: number, now: Date, capUsd: number | null) {
  const day = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const burnPerDay = spentUsd / day;
  const projectedUsd = burnPerDay * daysInMonth;
  const base = { spentUsd: round(spentUsd), burnPerDay: round(burnPerDay), projectedUsd: round(projectedUsd), daysInMonth, day };
  if (!capUsd) return { ...base, capUsd: null, used: null, daysToCap: null, projectedOver: false, status: "none" as CapStatus };
  const used = spentUsd / capUsd;
  return {
    ...base, capUsd, used: round(used, 3),
    daysToCap: used >= 1 ? 0 : burnPerDay > 0 ? round((capUsd - spentUsd) / burnPerDay, 1) : null,
    projectedOver: projectedUsd >= capUsd,
    status: (used >= 1 ? "over" : used >= 0.8 ? "warn" : "ok") as CapStatus,
  };
}

// ---- Improvements: the five Switch ROI analyses, computed locally ----
export type Improvement = {
  kind: "context_cache_waste" | "verbosity" | "model_optimizer" | "tool_bloat" | "retry_loop_waste";
  agent: string; finding: string; savingUsd30d: number | null; confidence: "High" | "Medium" | "Low"; action: string; data: Record<string, number | string | boolean>;
};
const confidence = (turns: number) => (turns >= 50 ? "High" : turns >= 10 ? "Medium" : "Low");
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));
const usd = (n: number) => `$${n >= 1 ? n.toFixed(2) : n.toFixed(4)}`;
/** Blended price of an agent's tokens (its main model's card; Haiku when unknown). */
const priceFor = (r: RoiRow, prices: Prices) => {
  const m = Object.entries(r.byModel).sort((a, b) => b[1].output + b[1].input - (a[1].output + a[1].input))[0]?.[0];
  return (m && prices[m]) || prices[CHEAP_MODEL] || DEFAULT_PRICES[CHEAP_MODEL];
};

export type HourCtx = { turnsByHour: Map<string, number[]>; hours: number; hourStart: number };
/** The five analyses. `rows` are the window's; savings are scaled to 30 days (the docs' "estimated 30-day savings").
 *  `hourly` (turns per agent per UTC hour, last 24 h) drives retry_loop_waste. Each finding names the agent, the
 *  numbers behind it, the estimated saving and one action. */
export function improvements(rows: RoiRow[], events: OfficeEvent[], since: number, windowHours: number, prices: Prices, hourly: HourCtx | null): Improvement[] {
  const out: Improvement[] = [];
  const scale = 720 / windowHours;
  const team = rows.filter((r) => r.turns > 0);
  const outPerTurn = team.map((r) => r.tokens.output / r.turns);
  const med = median(outPerTurn);
  const longPosts = new Map<string, number>();
  for (const e of posts(events, since)) if (String(e.text ?? "").length > 900) longPosts.set(e.speaker, (longPosts.get(e.speaker) ?? 0) + 1);

  for (const r of team) {
    const p = priceFor(r, prices), t = r.tokens, conf = confidence(r.turns);
    const read = t.input + t.cache_read + t.cache_write;
    // context_cache_waste: context paid at full input / write price instead of the cache-read price, and re-reads.
    const hit = read ? t.cache_read / read : 1;
    const perTurnRead = t.cache_read / r.turns;
    if (read && hit < 0.7) {
      const save = (0.5 * (t.input * (p.input - p.cache_read) + t.cache_write * (p.cache_write - p.cache_read))) / 1e6;
      out.push({ kind: "context_cache_waste", agent: r.agent, confidence: conf, savingUsd30d: round(save * scale),
        finding: `Only ${pct(hit)} of the ${k(read)} tokens it read came from the prompt cache; ${k(t.input + t.cache_write)} were paid at the full or cache-write price.`,
        action: "Keep the start of its prompt stable (no timestamps or changing lists in the instructions) so later turns read it from cache.",
        data: { cacheHitRate: round(hit, 3), inputTokens: t.input, cacheWriteTokens: t.cache_write, cacheReadTokens: t.cache_read } });
    } else if (perTurnRead > 50_000 && (t.cache_read * p.cache_read) / 1e6 >= 0.4 * r.costUsd && r.turns >= 3) {
      const save = (0.3 * t.cache_read * p.cache_read) / 1e6;
      out.push({ kind: "context_cache_waste", agent: r.agent, confidence: conf, savingUsd30d: round(save * scale),
        finding: `Re-reads ${k(perTurnRead)} cached tokens every turn (${pct(hit)} cache hit rate): the whole chat history, on each of ${r.turns} wake-ups.`,
        action: "Wake it less often and keep threads short (one ask per plan, a fresh topic per campaign); a 30% shorter history saves the figure shown.",
        data: { cacheHitRate: round(hit, 3), cacheReadPerTurn: Math.round(perTurnRead), turns: r.turns } });
    }
    // verbosity: output tokens per turn against the team median, and long posts in the room.
    const opt = t.output / r.turns, longs = longPosts.get(r.agent) ?? 0;
    if (team.length > 1 && r.turns >= 3 && ((med > 0 && opt > 2 * med) || longs >= 3)) {
      const save = med > 0 && opt > med ? ((opt - med) * r.turns * p.output) / 1e6 : 0;
      out.push({ kind: "verbosity", agent: r.agent, confidence: conf, savingUsd30d: round(save * scale),
        finding: `Writes ${k(opt)} output tokens a turn against a team median of ${k(med)}${longs ? `, and posted ${longs} messages over 900 characters` : ""}. Candidate for verbosity optimization: Yes.`,
        action: "Ask for the answer first and short lines (the Telegram style rules); move long tables into a pinned room document.",
        data: { outputPerTurn: Math.round(opt), teamMedian: Math.round(med), longPosts: longs, candidate: true } });
    }
    // model_optimizer: everything not on Haiku, re-priced at Haiku.
    const cheap = prices[CHEAP_MODEL];
    let pricey = 0, atCheap = 0;
    for (const [m, mt] of Object.entries(r.byModel)) if (m !== CHEAP_MODEL && prices[m] && cheap) (pricey += costOf(mt, prices[m])), (atCheap += costOf(mt, cheap));
    if (pricey > 0 && pricey - atCheap > 0) {
      const models = Object.keys(r.byModel).filter((m) => m !== CHEAP_MODEL).join(", ");
      out.push({ kind: "model_optimizer", agent: r.agent, confidence: conf, savingUsd30d: round((pricey - atCheap) * scale),
        finding: `${usd(pricey)} of its ${usd(r.costUsd)} went to ${models}; the same tokens on ${CHEAP_MODEL} cost ${usd(atCheap)}.`,
        action: `Set its model to ${CHEAP_MODEL} in Console (Advanced configuration) or rerun scripts/switch-sync-agents.sh, then check its evals.`,
        data: { nonCheapUsd: round(pricey), atCheapUsd: round(atCheap) } });
    }
    // tool_bloat (local signal): wake-ups that produced nothing new. Switch's counters carry no tool definitions, so
    // we measure the Rooms equivalent of an unused tool: turns that end in no post or only an acknowledgement.
    const useful = r.posted - r.acks + r.docs + r.files;
    const idle = Math.max(0, r.turns - useful);
    if (r.turns >= 5 && idle / r.turns >= 0.4) {
      out.push({ kind: "tool_bloat", agent: r.agent, confidence: conf, savingUsd30d: round(idle * (r.costUsd / r.turns) * scale),
        finding: `${idle} of ${r.turns} wake-ups (${pct(idle / r.turns)}) produced no post or only an acknowledgement (${r.acks} "ok / confirmed" replies).`,
        action: `Don't address ${r.agent} with FYIs; tell reporters to skip "confirmed" replies, and scope its addressing so it is woken only when it must answer.`,
        data: { turns: r.turns, idleTurns: idle, acks: r.acks, useful } });
    }
  }
  // retry_loop_waste: bursts (6+ turns in one hour, at most one post) and duplicate posts within 15 minutes.
  const dupes = new Map<string, number>();
  const lastText = new Map<string, { text: string; t: number }[]>();
  for (const e of posts(events, since)) {
    const text = String(e.text ?? "").trim().toLowerCase();
    if (text.length < 12) continue;
    const seen = lastText.get(e.speaker) ?? [];
    if (seen.some((s) => s.text === text && e.t - s.t <= 15 * 60_000)) dupes.set(e.speaker, (dupes.get(e.speaker) ?? 0) + 1);
    seen.push({ text, t: e.t });
    lastText.set(e.speaker, seen.slice(-20));
  }
  const byAgent = new Map(team.map((r) => [r.agent, r]));
  const names = new Set([...dupes.keys(), ...(hourly?.turnsByHour.keys() ?? [])]);
  for (const agent of names) {
    const r = byAgent.get(agent);
    if (!r) continue;
    let bursts = 0, wasted = 0;
    const series = hourly?.turnsByHour.get(agent) ?? [];
    series.forEach((turns, h) => {
      if (turns < 6) return;
      const from = hourly!.hourStart + h * 3_600_000;
      const postsInHour = events.filter((e) => e.speaker === agent && e.t >= from && e.t < from + 3_600_000 && !isAck(e.text) && e.type !== "working" && e.type !== "hired").length;
      if (postsInHour <= 1) (bursts++, (wasted += turns - postsInHour));
    });
    const d = dupes.get(agent) ?? 0;
    if (!bursts && !d) continue;
    const perTurn = r.turns ? r.costUsd / r.turns : 0;
    out.push({ kind: "retry_loop_waste", agent, confidence: confidence(wasted + d), savingUsd30d: round((wasted * perTurn * 720) / (hourly?.hours || 24) + d * perTurn * scale),
      finding: `${bursts ? `${bursts} burst${bursts > 1 ? "s" : ""} of 6+ turns in an hour with at most one real post (${wasted} turns)` : ""}${bursts && d ? "; " : ""}${d ? `${d} duplicate post${d > 1 ? "s" : ""} within 15 minutes` : ""}.`,
      action: "Look for a step that keeps failing (a tool call refused, a missing file) or two agents waking each other; fix it rather than letting it retry.",
      data: { bursts, burstTurns: wasted, duplicatePosts: d } });
  }
  return out.sort((a, b) => (b.savingUsd30d ?? 0) - (a.savingUsd30d ?? 0));
}

/** Work sessions in the hourly series: runs of consecutive active hours (the closest local stand-in for the hosted
 *  "$/session"; Switch counts turns, not Claude Code sessions). */
export const sessionsIn = (series: number[]) => series.reduce((n, v, i) => n + (v > 0 && !(series[i - 1] > 0) ? 1 : 0), 0);
