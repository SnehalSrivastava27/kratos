import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AGENT_IDS, PEOPLE, TG_GROUP, TOPICS, body, clock, saleDemo } from './data';
import { Container, EASE, MateIcon } from './ui';
import { BrandMarquee } from './Brands';

const HeroOffice = lazy(() => import('./HeroOffice'));

const enter = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: EASE, delay },
});

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-black/[0.07]">
      <Container className="grid gap-8 pt-14 pb-12 md:grid-cols-2 md:gap-x-0 md:gap-y-8 md:pt-16 md:pb-12 lg:pt-20">
        <div className="md:col-span-2">
          <motion.h1 {...enter(0)} className="max-w-[13ch] text-[44px] leading-[1.02] font-medium tracking-[-0.035em] md:max-w-[22ch] md:text-[64px]">
            Your brand never sleeps.<br className="hidden md:block" /> <span className="text-dim">Neither do your teammates.</span>
          </motion.h1>
        </div>
        <div>
          <motion.p {...enter(0.08)} className="max-w-[46ch] text-[17px] leading-[1.55] text-neutral-500 md:text-lg [&_b]:font-normal [&_b]:text-foreground">
            <b>An AI teammate for every department</b> of your D2C brand. They plan together in the <b>Telegram</b> you already use, one topic per department, and a live office shows who’s doing what.
          </motion.p>
          <motion.div {...enter(0.16)} className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" className="h-11 rounded-full px-5 text-[15px]" render={<Link to="/office" />} nativeButton={false}>
              Watch them plan a sale <ArrowRight data-icon="inline-end" />
            </Button>
            <Button size="lg" variant="outline" className="h-11 rounded-full bg-transparent px-5 text-[15px]" render={<a href="#how" />} nativeButton={false}>
              How it works
            </Button>
          </motion.div>
        </div>
        <motion.div {...enter(0.24)} className="flex min-w-0 flex-col justify-end gap-5 md:pl-8">
          <p className="text-[17px] text-neutral-500 md:text-lg">
            Sells everywhere you sell: <u className="decoration-neutral-300 underline-offset-4 text-foreground">D2C</u>, <u className="decoration-neutral-300 underline-offset-4 text-foreground">marketplaces</u> &amp; <u className="decoration-neutral-300 underline-offset-4 text-foreground">quick commerce</u>.
          </p>
          <BrandMarquee />
        </motion.div>
      </Container>
      <Stage />
    </section>
  );
}

const WIDE = '(min-width: 768px)';
function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * One focal stage: a crisp poster of the office, crossfading to the live 3D office once it has drawn.
 * Phones and reduced motion keep the poster (no WebGL). One overlay: the Telegram notification stack.
 */
function Stage() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.15 });
  const reduce = useReducedMotion();
  const wide = useWide();
  const [mount, setMount] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (inView && wide && !reduce) setMount(true); }, [inView, wide, reduce]);

  return (
    <Container className="pb-12 md:pb-28">
      <motion.div ref={ref} {...enter(0.32)} className="relative">
        <div data-stage className="relative aspect-[4/3] overflow-hidden rounded-[20px] border border-black/[0.08] bg-[#FDF3E3] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_40px_80px_-40px_rgba(60,40,0,0.28)] sm:aspect-[16/10] md:rounded-[24px] lg:aspect-[16/9]">
          <img
            src="/hero/office-poster.webp"
            srcSet="/hero/office-poster.webp 1x, /hero/office-poster@2x.webp 2x"
            alt=""
            className="absolute inset-0 size-full object-cover"
            fetchPriority="high"
          />
          {mount && (
            <div className={cn('absolute inset-0 transition-opacity duration-1000 ease-out', ready ? 'opacity-100' : 'opacity-0')}>
              <Fallback>
                <Suspense fallback={null}>
                  <HeroOffice onReady={() => setReady(true)} />
                </Suspense>
              </Fallback>
            </div>
          )}
          {/* Sits over the canvas so the scene never eats page scroll; a click opens the full office. */}
          <Link to="/office" className="absolute inset-0 z-10 rounded-[inherit] focus-visible:ring-3 focus-visible:ring-saffron/40 focus-visible:outline-none" aria-label={`Open the live office of ${TG_GROUP}`} />
          <Presence />
        </div>
        <Notifications run={inView && !reduce} />
      </motion.div>
    </Container>
  );
}

/** If WebGL or the 3D office fails, the poster simply stays. */
class Fallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

function Presence() {
  return (
    <div className="pointer-events-none absolute top-3 right-3 z-20 hidden items-center gap-2 rounded-full border border-black/[0.06] bg-white/90 py-1 pr-3 pl-1 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.15)] backdrop-blur sm:flex md:top-4 md:right-4">
      <span className="flex -space-x-1.5">
        {AGENT_IDS.map((id) => <span key={id} className="rounded-full bg-white ring-2 ring-white"><MateIcon id={id} size="sm" className="rounded-full" /></span>)}
      </span>
      <span className="flex items-center gap-1.5 text-[12px] text-neutral-600">
        <span className="size-1.5 rounded-full bg-emerald-500" />{AGENT_IDS.length} teammates · online
      </span>
    </div>
  );
}

// Story beats from demo/feeds/sale-demo.json: ask → forecast → ads → stock → final plan.
const BEATS = ['evt-001', 'evt-007', 'evt-017', 'evt-022', 'evt-029'].map((id) => saleDemo.find((e) => e.id === id)!);
const BEAT_MS = 3500;

/** "Live" Telegram notifications from the Kesar HQ group, stacked; the newest slides in on top. */
function Notifications({ run }: { run: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => setI((n) => (n + 1) % BEATS.length), BEAT_MS);
    return () => clearInterval(id);
  }, [run]);
  const e = BEATS[i];
  const [title, line] = body(e.text).split('\n');
  const topic = TOPICS.find((t) => t.id === e.room)!.label;

  return (
    <div className="relative z-20 mt-5 h-[104px] md:absolute md:-bottom-12 md:left-8 md:mt-0 md:w-[372px] lg:left-10" aria-live="polite">
      {/* two cards peeking out underneath: a stack, not a single toast */}
      <div aria-hidden="true" className="absolute inset-x-6 top-4 h-[92px] rounded-2xl border border-black/[0.05] bg-white/70 shadow-sm" />
      <div aria-hidden="true" className="absolute inset-x-3 top-2 h-[96px] rounded-2xl border border-black/[0.06] bg-white/85 shadow-sm" />
      <AnimatePresence initial={false}>
        <motion.div
          key={e.id}
          initial={{ opacity: 0, y: -14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="absolute inset-x-0 top-0 flex h-[96px] gap-3 rounded-2xl border border-black/[0.07] bg-white p-3.5 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.28)]"
        >
          <MateIcon id={e.speaker} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1.5 text-[12px] text-neutral-400">
              <b className="truncate text-[13.5px] font-semibold text-foreground">{PEOPLE[e.speaker].name}</b>
              <span className="truncate">{TG_GROUP} › {topic}</span>
              <span className="ml-auto shrink-0 tabular-nums">{clock(e.t)}</span>
            </p>
            <p className="mt-1 truncate text-[13.5px] font-medium text-neutral-800">{title}</p>
            <p className="truncate text-[13px] text-neutral-500">{line}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
