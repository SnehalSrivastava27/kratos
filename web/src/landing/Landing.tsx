import { MotionConfig } from 'framer-motion';
import { Link } from 'react-router-dom';
import './landing.css';
import Hero from './Hero';
import Channels from './Channels';
import TeamChat from './TeamChat';
import Teammates from './Teammates';
import Thinking from './Thinking';
import FinanceMoment from './FinanceMoment';
import HowItWorks from './HowItWorks';
import FinalCta from './FinalCta';

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
        <TeamChat />
        <Teammates />
        <Thinking />
        <FinanceMoment />
        <HowItWorks />
        <FinalCta />
      </main>
    </MotionConfig>
  );
}
