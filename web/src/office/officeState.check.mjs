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
assert.equal(at(2).people['d2c-captain'].route.length, 6); // 5 desks + back
assert.equal(at(3).people['d2c-analyst'].state, 'done');
// specialists start at their desks and get to work when their lead is assigned
assert.equal(at(0).people['d2c-forecaster'].zone, 'data_wall');
assert.equal(at(0).people['d2c-forecaster'].state, 'idle');
assert.equal(at(2).people['d2c-forecaster'].state, 'working');
assert.equal(at(2).people['d2c-copywriter'].state, 'working');
assert.equal(at(2).people['d2c-payroll'].state, 'idle'); // finance isn't on the sale brief
assert.equal(at(feed.findIndex((e) => e.speaker === 'd2c-analyst' && e.type === 'done') + 1).people['d2c-insights'].state, 'done');
assert.equal(at(4).people['d2c-influencers'].state, 'done');
assert.match(at(6).people['d2c-captain'].beacon, /founder/);
const end = at(7);
assert.ok(end.confettiId && Object.values(end.people).every((p) => p.state === 'done' && !p.beacon));
// pushback / approved still work without any finance agent
const pb = reduce([
  { id: 'p1', t: 0, room: 'war_room', speaker: 'd2c-captain', type: 'pushback', text: 'cut it', meta: { targets: ['d2c-influencers'] } },
], ctx);
assert.match(pb.people['d2c-influencers'].beacon, /pushed back/);
const ok = reduce([
  { id: 'p1', t: 0, room: 'war_room', speaker: 'd2c-captain', type: 'pushback', text: 'cut it', meta: { targets: ['d2c-influencers'] } },
  { id: 'p2', t: 1, room: 'war_room', speaker: 'd2c-captain', type: 'approved', text: 'ok', meta: { targets: ['d2c-influencers'] } },
], ctx);
assert.equal(ok.people['d2c-influencers'].beacon, undefined);
// every event changes something visible
for (let i = 1; i <= feed.length; i++) assert.notDeepEqual(at(i), at(i - 1), `event ${i} changed nothing`);
console.log('officeState ok');
const extra = reduce([
  { id: 'x1', t: 0, room: 'ops', speaker: 'd2c-ops', type: 'message', text: 'move stock', meta: { transfers: [{ sku: 'SKU01', from: 'BLR', to: 'DEL', units: 50 }] } },
  { id: 'x2', t: 1, room: 'design', speaker: 'd2c-design', type: 'artifact', text: 'banner', meta: { artifact_url: '/gallery/hero.html' } },
], ctx);
assert.equal(extra.pinPulseId, 'x1');
assert.deepEqual(extra.gallery, ['/gallery/hero.html']);
console.log('extra events ok');
// Switch: private notes never put their text in a bubble; room roles follow the agent's own notices
const msg = (id, speaker, meta) => ({ id, t: 0, room: 'finance', speaker, type: 'message', text: 'secret ₹', meta });
const pv = reduce([msg('v1', 'd2c-finance', { private: true, to: 'd2c-ops' })], ctx).people['d2c-finance'].bubble;
assert.ok(pv.priv && pv.text === '');
const role = (action, who = 'd2c-finance', r = 'finance-approver') => msg(`r-${who}-${action}`, who, { switch_role: { role: r, action } });
assert.equal(reduce([role('assumed')], ctx).people['d2c-finance'].role, 'finance-approver');
assert.equal(reduce([role('assumed'), role('released')], ctx).people['d2c-finance'].role, undefined);
const moved = reduce([role('assumed'), role('assumed', 'd2c-payroll')], ctx).people;
assert.ok(!moved['d2c-finance'].role && moved['d2c-payroll'].role === 'finance-approver'); // one holder at a time
assert.equal(reduce([role('assumed', 'founder')], ctx).people.founder.role, undefined); // only agents
assert.equal(reduce([msg('m', 'd2c-finance', { switch_role: { action: 'assumed' } })], ctx).people['d2c-finance'].role, undefined); // tolerant
console.log('switch extras ok');
