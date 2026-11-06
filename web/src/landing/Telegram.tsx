import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck } from 'lucide-react';
import type { OfficeEvent } from '@/shared/types';
import { cn } from '@/lib/utils';
import { PEOPLE, TG_GROUP, TOPICS, body, clock } from './data';

// Light Telegram theme. Telegram blue (--color-tg) only appears inside these mockups.
export const TG_WALL = 'bg-[#E4EBE3] [background-image:radial-gradient(rgba(255,255,255,.55)_1px,transparent_1.2px)] [background-size:14px_14px]';

export function TgAvatar({ size = 'size-9' }: { size?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FFB830] to-[#F08A00] text-sm font-semibold text-white', size)}>{TG_GROUP[0]}</span>
  );
}

/** Header subtitle: who is typing right now, else the topic count. */
export function tgSubtitle(events: OfficeEvent[]) {
  const last = events[events.length - 1];
  return last?.type === 'working' ? `${PEOPLE[last.speaker].name} is typing…` : `${TOPICS.length} topics · 1 bot`;
}

export function TopicIcon({ emoji, on, className }: { emoji: string; on?: boolean; className?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-[10px] text-[15px] transition-colors', on ? 'bg-tg/15' : 'bg-black/[0.04]', className)}>{emoji}</span>
  );
}

/** Unread-style badge: messages posted in a topic so far. */
export function topicCounts(events: OfficeEvent[]) {
  const n: Record<string, number> = {};
  for (const e of events) if (e.type !== 'working') n[e.room] = (n[e.room] ?? 0) + 1;
  return n;
}
function Badge({ n }: { n?: number }) {
  return n ? <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-tg px-1 text-[9.5px] font-semibold text-white tabular-nums">{n}</span> : null;
}

/** Forum topics as a vertical rail (Telegram Desktop with a topic open). */
export function TopicRail({ active, counts = {} }: { active: string; counts?: Record<string, number> }) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r border-black/[0.06] bg-white py-2.5">
      {TOPICS.map((t) => (
        <span key={t.id} className="relative flex flex-col items-center gap-0.5" title={t.label}>
          {t.id === active && <motion.span layoutId="tg-rail" className="absolute -left-[9px] top-1.5 h-6 w-[3px] rounded-r bg-tg" />}
          <span className="relative"><TopicIcon emoji={t.emoji} on={t.id === active} className="size-8" />{t.id !== active && <Badge n={counts[t.id]} />}</span>
          <span className={cn('max-w-12 truncate text-[9px]', t.id === active ? 'font-medium text-tg' : 'text-neutral-400')}>{t.label}</span>
        </span>
      ))}
    </div>
  );
}

/** Forum topics as horizontal tabs (Telegram mobile). */
export function TopicTabs({ active, counts = {} }: { active: string; counts?: Record<string, number> }) {
  return (
    <div className="flex gap-1 overflow-hidden border-b border-black/[0.06] bg-white px-2 pb-1.5 [mask-image:linear-gradient(to_right,black_85%,transparent)]">
      {TOPICS.map((t) => (
        <span key={t.id} className={cn('relative inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] transition-colors', t.id === active ? 'font-medium text-tg' : 'text-neutral-500')}>
          {t.id === active && <motion.span layoutId="tg-tab" className="absolute inset-0 -z-0 rounded-full bg-tg/10" />}
          <span className="relative">{t.emoji}</span><span className="relative">{t.label}</span>
          {t.id !== active && !!counts[t.id] && <span className="relative grid h-4 min-w-4 place-items-center rounded-full bg-tg px-1 text-[9.5px] font-semibold text-white tabular-nums">{counts[t.id]}</span>}
        </span>
      ))}
    </div>
  );
}

/** Message list. Agents all post through one bot: bold marker + name first, then the text. */
export function TgMessages({ events, compact }: { events: OfficeEvent[]; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1.5', compact ? 'text-[12.5px]' : 'text-[13.5px]')}>
      <AnimatePresence initial={false}>
        {events.filter((e) => e.type !== 'working').map((e) => {
          const me = e.speaker === 'founder';
          const p = PEOPLE[e.speaker];
          return (
            <motion.div
              key={e.id}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={cn(
                'relative max-w-[88%] rounded-2xl px-3 pt-1.5 pb-1 leading-[1.4] shadow-[0_1px_1px_rgba(0,0,0,0.08)]',
                me ? 'self-end rounded-br-md bg-[#EFFDDE]' : 'self-start rounded-bl-md bg-white',
              )}
            >
              <p className="whitespace-pre-line text-[#111]">
                {!me && <b className="font-semibold">{p.emoji} {p.name}{'\n'}</b>}
                {body(e.text)}
                <span className={cn('float-right mt-1.5 ml-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[10.5px]', me ? 'text-[#4FAE4E]' : 'text-[#A0ACB6]')}>
                  {clock(e.t)}{me && <CheckCheck className="size-3.5" />}
                </span>
              </p>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
