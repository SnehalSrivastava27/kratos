import { motion } from 'framer-motion';
import { Armchair, Coffee, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEPT, PEOPLE } from './data';

// Floor plan from contracts/zones.json, row by row: the west wing (library, finance, open desks), then the main floor.
const ROOMS = ['librarian', 'd2c-design', 'hub', 'd2c-analyst', 'd2c-finance', 'd2c-influencers', 'd2c-captain', 'd2c-ads', 'desks', 'd2c-ops', 'pantry', 'founder'];
const SHARED: Record<string, { room: string; Icon: typeof Coffee }> = { hub: { room: 'Telegram Hub', Icon: Send }, pantry: { room: 'Chai Pantry', Icon: Coffee }, desks: { room: 'Open Desks', Icon: Armchair } };

/** Flat 4×3 plan of the office. `lit` is a person id; their room glows in their colour. */
export function FloorPlan({ lit, className }: { lit?: string; className?: string }) {
  return (
    <div className={cn('grid grid-cols-4 gap-1.5', className)}>
      {ROOMS.map((id) => {
        const d = DEPT[id] ?? SHARED[id];
        const on = id === lit;
        const Icon = d.Icon;
        const color = PEOPLE[id]?.color ?? '#a3a3a3';
        return (
          <div
            key={id}
            className={cn(
              'relative flex min-h-[64px] flex-col overflow-hidden rounded-lg border p-2.5 transition-colors duration-500',
              on ? 'border-transparent bg-white shadow-sm' : 'border-black/[0.06] bg-white/50',
            )}
            style={on ? { boxShadow: `0 0 0 1.5px ${color}, 0 8px 24px -10px ${color}80` } : undefined}
          >
            <span className={cn('text-[11px] font-medium leading-tight', on ? 'text-foreground' : 'text-neutral-400')}>{d.room}</span>
            {PEOPLE[id] && <span className="mt-1 text-[10.5px] text-neutral-400">{PEOPLE[id].name}</span>}
            <Icon className="mt-auto size-4 self-end transition-colors duration-500" strokeWidth={1.6} style={{ color: on ? color : '#c4c4c2' }} />
            {on && (
              <motion.span layoutId="floor-pin" className="absolute top-2.5 right-2.5 size-2 rounded-full" style={{ background: color }} transition={{ type: 'spring', stiffness: 260, damping: 26 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
