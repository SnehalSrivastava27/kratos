// Usage: node demo/validate.mjs demo/feeds/sale-demo.json
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const contract = (f) => read(new URL(`../contracts/${f}`, import.meta.url));
const feed = read(process.argv[2] ?? new URL('feeds/sale-demo.json', import.meta.url));
const errors = [];
const fail = (msg) => errors.push(msg);

// 1. Schema
const check = new Ajv({ allErrors: true }).compile(contract('events.schema.json'));
if (!Array.isArray(feed)) fail('feed must be an array');
feed.forEach((e) => check(e) || fail(`${e.id}: ${JSON.stringify(check.errors)}`));

// 2. Ids, timing, speakers, Telegram style
const people = new Set(contract('roster.json').people.map((p) => p.id));
const ids = new Set();
feed.forEach((e, i) => {
  if (ids.has(e.id)) fail(`${e.id}: duplicate id`);
  ids.add(e.id);
  if (i && e.t < feed[i - 1].t) fail(`${e.id}: t goes backwards`);
  if (!people.has(e.speaker)) fail(`${e.id}: unknown speaker ${e.speaker}`);
  for (const id of e.meta?.targets ?? []) if (!people.has(id)) fail(`${e.id}: unknown target ${id}`);
  if (!/^\p{Extended_Pictographic}/u.test(e.text)) fail(`${e.id}: text must start with an emoji`);
  if (e.text.includes('|')) fail(`${e.id}: no tables`);
  for (const line of e.text.split('\n')) if ([...line].length > 45) fail(`${e.id}: line too long: "${line}"`);
});
if (feed.length < 35 || feed.length > 50) fail(`expected 35–50 events, got ${feed.length}`);
const end = feed.at(-1)?.t ?? 0;
if (end < 35000 || end > 55000) fail(`expected ~45s run, last t = ${end}`);
if (!feed.some((e) => e.type === 'working')) fail('no working events');

// 3. Story beats in order, with PLAN §7 numbers
const has = (s) => (e) => e.text.includes(s);
const transfer = (sku, units) => (e) =>
  e.meta?.transfers?.some((x) => x.sku === sku && x.to === 'Delhi' && x.units === units);
const beats = [
  ['founder prompt', (e) => e.speaker === 'founder' && has('₹5L')(e)],
  ['captain assigns', (e) => e.speaker === 'd2c-captain' && e.type === 'assign'],
  ['analyst forecast', (e) => e.speaker === 'd2c-analyst' && e.type === 'done' &&
    ['SKU01 · 800', 'SKU02 · 1,400', 'SKU03 · 600', 'SKU04 · 240', 'SKU05 · 300', '₹20.4L'].every((s) => has(s)(e))],
  ['ads plan', (e) => e.speaker === 'd2c-ads' && e.type === 'done'],
  ['creators top-4 ₹3.55L', (e) => e.speaker === 'd2c-influencers' && e.type === 'done' && has('₹3.55L')(e)],
  ['ops transfers (Delhi SKU01 70 + SKU05 40)', (e) => transfer('SKU01', 70)(e) && transfer('SKU05', 40)(e)],
  ['hero artifact', (e) => e.type === 'artifact' && e.meta?.artifact_url === '/gallery/hero.html'],
  ['serum artifact', (e) => e.type === 'artifact' && e.meta?.artifact_url === '/gallery/serum.html'],
  ['glowkit artifact', (e) => e.type === 'artifact' && e.meta?.artifact_url === '/gallery/glowkit.html'],
  ['finance pushback', (e) => e.type === 'pushback' && e.meta?.ebitda === -76086],
  ['revised creators ₹1.18L', (e) => e.speaker === 'd2c-influencers' && e.type === 'done' && has('₹1.18L')(e)],
  ['finance approved', (e) => e.type === 'approved' && e.meta?.ebitda === 160914],
  ['captain asks founder', (e) => e.speaker === 'd2c-captain' && e.type === 'approval_needed' && e.meta?.targets?.includes('founder')],
  ['founder celebrates', (e) => e.speaker === 'founder' && e.type === 'celebrate'],
];
let at = 0;
for (const [name, ok] of beats) {
  const i = feed.findIndex((e, j) => j >= at && ok(e));
  if (i < 0) fail(`missing or out of order: ${name}`);
  else at = i + 1;
}
// Any EBITDA shown must be one of the PLAN §7 numbers
for (const e of feed) if ('ebitda' in (e.meta ?? {}) && ![128914, -76086, 160914].includes(e.meta.ebitda))
  fail(`${e.id}: unexpected ebitda ${e.meta.ebitda}`);

if (errors.length) { console.error(`❌ ${errors.length} problem(s)\n` + errors.join('\n')); process.exit(1); }
console.log(`✅ ${feed.length} events, ${end / 1000}s, schema + story order + numbers OK`);
