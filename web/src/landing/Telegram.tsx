import { Fragment } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck } from 'lucide-react';
import type { OfficeEvent } from '@/shared/types';
import { cn } from '@/lib/utils';
import { DEPT, PEOPLE, TG_GROUP, TOPICS, clock, ink, names } from './data';

// Light Telegram theme. Telegram blue (--color-tg) only appears inside these mockups.
export const TG_WALL = 'bg-[#E4EBE3] [background-image:radial-gradient(rgba(255,255,255,.55)_1px,transparent_1.2px)] [background-size:14px_14px]';

export function TgAvatar({ size = 'size-9' }: { size?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FFB830] to-[#F08A00] text-sm font-semibold text-white', size)}>{TG_GROUP[0]}</span>
  );
}

/** Inline Telegram markdown: **bold**, _italic_, **_bold italic_**. */
function inline(s: string) {
  return s.split(/(\*\*_.+?_\*\*|\*\*.+?\*\*|(?<![\w])_.+?_(?![\w]))/g).map((t, i) =>
    t.startsWith('**_') ? <b key={i} className="font-semibold"><i>{t.slice(3, -3)}</i></b>
    : t.startsWith('**') ? <b key={i} className="font-semibold">{t.slice(2, -2)}</b>
    : t.length > 2 && t[0] === '_' && t.endsWith('_') ? <i key={i}>{t.slice(1, -1)}</i>
    : <Fragment key={i}>{t}</Fragment>,
  );
}

/** A real Telegram message as the team's style writes it: emoji + bold title, bullets, blank-line gaps. */
export function TgText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('block', className)}>
      {names(text).split('\n').map((line, i) =>
        !line.trim() ? <span key={i} className="block h-1.5" />
        : line.startsWith('- ') ? <span key={i} className="block pl-3 -indent-3">•&nbsp;{inline(line.slice(2))}</span>
        : <span key={i} className="block">{inline(line)}</span>,
      )}
    </span>
  );
}

/** Header subtitle: who is typing right now, else the topic count. */
export function tgSubtitle(events: OfficeEvent[]) {
  const last = events[events.length - 1];
  return last?.type === 'working' ? `${PEOPLE[last.speaker].name} is typing…` : `${TOPICS.length} topics · 1 bot`;
}

/** Unread-style badge: messages posted in a topic so far. */
export function topicCounts(events: OfficeEvent[]) {
  const n: Record<string, number> = {};
  for (const e of events) if (e.type !== 'working') n[e.room] = (n[e.room] ?? 0) + 1;
  return n;
}

/** Forum topics as horizontal tabs (Telegram mobile). Each topic wears its owner's line icon. */
export function TopicTabs({ active, counts = {} }: { active: string; counts?: Record<string, number> }) {
  return (
    <div className="flex gap-1 overflow-hidden border-b border-black/[0.06] bg-white px-2 pb-1.5 [mask-image:linear-gradient(to_right,black_85%,transparent)]">
      {TOPICS.map((t) => {
        const { Icon } = DEPT[t.owner];
        return (
          <span key={t.id} className={cn('relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition-colors', t.id === active ? 'font-medium text-tg' : 'text-neutral-500')}>
            {t.id === active && <motion.span layoutId="tg-tab" className="absolute inset-0 -z-0 rounded-full bg-tg/10" />}
            <Icon className="relative size-3.5" strokeWidth={1.6} style={{ color: t.id === active ? undefined : PEOPLE[t.owner].color }} />
            <span className="relative">{t.label}</span>
            {t.id !== active && !!counts[t.id] && <span className="relative grid h-4 min-w-4 place-items-center rounded-full bg-tg px-1 text-[9.5px] font-semibold text-white tabular-nums">{counts[t.id]}</span>}
          </span>
        );
      })}
    </div>
  );
}

/** Message list. Agents all post through one bot; the sender name sits on top in their colour, like Telegram. */
export function TgMessages({ events, compact }: { events: OfficeEvent[]; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1.5', compact ? 'text-[12.5px]' : 'text-[13.5px]')}>
      <AnimatePresence initial={false}>
        {events.filter((e) => e.type !== 'working').map((e) => {
          const me = e.speaker === 'founder';
          return (
            <motion.div
              key={e.id}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={cn(
                'relative max-w-[88%] rounded-2xl px-3 pt-1.5 pb-1 leading-[1.4] text-[#111] shadow-[0_1px_1px_rgba(0,0,0,0.08)]',
                me ? 'self-end rounded-br-md bg-[#EFFDDE]' : 'self-start rounded-bl-md bg-white',
              )}
            >
              {!me && <p className="text-[0.92em] font-semibold" style={{ color: ink(e.speaker) }}>{PEOPLE[e.speaker].name}</p>}
              <TgText text={e.text} />
              <span className={cn('-mt-0.5 flex items-center justify-end gap-0.5 text-[10.5px]', me ? 'text-[#4FAE4E]' : 'text-[#A0ACB6]')}>
                {clock(e.t)}{me && <CheckCheck className="size-3.5" />}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
