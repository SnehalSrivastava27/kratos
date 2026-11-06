import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

// PLAN §7 expected numbers, in ₹ lakh.
const PLAN = 1.29;
const OVER = -0.76;
const STEPS = [
  { text: 'Plan at ₹5L marketing: EBITDA\u00A0+₹1.29L', cls: '' },
  { text: 'Creators pick top 4 by reach (₹3.55L). Marketing ₹7.05L. Finance pushes back: EBITDA\u00A0−₹0.76L', cls: 'bad' },
  { text: 'Creators send a cheaper shortlist. Finance approves: EBITDA\u00A0+₹1.29L', cls: 'good' },
];

const fmt = (v: number) => `${v < 0 ? '−' : '+'}₹${Math.abs(v).toFixed(2)}L`;

export default function FinanceMoment() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(PLAN);
  const [step, setStep] = useState(reduce ? 2 : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setValue(PLAN); setStep(2); return; }
    let ctl = animate(PLAN, OVER, {
      duration: 1.4, ease: 'easeOut', delay: 0.6, onUpdate: setValue,
      onPlay: () => setStep(1),
      onComplete: () => {
        ctl = animate(OVER, PLAN, {
          duration: 1.4, ease: 'easeOut', delay: 1.2, onUpdate: setValue,
          onPlay: () => setStep(2),
        });
      },
    });
    return () => ctl.stop();
  }, [inView, reduce]);

  const bad = step === 1;
  return (
    <section className="section container">
      <div className="finance" ref={ref}>
        <div>
          <p className="eyebrow">The Finance moment</p>
          <h2 className="split-title">Nobody blows the budget.</h2>
          <p className="ebitda-label" style={{ marginTop: 24 }}>Festive sale EBITDA</p>
          <div className={`ebitda ${bad ? 'neg' : value >= 0 && step === 2 ? 'pos' : ''}`} aria-live="polite">
            {fmt(value)}
          </div>
        </div>
        <ol className="timeline">
          {STEPS.map((s, i) => (
            <li key={i} className={`${s.cls} ${i <= step ? 'on' : ''}`}>
              <span className="dot" />{s.text}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
