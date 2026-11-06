import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const KIT = fileURLToPath(new URL('../bin/kit.mjs', import.meta.url));
const REPO = path.resolve(path.dirname(KIT), '..', '..');
const FIX = 'kit/test/fixtures';
const OUT = path.join(REPO, 'gallery', 'live-run');

function kit(args, env = {}) {
  const r = spawnSync(process.execPath, [KIT, ...args, ...(args.includes('--data') ? [] : ['--data', FIX])], { cwd: REPO, encoding: 'utf8', env: { ...process.env, ...env } });
  let json;
  try { json = JSON.parse(r.stdout); } catch { throw new Error(`not JSON: ${r.stdout} ${r.stderr}`); }
  return { code: r.status, ...json };
}
const ok = (args, env) => { const r = kit(args, env); assert.equal(r.ok, true, r.error); assert.equal(r.code, 0); return r; };
const bad = (args, re) => { const r = kit(args); assert.equal(r.ok, false, `expected failure for ${args.join(' ')}`); assert.equal(r.code, 1); if (re) assert.match(r.error, re); return r; };
const file = (rel) => fs.readFileSync(path.join(REPO, rel));
const spec = (o) => JSON.stringify(o);
after(() => { for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) if (f.startsWith('test-')) fs.rmSync(path.join(OUT, f)); });

test('help lists every contract command and has example specs', () => {
  const r = ok(['help']);
  for (const c of ['sql', 'tables', 'stats', 'forecast', 'chart', 'deck', 'xlsx', 'docx', 'pdf', 'banner', 'help']) assert.ok(r.commands[c], c);
  assert.ok(ok(['help', 'deck']).example.slides.length >= 4);
});

test('tables: typed columns, ids with leading zeros stay text', () => {
  const t = ok(['tables']).tables;
  const p = t.find((x) => x.table === 'products');
  assert.deepEqual(p.columns.map((c) => c.type), ['text', 'text', 'number', 'text']);
  assert.equal(t.find((x) => x.table === 'orders').rows, 42);
});

test('sql: select, quoted commas, limit + truncation', () => {
  const r = ok(['sql', "SELECT name, mrp FROM products WHERE sku = 'SKU02'"]);
  assert.deepEqual(r.rows, [{ name: 'Sunscreen, SPF 50', mrp: 599 }]);
  const l = ok(['sql', 'SELECT * FROM orders', '--limit', '5']);
  assert.equal(l.count, 5);
  assert.equal(l.truncated, true);
  assert.equal(ok(['sql', 'WITH t AS (SELECT sku, SUM(qty) q FROM orders GROUP BY sku) SELECT * FROM t;']).count, 2);
});

test('sql guard rejects writes, attach, pragma, file functions, extensions, multi-statements', () => {
  const attacks = [
    "ATTACH DATABASE '/tmp/x.db' AS x",
    'PRAGMA table_info(orders)',
    "INSERT INTO orders (order_id) VALUES ('x')",
    "UPDATE orders SET qty = 0",
    'DELETE FROM orders',
    'CREATE TABLE t (a)',
    'DROP TABLE orders',
    'SELECT 1; DROP TABLE orders',
    'SELECT 1 /* ; */ ; DELETE FROM orders',
    "SELECT load_extension('/tmp/evil')",
    "SELECT readfile('/etc/passwd')",
    "SELECT * FROM CSV('/etc/passwd')",
    "SELECT * INTO XLSX('/tmp/x.xlsx') FROM orders",
    'WITH x AS (SELECT 1) DELETE FROM orders',
    "SELECT 1 UNION SELECT 2; ATTACH 'x' AS y",
    'VACUUM',
    "WITH x AS (SELECT 1) SELECT * FROM x; PRAGMA writable_schema = 1",
  ];
  for (const a of attacks) bad(['sql', a]);
  // Data unchanged afterwards.
  assert.equal(ok(['sql', 'SELECT COUNT(*) n FROM orders']).rows[0].n, 42);
});

test('authorizer blocks non-reads even if the text guard were bypassed', async () => {
  const { openDb } = await import('../lib/data.mjs');
  const { db } = openDb(path.join(REPO, FIX));
  for (const s of ['PRAGMA table_info(orders)', "ATTACH ':memory:' AS x", 'DELETE FROM orders', 'CREATE TABLE z(a)', "SELECT load_extension('x')"]) {
    assert.throws(() => db.prepare(s).run(), undefined, s);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 42);
});

test('runaway query is killed by the timeout', () => {
  const r = kit(['sql', 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c'], { KIT_TIMEOUT_MS: '1500' });
  assert.equal(r.ok, false);
  assert.match(r.error, /timed out/);
});

test('stats and forecast', () => {
  const s = ok(['stats', 'orders', 'qty', '--by', 'sku']);
  assert.equal(s.groups.length, 2);
  assert.equal(s.groups[0].count, 21);
  bad(['stats', 'orders', 'nope'], /unknown column/);
  bad(['stats', 'orders; drop', 'qty'], /unknown table/);
  const f = ok(['forecast', '--table', 'orders', '--date', 'date', '--value', 'qty', '--by', 'sku', '--days', '5']);
  assert.equal(f.from, '2026-10-22');
  assert.equal(f.groups[0].forecast.length, 5);
  const f4 = ok(['forecast', '--table', 'orders', '--date', 'date', '--value', 'qty', '--by', 'sku', '--days', '5', '--uplift', '4']);
  assert.ok(Math.abs(f4.groups[0].total - 4 * f.groups[0].total) < 0.1);
});

test('chart -> svg + png; external urls refused', () => {
  const r = ok(['chart', spec({ out: 'test-chart', data: { sql: 'SELECT sku, SUM(qty) q FROM orders GROUP BY sku' }, mark: 'bar', encoding: { x: { field: 'sku', type: 'nominal' }, y: { field: 'q', type: 'quantitative' } } })]);
  assert.match(file(r.files[0].path).toString(), /^<svg/);
  assert.deepEqual([...file(r.files[1].path).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  bad(['chart', spec({ out: 'test-x', data: { url: 'https://example.com/a.csv' }, mark: 'bar' })], /external data/);
  bad(['chart', spec({ out: 'test-x', data: { url: '/etc/passwd' }, mark: 'bar' })], /external data/);
});

test('deck -> pptx with every slide type; slide cap enforced', () => {
  const chart = { data: { values: [{ a: 'x', b: 1 }, { a: 'y', b: 2 }] }, mark: 'bar', encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } } };
  const r = ok(['deck', spec({ out: 'test-deck', slides: [
    { type: 'title', title: 'T & <b>', subtitle: 's' },
    { type: 'kpis', title: 'K', kpis: [{ label: 'Rev', value: '₹1.2L', delta: '+3%' }] },
    { type: 'bullets', title: 'B', bullets: ['one', 'two'], callout: 'decide' },
    { type: 'table', title: 'Tb', sql: 'SELECT sku, name, mrp FROM products' },
    { type: 'chart', title: 'C', chart, caption: 'cap' },
  ] })]);
  assert.equal(r.slides, 5);
  const buf = file(r.path);
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  assert.ok(buf.includes('ppt/slides/slide5.xml') && buf.includes('ppt/media/'));
  bad(['deck', spec({ out: 'test-big', slides: Array.from({ length: 41 }, () => ({ type: 'bullets', title: 'x', bullets: ['y'] })) })], /too many slides/);
  bad(['deck', spec({ out: 'test-bad', slides: [{ type: 'nope' }] })], /unknown type/);
});

test('xlsx -> real workbook with formats, formula, frozen header, autofilter, totals', async () => {
  const r = ok(['xlsx', spec({ out: 'test-book', sheets: [{ name: 'Orders', sql: 'SELECT sku, qty, mrp, net_revenue FROM orders LIMIT 10', columns: [{ key: 'net_revenue', format: 'lakh' }], formulas: [{ header: 'Gross', formula: '{qty}*{mrp}', format: 'inr' }], totals: true }] })]);
  assert.equal(file(r.path).subarray(0, 2).toString(), 'PK');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file(r.path));
  const ws = wb.getWorksheet('Orders');
  assert.equal(ws.getCell('A1').value, 'sku');
  assert.equal(ws.getCell('E2').value.formula, 'B2*C2');
  assert.match(ws.getCell('A12').value, /Total/);
  assert.equal(ws.views[0].state, 'frozen');
  assert.ok(ws.autoFilter);
  assert.ok(ws.getCell('D2').value < 1); // stored in lakhs
  bad(['xlsx', spec({ out: 'test-x', sheets: [{ rows: [[1]], columns: ['a'], formulas: [{ formula: '{nope}*2' }] }] })], /unknown column/);
});

test('docx and pdf briefs', () => {
  const brief = { title: 'Brief', subtitle: 'sub', kpis: [{ label: 'Rev', value: '₹30.6L', delta: '-2%' }], blocks: [{ h: 'H' }, { p: 'para' }, { bullets: ['a', 'b'] }, { callout: 'do it' }, { table: { sql: 'SELECT sku, mrp FROM products' } }, { chart: { data: { values: [{ a: 1, b: 2 }] }, mark: 'point', encoding: { x: { field: 'a', type: 'quantitative' }, y: { field: 'b', type: 'quantitative' } } } }] };
  const d = ok(['docx', spec({ ...brief, out: 'test-brief' })]);
  const db = file(d.path);
  assert.equal(db.subarray(0, 2).toString(), 'PK');
  assert.ok(db.includes('word/document.xml'));
  const p = ok(['pdf', spec({ ...brief, out: 'test-brief' })]);
  assert.equal(file(p.path).subarray(0, 4).toString(), '%PDF');
});

test('banner -> svg (escaped) + png for each template', () => {
  for (const template of ['sale', 'launch', 'quote']) {
    const r = ok(['banner', spec({ out: `test-banner-${template}`, template, headline: '<script>alert(1)</script> Glow', sub: 'x & y', badge: '25% OFF', cta: 'Shop' })]);
    const svg = file(r.files[0].path).toString();
    assert.ok(!svg.includes('<script>') && svg.includes('&lt;script&gt;'));
    assert.deepEqual([...file(r.files[1].path).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  }
});

test('path guards: output names, spec paths, data dir, spec size', () => {
  const b = spec({ headline: 'x' });
  for (const out of ['../../evil', '/etc/evil', 'a/b', '..', 'UP/../x', '.hidden', 'a\\b']) bad(['banner', b, '--out', out], /bad output name/);
  bad(['banner', spec({ headline: 'x', out: '../../../tmp/pwn' })], /bad output name/);
  bad(['deck', '/etc/passwd'], /outside repo/);
  bad(['deck', '../../../../etc/hosts'], /outside repo|not found/);
  bad(['tables', '--data', '/etc'], /outside repo/);
  bad(['deck', '.env.example'], /not allowed/); // secrets never readable as a spec

  const big = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-')), 'big.json');
  fs.writeFileSync(big, spec({ headline: 'x'.repeat(1_100_000) }));
  bad(['banner', big], /1 MB/);
  // Output always lands in gallery/live-run with the forced extension.
  const r = ok(['banner', b, '--out', 'test-ok.exe']);
  assert.equal(r.files[0].path, 'gallery/live-run/test-ok.svg');
});

test('review 1: symlinked CSVs in the data dir are not loaded', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-data-'));
  fs.copyFileSync(path.join(REPO, FIX, 'products.csv'), path.join(d, 'products.csv'));
  fs.symlinkSync('/etc/shells', path.join(d, 'shells.csv'));
  fs.symlinkSync(path.join(REPO, FIX, 'orders.csv'), path.join(d, 'orders.csv'));
  const t = ok(['tables', '--data', d]).tables.map((x) => x.table);
  assert.deepEqual(t, ['products']);
  bad(['sql', 'SELECT * FROM shells', '--data', d], /no such table/);
});

test('review 2: size-producing SQL is blocked; blobs and long cells are summarized', () => {
  bad(['sql', 'SELECT randomblob(100000000)']);
  bad(['sql', 'SELECT zeroblob(100000000)']);
  bad(['sql', "SELECT printf('%.*c', 100000000, 'x')"]);
  bad(['sql', 'SELECT group_concat(a.order_id || b.order_id || c.order_id) FROM orders a, orders b, orders c']);
  assert.equal(ok(['sql', "SELECT x'00ff' AS b"]).rows[0].b, '<blob 2 bytes>');
  assert.ok(ok(['sql', "SELECT substr(group_concat(a.order_id), 1, 5000) s FROM orders a, orders b"]).rows[0].s.length <= 2001);
});

test('review 3: chart data generators and oversized inline data are refused', () => {
  bad(['chart', spec({ out: 'test-x', data: { sequence: { start: 0, stop: 1e9, as: 'x' } }, mark: 'point' })], /generator/);
  bad(['chart', spec({ out: 'test-x', data: { sphere: true }, mark: 'geoshape' })], /generator/);
  bad(['chart', spec({ out: 'test-x', data: { values: Array.from({ length: 10_001 }, (_, i) => ({ i })) }, mark: 'point' })], /10000/);
});

test('review 4: xlsx formulas are allowlisted', () => {
  const sheet = (formula) => spec({ out: 'test-f', sheets: [{ columns: ['a', 'b'], rows: [[1, 2]], formulas: [{ formula }] }] });
  for (const f of ['WEBSERVICE("http://x")', "cmd|' /c calc'!A0", '=HYPERLINK("http://x")', 'A1*2', '{a}&"x"', 'INDIRECT("A1")']) bad(['xlsx', sheet(f)], /formula/);
  ok(['xlsx', sheet('=IFERROR(ROUND({a}/{b}*100, 1), 0)')]);
  ok(['xlsx', sheet('IF({a}>{b}, {a}, SUM({a},{b}))')]);
});

test('review 6: nothing may follow the first statement, even hidden by a quote in a comment', () => {
  bad(['sql', "SELECT 1 -- '\n; ATTACH 'x' AS y"]);
  assert.equal(ok(['sql', 'SELECT 1 AS n; ']).rows[0].n, 1);
  assert.equal(ok(['sql', 'SELECT 1 AS n -- trailing comment']).rows[0].n, 1);
});
