import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import HeroOffice from './HeroOffice';

const up = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } };

export default function Hero() {
  return (
    <section className="hero container">
      <motion.div
        className="hero-copy"
        initial="hidden"
        animate="show"
        transition={{ staggerChildren: 0.12 }}
      >
        <motion.p className="eyebrow" variants={up}>D2C Agent HQ · for Kesar &amp; Co.</motion.p>
        <motion.h1 variants={up}>
          Your brand never sleeps. <span className="accent">Neither do your teammates.</span>
        </motion.h1>
        <motion.p className="lede" variants={up}>
          Every corner of your D2C brand gets an AI teammate. They work together in the Telegram
          groups your team already uses, and a live office shows them planning your next sale.
        </motion.p>
        <motion.div className="cta-row" variants={up}>
          <Link to="/office" className="btn btn-primary">
            Watch them plan a sale <ArrowRight size={18} />
          </Link>
          <a href="#how" className="btn btn-ghost">How it works</a>
        </motion.div>
      </motion.div>
      <motion.div
        className="window"
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
      >
        <div className="window-bar">
          <i /><i /><i />
          <span>Kesar HQ · live office</span>
        </div>
        <div className="window-body">
          <HeroOffice />
        </div>
      </motion.div>
    </section>
  );
}
