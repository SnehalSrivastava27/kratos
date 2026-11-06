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

// The real floor (contracts/zones.json): every desk seat is reachable from the front door, round the
// desks, the inner west wall (two doorways) and the library's bookcases. Mirrors world.ts / library.ts numbers.
import { readFileSync } from 'node:fs';
const { zones } = JSON.parse(readFileSync(new URL('../../../../contracts/zones.json', import.meta.url)));
const DESK = { w: 1.8, d: 0.9 }, SEAT = 0.85;
const desks = zones.flatMap((z) => (z.desks ?? []).map(([dx, dz], i) => ({ id: `${z.id}#${i}`, x: z.x + dx, z: z.z + dz })));
const solids = desks.map((d) => ({ minX: d.x - DESK.w / 2, maxX: d.x + DESK.w / 2, minZ: d.z - DESK.d / 2, maxZ: d.z + DESK.d / 2 }));
const wallX = -12.15, t = 0.15;
for (const [a, b] of [[-8.0, -6.6], [-5.0, 2.0], [3.6, 8.3]]) solids.push({ minX: wallX - t, maxX: wallX + t, minZ: a, maxZ: b });
solids.push({ minX: -17.8, maxX: -12.4, minZ: -7.98, maxZ: -7.52 }, { minX: -17.1, maxX: -12.9, minZ: -4.93, maxZ: -4.47 }); // bookcases
const fin = zones.find((z) => z.id === 'finance_cabin');
assert.ok(fin, 'finance cabin zone exists');
solids.push({ minX: -18.0, maxX: -17.4, minZ: fin.z - 1.3, maxZ: fin.z - 0.7 }, { minX: -18.0, maxX: -17.3, minZ: fin.z + 0.05, maxZ: fin.z + 0.75 }); // cabinet, safe
const floor = new NavGrid({ minX: -18.0, maxX: 12.3, minZ: -8.0, maxZ: 8.3 }, solids, 0.28);
const seen = new Set();
for (const d of desks) {
  assert.ok(!seen.has(`${d.x},${d.z}`), `${d.id} sits on another desk`);
  seen.add(`${d.x},${d.z}`);
  for (const o of desks) if (o !== d) assert.ok(Math.abs(o.x - d.x) >= DESK.w || Math.abs(o.z - d.z) >= DESK.d + 0.6, `${d.id} overlaps ${o.id}`);
  const [sx, sz] = [d.x, d.z + SEAT];
  const legs = floor.path(5.0, 8.0, sx, sz);
  let [x, z] = [5.0, 8.0];
  legs.forEach(([nx, nz], k) => {
    assert.ok(k === legs.length - 1 || floor.clear(x, z, nx, nz), `${d.id}: leg ${k} blocked`);
    [x, z] = [nx, nz];
  });
}
// the last hop into a seat is short: the path really got there, not a straight line through the furniture
for (const d of desks) {
  const legs = floor.path(5.0, 8.0, d.x, d.z + SEAT);
  const prev = legs.length > 1 ? legs[legs.length - 2] : [5.0, 8.0];
  assert.ok(legs.length === 1 ? floor.clear(5.0, 8.0, d.x, d.z + SEAT) : floor.clear(prev[0], prev[1], d.x, d.z + SEAT) || Math.hypot(prev[0] - d.x, prev[1] - d.z - SEAT) < 1.2, `${d.id}: unreachable ${JSON.stringify(legs)}`);
}
console.log(`floor ok: ${desks.length} desks reachable`);
