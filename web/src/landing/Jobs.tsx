import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { DEPT, PEOPLE } from './data';
import { BANNERS, Banner } from './Banners';
import { Band, Container, MateIcon, Reveal } from './ui';

type Row = { label: string; value: string; pct?: number; tone?: 'pos' | 'neg' | 'muted' };
type Job = { id: string; who: string; ask: string; steps: string[]; title: string; rows: Row[]; note: string };

// Numbers: docs/PLAN.md §7 + demo/feeds/sale-demo.json. The captain's job is the Approve moment below.
const JOBS: Job[] = [
  {
    id: 'ops', who: 'd2c-ops', ask: 'No stockouts. 1–2 day delivery everywhere.',
    steps: ['Pulled the sale forecast', 'Split demand by region: North 40%, West 35%, South 25%', 'Delhi short: Vitamin C Serum 250 of 320, Glow Kit 80 of 120', 'Booked transfers from Mumbai'],
    title: 'Transfers booked · Mumbai → Delhi', note: 'Arrives in 2 days',
    rows: [{ label: 'Vitamin C Serum', value: '70 units', pct: 64 }, { label: 'Glow Kit (bundle)', value: '40 units', pct: 36 }],
  },
  {
    id: 'ads', who: 'd2c-ads', ask: 'Plan Meta spend for the festive sale. ₹3L guide.',
    steps: ['Read ROAS on the last 4 campaigns', 'Retargeting leads at 4.8×, Advantage+ at 3.4×', 'Broad prospecting at 1.6×, below target', 'Split ₹3L across the winners'],
    title: 'Meta plan · ₹3L', note: 'Broad prospecting cut (ROAS 1.6)',
    rows: [{ label: 'Advantage+ Shopping', value: '₹1.2L', pct: 40 }, { label: 'Retargeting', value: '₹0.9L', pct: 30 }, { label: 'Lookalike 1%', value: '₹0.9L', pct: 30 }, { label: 'Broad prospecting', value: 'Cut', pct: 0, tone: 'muted' }],
  },
  {
    id: 'creators', who: 'd2c-influencers', ask: 'Creators for the festive sale. ₹1.5L guide.',
    steps: ['Scanned 8 proposed creators', 'Big names cost ₹60k–₹1.2L each', 'Ranked by engagement and ROAS per ₹', 'Picked 4 under the ₹1.5L cap'],
    title: 'Shortlist · 4 creators · ₹1.18L', note: 'Engagement 5.8% to 8.0%',
    rows: [{ label: 'GlowWithAnu', value: '₹45K', pct: 38 }, { label: 'Desi Skin Desk', value: '₹30K', pct: 25 }, { label: 'Tanvi Tries', value: '₹25K', pct: 21 }, { label: 'Kavya Care', value: '₹18K', pct: 15 }],
  },
  {
    id: 'analytics', who: 'd2c-analyst', ask: 'Forecast units per SKU. 30% off, 5 days.',
    steps: ['Pulled past sales and daily run-rate', 'Matched Summer Sale 2026: 4× uplift', 'Glow Kit bundles run hotter: 6×', 'Set live-sale pace alerts'],
    title: 'Forecast · 3,340 units', note: 'Revenue ≈ ₹20.4L',
    rows: [{ label: 'Sunscreen SPF 50', value: '1,400', pct: 100 }, { label: 'Vitamin C Serum', value: '800', pct: 57 }, { label: 'Hydrating Moisturiser', value: '600', pct: 43 }, { label: 'Glow Kit', value: '300', pct: 21 }, { label: 'Kesar Face Oil', value: '240', pct: 17 }],
  },
  {
    id: 'design', who: 'd2c-design', ask: 'Sale banners for the gallery.',
    steps: ['Sketched the hero banner', 'Spotlighted the best seller', 'Built a bundle card for the Glow Kit', 'Pinned all three to the gallery'],
    title: '3 banners pinned', note: 'Live on the office Gallery Wall', rows: [],
  },
];

export default function Jobs() {
  const [id, setId] = useState(JOBS[0].id);
  const job = JOBS.find((j) => j.id === id)!;
  const p = PEOPLE[job.who];
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [done, setDone] = useState(0);

  useEffect(() => { setDone(reduce ? job.steps.length : 0); }, [id, reduce, job.steps.length]);
  useEffect(() => {
    if (!inView || reduce || done >= job.steps.length) return;
    const t = setTimeout(() => setDone((d) => d + 1), done === 0 ? 500 : 750);
    return () => clearTimeout(t);
  }, [inView, reduce, done, job.steps.length]);
  const finished = done >= job.steps.length;

  return (
    <Band>
      <Container className="py-10 md:py-16">
        <Tabs value={id} onValueChange={(v) => setId(v as string)}>
          <Reveal className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:px-0">
            <TabsList className="h-10 rounded-full bg-black/[0.04] p-1">
              {JOBS.map((j) => {
                const D = DEPT[j.who];
                return (
                  <TabsTrigger key={j.id} value={j.id} className="h-8 rounded-full px-3.5 text-[13.5px] data-active:shadow-sm">
                    <D.Icon strokeWidth={1.6} style={{ color: PEOPLE[j.who].color }} />{D.short}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Reveal>
          <Reveal delay={0.06}>
            <div ref={ref} className="mt-8 grid overflow-hidden rounded-2xl border border-black/[0.07] bg-white md:grid-cols-2">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="p-6 md:p-10">
                  <p className="text-[12px] text-neutral-400">Sale Captain → {p.name}</p>
                  <p className="mt-1.5 text-[20px] leading-snug font-medium tracking-tight text-balance">“{job.ask}”</p>
                  <p className={cn('mt-8 flex items-center gap-2 text-[13px] font-medium', finished ? 'text-emerald-700' : 'text-saffron-ink')} aria-live="polite">
                    {finished ? <CircleCheck className="size-4" /> : <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />}
                    {finished ? `Finished in ${Math.round(job.steps.length * 0.75 + 0.5)}s` : 'Thinking…'}
                  </p>
                  <ul className="mt-4 flex flex-col gap-3">
                    {job.steps.map((s, k) => (
                      <li key={s} className={cn('flex items-start gap-3 text-[15px] leading-snug transition-colors duration-300', k < done ? 'text-neutral-800' : k === done ? 'text-neutral-500' : 'text-neutral-300')}>
                        {k < done
                          ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                          : <span className={cn('mt-[3px] size-3.5 shrink-0 rounded-full border-[1.5px]', k === done ? 'border-saffron' : 'border-neutral-200')} />}
                        {s}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
              <div className="border-t border-black/[0.07] bg-neutral-50/60 p-6 md:border-t-0 md:border-l md:p-10">
                <motion.div key={id} animate={{ opacity: finished ? 1 : 0.45 }} transition={{ duration: 0.5, ease: 'easeOut' }} className="rounded-xl border border-black/[0.07] bg-white p-5 shadow-[0_12px_32px_-20px_rgba(0,0,0,0.2)] md:p-6">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="inline-flex items-center gap-2 text-neutral-500"><MateIcon id={job.who} size="sm" />{p.name}</span>
                    <span className={cn('rounded-full px-2 py-0.5 font-medium', finished ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500')}>{finished ? 'Ready' : 'Drafting…'}</span>
                  </div>
                  <h3 className="mt-3 text-[22px] font-medium tracking-tight">{job.title}</h3>
                  {job.id === 'design' && (
                    <div className="mt-5 grid grid-cols-3 gap-2">
                      {BANNERS.map((b) => <Banner key={b.id} {...b} className="ring-1 ring-black/[0.06]" />)}
                    </div>
                  )}
                  <div className="mt-5 flex flex-col gap-3.5 empty:hidden">
                    {job.rows.map((r) => (
                      <div key={r.label} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[14px]">
                        <span className={r.tone === 'muted' ? 'text-neutral-400 line-through' : 'text-neutral-600'}>{r.label}</span>
                        <b className={cn('font-medium tabular-nums', r.tone === 'neg' && 'text-red-600', r.tone === 'pos' && 'text-emerald-700', r.tone === 'muted' && 'text-neutral-400')}>{r.value}</b>
                        {r.pct !== undefined && (
                          <span className="col-span-2 h-1 overflow-hidden rounded-full bg-neutral-100">
                            <motion.i className={cn('block h-full rounded-full', r.tone === 'neg' ? 'bg-red-400' : r.tone === 'pos' ? 'bg-emerald-500' : 'bg-saffron')} initial={{ width: 0 }} animate={{ width: finished ? `${r.pct}%` : 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 border-t border-black/[0.06] pt-4 text-[13px] text-neutral-500">{job.note}</p>
                </motion.div>
              </div>
            </div>
          </Reveal>
        </Tabs>
      </Container>
    </Band>
  );
}
