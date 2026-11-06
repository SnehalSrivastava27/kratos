import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { CircleCheck, LoaderCircle } from 'lucide-react';

const CARDS = [
  {
    who: '📦 Ops Lead', ask: 'Make sure every region gets 1–2 day delivery during the sale.',
    steps: ['Pulled the sale forecast', 'Split demand by region', 'Delhi short on Vitamin C Serum (needs 320, has 250)', 'Transfer 120 units from Mumbai by 9 Nov'],
    result: '✅ 1–2 day delivery everywhere',
  },
  {
    who: '📣 Ads Lead', ask: 'Split ₹3L of Meta spend for the festive sale.',
    steps: ['Read last campaigns’ ROAS', 'Retargeting leads at 4.8× ROAS', 'Cut broad prospecting (1.6×)', 'Shift budget to Retargeting + Advantage+'],
    result: '✅ Plan ready, blended ROAS up',
  },
  {
    who: '📊 Analyst', ask: 'Forecast units per SKU for 30% off, 5 days.',
    steps: ['Matched Summer Sale 2026 (25% off)', 'Applied 4× uplift, 6× for the Glow Kit', 'Sunscreen 1,400 · Serum 800 · Moisturiser 600', 'Set live-sale pace alerts'],
    result: '✅ ~3,340 units, revenue ≈ ₹20.4L',
  },
];

function Card({ c, i }: { c: (typeof CARDS)[number]; i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setDone(c.steps.length); return; }
    const id = setInterval(() => setDone((d) => (d >= c.steps.length ? d : d + 1)), 700);
    return () => clearInterval(id);
  }, [inView, reduce, c.steps.length]);

  return (
    <motion.div
      ref={ref}
      className="think"
      initial={{ opacity: 0, rotateY: -70 }}
      whileInView={{ opacity: 1, rotateY: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.12 }}
    >
      <div className="think-who">{c.who}</div>
      <div className="think-ask">{c.ask}</div>
      <div className="think-label">{done < c.steps.length ? 'Thinking…' : 'Done'}</div>
      <ul className="steps">
        {c.steps.map((s, j) => (
          <li key={s} className={j < done ? 'on' : ''}>
            {j < done ? <CircleCheck size={16} /> : <LoaderCircle size={16} />}
            {s}
          </li>
        ))}
      </ul>
      <motion.div
        className="think-result"
        initial={{ opacity: 0 }}
        animate={{ opacity: done >= c.steps.length ? 1 : 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {c.result}
      </motion.div>
    </motion.div>
  );
}

export default function Thinking() {
  return (
    <section className="section container">
      <h2 className="section-title">Watch them think.</h2>
      <p className="section-sub">Every request becomes a checklist you can follow, step by step, until the result lands.</p>
      <div className="cards">
        {CARDS.map((c, i) => <Card key={c.who} c={c} i={i} />)}
      </div>
    </section>
  );
}
