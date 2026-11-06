// One department → icon + colour map for the whole office UI (Lucide, 1.5px stroke). Emoji stay only
// inside real Telegram message text.
import {
  BarChart3, BookOpen, Camera, Clapperboard, ClipboardList, Code2, Coffee, Crown, Gem, Heart, Lightbulb, Megaphone, Package, Palette, PenLine, Rocket,
  ScanSearch, Search, Shapes, ShoppingCart, Sparkles, Star, Target, TrendingUp, Truck, UserRound, Users, Wallet, Zap, type LucideIcon,
} from 'lucide-react';
import type { Person } from '../shared/types';
import { readable } from './data';

export interface Dept { Icon: LucideIcon; color: string; name: string }
const D = (Icon: LucideIcon, color: string, name: string): Dept => ({ Icon, color, name });

/** By topic / shelf id. */
export const DEPT: Record<string, Dept> = {
  war_room: D(Target, '#F4A300', 'Target'), analytics: D(BarChart3, '#2563EB', 'BarChart3'), ads: D(Megaphone, '#DB2777', 'Megaphone'),
  creators: D(Star, '#F59E0B', 'Star'), ops: D(Package, '#059669', 'Package'), design: D(Palette, '#9333EA', 'Palette'), finance: D(Wallet, '#0F766E', 'Wallet'),
  engineering: D(Code2, '#475569', 'Code2'), general: D(Shapes, '#64748B', 'Shapes'),
};
const BY_PERSON: Record<string, Dept> = {
  founder: D(Crown, '#7C3AED', 'Crown'), 'd2c-captain': DEPT.war_room, 'd2c-analyst': DEPT.analytics, 'd2c-ads': DEPT.ads,
  'd2c-influencers': DEPT.creators, 'd2c-ops': DEPT.ops, 'd2c-design': DEPT.design, 'd2c-finance': DEPT.finance, librarian: D(BookOpen, '#8B5E3C', 'BookOpen'),
  // specialists: their own tool, in their own (department-shade) colour
  'd2c-forecaster': D(TrendingUp, '#3B82F6', 'TrendingUp'), 'd2c-insights': D(ScanSearch, '#1D4ED8', 'ScanSearch'),
  'd2c-marketplaces': D(ShoppingCart, '#E11D48', 'ShoppingCart'), 'd2c-google': D(Search, '#BE185D', 'Search'),
  'd2c-ugc': D(Clapperboard, '#D97706', 'Clapperboard'), 'd2c-procurement': D(ClipboardList, '#047857', 'ClipboardList'),
  'd2c-logistics': D(Truck, '#065F46', 'Truck'), 'd2c-copywriter': D(PenLine, '#7E22CE', 'PenLine'), 'd2c-payroll': D(Users, '#115E59', 'Users'),
};
/** Icons a hire can wear. The contract carries an emoji, so each icon travels as its emoji twin. */
export const HIRE_ICONS: { Icon: LucideIcon; emoji: string; name: string }[] = [
  { Icon: Rocket, emoji: '🚀', name: 'Rocket' }, { Icon: Sparkles, emoji: '✨', name: 'Sparkles' }, { Icon: Heart, emoji: '❤️', name: 'Heart' },
  { Icon: Lightbulb, emoji: '💡', name: 'Lightbulb' }, { Icon: ShoppingCart, emoji: '🛒', name: 'ShoppingCart' }, { Icon: Camera, emoji: '📷', name: 'Camera' },
  { Icon: Coffee, emoji: '☕', name: 'Coffee' }, { Icon: Gem, emoji: '💎', name: 'Gem' }, { Icon: Zap, emoji: '⚡', name: 'Zap' },
];

export function personDept(p: Pick<Person, 'id' | 'emoji' | 'color'> | undefined): Dept {
  if (!p) return D(UserRound, '#707579', 'UserRound');
  const known = BY_PERSON[p.id];
  if (known) return known;
  const h = HIRE_ICONS.find((i) => i.emoji === p.emoji);
  return D(h?.Icon ?? UserRound, p.color || '#707579', h?.name ?? 'UserRound');
}

const tint = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

/** A coloured icon on a soft tinted rounded square. */
export function IconTile({ dept, size = 40, className = '' }: { dept: Dept; size?: number; className?: string }) {
  const { Icon, color } = dept;
  return (
    <span className={`grid shrink-0 place-items-center ${className}`} aria-hidden
      style={{ width: size, height: size, borderRadius: size * 0.32, background: tint(color, 0.16), boxShadow: `inset 0 0 0 1.5px ${tint(color, 0.35)}` }}>
      <Icon size={Math.round(size * 0.58)} color={readable(color)} strokeWidth={size < 36 ? 2 : 1.5} />
    </span>
  );
}
export const PersonAvatar = ({ person, size }: { person: Pick<Person, 'id' | 'emoji' | 'color'> | undefined; size?: number }) => <IconTile dept={personDept(person)} size={size} />;
export const RoomTile = ({ room, size }: { room: string; size?: number }) => <IconTile dept={DEPT[room] ?? DEPT.general} size={size} />;

// ---- DOM (the engine's head badges and bubbles live outside React) ----
type IconNode = [string, Record<string, string>][];
/** The icon's shapes, read off the component (lucide-react wraps `iconNode` in a forwardRef element). */
const shapesOf = (Icon: LucideIcon): IconNode => {
  try {
    return ((Icon as unknown as { render: (p: object, r: null) => { props: { iconNode: IconNode } } }).render({}, null).props.iconNode) ?? [];
  } catch {
    return [];
  }
};
const svgCache = new Map<string, SVGElement>();
const NS = 'http://www.w3.org/2000/svg';
/** A Lucide icon as a fresh SVG element (built from its shapes once, then cloned). */
export function iconSvg(dept: Dept, size = 14): SVGElement {
  const key = `${dept.name}|${dept.color}|${size}`;
  let svg = svgCache.get(key);
  if (!svg) {
    svg = document.createElementNS(NS, 'svg');
    const attrs: Record<string, string> = { width: `${size}`, height: `${size}`, viewBox: '0 0 24 24', fill: 'none', stroke: dept.color, 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
    for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
    for (const [tag, a] of shapesOf(dept.Icon)) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(a)) if (k !== 'key') el.setAttribute(k, String(v));
      svg.append(el);
    }
    svgCache.set(key, svg);
  }
  return svg.cloneNode(true) as SVGElement;
}
