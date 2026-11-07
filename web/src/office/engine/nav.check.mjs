// Run: node web/src/office/engine/nav.check.mjs  (node ≥ 23 strips TS types)
import assert from 'node:assert/strict';
import { NavGrid } from './nav.ts';

const wall = { minX: -0.2, maxX: 0.2, minZ: -3, maxZ: 2 }; // a wall with a way round its +z end
const nav = new NavGrid({ minX: -5, maxX: 5, minZ: -4, maxZ: 4 }, [wall], 0.3);
const p = nav.path(-2, 0, 2, 0);
assert.ok(p.length >= 2, 'goes round, not through');
let [x, z] = [-2, 0];
for (const [nx, nz] of p) {
  assert.ok(nav.clear(x, z, nx, nz) || !nav.free(nx, nz), `leg ${x},${z} → ${nx},${nz} crosses the wall`);
  [x, z] = [nx, nz];
}
assert.deepEqual(p.at(-1), [2, 0]);
assert.ok(p.every(([, z]) => z > -3), 'took the open end');
assert.deepEqual(nav.path(-2, 3, 2, 3), [[2, 3]], 'clear line: one leg');
// a goal tucked inside a grown rect (a desk seat) is still reached
const q = nav.path(-2, 0, 0, 2.1);
assert.deepEqual(q.at(-1), [0, 2.1]);
console.log('nav ok');

// The real floor (contracts/zones.json + layout.ts): every desk seat and every station the founder uses (E) is
// reachable from the front door, round the desks, the inner west wall (two doorways), the bookcases and the big
// fixed pieces (war-room glass + table, huddle room, reception counter + sample wall, the Switch core, finance cabinet
// and safe). The live office runs the same check on its exact furniture: window.__hqReach() (dev).
import { readFileSync } from 'node:fs';
import { ANNEX, BOOK_ROWS, BOOK_DEPTH, CORE, DOOR, FLOOR, HACK_SCREEN, WALL, ZONE_MOVES, backWall, placeZone, bookcaseSolids, corePos, innerWall, stations } from './layout.ts';
const zones = JSON.parse(readFileSync(new URL('../../../../contracts/zones.json', import.meta.url))).zones.map(placeZone); // as the web floor places them
const Z = Object.fromEntries(zones.map((z) => [z.id, z]));
const roster = JSON.parse(readFileSync(new URL('../../../../contracts/roster.json', import.meta.url))).people;
const DESK = { w: 1.8, d: 0.9 }, SEAT = 0.85;
const desks = zones.flatMap((z) => (z.desks ?? []).map(([dx, dz], i) => ({ id: `${z.id}#${i}`, x: z.x + dx, z: z.z + dz })));
// every roster person has a desk in their zone (the k-th sits at desk #k; server office.ts desk() agrees)
const inZone = {};
for (const p of roster) inZone[p.zone] = (inZone[p.zone] ?? 0) + 1;
for (const [zone, n] of Object.entries(inZone)) if (zone !== 'war_room') assert.ok((Z[zone]?.desks?.length ?? 0) >= n, `${zone}: ${n} people, ${Z[zone]?.desks?.length ?? 0} desks`);
// every contract zone is in the original block, every annex room on the new floor, and no two rooms overlap
const inside = (z, b) => z.x - z.w / 2 >= b.minX - 0.01 && z.x + z.w / 2 <= b.maxX + 0.01 && z.z - z.d / 2 >= b.minZ - 0.01 && z.z + z.d / 2 <= b.maxZ + 0.01;
for (const z of zones) assert.ok(ZONE_MOVES[z.id] ? inside(z, FLOOR) && !inside(z, CORE) : inside(z, CORE), `${z.id} not where it belongs`);
for (const z of ANNEX) assert.ok(inside(z, FLOOR) && !(z.x > CORE.minX && z.x < CORE.maxX && z.z > CORE.minZ && z.z < CORE.maxZ), `${z.id} off the new wings`);
for (const z of [...zones, ...ANNEX]) {
  for (const o of [...zones, ...ANNEX]) if (o !== z) assert.ok(Math.abs(o.x - z.x) >= (o.w + z.w) / 2 - 0.01 || Math.abs(o.z - z.z) >= (o.d + z.d) / 2 - 0.01, `${z.id} overlaps ${o.id}`);
}
const solids = desks.map((d) => ({ minX: d.x - DESK.w / 2, maxX: d.x + DESK.w / 2, minZ: d.z - DESK.d / 2, maxZ: d.z + DESK.d / 2 }));
const r = (x, z, w, d) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
solids.push(...innerWall(), ...backWall(), ...bookcaseSolids());
solids.push(r(HACK_SCREEN.x, HACK_SCREEN.z, HACK_SCREEN.w + 0.4, 0.5)); // the hackathon screen's stand
const fin = Z.finance_cabin, war = Z.war_room, mr = Z.meeting_room, rc = Z.reception;
const wallX = WALL.outerX + WALL.t / 2;
solids.push(r(wallX + 0.32, fin.z - 1.0, 0.62, 0.65), r(wallX + 0.36, fin.z + 0.4, 0.7, 0.75)); // cabinet, safe
solids.push(r(war.x, war.z - 0.1, 3.8, 1.6), r(war.x - 4.2, war.z - 0.1, 0.1, 5.5), r(war.x + 4.2, war.z - 0.1, 0.1, 5.5), r(war.x - 2.85, war.z + 2.65, 2.8, 0.1), r(war.x + 2.85, war.z + 2.65, 2.8, 0.1));
solids.push(r(war.x - 1.3, war.z - 2.6, 0.12, 0.12), r(war.x + 1.3, war.z - 2.6, 0.12, 0.12));
solids.push(r(mr.x, mr.z - 2.2, 4.3, 0.1), r(mr.x - 2.05, mr.z - 0.1, 0.1, 4.3), r(mr.x + 2.05, mr.z - 1.0, 0.1, 2.5), r(mr.x, mr.z - 0.4, 1.5, 1.5));
const st = stations(Z);
solids.push(r(st.hire.at[0], st.hire.at[1], 2.36, 0.86), r(rc.x - 1.65, rc.z - 0.2, 1.5, 2.2)); // counter, sample wall (angled: its bounding box)
const [cx, cz] = corePos(Z.telegram_hub);
solids.push(r(cx, cz, 1.7, 1.7));
const floor = new NavGrid(FLOOR, solids, 0.28);
assert.ok(floor.free(...DOOR), 'the front door is on free floor');
/** A path from the door to (x, z) that never crosses a solid, except for a short last hop into a seat. */
function reach(id, x, z, hop) {
  const legs = floor.path(DOOR[0], DOOR[1], x, z);
  let [px, pz] = DOOR;
  legs.forEach(([nx, nz], k) => {
    assert.ok(k === legs.length - 1 || floor.clear(px, pz, nx, nz), `${id}: leg ${k} blocked`);
    [px, pz] = [nx, nz];
  });
  const prev = legs.length > 1 ? legs[legs.length - 2] : DOOR;
  assert.ok(floor.clear(prev[0], prev[1], x, z) || Math.hypot(prev[0] - x, prev[1] - z) < hop, `${id}: unreachable ${JSON.stringify(legs)}`);
}
const seen = new Set();
for (const d of desks) {
  assert.ok(!seen.has(`${d.x},${d.z}`), `${d.id} sits on another desk`);
  seen.add(`${d.x},${d.z}`);
  for (const o of desks) if (o !== d) assert.ok(Math.abs(o.x - d.x) >= DESK.w || Math.abs(o.z - d.z) >= DESK.d + 0.6, `${d.id} overlaps ${o.id}`);
  reach(d.id, d.x, d.z + SEAT, 1.2);
}
for (const [id, s] of Object.entries(st)) {
  assert.ok(floor.free(...s.stand), `${id}: its standing spot is inside furniture`);
  assert.ok(Math.hypot(s.stand[0] - s.at[0], s.stand[1] - s.at[1]) < s.reach, `${id}: standing spot out of reach`);
  reach(`station ${id}`, ...s.stand, 0.01);
}
for (const row of BOOK_ROWS) row.shelves.forEach((id, i) => {
  const x = row.x + (i - (row.shelves.length - 1) / 2) * row.w;
  reach(`shelf ${id}`, x, row.z + BOOK_DEPTH / 2 + 0.75, 0.01);
});
// the hackathon screen (Town Hall) and the far corners of both wings
for (const [id, x, z] of [['hackathon screen', HACK_SCREEN.x, HACK_SCREEN.z + 1.8], ['north-west corner', FLOOR.minX + 1, FLOOR.minZ + 1], ['east wing far corner', FLOOR.maxX - 1, FLOOR.minZ + 1]]) {
  assert.ok(floor.free(x, z), `${id}: blocked`);
  reach(id, x, z, 0.01);
}
console.log(`floor ok: ${FLOOR.maxX - FLOOR.minX} x ${FLOOR.maxZ - FLOOR.minZ} m, ${desks.length} desks, ${ANNEX.length} new rooms, ${Object.keys(st).length} stations and 8 shelves reachable`);
