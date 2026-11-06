import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Code } from 'lucide-react';

// TODO(orchestrator): set the real repo URL.
const REPO_URL = 'https://github.com/';

export default function FinalCta() {
  return (
    <>
      <section className="section container">
        <motion.div
          className="final"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <h2>Meet your new teammates.</h2>
          <p className="section-sub">Watch seven agents plan Kesar &amp; Co.’s festive sale, live.</p>
          <div className="cta-row">
            <Link to="/office" className="btn btn-primary">Open the office <ArrowRight size={18} /></Link>
            <a href={REPO_URL} className="btn btn-ghost" target="_blank" rel="noreferrer"><Code size={18} /> View on GitHub</a>
          </div>
        </motion.div>
      </section>
      <footer className="footer">Powered by <b>Switch</b> · Built for Flip the Switch 2026</footer>
    </>
  );
}
