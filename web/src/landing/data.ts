// Landing copy sources: docs/PLAN.md §1, §3, §7, §9 · demo/feeds/sale-demo.json · contracts/roster.json.
import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, Crown, Megaphone, Package, Palette, Star, Target, type LucideIcon } from 'lucide-react';
import type { OfficeEvent, Person } from '@/shared/types';
import feed from '../../../demo/feeds/sale-demo.json';
import roster from '../../../contracts/roster.json';

type Mate = Person & { topic?: string };
export const PEOPLE = Object.fromEntries((roster.people as Mate[]).map((p) => [p.id, p])) as Record<string, Mate>;
/** The six department teammates the landing shows (the librarian works behind the scenes). */
export const AGENT_IDS = (roster.people as Mate[]).filter((p) => p.kind === 'agent' && p.id !== 'librarian').map((p) => p.id);
/** The demo brand and its Telegram group. roster.telegram.group is the real private group, never shown here. */
export const BRAND = roster.brand;
export const TG_GROUP = 'Kesar HQ';
/** One Telegram group with forum topics; each room is a topic, owned by the teammate who sits in its zone. */
export const TOPICS = roster.rooms.map((r) => ({ id: r.id, label: r.topic, owner: (roster.people as Mate[]).find((p) => p.zone === r.zone)!.id }));

/** Stable module-level ref so <Office> doesn't restart its replay on every render. */
export const saleDemo = feed as OfficeEvent[];
/** Events the landing mockups show: only people and topics in the current roster. */
const FEED = saleDemo.filter((e) => PEOPLE[e.speaker] && TOPICS.some((t) => t.id === e.room));
/** Same loop length as the office replay (last event + 5s gap), so the mockups stay roughly in step. */
export const LOOP_MS = saleDemo[saleDemo.length - 1].t + 5000;

/** The landing's one icon map: short label, Lucide icon and office room per person (rooms: PLAN §9.6). Colour is PEOPLE[id].color. */
export const DEPT: Record<string, { short: string; Icon: LucideIcon; room: string }> = {
  founder: { short: 'Founder', Icon: Crown, room: 'Founder’s Desk' },
  'd2c-captain': { short: 'Captain', Icon: Target, room: 'War Room' },
  'd2c-analyst': { short: 'Analytics', Icon: BarChart3, room: 'Data Wall' },
  'd2c-ads': { short: 'Ads', Icon: Megaphone, room: 'Growth Pod' },
  'd2c-influencers': { short: 'Creators', Icon: Star, room: 'Creator Studio' },
  'd2c-ops': { short: 'Ops', Icon: Package, room: 'Dispatch Dock' },
  'd2c-design': { short: 'Design', Icon: Palette, room: 'Design Studio' },
  librarian: { short: 'Librarian', Icon: BookOpen, room: 'Library' },
};
export { FEED };
/** Roster colour, darkened where it is too light for text on white (the captain's saffron). */
export const ink = (id: string) => (PEOPLE[id]?.color === '#F4A300' ? '#9A5B00' : PEOPLE[id]?.color);

/** @ids → names. Keeps the Telegram markdown (render it with <TgText>). */
export const names = (text: string) => text.replace(/@([\w-]+)/g, (m, id) => (PEOPLE[id] ? `@${PEOPLE[id].name}` : m));
/** Plain text for UI chrome: no leading emoji (the UI shows who is speaking), no markdown, no blank lines. */
export const body = (text: string) =>
  names(text).replace(/^\p{Extended_Pictographic}️?\s*/u, '').replace(/\*\*/g, '').replace(/(^|\s)_|_(?=\s|$)/g, '$1').replace(/^- /gm, '').replace(/\n{2,}/g, '\n');
/** "9:41 PM" style timestamps that advance with the feed. */
export const clock = (t: number) => `9:${String(41 + Math.floor(t / 15000)).padStart(2, '0')} PM`;

export const REPO_URL = 'https://github.com/SnehalSrivastava27/kratos';
export const SWITCH_URL = 'https://github.com/sandbox-quantum/switch';

export type Status = 'idle' | 'assigned' | 'working' | 'done' | 'pushback';
/** What a teammate is doing `ms` into the replay, plus its latest line. */
export function statusAt(id: string, ms: number): { status: Status; line?: string } {
  let status: Status = 'idle';
  let line: string | undefined;
  for (const e of FEED) {
    if (e.t > ms) break;
    if (e.speaker === id) {
      line = body(e.text).split('\n')[0];
      status = e.type === 'working' ? 'working' : e.type === 'pushback' ? 'pushback' : e.type === 'assign' ? 'working' : 'done';
    } else if (e.meta?.targets?.includes(id) && status !== 'working') status = 'assigned';
  }
  return { status, line };
}

/** Milliseconds into the replay loop. Parked at the end (everything shown) when `run` is false. */
export function useFeedClock(run = true) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!run) return;
    const start = performance.now();
    const id = setInterval(() => setMs((performance.now() - start) % LOOP_MS), 250);
    return () => clearInterval(id);
  }, [run]);
  return run ? ms : LOOP_MS - 1;
}
