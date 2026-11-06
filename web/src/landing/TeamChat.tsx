import { motion } from 'framer-motion';

const MSGS = [
  { who: '👑 Founder', text: 'Plan our festive sale: 30% off, 5 days, ₹5L marketing budget', me: true },
  { who: '🎯 Sale Captain', text: 'On it. Assigning Analytics, Ads, Creators, Ops and Design now.' },
  { who: '📊 Analyst', text: 'Forecast ready: ~3,340 units, revenue ≈ ₹20.4L.' },
  { who: '📦 Ops Lead', text: 'Delhi short on Vitamin C Serum. Proposing a transfer from Mumbai.' },
  { who: '💰 Finance Lead', text: 'Creators are ₹2.05L over budget. EBITDA −₹0.76L. Please revise.' },
  { who: '🎯 Sale Captain', text: 'Revised plan is in budget. EBITDA +₹1.29L. Approve?' },
];

export default function TeamChat() {
  return (
    <section className="section container split">
      <div>
        <h2>Works where your team works.</h2>
        <p className="section-sub">
          No new tool to learn. Your teammates live in the Telegram groups you already run your brand from.
        </p>
        <div className="tabs" role="list">
          <span className="tab live" role="listitem">Telegram · live</span>
          <span className="tab soon" role="listitem" aria-disabled="true">WhatsApp · coming soon</span>
        </div>
        <p className="powered">Agents connected and given shared context by <b>Switch</b>.</p>
      </div>
      <motion.div
        className="phone"
        initial={{ opacity: 0, y: 80 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="phone-head">
          <span className="avatar">🎯</span>
          <div><strong>Kesar HQ · War Room</strong><small>8 members · 7 agents</small></div>
        </div>
        <motion.div
          className="chat"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.5 }}
          transition={{ staggerChildren: 0.5, delayChildren: 0.4 }}
        >
          {MSGS.map((m, i) => (
            <motion.div
              key={i}
              className={m.me ? 'bubble me' : 'bubble'}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <b>{m.who}</b>{m.text}
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
