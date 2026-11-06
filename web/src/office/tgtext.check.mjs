// Run: node web/src/office/tgtext.check.mjs  (node ≥ 23 strips TS types)
import assert from 'node:assert/strict';
import { inline, tgLine, tgPlain, safeHref } from './tgtext.ts';

assert.deepEqual(inline('a **b** c'), ['a ', { t: 'b', kids: ['b'] }, ' c']);
assert.deepEqual(inline('**_bi_**'), [{ t: 'b', kids: [{ t: 'i', kids: ['bi'] }] }]);
assert.deepEqual(inline('`**x**`'), [{ t: 'code', kids: ['**x**'] }], 'code first: no bold inside');
assert.deepEqual(inline('~~old~~ *it*'), [{ t: 's', kids: ['old'] }, ' ', { t: 'i', kids: ['it'] }]);
assert.deepEqual(inline('snake_case_name'), ['snake_case_name'], 'underscores inside words stay');
assert.deepEqual(inline('[x](javascript:alert(1))'), ['x', ')'], 'no js: links');
assert.equal(inline('[b](/gallery/a.html)')[0].href, '/gallery/a.html');
assert.equal(safeHref('/gallery/../x'), null);
assert.deepEqual(tgLine('- item'), ['• item']);
assert.deepEqual(tgLine('# Title'), [{ t: 'b', kids: ['Title'] }]);
assert.equal(tgPlain('**Plan**\n\n- 30% off\n- _5 days_'), 'Plan\n\n• 30% off\n• 5 days');
// unmatched markers stay fast (the cap + no '[' in link labels)
for (const bad of ['['.repeat(60000), '[a'.repeat(30000), '**a'.repeat(20000), '_x '.repeat(20000)]) {
  const t0 = performance.now();
  inline(bad);
  assert.ok(performance.now() - t0 < 300, `slow on ${bad.slice(0, 6)}… (${Math.round(performance.now() - t0)} ms)`);
}
console.log('tgtext ok');
