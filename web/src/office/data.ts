import rosterJson from '../../../contracts/roster.json';
import zonesJson from '../../../contracts/zones.json';
import type { OfficeEvent, Person, Zone } from '../shared/types';
import type { Ctx, SceneState } from './officeState';

export const roster = rosterJson.people as Person[];
export const zones = zonesJson.zones as Zone[];
export const zoneById = Object.fromEntries(zones.map((z) => [z.id, z])) as Record<string, Zone>;
export const personById = Object.fromEntries(roster.map((p) => [p.id, p])) as Record<string, Person>;
export const roomZone = Object.fromEntries(rosterJson.rooms.map((r) => [r.id, r.zone])) as Record<string, string>;
export const ctx: Ctx = { roster, roomZone };

export const C = { saffron: '#F4A300', cream: '#FFF6E5', plum: '#1E1328', mint: '#3CCB8B', red: '#E5484D', cyan: '#22D3EE' };
export const ZONE_EMOJI: Record<string, string> = {
  design_studio: '🎨', data_wall: '📊', finance_cabin: '💰', creator_studio: '⭐', war_room: '🎯',
  growth_pod: '📣', dispatch_dock: '📦', dark_store: '⚡', chai_pantry: '☕', founder_desk: '👑',
};
const owner = (zoneId: string) => roster.find((p) => p.zone === zoneId);
export const zoneColor = (zoneId: string) =>
  zoneId === 'dark_store' ? C.cyan : zoneId === 'war_room' || zoneId === 'chai_pantry' ? C.saffron : owner(zoneId)?.color ?? C.saffron;

/** Zone-local desk centre for each zone owner (monitor faces +z, the owner sits on the camera side). */
export const DESK: Record<string, [number, number]> = {
  design_studio: [-1.5, -0.55], data_wall: [1.4, -0.15], finance_cabin: [1.3, -0.55], creator_studio: [-1.5, -0.6],
  growth_pod: [0, -0.6], dispatch_dock: [1.5, -0.9], founder_desk: [0.4, -0.5],
};
const SEAT_OFF = 0.85;
export const world = (zoneId: string, [dx, dz]: [number, number]): [number, number] => {
  const z = zoneById[zoneId];
  return [z.x + dx, z.z + dz];
};

/** Where a person stands in a zone: their desk seat if it's their home zone, otherwise a visitor slot at the zone front. */
export function spot(zoneId: string, personId: string): [number, number] {
  const z = zoneById[zoneId] ?? zoneById.chai_pantry;
  const i = roster.findIndex((p) => p.id === personId);
  if (roster[i]?.zone === z.id) {
    if (DESK[z.id]) return world(z.id, [DESK[z.id][0], DESK[z.id][1] + SEAT_OFF]);
    if (z.id === 'war_room') return [z.x, z.z + 1.15]; // captain at the head of the war-room table
  }
  return [z.x + (i - 4.5) * 0.55, z.z + z.d / 2 - 0.75 - (i % 2) * 0.6];
}
export const isSeat = (personId: string, x: number, z: number) => {
  const p = personById[personId];
  const [sx, sz] = spot(p.zone, p.id);
  return Math.hypot(sx - x, sz - z) < 0.15;
};

const LEAD_EMOJI = /^\p{Extended_Pictographic}️?\s*/u;
/** Feed text → display text: drop the leading speaker emoji, turn @ids into @Names. */
export const clean = (text: string) =>
  text.replace(LEAD_EMOJI, '').replace(/@([\w-]+)/g, (m, id) => (personById[id] ? '@' + personById[id].name : m));
export const firstLine = (text: string) => clean(text).split('\n')[0];

export type Tone = 'idle' | 'live' | 'red' | 'mint';
/** One-line caption for "what's happening right now". */
export function caption(events: OfficeEvent[], scene: SceneState): { text: string; tone: Tone } {
  const beacon = Object.values(scene.people).find((p) => p.beacon)?.beacon;
  if (beacon) return { text: beacon, tone: 'red' };
  const e = events[events.length - 1];
  if (!e) return { text: 'Waiting for the founder’s brief…', tone: 'idle' };
  const n = personById[e.speaker]?.name ?? e.speaker;
  const targets = (e.meta?.targets ?? []).map((t) => personById[t]?.name).filter(Boolean);
  switch (e.type) {
    case 'assign':
      return { text: `${n} briefed ${targets.length > 2 ? 'the whole team' : targets.join(' & ')}`, tone: 'live' };
    case 'artifact':
      return { text: `${n} pinned “${firstLine(e.text)}” to the gallery`, tone: 'live' };
    case 'done':
      return { text: `${n} delivered · ${firstLine(e.text)}`, tone: 'mint' };
    case 'approved':
      return { text: `${n} approved · ${firstLine(e.text)}`, tone: 'mint' };
    case 'celebrate':
      return { text: 'Founder approved the plan — the festive sale ships 🚀', tone: 'mint' };
    default:
      return { text: `${n} · ${firstLine(e.text)}`, tone: 'live' };
  }
}
