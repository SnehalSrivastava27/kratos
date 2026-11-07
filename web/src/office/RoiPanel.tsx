// SW5: "Switch ROI" (what every agent costs and delivers, GET /api/roi) and "Switch Trust" (guardrails). Live: the
// signed-in workspace; demo (no workspace): numbers modelled on the live War Room run (docs/live-demo-run.md), labelled.
import { useEffect, useState } from 'react';
import { Coins, Lightbulb, Lock, ShieldCheck, ShieldOff, UserCheck } from 'lucide-react';
import { Modal } from './Hud';
import { apiScope } from './api';
import { personById } from './data';
import './switch.css';

type Row = { agent: string; models: string[]; turns: number; costUsd: number; posted: number; docs: number; deliverables: number; costPerDeliverable: number | null; turnShare: number };
type Trust = {
  switchTrust: 'enabled' | 'disabled' | 'unavailable'; reason?: string; policySet?: boolean;
  lockdown: { tools: string[]; autoMode: boolean }; approvalRequired: boolean; safetyBlock: { agents: number; of: number }; injectionRefusals: string | null;
};
type Budget = { id: string; agent_name: string | null; metric: string; amount_limit: number; period_hours: number; spent: number; exhausted: boolean };
export type Roi = {
  source: 'switch' | 'unavailable' | 'demo'; reason?: string; window: { hours: number };
  rows: Row[]; totals: { turns: number; costUsd: number; deliverables: number } | null; recommendations: string[]; budgets: Budget[]; trust: Trust;
};

// ---- demo: the live War Room run's 63 agent messages, priced like a Haiku turn there (~110K cached tokens re-read,
// ~3.5K written, ~550 out; claude-haiku-5-5 list prices). Every number below is derived from these.
const PER_TURN = (110_000 * 0.01 + 3_500 * 0.125 + 120 * 0.1 + 550 * 0.5) / 1e6;
const RUN: [string, number, number, number][] = [ // agent, turns, messages posted, docs pinned
  ['d2c-captain', 30, 26, 1], ['d2c-influencers', 12, 11, 0], ['d2c-design', 10, 9, 0], ['d2c-ops', 6, 5, 0], ['d2c-ugc', 5, 4, 0],
  ['d2c-ads', 4, 3, 0], ['d2c-finance', 3, 2, 0], ['d2c-logistics', 2, 2, 0], ['d2c-analyst', 2, 1, 0],
];
const DEMO_TURNS = RUN.reduce((s, r) => s + r[1], 0);
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
export const DEMO_ROI: Roi = {
  source: 'demo', window: { hours: 24 },
  rows: RUN.map(([agent, turns, posted, docs]) => ({
    agent, models: ['claude-haiku-5-5'], turns, costUsd: r4(turns * PER_TURN), posted, docs, deliverables: posted + docs,
    costPerDeliverable: r4((turns * PER_TURN) / (posted + docs)), turnShare: turns / DEMO_TURNS,
  })),
  totals: { turns: DEMO_TURNS, costUsd: r4(DEMO_TURNS * PER_TURN), deliverables: RUN.reduce((s, r) => s + r[2] + r[3], 0) },
  recommendations: [
    `d2c-captain uses ${Math.round((100 * 30) / DEMO_TURNS)}% of all turns (30); almost all of what it reads is the cached chat it re-reads every turn. Fewer wake-ups (one ask per plan, no "confirmed" replies) cut it most.`,
    'Creators Lead posted 11 times in 5 minutes, mostly "confirmed / on hold": a third of the run carried no new information.',
  ],
  budgets: [],
  trust: { switchTrust: 'disabled', lockdown: { tools: ['Bash', 'Read', 'Grep', 'Glob', 'Write'], autoMode: false }, approvalRequired: true, safetyBlock: { agents: 16, of: 16 }, injectionRefusals: '4/4' },
};

/** GET /api/roi for the workspace (cookie session); the demo answers locally. */
async function loadRoi(): Promise<Roi> {
  const scope = apiScope();
  if (scope === 'demo') return DEMO_ROI;
  const r = await fetch(`/api/roi?ws=${encodeURIComponent(scope.slice(3))}`, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const usd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : n > 0 ? `$${n.toFixed(4)}` : '$0');
const name = (id: string) => personById[id]?.name ?? id;

export function RoiPanel({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<Roi | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => void loadRoi().then(setD, (e) => setErr(String(e.message ?? e))), []);
  const top = d?.rows.length ? Math.max(...d.rows.map((r) => r.costUsd), 1e-9) : 1;
  const sub = !d ? (err ? 'Could not load' : 'Loading…') : d.source === 'demo' ? 'Demo · modelled on a live War Room run' : d.source === 'switch' ? `Last ${d.window.hours} h · from Switch usage` : 'Switch usage unavailable';
  return (
    <Modal label="Switch ROI and Trust" onClose={onClose} className="sw-panel w-[min(640px,100%)]"
      title={<span className="flex min-w-0 items-center gap-2"><span className="sw-mark"><Coins className="size-4" strokeWidth={2.75} /></span> Switch ROI <span className="truncate text-[13px] font-bold text-[var(--muted)]">· {sub}</span></span>}>
      <div className="ao-body">
        {err && <p className="sw-empty">The office server didn’t answer ({err}).</p>}
        {d && (
          <>
            {d.source === 'unavailable' && <p className="sw-empty mb-3">Switch couldn’t give usage: {d.reason}. Your guardrails are below.</p>}
            {d.totals && (
              <div className="sw-stats">
                <div><b>{usd(d.totals.costUsd)}</b><span>est. cost{d.source === 'demo' ? ' (demo)' : ''}</span></div>
                <div><b>{d.totals.turns}</b><span>agent turns</span></div>
                <div><b>{d.totals.deliverables}</b><span>posts + pinned docs</span></div>
              </div>
            )}
            {d.rows.length > 0 && (
              <>
                <h3 className="sw-h">What each agent costs and delivers</h3>
                <div className="overflow-x-auto rounded-xl border-2 border-[#e8dccb] bg-white">
                  <table className="w-full border-collapse text-[13px] font-bold tabular-nums">
                    <thead>
                      <tr className="text-left text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
                        <th className="px-2.5 py-1.5">Agent</th><th className="px-2 py-1.5 text-right">Turns</th><th className="px-2 py-1.5 text-right">Est. cost</th>
                        <th className="px-2 py-1.5 text-right">Delivered</th><th className="px-2.5 py-1.5 text-right max-[560px]:hidden">Per item</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.map((r) => (
                        <tr key={r.agent} className="border-t border-[#f0e6d8]">
                          <td className="max-w-[170px] px-2.5 py-1.5 max-[560px]:max-w-[120px]">
                            <div className="truncate font-extrabold" title={r.agent}>{name(r.agent)}</div>
                            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-[var(--ink)]/10"><span className="block h-full rounded-full bg-[#F4A300]" style={{ width: `${(100 * r.costUsd) / top}%` }} /></div>
                          </td>
                          <td className="px-2 py-1.5 text-right">{r.turns}<span className="text-[11px] text-[var(--muted)] max-[560px]:hidden"> · {Math.round(r.turnShare * 100)}%</span></td>
                          <td className="px-2 py-1.5 text-right">{usd(r.costUsd)}{r.models.some((m) => m !== 'claude-haiku-5-5') && <span className="ml-1 rounded bg-[#fde8e8] px-1 text-[10.5px] text-[#C8303A]" title={r.models.join(', ')}>not Haiku</span>}</td>
                          <td className="px-2 py-1.5 text-right">{r.deliverables}{r.docs > 0 && <span className="text-[11px] text-[var(--muted)] max-[560px]:hidden"> · {r.docs} doc</span>}</td>
                          <td className="px-2.5 py-1.5 text-right max-[560px]:hidden">{r.costPerDeliverable == null ? '—' : usd(r.costPerDeliverable)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 mb-4 text-[11.5px] font-bold text-[var(--muted)]">Cost is an estimate: Switch counts tokens per model; priced at Anthropic list prices (Haiku 5.5: $0.10 in · $0.50 out · $0.01 cached per M tokens, the ≤100K-token prompt rate; turns that re-read a longer chat cost up to 5× more).</p>
              </>
            )}
            {d.source === 'switch' && d.rows.length === 0 && <p className="sw-empty mb-4">No agent turns in the last {d.window.hours} h.</p>}
            {d.recommendations.length > 0 && (
              <>
                <h3 className="sw-h">What to change</h3>
                <ul className="sw-hops mb-4">
                  {d.recommendations.map((t) => <li key={t} className="flex gap-2 text-[13px] font-bold leading-snug"><Lightbulb className="mt-0.5 size-4 shrink-0 text-[#c27c00]" strokeWidth={2.5} /><span>{t.replace(/d2c-[\w-]+/g, name)}</span></li>)}
                </ul>
              </>
            )}
            {d.budgets.length > 0 && (
              <>
                <h3 className="sw-h">Switch budgets</h3>
                <ul className="sw-hops mb-4">
                  {d.budgets.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 text-[13px] font-bold">
                      <span className="min-w-0 flex-1 truncate">{b.agent_name ? name(b.agent_name) : 'Whole workspace'} · {b.metric.replace(/_/g, ' ')}</span>
                      <span className={`tabular-nums ${b.exhausted ? 'text-[#C8303A]' : ''}`}>{b.spent.toLocaleString()} / {b.amount_limit.toLocaleString()} per {b.period_hours} h</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <TrustCard t={d.trust} />
          </>
        )}
      </div>
    </Modal>
  );
}

function TrustCard({ t }: { t: Trust }) {
  const on = t.switchTrust === 'enabled';
  const items: [React.ReactNode, string, string][] = [
    [<Lock key="l" className="size-4" strokeWidth={2.5} />, 'Agent lockdown', `${t.lockdown.tools.join(', ')} only; ${t.lockdown.autoMode ? 'auto mode on' : 'anything else waits for a human'}`],
    [<UserCheck key="u" className="size-4" strokeWidth={2.5} />, 'Approval required', t.approvalRequired ? 'Finance checks every plan, then the founder approves once before anything ships' : 'off'],
    [<ShieldCheck key="s" className="size-4" strokeWidth={2.5} />, 'SAFETY block', `${t.safetyBlock.agents}/${t.safetyBlock.of} agents refuse secrets, deletes and outside calls first${t.injectionRefusals ? ` · injection evals ${t.injectionRefusals} refused` : ''}`],
  ];
  return (
    <>
      <h3 className="sw-h">Switch Trust</h3>
      <div className={`mb-2 flex items-start gap-2 rounded-xl border-2 px-3 py-2 text-[13px] font-bold ${on ? 'border-[#9ad9b8] bg-[#e6f6ee]' : 'border-[#e8dccb] bg-white'}`}>
        {on ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#0F7A4F]" strokeWidth={2.5} /> : <ShieldOff className="mt-0.5 size-4 shrink-0 text-[var(--muted)]" strokeWidth={2.5} />}
        <span>
          <b className="font-black">Hosted guardrails: {t.switchTrust}</b>
          <span className="block text-[12px] text-[var(--muted)]">
            {on ? 'Switch checks messages against your policy (block, redact, alert).' : t.switchTrust === 'disabled' ? 'Needs a Switch Trust policy id and key (Console → Trust settings). Until then, our own guardrails below do the job.' : t.reason ?? 'Switch did not answer.'}
          </span>
        </span>
      </div>
      <ul className="sw-hops">
        {items.map(([icon, title, text]) => (
          <li key={title} className="flex items-start gap-2 text-[13px] font-bold">
            <span className="mt-0.5 shrink-0 text-[#0F7A4F]">{icon}</span>
            <span className="min-w-0"><b className="font-black">{title}</b><span className="block text-[12px] text-[var(--muted)]">{text}</span></span>
          </li>
        ))}
      </ul>
    </>
  );
}
