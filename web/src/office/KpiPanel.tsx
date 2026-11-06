// The Data Wall's numbers (GET /api/kpis): shown when you walk up to the wall or click it. Compact on phones.
import { useEffect, useState } from 'react';
import { BarChart3, IndianRupee, MessageCircle, X } from 'lucide-react';
import { Modal } from './Hud';
import type { Kpis } from '../shared/types';
import { apiScope, getKpis } from './api';
import { count, inr } from './inr';

const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`);
const roas = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}×`);
const day = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

let cache: { key: string; data: Kpis; mock: boolean } | null = null; // per workspace (or the demo)

/** GET /api/kpis, cached per workspace: the last answer at once, then the fresh one. */
export function useKpis() {
  const key = apiScope();
  const [k, setK] = useState(cache?.key === key ? cache : null);
  useEffect(() => {
    let live = true;
    void getKpis().then((r) => {
      cache = { key, data: r.data, mock: r.mock };
      if (live) setK(cache);
    }, () => {});
    return () => void (live = false);
  }, [key]);
  return k;
}

export function KpiPanel({ onClose, style }: { onClose: () => void; style?: React.CSSProperties }) {
  const k = useKpis();
  const d = k?.data;
  const tiles: [string, string, string?][] = d
    ? [
        ['Net revenue', inr(d.net_revenue)],
        ['Orders', count(d.orders), `AOV ${inr(d.aov)}`],
        ['RTO', pct(d.rto_pct), `Returns ${pct(d.return_pct)}`],
        ['ROAS', roas(d.blended_roas), `Meta ${roas(d.meta_roas)}`], // blended: all ad spend
        ['EBITDA', inr(d.ebitda_last_month), 'last month'],
      ]
    : [];
  const top = d ? Math.max(1, ...d.by_channel.map((c) => c.net_revenue)) : 1;
  return (
    <section className="ao-panel ao-kpi" style={style} aria-label="Data Wall numbers">
      <header className="flex items-center gap-2 border-b-[3px] border-[var(--ink)] bg-[var(--paper-2)] px-3 py-2">
        <BarChart3 className="size-[18px] text-[#2563EB]" strokeWidth={2.5} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[14.5px] font-black">Data Wall</div>
          <div className="truncate text-[11.5px] font-bold text-[var(--muted)]">
            {d?.window.from ? `${day(d.window.from)} – ${day(d.window.to)}` : 'Loading…'}{k?.mock ? ' · sample data' : ''}
          </div>
        </div>
        <button type="button" className="ao-x" aria-label="Close the numbers" onClick={onClose}><X /></button>
      </header>
      {d && (
        <div className="grid gap-3 p-3">
          <div className="grid grid-cols-3 gap-1.5">
            {tiles.map(([label, value, sub], i) => (
              <div key={label} className={`rounded-xl border-2 border-[var(--ink)]/15 bg-white px-2 py-1.5 ${i === 0 ? 'col-span-2' : ''}`}>
                <div className="truncate text-[10.5px] font-extrabold tracking-wide text-[var(--muted)] uppercase">{label}</div>
                <div className="text-[18px] leading-tight font-black tabular-nums max-[760px]:text-[14px]">{value}</div>
                {sub && <div className="truncate text-[10.5px] font-bold text-[var(--muted)] max-[760px]:hidden">{sub}</div>}
              </div>
            ))}
          </div>
          <div className="max-[760px]:hidden">
            <div className="mb-1 text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">By channel</div>
            <ul className="grid gap-1">
              {d.by_channel.slice(0, 5).map((c) => (
                <li key={c.channel} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[12.5px] font-bold">
                  <span className="truncate">{c.channel}</span>
                  <span className="tabular-nums">{inr(c.net_revenue)} <span className="font-semibold text-[var(--muted)]">· RTO {pct(c.rto_pct)}</span></span>
                  <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[var(--ink)]/10">
                    <span className="block h-full rounded-full bg-[#2563EB]" style={{ width: `${(100 * c.net_revenue) / top}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="max-[760px]:hidden">
            <div className="mb-1 text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">Top SKUs</div>
            <ol className="grid gap-0.5">
              {d.top_skus.slice(0, 3).map((s, i) => (
                <li key={s.sku} className="flex items-baseline gap-2 text-[12.5px] font-bold">
                  <span className="w-3 text-[var(--muted)]">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="tabular-nums text-[var(--muted)]">{count(s.units)} units</span>
                  <span className="w-14 text-right tabular-nums">{inr(s.net_revenue)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

/** The Finance Cabin's ledger screen (E there): the P&L headline from the same /api/kpis numbers. */
export function LedgerCard({ onAsk, onClose }: { onAsk?: () => void; onClose: () => void }) {
  const k = useKpis();
  const d = k?.data;
  const e = d?.ebitda_last_month ?? null;
  return (
    <Modal className="w-[min(400px,100%)]" onClose={onClose} label="The ledger" title={
      <span className="flex items-center gap-2"><IndianRupee className="size-5 text-[#0F766E]" strokeWidth={2.5} /> The ledger <span className="text-[13px] font-bold text-[var(--muted)]">· Finance Cabin</span></span>
    }>
      <div className="ao-body grid gap-3 !pt-3">
        {!d ? <p className="m-0 font-bold text-[var(--muted)]">Opening the books…</p> : (
          <>
            <div className={`rounded-2xl border-[3px] border-[var(--ink)] px-3 py-2.5 ${e != null && e < 0 ? 'bg-[#fde8e8]' : 'bg-[#e6f6ee]'}`}>
              <div className="text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">EBITDA · last month</div>
              <div className={`text-[26px] leading-tight font-black tabular-nums ${e != null && e < 0 ? 'text-[#C8303A]' : 'text-[#0F7A4F]'}`}>
                {e == null ? '—' : e < 0 ? `Loss of ${inr(-e)}` : inr(e)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {([['Net revenue', inr(d.net_revenue)], ['Orders', count(d.orders)], ['Blended ROAS', roas(d.blended_roas)]] as const).map(([l, v]) => (
                <div key={l} className="rounded-xl border-2 border-[var(--ink)]/15 bg-white px-2 py-1.5">
                  <div className="truncate text-[10.5px] font-extrabold tracking-wide text-[var(--muted)] uppercase">{l}</div>
                  <div className="text-[16px] leading-tight font-black tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            <div className="text-[12px] font-bold text-[var(--muted)]">
              {d.window.from ? `${day(d.window.from)} – ${day(d.window.to)}` : ''}{k?.mock ? ' · sample data' : ''}
            </div>
            {onAsk && <button type="button" className="ao-btn tg !justify-center" onClick={onAsk}><MessageCircle />Ask Finance about it</button>}
          </>
        )}
      </div>
    </Modal>
  );
}
