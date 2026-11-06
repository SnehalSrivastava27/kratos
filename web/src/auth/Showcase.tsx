import { motion } from 'framer-motion';
import { Check, Search } from 'lucide-react';
import { FEED, PEOPLE, TOPICS, body, clock } from '@/landing/data';
import { DeptIcon } from './dept';
import { EASE, TwoTone } from '@/landing/ui';

// Right half of /login and /signup: a calm, still Telegram topics list. Only scripted demo copy
// (demo/feeds/sale-demo.json) and the demo brand, never real chats or group names: this page is public.
const DEMO_GROUP = 'Kesar HQ';
const plain = (s: string) => body(s).replace(/[*_`]/g, '');
const ROWS = TOPICS.map((t) => {
  const inRoom = FEED.filter((e) => e.room === t.id && e.type !== 'working');
  const e = inRoom.filter((x) => x.type === 'done').pop() ?? inRoom.pop();
  const [title, ...rest] = plain(e?.text ?? '').split('\n');
  return { ...t, who: e ? PEOPLE[e.speaker]?.name : '', title, line: rest.join(' · '), at: e ? clock(e.t) : '', n: inRoom.length };
});

export default function Showcase() {
  return (
    <aside aria-hidden="true" className="relative hidden overflow-hidden border-l border-black/[0.07] bg-[#F4F3EF] lg:block">
      {/* blueprint: faint dotted field + the landing's dashed saffron centre line */}
      <div className="absolute inset-0 [background-image:radial-gradient(rgba(0,0,0,0.07)_1px,transparent_1.2px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-[linear-gradient(to_bottom,rgba(244,163,0,0.45)_50%,transparent_50%)] [background-size:1px_8px] opacity-60" />
      <div className="absolute top-1/2 left-1/2 size-[560px] -translate-1/2 rounded-full bg-saffron/[0.08] blur-3xl" />

      <div className="relative flex h-full flex-col items-center justify-center gap-10 px-10 py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
          className="relative w-full max-w-[440px]"
        >
          <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_30px_70px_-30px_rgba(0,0,0,0.25)]">
            <div className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FFB830] to-[#F08A00] text-sm font-semibold text-white">K</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold tracking-tight">{DEMO_GROUP}</p>
                <p className="text-[12px] text-neutral-400">{TOPICS.length} topics · 7 members · 1 bot</p>
              </div>
              <Search className="size-4 text-neutral-300" />
            </div>
            <ul>
              {ROWS.map((r) => (
                <li key={r.id} className="flex items-center gap-3 border-b border-black/[0.045] px-4 py-2.5 last:border-0">
                  <DeptIcon room={r.id} className="size-10 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13.5px] font-semibold">{r.label}</span>
                      <span className="shrink-0 text-[11px] text-neutral-400 tabular-nums">{r.at}</span>
                    </p>
                    <p className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12.5px] text-neutral-500"><span className="text-neutral-700">{r.who}: </span>{r.title}</span>
                      <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-neutral-200 px-1.5 text-[10.5px] font-medium text-neutral-600 tabular-nums">{r.n}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="absolute -right-6 -bottom-8 w-[236px] rounded-2xl border border-black/[0.07] bg-white p-4 shadow-[0_24px_50px_-28px_rgba(0,0,0,0.3)] xl:-right-12">
            <p className="flex items-center gap-1.5 text-[12px] text-neutral-500"><span className="size-1.5 rounded-full" style={{ background: PEOPLE['d2c-captain']?.color }} />{PEOPLE['d2c-captain']?.name}</p>
            <p className="mt-2 text-[14.5px] font-medium tracking-tight">Final plan · ₹4.68L of ₹5L</p>
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-emerald-700"><Check className="size-3.5" />Founder approved</p>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.35 }} className="mt-6 max-w-[440px] text-center">
          <TwoTone as="h2" a="Six teammates." b="One Telegram group." className="text-[26px] leading-tight tracking-[-0.025em]" />
          <p className="mt-3 text-[14.5px] leading-relaxed text-neutral-500">Each department gets its own topic. You read along, step in, approve. A replay from the demo.</p>
        </motion.div>
      </div>
    </aside>
  );
}
