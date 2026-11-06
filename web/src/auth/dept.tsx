import { BarChart3, Megaphone, Package, Palette, Star, Target, type LucideIcon } from 'lucide-react';
import type { RoomId } from '@/shared/types';
import { cn } from '@/lib/utils';

/** Department topic marks for UI chrome: Lucide icon in the department colour on a soft tinted square. */
export const DEPT_ICON: Record<RoomId, { Icon: LucideIcon; color: string }> = {
  war_room: { Icon: Target, color: '#F4A300' },
  analytics: { Icon: BarChart3, color: '#2563EB' },
  ads: { Icon: Megaphone, color: '#DB2777' },
  creators: { Icon: Star, color: '#F59E0B' },
  ops: { Icon: Package, color: '#059669' },
  design: { Icon: Palette, color: '#9333EA' },
};

export function DeptIcon({ room, className }: { room: string; className?: string }) {
  const d = DEPT_ICON[room as RoomId] ?? DEPT_ICON.war_room;
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-lg', className)} style={{ background: `${d.color}17`, color: d.color }}>
      <d.Icon className="size-[55%]" strokeWidth={1.8} />
    </span>
  );
}
