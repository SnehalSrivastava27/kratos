// The floor plan's fixed numbers (walls, doorways, the front door, cable lanes, bookcases, the founder's
// stations), in one pure module so world.ts, the engine and nav.check.mjs (plain node) agree.
// Zones themselves live in contracts/zones.json. Units: metres, x right, z towards the camera.
import type { Rect } from './nav';

/** The walkable floor, inside the walls: a 44 × 22 m office (the west wing is x < WALL.leftX). */
export const FLOOR: Rect = { minX: -24.0, maxX: 20.0, minZ: -11.0, maxZ: 11.0 };
/** leftX: the inner wall into the west wing (library, finance cabin, open desks); outerX: the west wall. Values are wall centres. */
export const WALL = { h: 2.6, t: 0.3, backZ: -11.15, leftX: -16.15, outerX: -24.15 };
/** z spans of the inner wall's doorways: one off each cross corridor. */
export const DOORS: [number, number][] = [[-5.6, -3.7], [2.6, 4.5]];
/** The front door: the open front edge at reception, where new hires walk in. */
export const DOOR: [number, number] = [8.75, 10.6];
/** Cross corridors (z) and the two north–south aisles (x) the Switch cables run along. */
export const LANES = { back: -4.5, front: 3.65, aisles: [-4.6, 8.25] };

/** The inner wall, solid between its doorways (for the nav grid). */
export function innerWall(): Rect[] {
  const out: Rect[] = [];
  let z0 = FLOOR.minZ;
  for (const [a, b] of [...DOORS, [FLOOR.maxZ + 0.3, FLOOR.maxZ + 0.3]]) {
    out.push({ minX: WALL.leftX - WALL.t / 2, maxX: WALL.leftX + WALL.t / 2, minZ: z0, maxZ: a });
    z0 = b;
  }
  return out;
}

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
    kpi: { at: [dw.x, FLOOR.minZ + 0.3], stand: [dw.x, FLOOR.minZ + 1.6], reach: 2.6 }, // the aisle in front of the Data Wall
    hire: { at: [rc.x + 0.85, rc.z - 0.6], stand: [rc.x + 0.85, rc.z + 0.65], reach: 1.8 }, // the reception counter
    ledger: { at: [WALL.outerX + WALL.t / 2, fin.z - 1.0], stand: [WALL.outerX + 1.4, fin.z - 1.0], reach: 2.2 }, // the P&L screen on the west wall
    chai: { at: [chai.x + 0.4, chai.z - 1.05], stand: [chai.x + 0.4, chai.z + 0.1], reach: 1.9 }, // the chai counter
    switch: { at: [cx, cz], stand: [cx, cz + 1.25], reach: 2.0 },
  };
}
