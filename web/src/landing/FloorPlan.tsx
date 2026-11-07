import { motion } from 'framer-motion';
import { Armchair, Coffee, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEPT, PEOPLE } from './data';

// The office floor (web/src/office/engine/layout.ts), roughly as it lies: the back row runs from the north wing's
// Finance Cabin (on the west wall) to the Creator Studio behind the Data Wall; the middle row is the main floor;
// the front row ends in the east wing, where the Growth Pod now sits by the Town Hall.
const ROOMS = ['d2c-finance', 'librarian', 'd2c-design', 'd2c-influencers', 'hub', 'd2c-analyst', 'd2c-captain', 'pantry', 'desks', 'd2c-ops', 'founder', 'd2c-ads'];
/** Rooms that moved out of the original block into the new wings. */
const WING: Record<string, string> = { 'd2c-finance': 'North wing', 'd2c-influencers': 'North wing', 'd2c-ads': 'East wing' };
export const SHARED: Record<string, { room: string; Icon: typeof Coffee; about: string }> = {
  hub: { room: 'Telegram Hub', Icon: Send, about: 'The Telegram wall and the Switch core: every message between your group and the team is routed here.' },
  pantry: { room: 'Chai Pantry', Icon: Coffee, about: 'Chai with the team. Walk up, press E, and whoever is nearby says hello.' },
  desks: { room: 'Open Desks', Icon: Armchair, about: 'Free desks for new hires: hire a teammate and they walk in and sit here.' },
};

/** Flat 4×3 plan of the office. `lit` is the selected tile (a person id or a shared room); its room glows in their colour. */
export function FloorPlan({ lit, onPick, className }: { lit?: string; onPick?: (id: string) => void; className?: string }) {
  return (
    <div className={cn('grid grid-cols-4 gap-1.5', className)} role="group" aria-label="Office floor plan">
      {ROOMS.map((id) => {
        const d = DEPT[id] ?? SHARED[id];
        const on = id === lit;
        const Icon = d.Icon;
        const color = PEOPLE[id]?.color ?? '#3390EC';
        return (
          <button
            type="button"
            key={id}
            onClick={() => onPick?.(id)}
            aria-pressed={on}
            className={cn(
              'relative flex min-h-[64px] cursor-pointer flex-col overflow-hidden rounded-lg border p-2.5 text-left transition-colors duration-500 outline-none focus-visible:ring-2 focus-visible:ring-black/30',
              on ? 'border-transparent bg-white shadow-sm' : 'border-black/[0.06] bg-white/50 hover:bg-white/80',
            )}
            style={on ? { boxShadow: `0 0 0 1.5px ${color}, 0 8px 24px -10px ${color}80` } : undefined}
          >
            <span className={cn('text-[11px] font-medium leading-tight', on ? 'text-foreground' : 'text-neutral-400')}>{d.room}</span>
            {PEOPLE[id] && <span className="mt-1 text-[10.5px] text-neutral-400">{PEOPLE[id].name}</span>}
            {WING[id] && <span className="mt-0.5 text-[9.5px] tracking-wide text-neutral-400 uppercase">{WING[id]}</span>}
            <Icon className="mt-auto size-4 self-end transition-colors duration-500" strokeWidth={1.6} style={{ color: on ? color : '#c4c4c2' }} />
            {on && (
              <motion.span layoutId="floor-pin" className="absolute top-2.5 right-2.5 size-2 rounded-full" style={{ background: color }} transition={{ type: 'spring', stiffness: 260, damping: 26 }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
