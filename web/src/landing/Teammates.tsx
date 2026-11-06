import { useState } from 'react';
import { motion } from 'framer-motion';

// PLAN §9.1 section D. Grid order = isometric floor layout.
const TEAM = [
  { id: 'ads', emoji: '📣', name: 'Ads', zone: 'Growth Pod', plate: 'Plans Meta campaigns, splits budget by ROAS', own: "A campaign's ROAS drops below target: drafts a fix" },
  { id: 'creators', emoji: '⭐', name: 'Creators', zone: 'Creator Studio', plate: 'Shortlists influencers, compares fees and reach', own: "A creator's engagement dips: suggests a swap" },
  { id: 'ops', emoji: '📦', name: 'Ops', zone: 'Dispatch Dock', plate: 'Places stock so every region gets 1–2 day delivery', own: 'A SKU will run out in a region: proposes a transfer' },
  { id: 'analytics', emoji: '📊', name: 'Analytics', zone: 'Data Wall', plate: 'Forecasts sales, sets live dashboard metrics', own: 'Sales pace falls behind forecast: alerts the captain' },
  { id: 'design', emoji: '🎨', name: 'Design', zone: 'Design Studio', plate: 'Makes sale banners and creatives', own: 'A new campaign starts: drafts creatives for it' },
  { id: 'finance', emoji: '💰', name: 'Finance', zone: 'Finance Cabin', plate: 'Keeps every plan in budget and EBITDA positive', own: 'Spend goes over plan: pushes back with the exact cut' },
];
const FLOOR = [
  { id: 'war', emoji: '🎯', zone: 'War Room' },
  ...TEAM,
  { id: 'founder', emoji: '👑', zone: "Founder's Desk" },
  { id: 'chai', emoji: '☕', zone: 'Chai Pantry' },
];

export default function Teammates() {
  const [active, setActive] = useState(TEAM[0].id);
  return (
    <section className="section container">
      <h2 className="section-title">Every corner of your brand has a teammate.</h2>
      <p className="section-sub">Each department gets an agent that takes work off your plate, and knows when to act on its own.</p>
      <div className="team">
        <div className="iso-wrap" aria-hidden="true">
          <div className="iso">
            {FLOOR.map((z) => (
              <div key={z.id} className={z.id === active ? 'zone active' : 'zone'}>
                {z.emoji}<span>{z.zone}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="zone-list">
          {TEAM.map((t) => (
            // Outer div: highlights the zone while the card crosses the middle of the viewport.
            <motion.div
              key={t.id}
              viewport={{ margin: '-45% 0px -45% 0px' }}
              onViewportEnter={() => setActive(t.id)}
            >
              <motion.article
                tabIndex={0}
                className={t.id === active ? 'zone-card active' : 'zone-card'}
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                onMouseEnter={() => setActive(t.id)}
                onFocus={() => setActive(t.id)}
              >
                <h3><span>{t.emoji}</span>{t.name} · <small>{t.zone}</small></h3>
                <dl>
                  <div><dt>Takes off your plate</dt><dd>{t.plate}</dd></div>
                  <div><dt>Acts on its own when</dt><dd>{t.own}</dd></div>
                </dl>
              </motion.article>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
