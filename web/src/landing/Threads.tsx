import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowUp, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AGENT_IDS, DEPT, FEED, PEOPLE, body } from './data';
import { Band, Container, Reveal, Window } from './ui';

const STEPS = [
  { title: 'In your sidebar', text: 'Six teammates, one per department, right next to the Telegram topics they work in.', agent: 'd2c-analyst' },
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
    if (e.speaker !== id) return { id: e.id, kind: 'ask', who: e.speaker, text: body(e.text) };
    if (e.type === 'working') { lastWork = e.t; return { id: e.id, kind: 'step', who: id, text: body(e.text) }; }
    const secs = lastWork >= 0 ? Math.max(1, Math.round((e.t - lastWork) / 1000)) : undefined;
    lastWork = -1;
    return { id: e.id, kind: 'reply', who: id, text: body(e.text), secs };
  });
}

export default function Threads() {
  const [step, setStep] = useState(0);
  const [agent, setAgent] = useState(STEPS[0].agent);
  const [auto, setAuto] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const items = useMemo(() => threadFor(agent), [agent]);
  const go = (i: number) => { const s = i % STEPS.length; setStep(s); setAgent(STEPS[s].agent); };
  const p = PEOPLE[agent];
  const playing = auto && inView && !reduce;

  return (
    <Band>
      <Container className="grid gap-10 py-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12 md:py-16 lg:gap-16">
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
          <div ref={ref}>
          <Window title="D2C Agent HQ" className="h-[540px]">
            <div className="flex h-full">
              <aside className={cn('hidden w-[184px] shrink-0 flex-col gap-0.5 border-r border-black/[0.06] bg-neutral-50/70 p-2.5 transition-shadow sm:flex', step === 0 && 'bg-saffron/[0.06]')}>
                <p className="px-2 pt-1 pb-2 text-[11px] font-medium text-neutral-400">Teammates</p>
                {AGENT_IDS.map((id) => {
                  const D = DEPT[id];
                  return (
                    <button key={id} onClick={() => { setAgent(id); setAuto(false); }} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors', id === agent ? 'bg-white font-medium text-foreground shadow-sm' : 'text-neutral-500 hover:text-foreground')}>
                      <D.Icon className="size-3.5" style={{ color: PEOPLE[id].color }} strokeWidth={1.8} />{D.short}
                    </button>
                  );
                })}
              </aside>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/[0.06] px-4 text-[13px] font-medium">
                  <span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}
                  <span className="ml-auto text-[11.5px] font-normal text-neutral-400">{p.topic} topic</span>
                </div>
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div key={agent} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-4 md:p-5">
                      {items.slice(-7).map((it) => it.kind === 'ask' ? (
                        <div key={it.id} className="self-end max-w-[85%] rounded-xl bg-neutral-100 px-3 py-2 text-[13px] leading-snug whitespace-pre-line text-neutral-700">
                          <span className="mb-0.5 block text-[11px] text-neutral-400">{PEOPLE[it.who]?.name}</span>{it.text}
                        </div>
                      ) : it.kind === 'step' ? (
                        <div key={it.id} className="flex items-center gap-2 text-[12.5px] text-neutral-400"><Check className="size-3.5" />{it.text}</div>
                      ) : (
                        <div key={it.id}>
                          <div className="flex items-baseline gap-2 text-[12px]"><b className="font-medium">{PEOPLE[it.who].name}</b>{it.secs !== undefined && <span className="text-neutral-400">Finished in {it.secs}s</span>}</div>
                          <p className="mt-1 text-[13.5px] leading-snug whitespace-pre-line text-neutral-800">{it.text}</p>
                        </div>
                      ))}
                    </motion.div>
                  </AnimatePresence>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white to-transparent" />
                </div>
                <div className={cn('m-3 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] transition-colors', step === 2 ? 'border-saffron/50 text-foreground' : 'border-black/[0.08] text-neutral-400')}>
                  <span className="flex-1">{step === 2 ? <>Looks great. Ship it!<i className="ml-px inline-block h-4 w-px translate-y-0.5 animate-pulse bg-foreground" /></> : 'Reply to the thread…'}</span>
                  <span className={cn('grid size-6 place-items-center rounded-full', step === 2 ? 'bg-foreground text-white' : 'bg-neutral-100 text-neutral-400')}><ArrowUp className="size-3.5" /></span>
                </div>
              </div>
            </div>
          </Window>
          </div>
        </Reveal>
      </Container>
    </Band>
  );
}
