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
