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
// Text as the reader sees it in Telegram: **bold** and _italic_ marks dropped (scripts/tg-render.py shows the HTML).
const plain = (text) => text.replace(/\*\*|(?<!\w)_|_(?!\w)/g, '');
// Agents write like switch/agents/*.md: line 1 is one emoji + **title**; blank lines between groups are fine.
const TITLE = /^\p{Extended_Pictographic}\uFE0F? \*\*[^*\n]+\*\*$/u;
const ids = new Set();
feed.forEach((e, i) => {
  if (ids.has(e.id)) fail(`${e.id}: duplicate id`);
  ids.add(e.id);
  if (i && e.t < feed[i - 1].t) fail(`${e.id}: t goes backwards`);
  if (!people.has(e.speaker)) fail(`${e.id}: unknown speaker ${e.speaker}`);
  for (const id of e.meta?.targets ?? []) if (!people.has(id)) fail(`${e.id}: unknown target ${id}`);
  if (!/^\p{Extended_Pictographic}/u.test(e.text)) fail(`${e.id}: text must start with an emoji`);
  else if (e.speaker !== 'founder' && !TITLE.test(e.text.split('\n')[0])) fail(`${e.id}: line 1 must be an emoji then a **bold title**`);
  if (e.text.includes('|')) fail(`${e.id}: no tables`);
  if (/₹0\.\d/.test(e.text)) fail(`${e.id}: under ₹1L write the rupees (₹90,000), not ₹0.xL`);
  if (e.meta?.artifact_url && !/^\/gallery\/[\w.\/-]+$/.test(e.meta.artifact_url)) fail(`${e.id}: artifact_url must be /gallery/...`);
  if (e.meta?.private && !(e.meta.to && e.meta.targets?.includes(e.meta.to))) fail(`${e.id}: a private note needs meta.to in meta.targets`);
  for (const line of plain(e.text).split('\n')) if ([...line].length > 45) fail(`${e.id}: line too long: "${line}"`);
});
if (feed.length < 35 || feed.length > 50) fail(`expected 35–50 events, got ${feed.length}`);
const end = feed.at(-1)?.t ?? 0;
if (end < 40000 || end > 50000) fail(`expected ~45s run, last t = ${end}`);
if (!feed.some((e) => e.type === 'working')) fail('no working events');

// 3. Story beats in order, with PLAN §7 numbers
const has = (s) => (e) => plain(e.text).includes(s);
// `label` then `value` on one line, e.g. "- **SKU01 Serum:** **800** units".
const pair = (label, value) => (e) => plain(e.text).split('\n').some((l) => l.includes(label) && l.includes(value, l.indexOf(label) + label.length));
const by = (speaker, type) => (e) => e.speaker === speaker && e.type === type;
const transfer = (sku, units) => (e) =>
  e.meta?.transfers?.some((x) => x.sku === sku && x.from === 'Mumbai' && x.to === 'Delhi' && x.units === units);
const lakh = (rupees) => `₹${+(rupees / 1e5).toFixed(2)}L`;

// Creators: fees of the named creators come from data/influencers.csv; must fit the ₹1.5L guidance.
const budget = read(new URL('../data/budget.json', import.meta.url));
const creators = readFileSync(new URL('../data/influencers.csv', import.meta.url), 'utf8')
  .trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => ({ name: c[0], fee: +c[5] }));
const pick = feed.find(by('d2c-influencers', 'done'));
const picked = creators.filter((c) => pick && has(c.name)(pick));
const creatorFee = picked.reduce((a, c) => a + c.fee, 0);
if (picked.length !== 4) fail(`creators: expected 4 named creators, got ${picked.length}`);
if (creatorFee > budget.guidance.influencers) fail(`creators: ${lakh(creatorFee)} over ${lakh(budget.guidance.influencers)} guidance`);
const marketing = budget.guidance.ads + creatorFee + budget.guidance.creative_production;
if (marketing > budget.total_marketing_budget) fail(`marketing ${lakh(marketing)} over ${lakh(budget.total_marketing_budget)}`);

const beats = [
  ['founder prompt to captain', (e) => e.speaker === 'founder' && has('@d2c-captain')(e) && has('₹5L')(e)],
  ['captain working', by('d2c-captain', 'working')],
  ['captain assigns analyst first', (e) => by('d2c-captain', 'assign')(e) && e.meta?.targets?.[0] === 'd2c-analyst'],
  ['analyst working', by('d2c-analyst', 'working')],
  ['analyst forecast', (e) => by('d2c-analyst', 'done')(e) &&
    [['SKU01', '800'], ['SKU02', '1,400'], ['SKU03', '600'], ['SKU04', '240'], ['SKU05', '300']].every(([k, v]) => pair(k, v)(e)) && has('₹20.4L')(e)],
  ['ads working', by('d2c-ads', 'working')],
  ['ads plan ₹3L', (e) => by('d2c-ads', 'done')(e) && ['₹3L', '₹1.2L', '₹90,000'].every((s) => has(s)(e)) && pair('Broad prospecting', 'cut')(e)],
  ['finance private nudge to creators (₹3.55L → cut ₹2.05L)', (e) => e.speaker === 'd2c-finance' && e.meta?.private && e.meta.to === 'd2c-influencers' && ['₹3.55L', '₹1.5L', '₹2.05L'].every((s) => has(s)(e))],
  ['creators private revision to finance', (e) => e.speaker === 'd2c-influencers' && e.meta?.private && e.meta.to === 'd2c-finance' && has(lakh(creatorFee))(e)],
  [`creators shortlist ${lakh(creatorFee)}`, (e) => e === pick && has(lakh(creatorFee))(e)],
  ['ops transfers (Mumbai→Delhi SKU01 70 + SKU05 40)', (e) => e.speaker === 'd2c-ops' && transfer('SKU01', 70)(e) && transfer('SKU05', 40)(e)],
  ['hero artifact', (e) => e.type === 'artifact' && e.meta?.artifact_url === '/gallery/hero.html'],
  ['serum artifact', (e) => e.type === 'artifact' && e.meta?.artifact_url === '/gallery/serum.html'],
  ['glowkit artifact', (e) => e.type === 'artifact' && e.meta?.artifact_url === '/gallery/glowkit.html'],
  ['finance approves in war room', (e) => by('d2c-finance', 'approved')(e) && e.room === 'war_room'],
  ['finance sign-off pinned in Switch', (e) => by('d2c-finance', 'artifact')(e) && e.meta?.switch_document?.title === 'Finance sign-off'],
  ['captain pins the plan in Switch', (e) => by('d2c-captain', 'artifact')(e) && e.meta?.switch_document?.id === 'festive-sale-plan' && e.meta.switch_document.version === 1],
  [`captain final plan (marketing ${lakh(marketing)} of ₹5L)`, (e) => e.speaker === 'd2c-captain' && e.room === 'war_room' &&
    ['₹20.4L', '₹3L', lakh(creatorFee), 'banners', 'Pinned in Switch', `${lakh(marketing)} of ₹5L`].every((s) => has(s)(e)) &&
    pair('SKU01', '70')(e) && pair('SKU05', '40')(e)],
  ['captain asks founder', (e) => by('d2c-captain', 'approval_needed')(e) && e.meta?.targets?.includes('founder')],
  ['founder approves', (e) => by('founder', 'approved')(e) && has('Approved ✅')(e)],
  ['celebrate', (e) => e.type === 'celebrate'],
];
let at = 0;
for (const [name, ok] of beats) {
  const i = feed.findIndex((e, j) => j >= at && ok(e));
  if (i < 0) fail(`missing or out of order: ${name}`);
  else at = i + 1;
}

if (errors.length) { console.error(`❌ ${errors.length} problem(s)\n` + errors.join('\n')); process.exit(1); }
console.log(`✅ ${feed.length} events, ${end / 1000}s, schema + story order + numbers OK\n   creators ${picked.map((c) => c.name).join(', ')} = ${lakh(creatorFee)}; marketing ${lakh(marketing)} of ${lakh(budget.total_marketing_budget)}`);
