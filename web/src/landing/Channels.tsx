import { motion } from 'framer-motion';
import { Store, ShoppingBag, Sparkles, Zap, Megaphone, type LucideIcon } from 'lucide-react';

// Shares from data/channels.csv (PLAN §7). Ads & creators drive demand, not orders.
const CHANNELS: { group: string; names: string; share: string; Icon: LucideIcon }[] = [
  { group: 'D2C website', names: 'Shopify store', share: '45% of orders', Icon: Store },
  { group: 'Marketplaces', names: 'Amazon · Flipkart · Myntra', share: '30% of orders', Icon: ShoppingBag },
  { group: 'Beauty commerce', names: 'Nykaa · Purplle', share: '15% of orders', Icon: Sparkles },
  { group: 'Quick commerce', names: 'Blinkit · Zepto · Swiggy Instamart', share: '10% of orders', Icon: Zap },
  { group: 'Ads & creators', names: 'Meta Ads · Instagram · YouTube', share: 'Drives demand', Icon: Megaphone },
];

export default function Channels() {
  return (
    <section className="section container">
      <h2 className="section-title">Sells everywhere you sell.</h2>
      <p className="section-sub">Your teammates understand every channel your orders come from.</p>
      <div className="channel-row">
        {CHANNELS.map(({ group, names, share, Icon }, i) => (
          <motion.div
            key={group}
            className="channel"
            tabIndex={0}
            initial={{ opacity: 0, x: i < 2 ? -80 : i > 2 ? 80 : 0, y: i === 2 ? 60 : 0 }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.06 }}
          >
            <span className="channel-icon"><Icon size={22} /></span>
            <strong>{group}</strong>
            <span className="channel-names">{names}</span>
            <span className="channel-share">{share}</span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
