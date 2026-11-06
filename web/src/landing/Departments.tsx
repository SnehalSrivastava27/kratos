import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Hand, Zap } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DEPT, FEED, PEOPLE, TG_GROUP } from './data';
import { TgText } from './Telegram';
import { FloorPlan } from './FloorPlan';
import { Band, Container, MateIcon, Reveal } from './ui';

// PLAN §9.1 section D; the captain's row follows the hero workflow in §3.
const TEAM = [
  { id: 'd2c-captain', plate: 'Turns one message from the founder into a job for every department, then brings back one plan to approve.', own: 'A plan goes over budget: sends it back to the right teammate with the exact cut.' },
  { id: 'd2c-ads', plate: 'Plans Meta campaigns and splits the budget by ROAS.', own: 'A campaign’s ROAS drops below target: drafts a fix.' },
  { id: 'd2c-influencers', plate: 'Shortlists creators and compares fees, reach and engagement.', own: 'A creator’s engagement dips: suggests a swap.' },
  { id: 'd2c-ops', plate: 'Places stock so every region gets 1–2 day delivery.', own: 'A SKU will run out in a region: proposes a transfer.' },
  { id: 'd2c-analyst', plate: 'Forecasts sales per SKU and sets the live dashboard metrics.', own: 'Sales pace falls behind forecast: alerts the captain.' },
  { id: 'd2c-design', plate: 'Makes sale banners and creatives, pinned to the gallery.', own: 'A new campaign starts: drafts creatives for it.' },
];
// The teammate's last real message in the demo, shown as proof.
const LAST = Object.fromEntries(TEAM.map(({ id }) => [id, [...FEED].reverse().find((e) => e.speaker === id && e.type !== 'working')]));

export default function Departments() {
  const [id, setId] = useState(TEAM[0].id);
  const t = TEAM.find((m) => m.id === id)!;
  const p = PEOPLE[id];
  const { room } = DEPT[id];
  const last = LAST[id];

  return (
    <Band>
      <Container className="py-10 md:py-16">
        <Tabs value={id} onValueChange={(v) => setId(v as string)}>
          <Reveal>
            <TabsList variant="line" className="-mx-1 h-auto w-full justify-start gap-1 overflow-x-auto border-b border-black/[0.07] pb-px [scrollbar-width:none]">
              {TEAM.map((m) => {
                const D = DEPT[m.id];
                return (
                  <TabsTrigger key={m.id} value={m.id} className="h-10 flex-none px-3 text-[14px] after:bottom-[-2px]!">
                    <D.Icon strokeWidth={1.6} style={{ color: PEOPLE[m.id].color }} />{D.short}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Reveal>
          <Reveal delay={0.06} className="mt-8 grid overflow-hidden rounded-2xl border border-black/[0.07] bg-white md:grid-cols-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="flex flex-col gap-7 p-6 md:p-10">
                <div className="flex items-center gap-3">
                  <MateIcon id={id} size="lg" />
                  <div>
                    <h3 className="text-lg font-medium tracking-tight">{p.name}</h3>
                    <p className="text-[13px] text-neutral-500">{TG_GROUP} · {p.topic} topic · sits in the {room}</p>
                  </div>
                </div>
                <dl className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <dt className="flex items-center gap-1.5 text-[12px] font-medium tracking-wide text-neutral-400 uppercase"><Hand className="size-3.5" />Takes off your plate</dt>
                    <dd className="mt-2 text-[15px] leading-relaxed text-neutral-700">{t.plate}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-[12px] font-medium tracking-wide text-neutral-400 uppercase"><Zap className="size-3.5" />Acts on its own when</dt>
                    <dd className="mt-2 text-[15px] leading-relaxed text-neutral-700">{t.own}</dd>
                  </div>
                </dl>
                {last && (
                  <figure className="mt-auto rounded-xl border border-black/[0.06] bg-neutral-50 p-4">
                    <figcaption className="text-[12px] text-neutral-400">Last post in the festive sale demo</figcaption>
                    <TgText text={last.text} className="mt-1.5 text-[14px] leading-snug text-neutral-800" />
                  </figure>
                )}
              </motion.div>
            </AnimatePresence>
            <div className="border-t border-black/[0.07] bg-[#FFF8EC] p-4 md:border-t-0 md:border-l md:p-8">
              <FloorPlan lit={id} className="h-full min-h-[300px]" />
            </div>
          </Reveal>
        </Tabs>
      </Container>
    </Band>
  );
}
