// Switch ROI: the GET /api/roi payload (server/src/roi.ts) and the demo office's local copy of it. The demo is modelled
// on the live War Room run (docs/live-demo-run.md): every number below is derived from RUN and one Haiku turn's price.

type Tokens = { input: number; output: number; cache_read: number; cache_write: number };
export type Row = {
  agent: string; models: string[]; turns: number; costUsd: number; unpriced?: boolean; unpricedModels?: string[]; tokens?: Tokens;
  posted: number; acks?: number; docs: number; files?: number; deliverables: number; costPerDeliverable: number | null; deliverablesPerUsd?: number | null; costPerTurn?: number | null; turnShare: number;
};
export type CapStatus = 'ok' | 'warn' | 'over' | 'none';
export type Forecast = { spentUsd: number; burnPerDay: number; projectedUsd: number; capUsd: number | null; used: number | null; daysToCap: number | null; projectedOver: boolean; status: CapStatus };
export type SpendAgent = { agent: string; mtdUsd: number; mtdTurns: number; costPerTurn: number | null; months: number[]; sessions24h: number; costPerSession: number | null; unpriced: string[]; cap: Forecast; budgetId: string | null };
export type Spend = {
  monthLabels: string[]; months: { costUsd: number; turns: number }[]; mtd: { costUsd: number; turns: number; forecast: Forecast };
  trend: { day: string; costUsd: number; turns: number }[]; capSummary: { ok: number; warn: number; over: number; none: number }; agents: SpendAgent[];
};
export type Improvement = { kind: string; agent: string; finding: string; savingUsd30d: number | null; confidence: 'High' | 'Medium' | 'Low'; action: string };
export type Trust = {
  switchTrust: 'enabled' | 'disabled' | 'unavailable'; reason?: string; policySet?: boolean;
  lockdown: { tools: string[]; autoMode: boolean }; approvalRequired: boolean; safetyBlock: { agents: number; of: number }; injectionRefusals: string | null;
  telemetry?: 'on' | 'off'; endpointHost?: string; agentName?: string | null; contentLogged?: boolean;
};
export type Budget = { id: string; agent_name: string | null; metric: string; model?: string | null; amount_limit: number; period_hours: number; spent: number; exhausted: boolean; resets_at?: string };
export type Roi = {
  source: 'switch' | 'unavailable' | 'demo'; reason?: string; window: { hours: number };
  canEdit?: boolean; budgetsEnabled?: boolean; pricing?: { source?: string; negotiated?: string[] };
  rows: Row[]; totals: { turns: number; costUsd: number; deliverables: number; deliverablesPerUsd?: number | null; costPerTurn?: number | null; unpriced?: string[] } | null;
  recommendations: string[]; improvements?: Improvement[]; spend?: Spend | null; budgets: Budget[]; trust: Trust;
};

// ---- demo: the live War Room run's 63 agent messages, priced like a Haiku turn there (~110K cached tokens re-read,
// ~3.5K written, ~120 fresh in, ~550 out; claude-haiku-5-5 list prices).
const TURN = { input: 120, output: 550, cache_read: 110_000, cache_write: 3_500 };
const PER_TURN = (TURN.cache_read * 0.01 + TURN.cache_write * 0.125 + TURN.input * 0.1 + TURN.output * 0.5) / 1e6;
const RUN: [string, number, number, number, number][] = [ // agent, turns, messages posted, of which acks, docs pinned
  ['d2c-captain', 30, 26, 3, 1], ['d2c-influencers', 12, 11, 6, 0], ['d2c-design', 10, 9, 1, 0], ['d2c-ops', 6, 5, 2, 0], ['d2c-ugc', 5, 4, 1, 0],
  ['d2c-ads', 4, 3, 0, 0], ['d2c-finance', 3, 2, 0, 0], ['d2c-logistics', 2, 2, 1, 0], ['d2c-analyst', 2, 1, 0, 0],
];
const DEMO_TURNS = RUN.reduce((s, r) => s + r[1], 0);
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
// The month so far: 6 days, 3 rehearsal runs a day (18 runs). The month before: the Opus-era build-out.
const DAY = 7, DIM = 30, RUNS_MTD = 18;
const mtdOf = (turns: number) => r4(turns * PER_TURN * RUNS_MTD);
const CAPS: Record<string, number> = { 'd2c-captain': 1.5, 'd2c-influencers': 0.25, 'd2c-design': 0.5 };
const fc = (spent: number, cap: number | null): Forecast => {
  const burn = spent / DAY, projected = burn * DIM;
  if (!cap) return { spentUsd: spent, burnPerDay: r4(burn), projectedUsd: r4(projected), capUsd: null, used: null, daysToCap: null, projectedOver: false, status: 'none' };
  const used = spent / cap;
  return { spentUsd: spent, burnPerDay: r4(burn), projectedUsd: r4(projected), capUsd: cap, used: Math.round(used * 1000) / 1000, daysToCap: used >= 1 ? 0 : Math.round(((cap - spent) / burn) * 10) / 10, projectedOver: projected >= cap, status: used >= 1 ? 'over' : used >= 0.8 ? 'warn' : 'ok' };
};
const TREND_RUNS = [0, 0, 0, 0, 0, 0, 0, 1, 3, 2, 4, 3, 3, 2]; // runs per day, last 14 days (the team went live a week ago)
const capped = RUN.filter(([a]) => CAPS[a]);
const spendAgents: SpendAgent[] = RUN.map(([agent, turns]) => ({
  agent, mtdUsd: mtdOf(turns), mtdTurns: turns * RUNS_MTD, costPerTurn: r4(PER_TURN), months: [0, r4(turns * 0.096), mtdOf(turns)],
  sessions24h: 3, costPerSession: r4((turns * PER_TURN * 3) / 3), unpriced: [], cap: fc(mtdOf(turns), CAPS[agent] ?? null), budgetId: null,
}));
const mtdTotal = r4(DEMO_TURNS * PER_TURN * RUNS_MTD);
const save30 = (usd: number) => r4(usd * 30);

export const DEMO_ROI: Roi = {
  source: 'demo', window: { hours: 24 }, canEdit: false, budgetsEnabled: false,
  rows: RUN.map(([agent, turns, posted, acks, docs]) => ({
    agent, models: ['claude-haiku-5-5'], turns, costUsd: r4(turns * PER_TURN), posted, acks, docs, files: agent === 'd2c-design' ? 2 : 0,
    deliverables: posted + docs + (agent === 'd2c-design' ? 2 : 0), costPerDeliverable: r4((turns * PER_TURN) / (posted + docs + (agent === 'd2c-design' ? 2 : 0))),
    deliverablesPerUsd: Math.round(((posted + docs + (agent === 'd2c-design' ? 2 : 0)) / (turns * PER_TURN)) * 10) / 10, costPerTurn: r4(PER_TURN), turnShare: turns / DEMO_TURNS,
  })),
  totals: { turns: DEMO_TURNS, costUsd: r4(DEMO_TURNS * PER_TURN), deliverables: RUN.reduce((s, r) => s + r[2] + r[4], 0) + 2, deliverablesPerUsd: Math.round(((RUN.reduce((s, r) => s + r[2] + r[4], 0) + 2) / (DEMO_TURNS * PER_TURN)) * 10) / 10, costPerTurn: r4(PER_TURN), unpriced: [] },
  recommendations: [
    `d2c-captain uses ${Math.round((100 * 30) / DEMO_TURNS)}% of all turns (30); almost all of what it reads is the cached chat it re-reads every turn. Fewer wake-ups (one ask per plan, no "confirmed" replies) cut it most.`,
    'Creators Lead posted 11 times in 5 minutes, mostly "confirmed / on hold": a third of the run carried no new information.',
  ],
  improvements: [
    { kind: 'context_cache_waste', agent: 'd2c-captain', confidence: 'Medium', savingUsd30d: save30(0.3 * 30 * TURN.cache_read * 0.01 / 1e6 * 3),
      finding: 'Re-reads 110K cached tokens every turn (96% cache hit rate): the whole chat history, on each of 30 wake-ups.',
      action: 'Wake it less often and keep threads short (one ask per plan, a fresh topic per campaign); a 30% shorter history saves the figure shown.' },
    { kind: 'tool_bloat', agent: 'd2c-influencers', confidence: 'Medium', savingUsd30d: save30(7 * PER_TURN * 3),
      finding: '7 of 12 wake-ups (58%) produced no post or only an acknowledgement (6 "ok / confirmed" replies).',
      action: 'Don\'t address Creators Lead with FYIs; tell reporters to skip "confirmed" replies, and scope its addressing so it is woken only when it must answer.' },
    { kind: 'retry_loop_waste', agent: 'd2c-influencers', confidence: 'Low', savingUsd30d: save30(2 * PER_TURN * 3),
      finding: '2 duplicate posts within 15 minutes.', action: 'Look for a step that keeps failing or two agents waking each other; fix it rather than letting it retry.' },
    { kind: 'verbosity', agent: 'd2c-design', confidence: 'Medium', savingUsd30d: save30((1_100 - 550) * 10 * 0.5 / 1e6 * 3),
      finding: 'Writes 1.1K output tokens a turn against a team median of 550, and posted 3 messages over 900 characters. Candidate for verbosity optimization: Yes.',
      action: 'Ask for the answer first and short lines (the Telegram style rules); move long tables into a pinned room document.' },
    { kind: 'model_optimizer', agent: 'd2c-captain', confidence: 'High', savingUsd30d: 0,
      finding: 'Already on claude-haiku-5-5 this month. Last month\'s Opus 5.5 runs would have cost 40x less on Haiku.', action: 'No change: keep every team agent on claude-haiku-5-5.' },
  ],
  spend: {
    monthLabels: ['2026-09', '2026-10', '2026-11'],
    months: [{ costUsd: 0, turns: 0 }, { costUsd: r4(DEMO_TURNS * 0.096), turns: 412 }, { costUsd: mtdTotal, turns: DEMO_TURNS * RUNS_MTD }],
    mtd: { costUsd: mtdTotal, turns: DEMO_TURNS * RUNS_MTD, forecast: fc(capped.reduce((s, [, t]) => s + mtdOf(t), 0), capped.reduce((s, [a]) => s + CAPS[a], 0)) },
    trend: TREND_RUNS.map((n, i) => ({ day: `2026-${i < 7 ? '10' : '11'}-${String(i < 7 ? 25 + i : i - 6).padStart(2, '0')}`, costUsd: r4(n * DEMO_TURNS * PER_TURN), turns: n * DEMO_TURNS })),
    capSummary: { ok: spendAgents.filter((a) => a.cap.status === 'ok').length, warn: spendAgents.filter((a) => a.cap.status === 'warn').length, over: spendAgents.filter((a) => a.cap.status === 'over').length, none: spendAgents.filter((a) => a.cap.status === 'none').length },
    agents: spendAgents,
  },
  budgets: [],
  trust: { switchTrust: 'disabled', lockdown: { tools: ['Bash', 'Read', 'Grep', 'Glob', 'Write'], autoMode: false }, approvalRequired: true, safetyBlock: { agents: 16, of: 16 }, injectionRefusals: '4/4', telemetry: 'off' },
};
