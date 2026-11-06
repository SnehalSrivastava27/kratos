// Run: node web/src/office/demoScript.check.mjs  (node ≥ 23 strips TS types)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decide, isGate, nextGate, revision } from './demoScript.ts';

const feed = JSON.parse(readFileSync(new URL('../../../demo/feeds/sale-demo.json', import.meta.url)));
const humans = new Set(['founder']);
const g = nextGate(feed, 0, humans);
assert.ok(g > 0, 'the story has an approval gate for the founder');
assert.equal(feed[g].type, 'approval_needed');
assert.ok(feed.slice(0, g).every((e) => !isGate(e, humans)), 'nothing before it waits');
assert.equal(nextGate(feed, feed.length, humans), -1);
// An approval between agents (e.g. Finance asking the Captain) plays on; one to the founder waits.
assert.equal(isGate({ type: 'approval_needed', meta: { targets: ['d2c-captain'] } }, humans), false);
assert.equal(isGate({ type: 'approval_needed', meta: { targets: ['founder'] } }, humans), true);
assert.equal(isGate({ type: 'approval_needed' }, humans), true);
assert.deepEqual(decide('Approved ✅'), { approve: true });
assert.deepEqual(decide('yes'), { approve: true });
assert.deepEqual(decide('Please change: less ads'), { approve: false, ask: 'less ads' });
const rev = revision(1, { founder: 'founder', captain: 'd2c-captain', lead: { id: 'd2c-ads', emoji: '📣' } });
assert.ok(isGate(rev[rev.length - 1], humans), 'a revision ends by asking again');
assert.equal(new Set(rev.map((e) => e.id)).size, rev.length);
assert.ok(rev.every((e, i) => i === 0 || e.t > rev[i - 1].t));
console.log('demoScript: ok');
