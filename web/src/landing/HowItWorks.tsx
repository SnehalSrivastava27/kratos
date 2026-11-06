import { useRef } from 'react';
import { motion, useScroll, useReducedMotion } from 'framer-motion';
import { Send, Bot, MessageCircle, Monitor } from 'lucide-react';

const STEPS = [
  { Icon: MessageCircle, title: 'Telegram', text: 'The founder drops a request in the War Room group.' },
  { Icon: Send, title: 'Switch', text: 'Switch routes it to the right agents with shared context.' },
  { Icon: Bot, title: 'Agents', text: 'Each teammate works in its own department group.' },
  { Icon: Monitor, title: 'Office', text: 'The live office shows who is doing what, right now.' },
];

export default function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end 50%'] });

  return (
    <section className="section container" id="how">
      <h2 className="section-title">How it works</h2>
      <p className="section-sub">Four steps from a Telegram message to a finished, approved plan.</p>
      <div className="how" ref={ref}>
        <div className="how-line">
          {/* --p drives scaleX on desktop, scaleY on mobile (see landing.css). */}
          <motion.div style={{ ['--p' as string]: reduce ? 1 : scrollYProgress }} />
        </div>
        {STEPS.map(({ Icon, title, text }, i) => (
          <motion.div
            key={title}
            className="how-step"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: i * 0.1 }}
          >
            <span className="how-icon"><Icon size={28} /></span>
            <div><h3>{title}</h3><p>{text}</p></div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
