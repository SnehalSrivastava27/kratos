import { MotionConfig } from 'framer-motion';
import { Link } from 'react-router-dom';
import './landing.css';
import Hero from './Hero';
import Channels from './Channels';

export default function Landing() {
  return (
    // reducedMotion="user": Framer drops transform animations when the OS asks for less motion.
    <MotionConfig reducedMotion="user">
      <main className="landing">
        <header className="nav container">
          <Link to="/" className="brand"><span className="brand-dot" /> D2C Agent HQ</Link>
          <Link to="/office" className="btn btn-primary btn-sm">Open the office</Link>
        </header>
        <Hero />
        <Channels />
      </main>
    </MotionConfig>
  );
}
