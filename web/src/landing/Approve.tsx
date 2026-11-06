import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { Check, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEPT, PEOPLE, TG_GROUP } from './data';
import { BANNERS, Banner } from './Banners';
import { Band, Container, EASE, MateIcon, Reveal } from './ui';

// demo/feeds/sale-demo.json evt-028 → 031. ₹ lakh; budget.json total ₹5L.
const LINES = [
  { id: 'd2c-analyst', text: '3,340 units · revenue ≈ ₹20.4L' },
  { id: 'd2c-ads', text: 'Ads ₹3L · 3 campaigns' },
  { id: 'd2c-influencers', text: 'Creators ₹1.18L · 4 creators' },
  { id: 'd2c-ops', text: 'Mumbai → Delhi · 110 units, arrives in 2 days' },
  { id: 'd2c-design', text: '3 banners pinned to the gallery' },
];
const SPEND = [
  { label: 'Ads', v: 3, cls: 'bg-[#DB2777]' },
  { label: 'Creators', v: 1.18, cls: 'bg-[#F59E0B]' },
  { label: 'Creative', v: 0.5, cls: 'bg-[#9333EA]' },
];
const TOTAL = 4.68, BUDGET = 5;

export default function Approve() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const reduce = useReducedMotion();
  const [spent, setSpent] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'tap' | 'done'>('idle');

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setSpent(TOTAL); setPhase('done'); return; }
    const ctl = animate(0, TOTAL, { duration: 1.4, ease: 'easeOut', delay: 0.9, onUpdate: setSpent });
    const t1 = setTimeout(() => setPhase('tap'), 3000);
    const t2 = setTimeout(() => setPhase('done'), 3350);
    return () => { ctl.stop(); clearTimeout(t1); clearTimeout(t2); };
  }, [inView, reduce]);

  const captain = PEOPLE['d2c-captain'];
  return (
    <Band id="approve" className="scroll-mt-16">
      <Container className="grid md:grid-cols-2">
        <Reveal className="flex flex-col justify-start py-16 md:py-24 md:pr-16 md:pt-28">
          <p className="mb-6 flex items-center gap-2 text-[13px] text-neutral-500"><span className="size-1.5 rounded-full" style={{ background: captain.color }} />The approve moment</p>
          <blockquote className="text-[32px] leading-[1.08] font-medium tracking-[-0.03em] text-balance md:text-[44px]">
            The whole sale lands in one message. <span className="text-dim">You just tap Approve.</span>
          </blockquote>
          <p className="mt-6 max-w-[44ch] text-[17px] leading-[1.55] text-neutral-500 [&_b]:font-normal [&_b]:text-foreground">
            Forecast, ads, creators, stock and banners, <b>checked against the budget</b> and posted to the War Room topic. One tap from the founder and <b>every teammate gets to work</b>.
          </p>
        </Reveal>
        <div className="relative flex items-center border-black/[0.07] pb-16 md:border-l md:py-20 md:pl-16">
          <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="w-full rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.22)] md:p-7"
          >
            <p className="flex items-center gap-2 text-[12px] text-neutral-500">
              <MateIcon id="d2c-captain" size="sm" />
              <b className="font-medium text-foreground">{captain.name}</b> · {TG_GROUP} › War Room
            </p>
            <h3 className="mt-4 text-[22px] font-medium tracking-tight">Final plan · Festive sale</h3>
            <ul className="mt-4 flex flex-col">
              {LINES.map((l, i) => {
                const D = DEPT[l.id];
                return (
                  <motion.li
                    key={l.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.4, ease: 'easeOut', delay: 0.2 + i * 0.12 }}
                    className="flex items-center gap-3 border-b border-black/[0.05] py-2.5 text-[14px] text-neutral-700"
                  >
                    <D.Icon className="size-[18px] shrink-0" style={{ color: PEOPLE[l.id].color }} strokeWidth={1.5} />
                    <span className="w-[4.5rem] shrink-0 text-[12px] text-neutral-400">{D.short}</span>
                    {l.text}
                  </motion.li>
                );
              })}
            </ul>
            <div className="mt-3 grid max-w-[288px] grid-cols-3 gap-2">
              {BANNERS.map((b) => <Banner key={b.id} {...b} className="ring-1 ring-black/[0.06]" />)}
            </div>
            <div className="mt-5">
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-neutral-500">Marketing spend</span>
                <span className="tabular-nums"><b className="font-medium">₹{spent.toFixed(2)}L</b> <span className="text-neutral-400">of ₹{BUDGET}L</span></span>
              </div>
              <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-neutral-100">
                {SPEND.map((s, i) => {
                  const before = SPEND.slice(0, i).reduce((a, x) => a + x.v, 0);
                  const w = Math.max(0, Math.min(s.v, spent - before)) / BUDGET * 100;
                  return <i key={s.label} className={cn('block h-full', s.cls)} style={{ width: `${w}%` }} />;
                })}
              </div>
              <p className="mt-2 flex gap-4 text-[11.5px] text-neutral-400">
                {SPEND.map((s) => <span key={s.label} className="inline-flex items-center gap-1.5"><i className={cn('size-1.5 rounded-full', s.cls)} />{s.label} ₹{s.v}L</span>)}
              </p>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <motion.span
                animate={{ scale: phase === 'tap' ? 0.95 : 1 }}
                transition={{ duration: 0.15 }}
                className={cn('inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[14px] font-medium transition-colors duration-300', phase === 'done' ? 'bg-emerald-600 text-white' : 'bg-foreground text-white')}
              >
                {phase === 'done' ? <><Check className="size-4" />Approved</> : 'Approve'}
              </motion.span>
              <AnimatePresence>
                {phase === 'done' && (
                  <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="inline-flex items-center gap-1.5 text-[13.5px] text-neutral-600">
                    <PartyPopper className="size-4 text-saffron" strokeWidth={1.6} />Festive sale is a go!
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </Container>
    </Band>
  );
}
