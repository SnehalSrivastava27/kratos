import rosterJson from '../../../contracts/roster.json';
import zonesJson from '../../../contracts/zones.json';
import type { OfficeEvent, Person, Room, Zone } from '../shared/types';
import type { Ctx, SceneState } from './officeState';
import { tgPlain } from './tgtext';

/** contracts/roster.json, never changed. */
export const STATIC_ROSTER: readonly Person[] = Object.freeze((rosterJson.people as Person[]).map((p) => Object.freeze({ ...p })));
/**
 * The mounted office's people: the static roster plus hires. One office is mounted at a time; Office calls
 * resetPeople(<mode:workspace>) when it mounts or switches workspace and resetPeople('') when it unmounts,
 * so one workspace's (or the demo's) hires never show up in another. Mutated in place: everything holds these refs.
 */
export const roster: Person[] = [...STATIC_ROSTER];
export const zones = zonesJson.zones as Zone[];
export const zoneById = Object.fromEntries(zones.map((z) => [z.id, z])) as Record<string, Zone>;
export const personById: Record<string, Person> = {};
/** The Telegram group's title: the demo's made-up one, or the signed-in workspace's (setGroup, from Office). A live binding: importers see the change. */
export let TG_GROUP = (rosterJson as { telegram?: { group: string } }).telegram?.group ?? 'Telegram';
/** The demo's group is the made-up brand's office: always "Kesar HQ" (live uses the workspace name). */
export const DEMO_GROUP = 'Kesar HQ';
TG_GROUP = DEMO_GROUP;
export const setGroup = (name: string) => void (TG_GROUP = name);
/** The Telegram topics the UI shows: `internal` rooms (QA Lab) stay hidden everywhere. */
export const ROOMS = (rosterJson.rooms as Room[]).filter((r) => !r.internal).map((r) => ({ ...r, topic: r.topic ?? r.label }));
export const INTERNAL_ROOMS = new Set<string>((rosterJson.rooms as Room[]).filter((r) => r.internal).map((r) => r.id));
export const roomZone = Object.fromEntries(rosterJson.rooms.map((r) => [r.id, r.zone])) as Record<string, string>;
export const ctx: Ctx = { roster, roomZone };

export const C = { saffron: '#F4A300', cream: '#FFF6E5', plum: '#1E1328', mint: '#3CCB8B', red: '#E5484D', cyan: '#22D3EE', tg: '#3390EC' };
export const ZONE_EMOJI: Record<string, string> = {
  design_studio: '🎨', data_wall: '📊', telegram_hub: '💬', creator_studio: '⭐', war_room: '🎯',
  growth_pod: '📣', dispatch_dock: '📦', finance_cabin: '💰', dark_store: '⚡', chai_pantry: '☕', founder_desk: '👑', library: '📚', open_desks: '🪑', meeting_room: '🗣️', reception: '🛎️',
};
const owner = (zoneId: string) => roster.find((p) => p.zone === zoneId);
export const zoneColor = (zoneId: string) =>
  zoneId === 'dark_store' ? C.cyan : zoneId === 'open_desks' ? '#06d6a0' : zoneId === 'library' ? '#c98b5a' : zoneId === 'telegram_hub' ? C.tg : zoneId === 'war_room' || zoneId === 'chai_pantry' ? C.saffron : owner(zoneId)?.color ?? C.saffron;

/** Every desk in the office (contracts/zones.json `desks`): id `<zone>#<i>`, world centre. Monitor faces +z, the sitter is on the camera side. */
export interface Desk { id: string; zone: string; x: number; z: number }
export const DESKS: Desk[] = (zonesJson.zones as (Zone & { desks?: [number, number][] })[]).flatMap((z) =>
  (z.desks ?? []).map(([dx, dz], i) => ({ id: `${z.id}#${i}`, zone: z.id, x: z.x + dx, z: z.z + dz })),
);
export const deskById = Object.fromEntries(DESKS.map((d) => [d.id, d])) as Record<string, Desk>;
const SEAT_OFF = 0.85;
export const seatOf = (d: Desk): [number, number] => [d.x, d.z + SEAT_OFF];
export const world = (zoneId: string, [dx, dz]: [number, number]): [number, number] => {
  const z = zoneById[zoneId];
  return [z.x + dx, z.z + dz];
};

/** Who sits where: the k-th roster person in a zone at desk #k (lead first, then specialists; server office.ts desk() agrees), hires wherever they were given. */
export const deskOf: Record<string, string> = {};
let session: string | null = null;
export const peopleSession = () => session;
export function resetPeople(key: string) {
  session = key;
  roster.splice(0, roster.length, ...STATIC_ROSTER);
  for (const k of Object.keys(personById)) delete personById[k];
  for (const k of Object.keys(deskOf)) delete deskOf[k];
  const taken: Record<string, number> = {};
  for (const p of roster) {
    personById[p.id] = p;
    const k = (taken[p.zone] = (taken[p.zone] ?? -1) + 1);
    if (deskById[`${p.zone}#${k}`]) deskOf[p.id] = `${p.zone}#${k}`;
  }
}
resetPeople('');
export const sitterAt = (deskId: string) => Object.keys(deskOf).find((id) => deskOf[id] === deskId);
export const freeDesks = () => DESKS.filter((d) => !sitterAt(d.id));

export type HiredPerson = Person & { desk?: string; role?: string; room?: string; hiredAt?: number; status?: string };
/** Adds (or updates) someone in the shared roster: hires and anyone /api/people knows that the static roster doesn't. */
export function addPerson(p: HiredPerson): boolean {
  const known = personById[p.id];
  const desk = p.desk && deskById[p.desk] && !(sitterAt(p.desk) && sitterAt(p.desk) !== p.id) ? p.desk : deskOf[p.id] ?? freeDesks().find((d) => d.zone === roomZone[p.room ?? ''])?.id ?? freeDesks().find((d) => d.zone === 'open_desks')?.id;
  if (desk) deskOf[p.id] = desk;
  const zone = desk ? deskById[desk].zone : p.zone;
  if (known) return false;
  const person = { ...p, zone };
  roster.push(person);
  personById[p.id] = person;
  return true;
}

/** Where a person stands in a zone: their desk seat if it's in that zone, otherwise a visitor slot at the zone front. */
export function spot(zoneId: string, personId: string): [number, number] {
  const z = zoneById[zoneId] ?? zoneById.chai_pantry;
  const d = deskById[deskOf[personId]];
  if (d?.zone === z.id) return seatOf(d);
  if (z.id === 'war_room' && personById[personId]?.zone === 'war_room') return [z.x, z.z + 1.15]; // captain at the head of the war-room table
  const i = roster.findIndex((p) => p.id === personId) % 10;
  return [z.x + (i - 4.5) * 0.55, z.z + z.d / 2 - 0.75 - (i % 2) * 0.6];
}
/** Is (x, z) this person's own desk seat? (called per character per frame) */
export const isSeat = (personId: string, x: number, z: number) => {
  const d = deskById[deskOf[personId]];
  return !!d && Math.hypot(d.x - x, d.z + SEAT_OFF - z) < 0.15;
};

/** Only same-origin gallery pages may become links: `/gallery/<file>` and nothing else (no schemes, no `..`). */
export const galleryUrl = (u?: string): string | null => (u && /^\/gallery\/[\w.\/-]+$/.test(u) && !u.includes('..') ? u : null);

const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** A team colour darkened just enough to read as text on white (WCAG AA 4.5:1). */
export function readable(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  let c = [n >> 16, (n >> 8) & 255, n & 255];
  while (1.05 / (lum(c) + 0.05) < 4.5) c = c.map((v) => Math.floor(v * 0.92));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const LEAD_EMOJI = /^\p{Extended_Pictographic}️?\s*/u;
/** Feed text → display text: drop the leading speaker emoji, turn @ids into @Names. */
export const clean = (text: string) =>
  text.replace(LEAD_EMOJI, '').replace(/@([\w-]+)/g, (m, id) => (personById[id] ? '@' + personById[id].name : m));
/** Display text with Telegram's Markdown markers taken out (canvas walls, previews, captions). */
export const plain = (text: string) => tgPlain(clean(text));
export const firstLine = (text: string) => plain(text).split('\n').find((l) => l.trim()) ?? '';

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
