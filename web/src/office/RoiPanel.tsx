// Switch ROI (what every agent costs and delivers, GET /api/roi) and Switch Trust (guardrails), in five tabs:
// Overview, Agents, Improvements, Caps & budgets, Trust. Live: the signed-in workspace; caps and budgets are editable
// by the host owner. Demo (no workspace): roiData.ts, modelled on the live War Room run, labelled and read-only.
import { useCallback, useEffect, useState } from 'react';
import { Activity, Coins, Gauge, Lightbulb, Lock, Radio, ShieldCheck, ShieldOff, Trash2, UserCheck } from 'lucide-react';
import { Modal } from './Hud';
import { apiScope } from './api';
import { personById } from './data';
import { DEMO_ROI, type Budget, type CapStatus, type Roi, type Trust } from './roiData';
import './switch.css';

export { DEMO_ROI, type Roi };

const wsParam = () => `ws=${encodeURIComponent(apiScope().slice(3))}`;
/** GET /api/roi for the workspace (cookie session); the demo answers locally. */
async function loadRoi(): Promise<Roi> {
  if (apiScope() === 'demo') return DEMO_ROI;
  const r = await fetch(`/api/roi?${wsParam()}`, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
/** A JSON write to /api/roi/… (owner only; the server checks origin and content type). */
async function write(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) {
  const r = await fetch(`/api/roi/${path}?${wsParam()}`, { method, credentials: 'include', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`);
}

const usd = (n: number) => (n >= 100 ? `$${Math.round(n)}` : n >= 1 ? `$${n.toFixed(2)}` : n >= 0.01 ? `$${n.toFixed(3)}` : n > 0 ? `$${n.toFixed(4)}` : '$0');
const name = (id: string) => personById[id]?.name ?? id;
const names = (t: string) => t.replace(/d2c-[\w-]+/g, name);
const TABS = ['Overview', 'Agents', 'Improvements', 'Caps & budgets', 'Trust'] as const;
type Tab = (typeof TABS)[number];
const KIND: Record<string, string> = { context_cache_waste: 'Context cache waste', verbosity: 'Verbosity', model_optimizer: 'Model optimization', tool_bloat: 'Wake-up bloat', retry_loop_waste: 'Retry and loop waste' };
const STATUS: Record<CapStatus, [string, string]> = { ok: ['Below cap', 'bg-[#e6f6ee] text-[#0F7A4F]'], warn: ['Near cap', 'bg-[#fff1d0] text-[#9a5b00]'], over: ['Over cap', 'bg-[#fde8e8] text-[#C8303A]'], none: ['No cap', 'bg-[var(--ink)]/5 text-[var(--muted)]'] };
const SHORT: Record<CapStatus, string> = { ok: 'OK', warn: '80%+', over: 'Over', none: '—' };
/** Cap status; `short` swaps to a one-word label on phones. */
const Pill = ({ s, short = false }: { s: CapStatus; short?: boolean }) => (
  <span className={`inline-block rounded-full px-2 py-px text-[11px] font-black whitespace-nowrap ${STATUS[s][1]}`} title={STATUS[s][0]}>
    {short ? <><span className="max-[560px]:hidden">{STATUS[s][0]}</span><span className="min-[561px]:hidden">{SHORT[s]}</span></> : STATUS[s][0]}
  </span>
);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const card = 'rounded-xl border-2 border-[#e8dccb] bg-white';
const note = 'mt-1.5 mb-4 text-[11.5px] font-bold leading-snug text-[var(--muted)]';

export function RoiPanel({ onClose }: { onClose: () => void }) {
  const [d, setD] = useState<Roi | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('Overview');
  const reload = useCallback(() => loadRoi().then((x) => (setD(x), setErr('')), (e) => setErr(String(e.message ?? e))), []);
  useEffect(() => void reload(), [reload]);
  const sub = !d ? (err ? 'Could not load' : 'Loading…') : d.source === 'demo' ? 'Demo · modelled on a live War Room run' : d.source === 'switch' ? `Last ${d.window.hours} h · from Switch usage` : 'Switch usage unavailable';
  return (
    <Modal label="Switch ROI and Trust" onClose={onClose} className="sw-panel w-[min(720px,100%)]"
      title={<span className="flex min-w-0 items-center gap-2"><span className="sw-mark"><Coins className="size-4" strokeWidth={2.75} /></span> Switch ROI <span className="truncate text-[13px] font-bold text-[var(--muted)]">· {sub}</span></span>}>
      <div className="roi-tabs" role="tablist" aria-label="Switch ROI sections">
        {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} className={`roi-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div className="ao-body" role="tabpanel" aria-label={tab}>
        {err && !d && <p className="sw-empty">The office server didn’t answer ({err}).</p>}
        {d && d.source === 'unavailable' && tab !== 'Trust' && <p className="sw-empty mb-3">Switch couldn’t give usage: {d.reason}. Your guardrails are on the Trust tab.</p>}
        {d && tab === 'Overview' && <Overview d={d} />}
        {d && tab === 'Agents' && <Agents d={d} />}
        {d && tab === 'Improvements' && <Improvements d={d} />}
        {d && tab === 'Caps & budgets' && <Caps d={d} reload={reload} />}
        {d && tab === 'Trust' && <TrustCard t={d.trust} />}
      </div>
    </Modal>
  );
}

function Overview({ d }: { d: Roi }) {
  const s = d.spend, t = d.totals;
  if (!t) return null;
  const f = s?.mtd.forecast;
  return (
    <>
      <div className="sw-stats roi-stats">
        <div><b>{usd(s?.mtd.costUsd ?? t.costUsd)}</b><span>{s ? 'spent this month' : `last ${d.window.hours} h`}{d.source === 'demo' ? ' (demo)' : ''}</span></div>
        <div><b>{f ? usd(f.projectedUsd) : usd(t.costUsd)}</b><span>{f ? `month-end at ${usd(f.burnPerDay)}/day` : 'est. cost'}</span></div>
        <div><b>{t.turns}</b><span>turns, last {d.window.hours} h</span></div>
        <div><b>{t.deliverablesPerUsd ?? '—'}</b><span>deliverables per $</span></div>
      </div>
      {s && s.trend.length > 0 && <Trend trend={s.trend} />}
      {s && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {s.months.map((m, i) => (
            <div key={s.monthLabels[i]} className={`${card} px-2.5 py-1.5`}>
              <div className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">{new Date(`${s.monthLabels[i]}-01T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' })}{i === 2 ? ' · MTD' : ''}</div>
              <div className="text-[17px] font-black tabular-nums">{usd(m.costUsd)}</div>
              <div className="text-[11.5px] font-bold text-[var(--muted)] tabular-nums">{m.turns.toLocaleString()} turns</div>
            </div>
          ))}
        </div>
      )}
      {!!t.unpriced?.length && <p className="mb-3 rounded-xl border-2 border-[#f3c48a] bg-[#FFF1D0] px-3 py-2 text-[12.5px] font-bold text-[#7a3a00]">Unpriced: {t.unpriced.join(', ')}. Their tokens are counted but add no dollars until you price them in switch/pricing.json.</p>}
      {d.recommendations.length > 0 && (
        <>
          <h3 className="sw-h">What to change first</h3>
          <ul className="sw-hops mb-2">
            {d.recommendations.map((x) => <li key={x} className="flex gap-2 text-[13px] font-bold leading-snug"><Lightbulb className="mt-0.5 size-4 shrink-0 text-[#c27c00]" strokeWidth={2.5} /><span>{names(x)}</span></li>)}
          </ul>
        </>
      )}
      <p className={note}>Estimates: Switch counts tokens per model; we price them at {d.pricing?.negotiated?.length ? `your rates for ${d.pricing.negotiated.join(', ')} and ` : ''}Anthropic list prices (switch/pricing.json). Haiku 5.5 is priced at its ≤100K-token prompt rate; longer prompts bill 5×, so read long-chat figures as a floor.</p>
    </>
  );
}

function Trend({ trend }: { trend: { day: string; costUsd: number; turns: number }[] }) {
  const max = Math.max(...trend.map((x) => x.costUsd), 1e-9);
  const total = trend.reduce((a, x) => a + x.costUsd, 0);
  const fmt = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <div className={`${card} mb-3 px-3 pt-2 pb-1.5`}>
      <div className="flex items-baseline justify-between gap-2 text-[12px] font-extrabold text-[var(--muted)]"><span className="tracking-wide uppercase">Daily spend · {trend.length} days</span><span className="tabular-nums">{usd(total)}</span></div>
      <div className="mt-1.5 flex h-[56px] items-end gap-[3px]" role="img" aria-label={`Daily spend over ${trend.length} days, ${usd(total)} in total, highest ${usd(max)}`}>
        {trend.map((x) => <span key={x.day} title={`${fmt(x.day)}: ${usd(x.costUsd)} · ${x.turns} turns`} className="flex-1 rounded-t-[3px] bg-[#F4A300]" style={{ height: `${Math.max(x.costUsd > 0 ? 6 : 2, (100 * x.costUsd) / max)}%`, opacity: x.costUsd > 0 ? 1 : 0.25 }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[11px] font-bold text-[var(--muted)]"><span>{fmt(trend[0].day)}</span><span>{fmt(trend[trend.length - 1].day)}</span></div>
    </div>
  );
}

function Agents({ d }: { d: Roi }) {
  const spend = new Map((d.spend?.agents ?? []).map((a) => [a.agent, a]));
  const rows = d.rows.length ? d.rows : [];
  const top = Math.max(...rows.map((r) => r.costUsd), 1e-9);
  if (!rows.length) return <p className="sw-empty">{d.source === 'switch' ? `No agent turns in the last ${d.window.hours} h.` : 'No usage to show.'}</p>;
  return (
    <>
      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full border-collapse text-[13px] font-bold tabular-nums">
          <thead>
            <tr className="text-left text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
              <th className="px-2.5 py-1.5">Agent</th><th className="px-2 py-1.5 text-right">Month</th><th className="px-2 py-1.5 text-right max-[560px]:hidden">$/turn</th>
              <th className="px-2 py-1.5 text-right">Delivered</th><th className="px-2 py-1.5 text-right max-[560px]:hidden">$/item</th><th className="px-2.5 py-1.5 text-right">Cap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = spend.get(r.agent);
              return (
                <tr key={r.agent} className="border-t border-[#f0e6d8]">
                  <td className="max-w-[180px] px-2.5 py-1.5 max-[560px]:max-w-[118px] max-[560px]:pr-1">
                    <div className="flex items-center gap-1"><span className="truncate font-extrabold" title={r.agent}>{name(r.agent)}</span>
                      {r.models.some((m) => m !== 'claude-haiku-5-5') && <span className="shrink-0 rounded bg-[#fde8e8] px-1 text-[10px] text-[#C8303A]" title={r.models.join(', ')}>not Haiku</span>}
                      {r.unpriced && <span className="shrink-0 rounded bg-[#fff1d0] px-1 text-[10px] text-[#9a5b00]" title={r.unpricedModels?.join(', ')}>unpriced</span>}</div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-[var(--ink)]/10"><span className="block h-full rounded-full bg-[#F4A300]" style={{ width: `${(100 * r.costUsd) / top}%` }} /></div>
                  </td>
                  <td className="px-2 py-1.5 text-right">{s ? usd(s.mtdUsd) : '—'}<div className="text-[11px] whitespace-nowrap text-[var(--muted)] max-[560px]:hidden">{usd(r.costUsd)} · {r.turns} t</div></td>
                  <td className="px-2 py-1.5 text-right max-[560px]:hidden">{s?.costPerTurn != null ? usd(s.costPerTurn) : r.costPerTurn != null ? usd(r.costPerTurn) : '—'}{s?.costPerSession != null && <div className="text-[11px] text-[var(--muted)]">{usd(s.costPerSession)}/session</div>}</td>
                  <td className="px-2 py-1.5 text-right">{r.deliverables}<div className="text-[11px] text-[var(--muted)] max-[560px]:hidden">{[r.posted && plural(r.posted, 'post'), r.docs && plural(r.docs, 'doc'), r.files && plural(r.files, 'file')].filter(Boolean).join(' · ') || '—'}</div></td>
                  <td className="px-2 py-1.5 text-right max-[560px]:hidden">{r.costPerDeliverable == null ? '—' : usd(r.costPerDeliverable)}</td>
                  <td className="px-2.5 py-1.5 text-right"><Pill short s={s?.cap.status ?? 'none'} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={note}>“Month” is month to date (UTC), with the last {d.window.hours} h and its turns below. Delivered = posts in this workspace + pinned room documents + files it produced in the gallery, last {d.window.hours} h. A session is a run of consecutive active hours. All costs are estimates.</p>
    </>
  );
}

function Improvements({ d }: { d: Roi }) {
  const list = d.improvements ?? [];
  const total = list.reduce((a, i) => a + (i.savingUsd30d ?? 0), 0);
  if (!list.length) return <p className="sw-empty">{d.source === 'switch' ? 'Nothing to improve in this window: no agent trips any of the five analyses.' : 'No findings.'}</p>;
  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-2"><h3 className="sw-h m-0">{list.length} findings · five analyses</h3><span className="text-[13px] font-black text-[#0F7A4F] tabular-nums">~{usd(total)} / 30 days</span></div>
      <ul className="sw-hops mb-2">
        {list.map((i) => (
          <li key={`${i.kind}-${i.agent}`} className="text-[13px] font-bold leading-snug">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="sw-role">{KIND[i.kind] ?? i.kind}</span><b className="font-black">{name(i.agent)}</b>
              <span className="text-[11px] font-extrabold text-[var(--muted)]">{i.confidence} confidence</span>
              <span className="ml-auto text-[12.5px] font-black text-[#0F7A4F] tabular-nums">{i.savingUsd30d ? `save ~${usd(i.savingUsd30d)}/30 d` : 'no saving'}</span>
            </div>
            <p className="mt-1 mb-0.5">{names(i.finding)}</p>
            <p className="m-0 flex gap-1.5 text-[12.5px] text-[var(--muted)]"><Lightbulb className="mt-px size-3.5 shrink-0 text-[#c27c00]" strokeWidth={2.5} /><span>{names(i.action)}</span></p>
          </li>
        ))}
      </ul>
      <p className={note}>The same five optimizations Switch ROI runs on Trust traces, computed here from Switch’s per-agent usage counters and the room’s messages. Savings are scaled from the last {d.window.hours} h to 30 days at list prices. Confidence follows how many turns back a finding. “Wake-up bloat” is our stand-in for tool bloat: Rooms usage carries no tool definitions, so it counts turns that produced no new post.</p>
    </>
  );
}

function Caps({ d, reload }: { d: Roi; reload: () => void }) {
  const agents = d.spend?.agents ?? [];
  const edit = !!d.canEdit && d.source === 'switch';
  const [agent, setAgent] = useState('');
  const [amount, setAmount] = useState('');
  const [enforce, setEnforce] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const run = (label: string, f: () => Promise<unknown>) => {
    setBusy(label), setMsg('');
    f().then(() => (setMsg(''), reload()), (e) => setMsg(String(e.message ?? e))).finally(() => setBusy(''));
  };
  const capped = agents.filter((a) => a.cap.capUsd);
  const cs = d.spend?.capSummary;
  return (
    <>
      {cs && (
        <div className="sw-stats roi-stats">
          <div><b>{capped.length ? usd(capped.reduce((a, x) => a + x.cap.capUsd!, 0)) : '—'}</b><span>{capped.length ? `capped, ${usd(capped.reduce((a, x) => a + x.mtdUsd, 0))} used` : 'No cap set'}</span></div>
          <div><b className="text-[#0F7A4F]">{cs.ok}</b><span>below cap</span></div>
          <div><b className="text-[#9a5b00]">{cs.warn}</b><span>near cap (80%+)</span></div>
          <div><b className="text-[#C8303A]">{cs.over}</b><span>over cap</span></div>
        </div>
      )}
      <h3 className="sw-h">Monthly caps</h3>
      {capped.length === 0 && <p className="sw-empty mb-2">No agent has a cap yet.</p>}
      <ul className="sw-hops mb-2">
        {capped.map((a) => {
          const c = a.cap;
          return (
            <li key={a.agent} className="text-[13px] font-bold">
              <div className="flex items-center gap-2">
                <b className="min-w-0 flex-1 truncate font-black">{name(a.agent)}</b><Pill s={c.status} />
                {edit && <button type="button" className="roi-icon" aria-label={`Remove ${name(a.agent)}'s cap`} disabled={!!busy} onClick={() => run(a.agent, () => write('DELETE', 'caps', { agent: a.agent }))}><Trash2 className="size-3.5" /></button>}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--ink)]/10"><span className={`block h-full rounded-full ${c.status === 'over' ? 'bg-[#C8303A]' : c.status === 'warn' ? 'bg-[#e19a00]' : 'bg-[#3CCB8B]'}`} style={{ width: `${Math.min(100, (c.used ?? 0) * 100)}%` }} /></div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-[var(--muted)] tabular-nums">
                <span>{usd(c.spentUsd)} of {usd(c.capUsd!)}</span><span>{usd(c.burnPerDay)}/day</span>
                <span className={c.projectedOver ? 'text-[#C8303A]' : ''}>month-end {usd(c.projectedUsd)}</span>
                <span>{c.daysToCap == null ? 'no spend yet' : c.daysToCap === 0 ? 'cap reached' : `${c.daysToCap} days to cap`}</span>
                {a.budgetId && <span className="text-[var(--ink)]">enforced (budget)</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {edit && (
        <form className="roi-form mb-1" onSubmit={(e) => (e.preventDefault(), agent && run('cap', () => write('POST', 'caps', { agent, usd: Number(amount), enforce: enforce || undefined })))}>
          <select className="ao-input" aria-label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} required>
            <option value="">Agent…</option>
            {agents.map((a) => <option key={a.agent} value={a.agent}>{name(a.agent)}{a.cap.capUsd ? ` (${usd(a.cap.capUsd)})` : ''}</option>)}
          </select>
          <input className="ao-input" aria-label="Monthly cap in US dollars" inputMode="decimal" type="number" min="0.01" step="0.01" placeholder="$ / month" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <button type="submit" className="ao-btn" disabled={!!busy}>{busy === 'cap' ? 'Saving…' : 'Set cap'}</button>
          {d.budgetsEnabled && <label className="roi-check"><input type="checkbox" checked={enforce} onChange={(e) => setEnforce(e.target.checked)} /> Also enforce as a Switch budget</label>}
        </form>
      )}
      <p className={note}>A cap is advisory, as in Switch Trust: it tracks and forecasts an agent against a monthly amount and never stops it. Burn rate is month-to-date spend over the days the month has run; Near cap starts at 80%.{d.budgetsEnabled ? ' Enforce converts the cap to a Switch turns budget at the agent’s current $/turn.' : ''}</p>
      <Budgets d={d} edit={edit} busy={busy} run={run} />
      {msg && <p role="alert" className="mt-2 text-[12.5px] font-bold text-[#C8303A]">{msg}</p>}
      {!edit && <p className={note}>{d.source === 'demo' ? 'Demo: read-only.' : 'Only the host owner can change caps and budgets.'}</p>}
    </>
  );
}

const METRICS = ['turns', 'messages', 'output_tokens', 'input_tokens', 'cache_read_tokens', 'cache_write_tokens'];
function Budgets({ d, edit, busy, run }: { d: Roi; edit: boolean; busy: string; run: (l: string, f: () => Promise<unknown>) => void }) {
  const on = !!d.budgetsEnabled;
  const [form, setForm] = useState({ agent: '', metric: 'turns', amount_limit: '', period_hours: '24' });
  return (
    <>
      <h3 className="sw-h">Switch budgets <span className="normal-case tracking-normal">· enforced</span></h3>
      {d.budgets.length === 0 && <p className="sw-empty mb-2 text-[12.5px]">{on ? 'No budgets on this Switch.' : 'None. Budgets stop an agent when reached, so editing them is off unless the office server runs with ROI_BUDGETS=on.'}</p>}
      <ul className="sw-hops mb-2">{d.budgets.map((b) => <BudgetRow key={b.id} b={b} edit={edit && on} busy={busy} run={run} />)}</ul>
      {edit && on && (
        <form className="roi-form" onSubmit={(e) => (e.preventDefault(), run('budget', () => write('POST', 'budgets', { agent: form.agent, metric: form.metric, amount_limit: Number(form.amount_limit), period_hours: Number(form.period_hours) })))}>
          <select className="ao-input" aria-label="Agent" value={form.agent} onChange={(e) => setForm({ ...form, agent: e.target.value })} required>
            <option value="">Agent…</option>
            {(d.spend?.agents ?? []).map((a) => <option key={a.agent} value={a.agent}>{name(a.agent)}</option>)}
          </select>
          <select className="ao-input" aria-label="Metric" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>{METRICS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}</select>
          <input className="ao-input" aria-label="Limit" type="number" min="1" step="1" placeholder="limit" value={form.amount_limit} onChange={(e) => setForm({ ...form, amount_limit: e.target.value })} required />
          <input className="ao-input" aria-label="Period in hours" type="number" min="1" max="8784" step="1" value={form.period_hours} onChange={(e) => setForm({ ...form, period_hours: e.target.value })} required />
          <button type="submit" className="ao-btn" disabled={!!busy}>{busy === 'budget' ? 'Adding…' : 'Add budget'}</button>
        </form>
      )}
      <p className={note}>A reached budget refuses the agent’s messages until the period turns over, and usage is counted after a turn ends, so it can overshoot by one turn. A switch-core feature, not in the hosted docs.</p>
    </>
  );
}

function BudgetRow({ b, edit, busy, run }: { b: Budget; edit: boolean; busy: string; run: (l: string, f: () => Promise<unknown>) => void }) {
  const [limit, setLimit] = useState(String(b.amount_limit));
  const [period, setPeriod] = useState(String(b.period_hours));
  const dirty = limit !== String(b.amount_limit) || period !== String(b.period_hours);
  return (
    <li className="text-[13px] font-bold">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{b.agent_name ? name(b.agent_name) : 'Whole workspace'} · {b.metric.replace(/_/g, ' ')}{b.model ? ` · ${b.model}` : ''}</span>
        <span className={`tabular-nums ${b.exhausted ? 'text-[#C8303A]' : 'text-[var(--muted)]'}`}>{b.spent.toLocaleString()} used{b.exhausted ? ' · reached' : ''}</span>
      </div>
      {edit ? (
        <div className="roi-form mt-1.5">
          <input className="ao-input" aria-label="Limit" type="number" min="1" step="1" value={limit} onChange={(e) => setLimit(e.target.value)} />
          <input className="ao-input" aria-label="Period in hours" type="number" min="1" max="8784" step="1" value={period} onChange={(e) => setPeriod(e.target.value)} />
          <button type="button" className="ao-btn" disabled={!dirty || !!busy} onClick={() => run(b.id, () => write('PUT', `budgets/${encodeURIComponent(b.id)}`, { amount_limit: Number(limit), period_hours: Number(period) }))}>Save</button>
          <button type="button" className="roi-icon" aria-label="Delete budget" disabled={!!busy} onClick={() => run(b.id, () => write('DELETE', `budgets/${encodeURIComponent(b.id)}`))}><Trash2 className="size-3.5" /></button>
        </div>
      ) : <div className="text-[12px] text-[var(--muted)] tabular-nums">limit {b.amount_limit.toLocaleString()} per {b.period_hours} h</div>}
    </li>
  );
}

function TrustCard({ t }: { t: Trust }) {
  const on = t.switchTrust === 'enabled', otel = t.telemetry === 'on';
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
      <div className={`mb-3 flex items-start gap-2 rounded-xl border-2 px-3 py-2 text-[13px] font-bold ${otel ? 'border-[#9ad9b8] bg-[#e6f6ee]' : 'border-[#e8dccb] bg-white'}`}>
        <Radio className={`mt-0.5 size-4 shrink-0 ${otel ? 'text-[#0F7A4F]' : 'text-[var(--muted)]'}`} strokeWidth={2.5} />
        <span>
          <b className="font-black">Telemetry to Switch Trust: {otel ? 'on' : 'off'}</b>
          <span className="block text-[12px] text-[var(--muted)]">
            {otel ? `Claude Code sends usage (no prompts or responses) to ${t.endpointHost} as “${t.agentName ?? 'kratos-team'}”: sessions, turns and cost show up in Trust’s Agents page.${t.contentLogged ? ' Content logging is ON.' : ''}`
              : 'Opt-in: set TRUST_OTLP_ENDPOINT and TRUST_API_KEY, then run scripts/switch-sync-agents.sh. Usage only, never content.'}
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
        <li className="flex items-start gap-2 text-[13px] font-bold">
          <span className="mt-0.5 shrink-0 text-[#1A6FB5]"><Activity className="size-4" strokeWidth={2.5} /></span>
          <span className="min-w-0"><b className="font-black">Trust MCP, for the developer</b><span className="block text-[12px] text-[var(--muted)]">switch-trust-mcp in your own Claude Code (a Viewer key) reads sessions, ROI analyses and guardrail outcomes. Not given to the team.</span></span>
        </li>
      </ul>
      <p className={`${note} flex items-center gap-1`}><Gauge className="size-3.5" /> Lockdown, approval and the SAFETY block run here, with or without a Trust account.</p>
    </>
  );
}
