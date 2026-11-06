// Run: node web/src/office/officeState.check.mjs  (node ≥ 23 strips TS types)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reduce } from './officeState.ts';

const read = (f) => JSON.parse(readFileSync(new URL(`../../../contracts/${f}`, import.meta.url)));
const roster = read('roster.json');
const feed = read('sample-feed.json');
const ctx = { roster: roster.people, roomZone: Object.fromEntries(roster.rooms.map((r) => [r.id, r.zone])) };
const at = (n) => reduce(feed.slice(0, n), ctx);

assert.equal(at(0).people['d2c-ads'].zone, 'chai_pantry');
assert.equal(at(1).people.founder.zone, 'war_room'); // founder walks to war room
assert.equal(at(2).people['d2c-ads'].state, 'working');
assert.equal(at(2).people['d2c-ads'].zone, 'growth_pod');
assert.equal(at(2).people['d2c-captain'].route.length, 7); // 6 desks + back
assert.equal(at(3).people['d2c-analyst'].state, 'done');
assert.ok(at(5).people['d2c-influencers'].beacon);
assert.equal(at(5).ebitda, -76086);
assert.equal(at(6).people['d2c-influencers'].beacon, undefined);
assert.ok(at(7).financeGlow && at(7).ebitda > 0);
assert.match(at(8).people['d2c-captain'].beacon, /founder/);
const end = at(9);
assert.ok(end.confettiId && Object.values(end.people).every((p) => p.state === 'done' && !p.beacon));
// every event changes something visible
for (let i = 1; i <= feed.length; i++) assert.notDeepEqual(at(i), at(i - 1), `event ${i} changed nothing`);
console.log('officeState ok');
