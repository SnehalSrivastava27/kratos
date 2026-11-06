import rosterJson from '../../../contracts/roster.json';
import zonesJson from '../../../contracts/zones.json';
import type { Person, Zone } from '../shared/types';

export const roster = rosterJson.people as Person[];
export const zones = zonesJson.zones as Zone[];
export const zoneById = Object.fromEntries(zones.map((z) => [z.id, z])) as Record<string, Zone>;
export const personById = Object.fromEntries(roster.map((p) => [p.id, p])) as Record<string, Person>;
export const roomZone = Object.fromEntries(rosterJson.rooms.map((r) => [r.id, r.zone])) as Record<string, string>;

// Each person's home spot: offset slightly from zone centre so people sharing a zone don't overlap.
export function homeOf(p: Person): [number, number] {
  const z = zoneById[p.zone];
  return [z.x, z.z + 0.6];
}
