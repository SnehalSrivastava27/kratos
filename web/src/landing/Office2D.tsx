import { motion } from 'framer-motion';
import { Coffee, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEPT, FEED, PEOPLE, body, useFeedClock } from './data';

// Floor plan from contracts/zones.json, row by row. Person ids for desks, plus two shared rooms.
const ROOMS = ['d2c-design', 'd2c-analyst', 'hub', 'd2c-influencers', 'd2c-captain', 'd2c-ads', 'd2c-ops', 'pantry', 'founder'];
const SHARED: Record<string, { room: string; Icon: typeof Coffee }> = { hub: { room: 'Telegram Hub', Icon: Send }, pantry: { room: 'Chai Pantry', Icon: Coffee } };

/** Flat 3×3 plan of the office. `lit` is a person id; their room glows in their colour. */
export function FloorPlan({ lit, className }: { lit?: string; className?: string }) {
  return (
    <div className={cn('grid grid-cols-3 gap-1.5', className)}>
      {ROOMS.map((id) => {
        const d = DEPT[id] ?? SHARED[id];
        const on = id === lit;
        const Icon = d.Icon;
        const color = PEOPLE[id]?.color ?? '#a3a3a3';
        return (
          <div
            key={id}
            className={cn(
              'relative flex min-h-[64px] flex-col justify-between overflow-hidden rounded-lg border p-2.5 transition-colors duration-500',
              on ? 'border-transparent bg-white shadow-sm' : 'border-black/[0.06] bg-white/50',
            )}
            style={on ? { boxShadow: `0 0 0 1.5px ${color}, 0 8px 24px -10px ${color}80` } : undefined}
          >
            <span className={cn('text-[11px] font-medium leading-tight', on ? 'text-foreground' : 'text-neutral-400')}>{d.room}</span>
            <Icon className="size-4 self-end transition-colors duration-500" strokeWidth={1.6} style={{ color: on ? color : '#c4c4c2' }} />
            {on && (
              <motion.span layoutId="floor-pin" className="absolute top-2.5 right-2.5 size-2 rounded-full" style={{ background: color }} transition={{ type: 'spring', stiffness: 260, damping: 26 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const SAYS = FEED.filter((e) => e.type !== 'working');

/** Phones get this instead of WebGL: the same feed, replayed on a flat plan. */
export default function Office2D({ run = true }: { run?: boolean }) {
  const ms = useFeedClock(run);
  const e = SAYS.filter((s) => s.t <= ms).pop() ?? SAYS[0];
  const who = PEOPLE[e.speaker];
  return (
    <div className="flex h-full flex-col gap-3 bg-[#FFF8EC] p-3">
      <FloorPlan lit={e.speaker} className="flex-1" />
      <div className="rounded-lg border border-black/[0.06] bg-white p-3 shadow-sm" aria-live="polite">
        <p className="text-xs font-medium" style={{ color: who.color }}>{who.name}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug whitespace-pre-line text-neutral-700">{body(e.text)}</p>
      </div>
    </div>
  );
}
