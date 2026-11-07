// The floor plan's fixed numbers (walls, doorways, the front door, cable lanes, bookcases, the founder's
// stations), in one pure module so world.ts, the engine and nav.check.mjs (plain node) agree.
// Zones themselves live in contracts/zones.json. Units: metres, x right, z towards the camera.
import type { Rect } from './nav';

/**
 * The walkable floor, inside the walls: an 88 × 44 m HQ. The original 44 × 22 m office (contracts/zones.json) is the
 * front-left block (CORE); the north wing sits behind its back wall and the east wing runs the full depth.
 */
export const FLOOR: Rect = { minX: -24.0, maxX: 64.0, minZ: -33.0, maxZ: 11.0 };
/** The original office's block: the department zones, the people and the Switch cables all live in here. */
export const CORE: Rect = { minX: -24.0, maxX: 20.0, minZ: -11.0, maxZ: 11.0 };
/**
 * backZ: the original office's back wall (now an inner wall into the north wing; its wall screens still hang on it);
 * backEnd: where it stops (open to the east wing); outerBackZ: the HQ's back wall; leftX: the inner wall into the
 * west wing (library, finance cabin, open desks); outerX: the west wall. Values are wall centres.
 */
export const WALL = { h: 2.6, t: 0.3, backZ: -11.15, backEnd: 20.15, outerBackZ: -33.15, leftX: -16.15, outerX: -24.15 };
/** x spans of the back wall's doorways into the north wing, on the two aisles. */
export const BACK_DOORS: [number, number][] = [[-6.4, -2.8], [6.45, 10.05]];
/** z spans of the inner wall's doorways: one off each cross corridor. */
export const DOORS: [number, number][] = [[-5.6, -3.7], [2.6, 4.5]];
/** The front door: the open front edge at reception, where new hires walk in. */
export const DOOR: [number, number] = [8.75, 10.6];
/** Cross corridors (z) and the two north–south aisles (x) the Switch cables run along. */
export const LANES = { back: -4.5, front: 3.65, aisles: [-4.6, 8.25] };

/** The inner wall, solid between its doorways (for the nav grid). */
export function innerWall(): Rect[] {
  const out: Rect[] = [];
  let z0 = CORE.minZ;
  for (const [a, b] of [...DOORS, [FLOOR.maxZ + 0.3, FLOOR.maxZ + 0.3]]) {
    out.push({ minX: WALL.leftX - WALL.t / 2, maxX: WALL.leftX + WALL.t / 2, minZ: z0, maxZ: a });
    z0 = b;
  }
  return out;
}

/** The old back wall, solid between its doorways, from the west wall to its open east end (for the nav grid). */
export function backWall(): Rect[] {
  const out: Rect[] = [];
  let x0 = FLOOR.minX;
  for (const [a, b] of [...BACK_DOORS, [WALL.backEnd, WALL.backEnd]]) {
    out.push({ minX: x0, maxX: a, minZ: WALL.backZ - WALL.t / 2, maxZ: WALL.backZ + WALL.t / 2 });
    x0 = b;
  }
  return out;
}

/**
 * The new wings' rooms: web-only and decorative (nobody is seated here; the server never sees them). The founder
 * wanted room to walk, not more desks: most of the new floor is open corridor and atrium between these.
 * meeting = a glass room with a table; lounge = sofa nooks; pantry = a kitchen and café tables;
 * atrium = a big planter ringed by benches; townhall = benches facing the hackathon screen.
 */
export type AnnexKind = 'meeting' | 'lounge' | 'pantry' | 'atrium' | 'townhall';
export interface Annex { id: string; label: string; kind: AnnexKind; color: string; x: number; z: number; w: number; d: number }
export const ANNEX: Annex[] = [
  // North wing (behind the old back wall): its corridors line up with the doorways on the aisles (x -4.6, 8.25).
  { id: 'briefing', label: "Captain's Briefing Room", kind: 'meeting', color: '#F4A300', x: -15.3, z: -28.2, w: 16, d: 8.6 },
  { id: 'focus_room', label: 'Focus Room', kind: 'meeting', color: '#3390EC', x: 1.8, z: -28.2, w: 8.2, d: 8.6 },
  { id: 'reading_lounge', label: 'Reading Lounge', kind: 'lounge', color: '#c98b5a', x: 15.1, z: -28.2, w: 9.2, d: 8.6 },
  { id: 'garden', label: 'Garden Atrium', kind: 'atrium', color: '#3CCB8B', x: -15.3, z: -16.4, w: 16, d: 8.2 },
  // East wing: a 4 m boulevard (x 20..24) down its west side, wide cross corridors between the rows.
  { id: 'boardroom', label: 'Boardroom', kind: 'meeting', color: '#7C3AED', x: 32, z: -28.2, w: 15, d: 8.6 },
  { id: 'sky_lounge', label: 'Sky Lounge', kind: 'lounge', color: '#5b8def', x: 54, z: -28.2, w: 18, d: 8.6 },
  { id: 'cafe', label: 'Café & Pantry', kind: 'pantry', color: '#F4A300', x: 32, z: -13.2, w: 15, d: 10.4 },
  { id: 'atrium', label: 'Atrium', kind: 'atrium', color: '#22D3EE', x: 54, z: -13.2, w: 18, d: 10.4 },
  { id: 'town_hall', label: 'Town Hall', kind: 'townhall', color: '#22D3EE', x: 32, z: 4.4, w: 15, d: 12 },
  { id: 'glass_room', label: 'Glass Room', kind: 'meeting', color: '#DB2777', x: 54, z: 4.6, w: 10, d: 9.2 },
];

/** The Town Hall's big screen (the hackathon page, facing +z at the back of the room). */
export const HACK_SCREEN = (() => {
  const t = ANNEX.find((a) => a.id === 'town_hall')!;
  return { x: t.x, z: t.z - t.d / 2 + 0.9, w: 8.0, h: 5.0, y: 3.2 }; // h: the page shot (16:9) under a label bar
})();
export const HACKATHON_URL = 'https://www.wemakedevs.org/hackathons/switch';

/** The library's two rows of bookcases facing the room (+z): against the back wall, and a freestanding row. */
export const BOOK_ROWS = [
  { x: -20.0, z: -10.75, w: 1.5, h: 2.4, levels: 5, shelves: ['war_room', 'analytics', 'ads', 'creators'] },
  { x: -20.2, z: -6.7, w: 1.2, h: 1.9, levels: 4, shelves: ['ops', 'design', 'engineering', 'general'] },
] as const;
export const BOOK_DEPTH = 0.45;
export const bookcaseSolids = (): Rect[] => BOOK_ROWS.map((r) => {
  const half = (r.w * r.shelves.length) / 2;
  return { minX: r.x - half, maxX: r.x + half, minZ: r.z - BOOK_DEPTH / 2, maxZ: r.z + BOOK_DEPTH / 2 };
});

type Box = { x: number; z: number; w: number; d: number };
/** The Switch core stands in front of the Telegram wall, in the middle of the back row. */
export const corePos = (hub: Box): [number, number] => [hub.x, hub.z - 0.9];

/**
 * The founder's stations: things you walk up to and press E at. `at` is what you face (the hotspot), `stand`
 * a free spot in reach of it (nav.check.mjs walks there from the door), `reach` how near counts.
 */
export type StationId = 'plan' | 'kpi' | 'hire' | 'ledger' | 'chai' | 'switch';
export interface Station { at: [number, number]; stand: [number, number]; reach: number }
export function stations(z: Record<string, Box>): Record<StationId, Station> {
  const war = z.war_room, dw = z.data_wall, rc = z.reception, fin = z.finance_cabin, chai = z.chai_pantry;
  const [cx, cz] = corePos(z.telegram_hub);
  return {
    plan: { at: [war.x, war.z - 0.1], stand: [war.x - 1.0, war.z + 1.25], reach: 2.4 }, // the war-room table (its screen behind)
    kpi: { at: [dw.x, CORE.minZ + 0.3], stand: [dw.x, CORE.minZ + 1.6], reach: 2.6 }, // the aisle in front of the Data Wall
    hire: { at: [rc.x + 0.85, rc.z - 0.6], stand: [rc.x + 0.85, rc.z + 0.65], reach: 1.8 }, // the reception counter
    ledger: { at: [WALL.outerX + WALL.t / 2, fin.z - 1.0], stand: [WALL.outerX + 1.4, fin.z - 1.0], reach: 2.2 }, // the P&L screen on the west wall
    chai: { at: [chai.x + 0.4, chai.z - 1.05], stand: [chai.x + 0.4, chai.z + 0.1], reach: 1.9 }, // the chai counter
    switch: { at: [cx, cz], stand: [cx, cz + 1.25], reach: 2.0 },
  };
}
