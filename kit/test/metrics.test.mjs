// kit metric / kit brief / cache: every metric runs, and values tie to independent computations
// (data/README.md story numbers, pnl_monthly, evals/questions.mjs truths computed from the raw CSVs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb as evalDb } from '../../evals/lib.mjs';
import { questions } from '../../evals/questions.mjs';

const KIT = fileURLToPath(new URL('../bin/kit.mjs', import.meta.url));
const REPO = path.resolve(path.dirname(KIT), '..', '..');
const run = (...args) => { const r = spawnSync(process.execPath, [KIT, ...args], { cwd: REPO, encoding: 'utf8' }); return { code: r.status, ...JSON.parse(r.stdout) }; };
const ok = (...args) => { const r = run(...args); assert.equal(r.ok, true, `${args.join(' ')}: ${r.error}`); return r; };
const m = (...args) => ok('metric', ...args);
const row = (r, k, v) => { const x = r.values.find((y) => y[k] === v); assert.ok(x, `${k}=${v} in ${JSON.stringify(r.values)}`); return x; };
const sql = (q) => ok('sql', q).rows;
const near = (a, b, tol = 0.001, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * tol + 1e-9, `${msg || ''} got ${a}, want ${b}`);
const MONTHS = ['2026-08', '2026-09', '2026-10'];

test('every metric runs, plain and for one month; list and suggestions', () => {
  const names = ok('metric', 'list').metrics.map((x) => x.name);
  assert.ok(names.length >= 40, `${names.length} metrics`);
  for (const n of names) {
    const r = m(n);
    for (const k of ['metric', 'definition', 'unit', 'filters', 'source_tables', 'sql']) assert.ok(r[k] != null, `${n}.${k}`);
    assert.ok('value' in r || Array.isArray(r.values), `${n} has value(s)`);
    m(n, '--month', '2026-10');
  }
  const bad = run('metric', 'net_revnue');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Did you mean: net_revenue/);
});

test('filters and dims are validated', () => {
  const bad = (re, ...a) => { const r = run('metric', ...a); assert.equal(r.ok, false, a.join(' ')); assert.match(r.error, re); };
  bad(/unknown channel "Shopee"/, 'net_revenue', '--channel', 'Shopee');
  bad(/unknown sku/, 'net_revenue', '--sku', 'SKU99');
  bad(/--by nope not available.*channel/, 'net_revenue', '--by', 'nope');
  bad(/--sku not available/, 'rto_pct', '--sku', 'SKU01');
  bad(/--month must be YYYY-MM/, 'orders', '--month', "2026-10' OR 1=1 --");
  bad(/YYYY-MM-DD/, 'orders', '--from', '2026-1-1');
  bad(/one of --month/, 'orders', '--month', '2026-10', '--last', '30');
  bad(/--last must be/, 'orders', '--last', '0');
  bad(/at most 2/, 'net_revenue', '--by', 'channel,sku,month');
  // Case-insensitive channel, SKU by product name, canonicalised in filters.
  assert.equal(m('net_revenue', '--channel', 'website').filters.channel, 'Website');
  assert.equal(m('units', '--sku', 'sunscreen').filters.sku, 'SKU02');
});

test('the returned sql is what ran and re-runs through kit sql', () => {
  for (const a of [['net_revenue', '--by', 'channel', '--month', '2026-10'], ['days_of_cover'], ['cohort_retention'], ['rm_cost_change']]) {
    const r = m(...a);
    const again = sql(r.sql);
    assert.deepEqual(again.map((x) => x.value), (r.values || [r]).map((x) => x.value), a.join(' '));
  }
});

test('P&L ties: net revenue, COGS, orders, units, EBITDA; CM3 - salaries - opex = EBITDA', () => {
  const pnl = Object.fromEntries(sql('SELECT * FROM pnl_monthly').map((p) => [p.month, p]));
  for (const mo of MONTHS) {
    const p = pnl[mo];
    assert.equal(m('net_revenue', '--month', mo).value, p.net_revenue);
    assert.equal(m('gross_revenue', '--month', mo).value, p.gross_revenue);
    assert.equal(m('discounts', '--month', mo).value, p.discounts);
    assert.equal(m('cogs', '--month', mo).value, p.cogs);
    assert.equal(m('channel_fees', '--month', mo).value, p.channel_fees);
    assert.equal(m('shipping_cost', '--month', mo).value, p.shipping);
    assert.equal(m('marketing_spend', '--month', mo).value, p.marketing);
    assert.equal(m('orders', '--month', mo).value, p.orders);
    assert.equal(m('units', '--month', mo).value, p.units);
    assert.equal(m('opex', '--month', mo).value, p.opex);
    assert.equal(m('new_customers', '--month', mo).value, p.new_customers);
    assert.equal(m('ebitda', '--month', mo).value, p.ebitda);
    assert.equal(m('cm3', '--month', mo).value - p.salaries - p.opex, p.ebitda, `CM3 bridge ${mo}`);
    near(m('marketing_pct', '--month', mo).value, p.marketing_pct, 0.01);
  }
  // Channel split adds up to the total.
  const byCh = m('cm3', '--by', 'channel', '--month', '2026-10').values;
  assert.equal(byCh.reduce((s, x) => s + x.value, 0), m('cm3', '--month', '2026-10').value);
});

test('data/README.md story numbers', () => {
  const rto = (mo, ch) => m('rto_pct', '--channel', ch, '--month', mo).value;
  assert.equal(rto('2026-09', 'Amazon'), 5.6);
  assert.equal(rto('2026-09', 'Website'), 9.3);
  assert.equal(rto('2026-09', 'Flipkart'), 8.4);
  assert.equal(rto('2026-10', 'Website'), 9.9);
  const pay = m('rto_pct', '--channel', 'Website', '--by', 'payment');
  assert.equal(row(pay, 'payment', 'cod').value, 23.2);
  assert.equal(row(pay, 'payment', 'prepaid').value, 1.3);
  assert.equal(Math.round(m('cod_share', '--channel', 'Website').value), 38);
  const tier = m('rto_pct', '--channel', 'Website', '--by', 'tier,payment').values.filter((x) => x.payment === 'cod');
  assert.deepEqual([1, 2, 3].map((t) => tier.find((x) => x.tier === t).value), [18.3, 27.2, 36.7]);
  const cour = m('rto_pct', '--channel', 'Website', '--by', 'courier').values;
  assert.deepEqual([cour[0].courier, cour[0].value, cour.at(-1).courier, cour.at(-1).value], ['Shadowfax', 11.4, 'Blue Dart', 6.7]);
  const ret = m('returns');
  assert.deepEqual([ret.value, ret.refunds], [287, 235660]);
  assert.deepEqual(m('return_reasons').values.slice(0, 2).map((x) => [x.reason, x.value]), [['Damaged or leaking on arrival', 68], ['Did not suit skin type', 47]]);
  assert.deepEqual(m('creator_fees', '--by', 'month').values.map((x) => x.value), [122000, 231000, 275500]);
  const meta = m('meta_roas', '--by', 'campaign', '--last', '30');
  assert.deepEqual([meta.values.reduce((s, x) => s + x.spend, 0), meta.values.reduce((s, x) => s + x.revenue, 0)], [450000, 1402000]);
  assert.equal(row(meta, 'campaign', 'Retargeting - cart abandoners').value, 4.8);
  assert.equal(row(m('meta_roas', '--by', 'type', '--last', '30'), 'type', 'ugc_video').value, 4.02);
  assert.equal(m('ad_spend', '--channel', 'Google', '--month', '2026-10').value, 93058);
  assert.equal(row(m('google_roas', '--by', 'campaign', '--month', '2026-10'), 'campaign', 'Brand - Kesar & Co').value, 7.28);
  const amz = m('marketplace_roas', '--channel', 'Amazon', '--month', '2026-10');
  assert.deepEqual([amz.spend, amz.value], [51331, 3.72]);
  const fees = m('fees_pct', '--by', 'channel');
  assert.deepEqual([row(fees, 'channel', 'Nykaa').value, row(fees, 'channel', 'Website').value, row(fees, 'channel', 'Amazon').value], [33.1, 5.8, 15]);
  assert.equal(m('repeat_rate').value, 21.2);
  assert.equal(m('repeat_rate', '--channel', 'Website').value, 27.4);
  assert.equal(m('cac', '--month', '2026-10').value, 280);
  const pay10 = m('salary_bill');
  assert.deepEqual([pay10.value, pay10.net_pay, pay10.employer_cost, pay10.tds, pay10.headcount], [1214909, 1162815, 1258375, 4628, 25]);
  assert.equal(pay10.employer_cost, sql("SELECT salaries FROM pnl_monthly WHERE month = '2026-10'")[0].salaries);
  const cov = m('days_of_cover', '--last', '29').values; // README uses 29 days (10-03..10-31)
  assert.deepEqual(cov.slice(0, 2).map((x) => [x.warehouse, x.sku, x.on_hand, x.value]), [['Delhi', 'SKU01', 250, 13.3], ['Delhi', 'SKU05', 80, 14.6]]);
  assert.equal(row(m('days_of_cover', '--last', '29', '--sku', 'SKU02'), 'warehouse', 'Bangalore').value, 38);
  assert.deepEqual(m('stockout_risk').values.map((x) => x.warehouse + x.sku), ['DelhiSKU01', 'DelhiSKU05']);
  const po = m('po_delays');
  assert.deepEqual([po.delayed_now, po.arrived_late, po.pos], [2, 18, 94]);
  assert.equal(m('po_value').value, 8020784);
  const saf = m('rm_cost_change').values[0];
  assert.deepEqual([saf.material, saf.first_cost, saf.last_cost], ['Kashmiri saffron (kesar)', 257.75, 291.45]);
  const sku = m('net_revenue', '--by', 'sku').values;
  assert.deepEqual(sku.map((x) => [x.sku, x.value]), [['SKU02', 3429699], ['SKU01', 2926823], ['SKU03', 1772655], ['SKU05', 1689645], ['SKU04', 1273738]]);
  assert.equal(m('booked_revenue', '--by', 'day').values.reduce((a, b) => (b.value > a.value ? b : a)).day, '2026-10-21');
});

test('evals/questions.mjs truths (computed from raw CSVs) match one-command metrics', () => {
  const db = evalDb();
  const truth = (re) => { const q = questions.find((x) => typeof x.text === 'string' && re.test(x.text)); assert.ok(q, String(re)); return q.truth(db); };
  const pairs = [
    [/spend on Meta ads in October/, ['ad_spend', '--channel', 'Meta', '--month', '2026-10']],
    [/spend on Google Ads in October/, ['ad_spend', '--channel', 'Google', '--month', '2026-10']],
    [/spend on Amazon marketplace ads in October/, ['ad_spend', '--channel', 'Amazon', '--month', '2026-10']],
    [/net revenue in September 2026/, ['net_revenue', '--month', '2026-09']],
    [/EBITDA in October 2026/, ['ebitda', '--month', '2026-10']],
    [/marketing spend as a % of net revenue in October/, ['marketing_pct', '--month', '2026-10']],
    [/total opex in October/, ['opex', '--month', '2026-10']],
    [/total COGS in August/, ['cogs', '--month', '2026-08']],
    [/orders did we get in October 2026 \(all statuses\)/, ['orders_all', '--month', '2026-10']],
    [/units of SKU01 were ordered in October/, ['units_all', '--sku', 'SKU01', '--month', '2026-10']],
    [/customers are in customers.csv/, ['new_customers']],
    [/repeat rate/, ['repeat_rate']],
    [/returns were logged in October/, ['returns', '--month', '2026-10']],
    [/orders came through creator coupon codes/, ['creator_orders']],
    [/paid creators in total/, ['creator_fees']],
    [/value of purchase orders placed in October/, ['po_value', '--month', '2026-10']],
    [/total net pay for October/, ['salary_bill'], 'net_pay'],
    [/total TDS deducted/, ['salary_bill'], 'tds'],
    [/How many employees do we have/, ['headcount']],
    [/ROAS \(revenue \/ spend\) of Shopping-type Google/, ['google_roas', '--by', 'type'], (r) => row(r, 'type', 'shopping').value],
  ];
  for (const [re, args, key] of pairs) {
    const r = m(...args);
    const got = typeof key === 'function' ? key(r) : r[key || 'value'];
    near(got, truth(re), 0.01, `${re}`);
  }
});

test('brief: every dept, numbers carry the command behind them', () => {
  for (const d of ['analytics', 'ads', 'creators', 'ops', 'design', 'finance', 'captain']) {
    const b = ok('brief', d);
    assert.ok(b.numbers.length >= 5 && b.numbers.length <= 10, `${d} has ${b.numbers.length}`);
    for (const n of b.numbers) { assert.match(n.cmd, /^kit metric \w+/); assert.ok(n.display || n.top, `${d} ${n.label}`); }
  }
  const f = ok('brief', 'finance');
  assert.equal(f.month, '2026-10');
  assert.equal(f.numbers.find((n) => n.label === 'EBITDA').value, -229795);
  assert.ok(f.policy_checks.every((c) => typeof c.ok === 'boolean'));
  assert.equal(ok('brief', 'analyst').dept, 'analytics');
  assert.match(run('brief', 'legal').error, /unknown dept/);
});

test('cache: other --data dirs stay in memory and see edits; symlinked or tampered cache is rebuilt', () => {
  const cacheDir = path.join(REPO, 'data', '.cache');
  const cacheDb = path.join(cacheDir, 'kratos.db');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-cache-'));
  for (const f of ['orders.csv', 'products.csv']) fs.copyFileSync(path.join(REPO, 'kit/test/fixtures', f), path.join(d, f));
  const before = fs.readdirSync(cacheDir);
  assert.equal(ok('sql', 'SELECT COUNT(*) n FROM orders', '--data', d).rows[0].n, 42);
  fs.appendFileSync(path.join(d, 'products.csv'), 'SKU09,Test,100,x\n');
  assert.equal(ok('sql', 'SELECT COUNT(*) n FROM products', '--data', d).rows[0].n, 3);
  assert.deepEqual(fs.readdirSync(cacheDir), before, 'no cache file for a non-repo --data dir');
  ok('tables');
  assert.equal(fs.statSync(cacheDb).mode & 0o222, 0, 'cache is chmod 0444');

  // A symlink in place of the cache is never opened or written through; stray kratos-*.db files are pruned on rebuild.
  const victim = path.join(d, 'victim.txt');
  fs.writeFileSync(victim, 'keep');
  fs.rmSync(cacheDb, { force: true });
  fs.symlinkSync(victim, cacheDb);
  fs.writeFileSync(path.join(cacheDir, 'kratos-0123456789ab.db'), 'stray');
  assert.ok(m('net_revenue').value > 0);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'keep');
  assert.ok(fs.lstatSync(cacheDb).isFile());
  assert.ok(!fs.existsSync(path.join(cacheDir, 'kratos-0123456789ab.db')), 'stray cache pruned');

  // A view planted in an otherwise valid cache (signature still matches) forces a rebuild.
  const tmp = path.join(d, 'tampered.db');
  fs.copyFileSync(cacheDb, tmp);
  fs.chmodSync(tmp, 0o644);
  const t = new DatabaseSync(tmp);
  t.exec('CREATE VIEW planted AS SELECT 1 AS x');
  t.close();
  fs.renameSync(tmp, cacheDb);
  assert.equal(sql("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'view'")[0].n, 0);
  assert.equal(run('sql', 'SELECT * FROM planted').ok, false);
});

test('names and dates: prototype keys and impossible dates are plain errors', () => {
  assert.match(run('metric', 'constructor').error, /unknown metric "constructor"/);
  assert.match(run('metric', '__proto__').error, /unknown metric/);
  assert.match(run('metric', 'net_revenue', '--by', 'constructor').error, /not available/);
  assert.match(run('metric', 'net_revenue', '--by', '__proto__').error, /not available/);
  assert.match(run('brief', 'toString').error, /unknown dept/);
  for (const d of ['2026-02-31', '2026-04-31', '2026-13-01']) assert.match(run('metric', 'orders', '--from', d).error, /real date/);
  assert.equal(m('orders', '--from', '2026-10-01', '--to', '2026-10-31').value, m('orders', '--month', '2026-10').value);
});

test('cached DB handle refuses writes (authorizer + read-only file)', async () => {
  const { openDb } = await import('../lib/data.mjs');
  const { db } = openDb(path.join(REPO, 'data'));
  for (const s of ['DELETE FROM orders', 'DROP TABLE m_lines', "ATTACH ':memory:' AS x", 'CREATE TABLE z(a)', "UPDATE pnl SET ebitda = 0"]) assert.throws(() => db.prepare(s).run(), undefined, s);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM orders').get().n > 15000);
});
