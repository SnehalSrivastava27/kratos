import rosterJson from '../../../contracts/roster.json';
import zonesJson from '../../../contracts/zones.json';
import type { Person, Zone } from '../shared/types';
import type { Ctx } from './officeState';

export const roster = rosterJson.people as Person[];
export const zones = zonesJson.zones as Zone[];
export const zoneById = Object.fromEntries(zones.map((z) => [z.id, z])) as Record<string, Zone>;
export const personById = Object.fromEntries(roster.map((p) => [p.id, p])) as Record<string, Person>;
export const roomZone = Object.fromEntries(rosterJson.rooms.map((r) => [r.id, r.zone])) as Record<string, string>;
export const ctx: Ctx = { roster, roomZone };

/** Where a person stands inside a zone: a small ring around the centre so people sharing a zone don't overlap. */
export function spot(zoneId: string, personId: string): [number, number] {
  const z = zoneById[zoneId] ?? zoneById.chai_pantry;
  const i = roster.findIndex((p) => p.id === personId);
  const a = (i / roster.length) * Math.PI * 2;
  return [z.x + Math.cos(a) * 0.9, z.z + Math.sin(a) * 0.7];
}
