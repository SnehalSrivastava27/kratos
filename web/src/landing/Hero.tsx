import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Images, LayoutGrid, MessagesSquare, Paperclip, Search, ShoppingBag, Smile, Sparkles, Store, Megaphone, Zap, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AGENT_IDS, DEPT, FEED, PEOPLE, TG_GROUP, TOPICS, statusAt, useFeedClock, type Status } from './data';
import { TG_WALL, TgMessages, TopicIcon, TopicRail, tgSubtitle } from './Telegram';
import Office2D from './Office2D';
import { Container, EASE, LiveDot, Window } from './ui';

const HeroOffice = lazy(() => import('./HeroOffice'));

const enter = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: EASE, delay },
});

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-black/[0.07]">
      <Container className="grid gap-10 pt-16 pb-12 md:grid-cols-2 md:gap-0 md:pt-28 md:pb-16">
        <div className="md:col-span-2">
          <motion.h1 {...enter(0)} className="max-w-[15ch] text-[44px] leading-[1.02] font-medium tracking-[-0.035em] text-balance md:text-[68px]">
            Your brand never sleeps. <span className="text-dim">Neither do your teammates.</span>
          </motion.h1>
        </div>
        <div>
          <motion.p {...enter(0.08)} className="max-w-[46ch] text-[17px] leading-[1.55] text-neutral-500 md:text-lg [&_b]:font-normal [&_b]:text-foreground">
            <b>An AI teammate for every department</b> of your D2C brand. They plan together in the <b>Telegram groups</b> you already use, and a live office shows who’s doing what.
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
        <motion.div {...enter(0.24)} className="flex min-w-0 flex-col justify-end gap-5">
          <p className="text-[17px] text-neutral-500 md:text-lg">
            Sells everywhere you sell: <u className="decoration-neutral-300 underline-offset-4 text-foreground">D2C</u>, <u className="decoration-neutral-300 underline-offset-4 text-foreground">marketplaces</u> &amp; <u className="decoration-neutral-300 underline-offset-4 text-foreground">quick commerce</u>.
          </p>
          <Marquee />
        </motion.div>
      </Container>
      <Stage />
    </section>
  );
}

// Names as text, never logos (PLAN §9.1). Category glyphs are generic.
const CHANNELS = [
  ['Shopify', Store], ['Amazon', ShoppingBag], ['Flipkart', ShoppingBag], ['Myntra', ShoppingBag], ['Nykaa', Sparkles], ['Purplle', Sparkles],
  ['Blinkit', Zap], ['Zepto', Zap], ['Swiggy Instamart', Zap], ['Meta Ads', Megaphone], ['Instagram', Megaphone], ['YouTube', Megaphone],
] as const;

function Marquee() {
  const row = CHANNELS.map(([name, Icon]) => (
    <span key={name} className="inline-flex shrink-0 items-center gap-2 pr-10 text-[19px] font-semibold tracking-tight whitespace-nowrap text-neutral-400">
      <Icon className="size-4 text-neutral-300" strokeWidth={2} />{name}
    </span>
  ));
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]" aria-label="Sales channels: Shopify, Amazon, Flipkart, Myntra, Nykaa, Purplle, Blinkit, Zepto, Swiggy Instamart, Meta Ads, Instagram, YouTube">
      <div className="flex w-max animate-marquee motion-reduce:animate-none hover:[animation-play-state:paused]" aria-hidden="true">{row}{row}</div>
    </div>
  );
}

const SMALL = '(max-width: 767px)';
function useSmall() {
  const [small, setSmall] = useState(() => window.matchMedia(SMALL).matches);
  useEffect(() => {
    const m = window.matchMedia(SMALL);
    const on = () => setSmall(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return small;
}

/** Product composition: teammates sidebar · live office · Telegram War Room. Bleeds past the frame. */
function Stage() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.1 });
  const reduce = useReducedMotion();
  const ms = useFeedClock(inView && !reduce);
  const small = useSmall();

  return (
    <motion.div ref={ref} {...enter(0.32)} className="relative mx-auto w-full max-w-[1392px] px-4 pb-0 md:px-6">
      <div className="relative md:h-[600px] xl:h-[620px]">
        <Sidebar ms={ms} className="absolute top-10 left-0 hidden h-[560px] w-[288px] xl:flex" />
        <TgDesktop ms={ms} className="absolute top-10 right-0 hidden h-[560px] w-[320px] xl:flex" />
        <Window
          className="relative z-10 mx-auto h-[440px] w-full max-w-[720px] md:h-[560px] xl:h-[560px]"
          title="Kesar HQ · live office"
          right={<span className="inline-flex items-center gap-1.5 rounded-full bg-saffron/10 px-2 py-0.5 text-[11px] font-medium text-saffron-ink"><LiveDot />Replaying the festive sale</span>}
        >
          {small ? <Office2D run={inView && !reduce} /> : (
            <Suspense fallback={<OfficeSkeleton />}>
              <HeroOffice />
            </Suspense>
          )}
          {/* Keeps OrbitControls from eating page scroll; click opens the full office. */}
          <Link to="/office" className="group absolute inset-0 z-10" aria-label="Open the live office">
            <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
              Open the full office <ArrowUpRight className="size-3.5" />
            </span>
          </Link>
        </Window>
      </div>
      {/* fade the flanks into the next row */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden h-24 bg-gradient-to-b from-transparent to-canvas xl:block" />
    </motion.div>
  );
}

function OfficeSkeleton() {
  return (
    <div className="grid h-full place-items-center bg-[#FFF6E5]">
      <div className="grid w-2/3 grid-cols-3 gap-2">{Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-16 bg-black/[0.04]" />)}</div>
    </div>
  );
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  idle: { label: 'Idle', cls: 'text-neutral-400' },
  assigned: { label: 'Assigned', cls: 'text-neutral-500' },
  working: { label: 'Working', cls: 'text-saffron-ink' },
  done: { label: 'Done', cls: 'text-emerald-700' },
  pushback: { label: 'Pushed back', cls: 'text-red-600' },
};

function Sidebar({ ms, className }: { ms: number; className?: string }) {
  return (
    <aside aria-hidden="true" className={cn('flex-col overflow-hidden rounded-2xl border border-black/[0.07] bg-white/80 p-3 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.18)] backdrop-blur', className)}>
      <div className="flex items-center justify-between px-1.5 pb-3">
        <span className="inline-flex items-center gap-1 text-[15px] font-semibold tracking-tight">Kesar HQ <ChevronDown className="size-3.5 text-neutral-400" /></span>
        <Search className="size-4 text-neutral-400" />
      </div>
      {[
        [MessagesSquare, 'Topics', String(TOPICS.length), true],
        [LayoutGrid, 'Threads', String(AGENT_IDS.length), false],
        [Images, 'Gallery', ms >= 23000 ? '3' : '0', false],
      ].map(([Icon, label, n, on]) => {
        const I = Icon as typeof Search;
        return (
          <div key={label as string} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]', on ? 'bg-neutral-100 font-medium text-foreground' : 'text-neutral-500')}>
            <I className="size-3.5" />{label as string}<span className="ml-auto text-[11px] text-neutral-400 tabular-nums">{n as string}</span>
          </div>
        );
      })}
      <p className="mt-4 mb-1.5 px-2 text-[11px] font-medium text-neutral-400">Teammates</p>
      <div className="flex flex-col gap-0.5">
        {AGENT_IDS.map((id) => {
          const p = PEOPLE[id];
          const { Icon, short } = DEPT[id];
          const s = statusAt(id, ms);
          return (
            <div key={id} className={cn('flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors duration-500', s.status === 'working' && 'bg-saffron/[0.07]')}>
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md" style={{ background: `${p.color}14`, color: p.color }}><Icon className="size-3.5" strokeWidth={1.8} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-foreground">
                  {short}
                  <span className={cn('inline-flex items-center gap-1 text-[11px] font-normal', STATUS[s.status].cls)}>
                    {s.status === 'working' ? <LiveDot /> : s.status === 'done' ? <Check className="size-3" /> : null}
                    {STATUS[s.status].label}
                  </span>
                </span>
                <span className="block truncate text-[11.5px] text-neutral-400">{s.line ?? 'Waiting for the captain'}</span>
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function TgDesktop({ ms, className }: { ms: number; className?: string }) {
  const seen = FEED.filter((e) => e.t <= ms);
  const room = seen[seen.length - 1]?.room ?? 'war_room';
  const topic = TOPICS.find((t) => t.id === room)!;
  const shown = seen.filter((e) => e.room === room);
  const sub = tgSubtitle(shown);
  return (
    <div aria-hidden="true" className={cn('flex-col overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.18)]', className)}>
      <div className="flex items-center gap-2.5 border-b border-black/[0.06] px-3 py-2.5">
        <TopicIcon emoji={topic.emoji} on className="size-9" />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold">{topic.label}</p>
          <p className={cn('truncate text-[11.5px]', sub.endsWith('…') ? 'text-tg' : 'text-neutral-400')}>{TG_GROUP} · {sub}</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <TopicRail active={room} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className={cn('flex flex-1 flex-col justify-end overflow-hidden p-2.5', TG_WALL)}>
            <TgMessages events={shown.slice(-5)} compact />
          </div>
          <div className="flex items-center gap-2 border-t border-black/[0.06] px-3 py-2.5 text-[12px] text-neutral-400">
            <Paperclip className="size-4" /><span className="flex-1 truncate">Message {topic.label}</span><Smile className="size-4" /><Mic className="size-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
