// Landing copy sources: docs/PLAN.md §1, §3, §7, §9 · demo/feeds/sale-demo.json · contracts/roster.json.
import { useEffect, useState } from 'react';
import { BarChart3, Crown, Megaphone, Package, Palette, Star, Target, type LucideIcon } from 'lucide-react';
import type { OfficeEvent, Person } from '@/shared/types';
import feed from '../../../demo/feeds/sale-demo.json';
import roster from '../../../contracts/roster.json';

type Mate = Person & { topic?: string };
export const PEOPLE = Object.fromEntries((roster.people as Mate[]).map((p) => [p.id, p])) as Record<string, Mate>;
export const AGENT_IDS = (roster.people as Mate[]).filter((p) => p.kind === 'agent').map((p) => p.id);
/** One Telegram group with forum topics; each room is a topic. */
export const TG_GROUP = roster.telegram.group;
export const TOPICS = roster.rooms.map((r) => ({ id: r.id, label: r.topic, emoji: (roster.people as Mate[]).find((p) => p.zone === r.zone)?.emoji ?? '💬' }));

/** Stable module-level ref so <Office> doesn't restart its replay on every render. */
export const saleDemo = feed as OfficeEvent[];
/** Events the landing mockups show: only people and topics in the current roster. */
const FEED = saleDemo.filter((e) => PEOPLE[e.speaker] && TOPICS.some((t) => t.id === e.room));
/** Same loop length as the office replay (last event + 5s gap), so the mockups stay roughly in step. */
export const LOOP_MS = saleDemo[saleDemo.length - 1].t + 5000;

/** Short label, line icon and office room per person (rooms: PLAN §9.6). */
export const DEPT: Record<string, { short: string; Icon: LucideIcon; room: string }> = {
  founder: { short: 'Founder', Icon: Crown, room: 'Founder’s Desk' },
  'd2c-captain': { short: 'Captain', Icon: Target, room: 'War Room' },
  'd2c-analyst': { short: 'Analytics', Icon: BarChart3, room: 'Data Wall' },
  'd2c-ads': { short: 'Ads', Icon: Megaphone, room: 'Growth Pod' },
  'd2c-influencers': { short: 'Creators', Icon: Star, room: 'Creator Studio' },
  'd2c-ops': { short: 'Ops', Icon: Package, room: 'Dispatch Dock' },
  'd2c-design': { short: 'Design', Icon: Palette, room: 'Design Studio' },
};
export { FEED };
export const WAR_ROOM = FEED.filter((e) => e.room === 'war_room');

/** Drop the leading department emoji; the UI already shows who is speaking. */
export const body = (text: string) =>
  text.replace(/^\p{Extended_Pictographic}️?\s*/u, '').replace(/@([\w-]+)/g, (m, id) => (PEOPLE[id] ? `@${PEOPLE[id].name}` : m));
/** "9:41 PM" style timestamps that advance with the feed. */
export const clock = (t: number) => `9:${String(41 + Math.floor(t / 15000)).padStart(2, '0')} PM`;

export const REPO_URL = 'https://github.com/'; // TODO(orchestrator): real repo URL
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
