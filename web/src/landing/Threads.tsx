import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowUp, Check, ChevronDown, Images, LayoutGrid, MessagesSquare, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AGENT_IDS, DEPT, FEED, PEOPLE, TG_GROUP, TOPICS, body, statusAt, useFeedClock, type Status } from './data';
import { TgText } from './Telegram';
import { Band, Container, LiveDot, MateIcon, Reveal } from './ui';

const STEPS = [
  { title: 'In your sidebar', text: 'Seven teammates, one lead per department plus the Captain, right next to the Telegram topics they work in.', agent: 'd2c-analyst' },
  { title: 'One persistent thread', text: 'Each teammate keeps a single thread that never closes: what it was asked, what it did, and how long it took.', agent: 'd2c-influencers' },
  { title: 'Like a colleague', text: 'Push back, approve or change the plan in plain language. They pick it up from there.', agent: 'd2c-captain' },
];
const STEP_MS = 7000;

type Item = { id: string; kind: 'ask' | 'step' | 'reply'; who: string; text: string; secs?: number };

/** A teammate's thread, built from the real sale-demo feed. */
function threadFor(id: string): Item[] {
  const evs = FEED.filter((e) => (id === 'd2c-captain' ? e.room === 'war_room' : e.speaker === id || (e.meta?.targets?.includes(id) && e.speaker !== id)));
  let lastWork = -1;
  return evs.map((e) => {
    if (e.speaker !== id) return { id: e.id, kind: 'ask', who: e.speaker, text: e.text };
    if (e.type === 'working') { lastWork = e.t; return { id: e.id, kind: 'step', who: id, text: body(e.text).split('\n')[0] }; }
    const secs = lastWork >= 0 ? Math.max(1, Math.round((e.t - lastWork) / 1000)) : undefined;
    lastWork = -1;
    return { id: e.id, kind: 'reply', who: id, text: e.text, secs };
  });
}

export default function Threads() {
  const [step, setStep] = useState(0);
  const [agent, setAgent] = useState(STEPS[0].agent);
  const [auto, setAuto] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const ms = useFeedClock(inView && !reduce);
  const items = useMemo(() => threadFor(agent), [agent]);
  const go = (i: number) => { const s = i % STEPS.length; setStep(s); setAgent(STEPS[s].agent); };
  const pick = (id: string) => { setAgent(id); setAuto(false); };
  const p = PEOPLE[agent];
  const playing = auto && inView && !reduce;

  return (
    <Band>
      <Container className="grid gap-10 py-10 md:py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
        <Reveal>
          <ol className="border-l border-black/[0.08]">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative">
                <span className="absolute top-0 -left-px h-full w-px overflow-hidden">
                  {i === step && (
                    <motion.i
                      key={`${step}-${playing}`}
                      className="block w-px bg-foreground"
                      initial={{ height: playing ? '0%' : '100%' }}
                      animate={{ height: '100%' }}
                      transition={{ duration: playing ? STEP_MS / 1000 : 0, ease: 'linear' }}
                      onAnimationComplete={() => playing && go(step + 1)}
                    />
                  )}
                </span>
                <button onClick={() => { go(i); setAuto(false); }} className="grid w-full grid-cols-[2.5rem_1fr] border-b border-black/[0.06] py-6 pr-2 pl-5 text-left last:border-b-0 focus-visible:bg-neutral-100 focus-visible:outline-none">
                  <span className="pt-1.5 text-[12px] text-neutral-400 tabular-nums">0{i + 1}</span>
                  <span>
                    <strong className={cn('block text-[22px] font-medium tracking-tight transition-colors', i === step ? 'text-foreground' : 'text-neutral-400')}>{s.title}</strong>
                    <span className={cn('mt-1.5 block max-w-[38ch] text-[15px] leading-relaxed transition-colors', i === step ? 'text-neutral-600' : 'text-neutral-400')}>{s.text}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={0.08}>
          <div ref={ref} className="flex h-[600px] overflow-hidden rounded-[20px] border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_32px_64px_-36px_rgba(0,0,0,0.22)]">
            <Sidebar ms={ms} agent={agent} lit={step === 0} onPick={pick} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-3 border-b border-black/[0.06] px-4 py-3 md:px-5">
                <MateIcon id={agent} />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{p.name}</p>
                  <p className="truncate text-[12px] text-neutral-400">{TG_GROUP} › {p.topic} topic</p>
                </div>
              </div>
              {/* phones: the teammate list collapses into a row of avatars */}
              <div className="flex shrink-0 gap-1.5 border-b border-black/[0.06] px-4 py-2 sm:hidden">
                {AGENT_IDS.map((id) => (
                  <button key={id} onClick={() => pick(id)} aria-label={PEOPLE[id].name} className={cn('rounded-[11px] p-0.5 transition', id === agent ? 'ring-1 ring-black/15' : 'opacity-60')}>
                    <MateIcon id={id} />
                  </button>
                ))}
              </div>
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div key={agent} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-4 md:p-6">
                    {items.slice(-6).map((it) => it.kind === 'ask' ? (
                      <div key={it.id} className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-neutral-100 px-3.5 py-2.5 text-[13px] leading-snug text-neutral-700">
                        <span className="mb-0.5 block text-[11px] text-neutral-400">{PEOPLE[it.who]?.name}</span><TgText text={it.text} />
                      </div>
                    ) : it.kind === 'step' ? (
                      <div key={it.id} className="flex items-center gap-2 text-[12.5px] text-neutral-400"><Check className="size-3.5" />{it.text}</div>
                    ) : (
                      <div key={it.id} className="flex gap-3">
                        <MateIcon id={it.who} size="sm" className="mt-0.5" />
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2 text-[12px]"><b className="font-medium">{PEOPLE[it.who].name}</b>{it.secs !== undefined && <span className="text-neutral-400">Finished in {it.secs}s</span>}</div>
                          <TgText text={it.text} className="mt-1 text-[13.5px] leading-[1.45] text-neutral-800" />
                        </div>
                      </div>
                    ))}
                  </motion.div>
                </AnimatePresence>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white to-transparent" />
              </div>
              <div className={cn('m-3 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] transition-colors md:m-4', step === 2 ? 'border-saffron/50 text-foreground' : 'border-black/[0.08] text-neutral-400')}>
                <span className="flex-1">{step === 2 ? <>Looks great. Ship it!<i className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-foreground" /></> : `Reply to ${p.name}…`}</span>
                <span className={cn('grid size-6 place-items-center rounded-full', step === 2 ? 'bg-foreground text-white' : 'bg-neutral-100 text-neutral-400')}><ArrowUp className="size-3.5" /></span>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </Band>
  );
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  idle: { label: 'Idle', cls: 'text-neutral-400' },
  assigned: { label: 'Assigned', cls: 'text-neutral-500' },
  working: { label: 'Working', cls: 'text-saffron-ink' },
  done: { label: 'Done', cls: 'text-emerald-700' },
  pushback: { label: 'Pushed back', cls: 'text-red-600' },
};

/** The workspace sidebar: Kesar HQ, its topics, and the teammate list with live status. */
function Sidebar({ ms, agent, lit, onPick }: { ms: number; agent: string; lit: boolean; onPick: (id: string) => void }) {
  return (
    <aside className={cn('hidden w-[272px] shrink-0 flex-col border-r border-black/[0.06] p-3 transition-colors duration-500 sm:flex', lit ? 'bg-saffron/[0.05]' : 'bg-[#FAFAF9]')}>
      <div className="flex items-center justify-between px-2 pt-1 pb-3">
        <span className="inline-flex items-center gap-1 text-[15px] font-semibold tracking-tight">{TG_GROUP} <ChevronDown className="size-3.5 text-neutral-400" /></span>
        <Search className="size-4 text-neutral-400" strokeWidth={1.75} />
      </div>
      {([[MessagesSquare, 'Topics', TOPICS.length, true], [LayoutGrid, 'Threads', AGENT_IDS.length, false], [Images, 'Gallery', ms >= 25000 ? 3 : 0, false]] as const).map(([Icon, label, n, on]) => (
        <div key={label} className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px]', on ? 'bg-black/[0.045] font-medium text-foreground' : 'text-neutral-500')}>
          <Icon className="size-4" strokeWidth={1.6} />{label}<span className="ml-auto text-[11.5px] text-neutral-400 tabular-nums">{n}</span>
        </div>
      ))}
      <p className="mt-5 mb-1.5 px-2 text-[11.5px] font-medium text-neutral-400">Teammates</p>
      <div className="flex flex-col gap-0.5">
        {AGENT_IDS.map((id) => {
          const s = statusAt(id, ms);
          return (
            <button key={id} onClick={() => onPick(id)} className={cn('flex items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors', id === agent ? 'bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]' : 'hover:bg-black/[0.03]')}>
              <MateIcon id={id} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-[13.5px] font-medium text-foreground">
                  {DEPT[id].short}
                  <span className={cn('inline-flex items-center gap-1 text-[11px] font-normal', STATUS[s.status].cls)}>
                    {s.status === 'working' ? <LiveDot /> : s.status === 'done' ? <Check className="size-3" /> : null}
                    {STATUS[s.status].label}
                  </span>
                </span>
                <span className="block truncate text-[12px] text-neutral-400">{s.line ?? 'Waiting for the captain'}</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
