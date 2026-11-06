import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PEOPLE } from './data';
import { Band, Container, Reveal } from './ui';

// demo/feeds/sale-demo.json evt-026 → 027 → 029 → 031. ₹ lakh.
const PLAN = 1.29, OVER = -0.76, FINAL = 1.61;
const STEPS = [
  { tag: 'Plan', text: 'At ₹5L marketing', val: '+₹1.29L', tone: '' },
  { tag: 'Pushback', text: 'Creators pick the top 4 by reach. Marketing ₹7.05L, ₹2.05L over', val: '−₹0.76L', tone: 'neg' },
  { tag: 'Revised', text: 'Cheaper shortlist, ranked by engagement', val: '₹1.18L', tone: '' },
  { tag: 'Approved', text: 'Marketing ₹4.68L, inside the budget', val: '+₹1.61L', tone: 'pos' },
];
const fmt = (v: number) => `${v < 0 ? '−' : '+'}₹${Math.abs(v).toFixed(2)}L`;

export default function Finance() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(PLAN);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setValue(FINAL); setStep(3); return; }
    let ctl = animate(PLAN, OVER, {
      duration: 1.3, ease: 'easeOut', delay: 0.6, onUpdate: setValue, onPlay: () => setStep(1),
      onComplete: () => {
        setStep(2);
        ctl = animate(OVER, FINAL, { duration: 1.5, ease: 'easeOut', delay: 1.1, onUpdate: setValue, onComplete: () => setStep(3) });
      },
    });
    return () => ctl.stop();
  }, [inView, reduce]);

  const tone = value < 0 ? 'neg' : step === 3 ? 'pos' : '';
  return (
    <Band id="finance" className="scroll-mt-16">
      <Container className="grid md:grid-cols-2">
        <Reveal className="flex flex-col justify-center py-16 md:py-28 md:pr-16">
          <p className="mb-6 flex items-center gap-2 text-[13px] text-neutral-500"><span className="size-1.5 rounded-full" style={{ background: PEOPLE['d2c-finance'].color }} />The Finance moment</p>
          <blockquote className="text-[32px] leading-[1.1] font-medium tracking-[-0.03em] text-balance md:text-[48px]">
            Finance caught a ₹2.05L overspend <span className="text-dim">before anyone opened a spreadsheet.</span>
          </blockquote>
          <p className="mt-6 max-w-[44ch] text-[17px] leading-[1.55] text-neutral-500">
            Creators picked the biggest names. Finance ran the P&amp;L, sent back the exact cut, and approved the revised plan. No meeting needed.
          </p>
        </Reveal>
        <Reveal delay={0.08} className="relative flex items-center border-black/[0.07] py-10 md:border-l md:py-20 md:pl-16">
          <div ref={ref} className="w-full rounded-2xl border border-black/[0.07] bg-white p-6 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.2)] md:p-8">
            <p className="text-[13px] text-neutral-500">Festive sale EBITDA</p>
            <p
              aria-live="polite"
              className={cn('mt-2 text-[56px] leading-none font-medium tracking-[-0.04em] tabular-nums transition-colors duration-500 md:text-[72px]', tone === 'neg' ? 'text-red-600' : tone === 'pos' ? 'text-emerald-700' : 'text-foreground')}
            >
              {fmt(value)}
            </p>
            <ol className="mt-8 border-t border-black/[0.06]">
              {STEPS.map((s, i) => (
                <li key={s.tag} className={cn('grid grid-cols-[5.5rem_1fr_auto] items-baseline gap-3 border-b border-black/[0.06] py-3.5 text-[14px] transition-opacity duration-500 last:border-b-0', i <= step ? 'opacity-100' : 'opacity-35')}>
                  <span className={cn('text-[12px] font-medium', s.tone === 'neg' ? 'text-red-600' : s.tone === 'pos' ? 'text-emerald-700' : 'text-neutral-400')}>{s.tag}</span>
                  <span className="text-neutral-600">{s.text}</span>
                  <b className={cn('font-medium tabular-nums', s.tone === 'neg' ? 'text-red-600' : s.tone === 'pos' ? 'text-emerald-700' : 'text-foreground')}>{s.val}</b>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </Container>
    </Band>
  );
}
