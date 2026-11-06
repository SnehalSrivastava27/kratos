// Run: node web/src/office/inr.check.mjs  (node ≥ 23 strips TS types)
import assert from 'node:assert/strict';
import { count, inr } from './inr.ts';

assert.equal(inr(48_20_000), '₹48.2L');
assert.equal(inr(4_30_000), '₹4.3L');
assert.equal(inr(1_00_000), '₹1L');
assert.equal(inr(2_45_00_000), '₹2.45 Cr');
assert.equal(inr(12_50_00_00_000), '₹1250 Cr');
assert.equal(inr(785), '₹785');
assert.equal(inr(12345), '₹12,345');
assert.equal(inr(-4_30_000), '−₹4.3L');
assert.equal(inr(null), '—');
assert.equal(count(123456), '1,23,456');
console.log('inr ok');
