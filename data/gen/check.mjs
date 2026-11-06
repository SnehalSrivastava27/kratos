// Asserts the data catalog ties (contracts/data-catalog.md) and that regeneration is byte-identical.
// Run: node data/gen/check.mjs   (exit 1 on any failure)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '..');
const ROOT = path.resolve(DATA, '..');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.error('FAIL', msg); } };

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const header = {};
const load = (f) => {
  const [h, ...rs] = parseCsv(fs.readFileSync(path.join(DATA, f), 'utf8'));
  header[f] = h;
  return rs.map((r) => Object.fromEntries(h.map((c, i) => [c, r[i]])));
};
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const round = Math.round;

// ---- 1. catalog: every v2 file exists, headers start with the catalog columns ----
const catalog = fs.readFileSync(path.join(ROOT, 'contracts/data-catalog.md'), 'utf8');
const spec = {};
for (const m of catalog.matchAll(/^\| `([^`]+)` \| ([^|]+) \|$/gm)) spec[m[1]] = m[2].trim();
const v2 = Object.keys(spec);
ok(v2.length >= 20, `catalog parsed (${v2.length} files)`);
for (const f of v2) {
  ok(fs.existsSync(path.join(DATA, f)), `${f} exists`);
  if (!f.endsWith('.csv') || !fs.existsSync(path.join(DATA, f))) continue;
  const want = spec[f].split(',').map((s) => s.trim());
  load(f);
  ok(want.every((c, i) => header[f][i] === c), `${f} header starts with: ${want.join(',')} (got ${header[f].join(',')})`);
}

// ---- load ----
const products = load('products.csv'), P = Object.fromEntries(products.map((p) => [p.sku, p]));
const orders = load('orders.csv'), returns = load('returns.csv'), fees = load('channel_fees.csv'), couriers = load('couriers.csv');
const customers = load('customers.csv'), meta = load('meta_ads_daily.csv'), google = load('google_ads_daily.csv'), mkt = load('marketplace_ads_daily.csv');
const creators = load('creators.csv'), posts = load('creator_posts.csv'), mats = load('raw_materials.csv'), bom = load('bom.csv');
const pos = load('purchase_orders.csv'), suppliers = load('suppliers.csv'), inv = load('inventory_snapshot.csv');
const employees = load('employees.csv'), payroll = load('payroll_2026_10.csv'), opex = load('opex.csv'), pnl = load('pnl_monthly.csv');
const FEE = Object.fromEntries(fees.map((f) => [f.channel, f]));
const CHANNELS = ['Website', 'Amazon', 'Flipkart', 'Nykaa', 'Myntra', 'Blinkit', 'Zepto'];

// ---- 2. enums and referential ties ----
ok(orders.every((o) => P[o.sku]), 'every orders.sku is in products.csv');
ok(orders.every((o) => CHANNELS.includes(o.channel)), 'orders.channel values');
ok(orders.every((o) => ['delivered', 'rto', 'returned', 'cancelled'].includes(o.status)), 'orders.status values');
ok(orders.every((o) => ['prepaid', 'cod'].includes(o.payment)), 'orders.payment values');
ok(orders.every((o) => o.date >= '2026-08-01' && o.date <= '2026-10-31'), 'orders inside history window');
ok(orders.length >= 15000 && orders.length <= 25000, `orders.csv rows ${orders.length} in 15k-25k`);
ok(CHANNELS.every((c) => FEE[c]), 'channel_fees has every channel');
const lineKey = new Map(orders.map((o) => [o.order_id + '|' + o.sku, o]));
const orderIds = new Set(orders.map((o) => o.order_id));
ok(returns.every((r) => orderIds.has(r.order_id)), 'every returns.order_id is in orders.csv');
ok(returns.every((r) => lineKey.get(r.order_id + '|' + r.sku)?.status === 'returned' && +lineKey.get(r.order_id + '|' + r.sku).net_revenue === +r.refund), 'returns match returned order lines and refund = net_revenue');
ok(returns.length === orders.filter((o) => o.status === 'returned').length, 'one returns row per returned line');
const matIds = new Set(mats.map((m) => m.material_id));
ok(bom.every((b) => matIds.has(b.material_id) && P[b.sku]), 'every BOM material exists (and every BOM sku)');
ok(products.every((p) => Math.abs(sum(bom.filter((b) => b.sku === p.sku), (b) => +b.qty_per_unit * +mats.find((m) => m.material_id === b.material_id).unit_cost) - +p.cogs) < 0.1), 'BOM standard cost = products.cogs');
const supIds = new Set(suppliers.map((s) => s.supplier_id));
ok(mats.every((m) => supIds.has(m.supplier_id)) && pos.every((p) => supIds.has(p.supplier_id) && matIds.has(p.material_id)), 'materials and POs reference real suppliers/materials');
ok(pos.every((p) => Math.abs(round(+p.qty * +p.unit_cost) - +p.total) <= 1), 'PO total = qty x unit_cost');
const custIds = new Map(customers.map((c) => [c.customer_id, c]));
ok(orders.every((o) => custIds.has(o.customer_id)), 'every orders.customer_id is in customers.csv');

// ---- 3. order money: channel_fee and shipping_cost from the fee card / courier card ----
const byOrder = new Map();
for (const o of orders) { if (!byOrder.has(o.order_id)) byOrder.set(o.order_id, []); byOrder.get(o.order_id).push(o); }
const CARD = Object.fromEntries(couriers.map((c) => [c.courier + '|' + c.zone, c]));
let feeBad = 0, shipBad = 0;
for (const lines of byOrder.values()) {
  const l0 = lines[0], f = FEE[l0.channel], cod = l0.payment === 'cod';
  const anyRet = lines.some((l) => l.status === 'returned');
  for (const l of lines) {
    const net = +l.net_revenue, pg = !cod ? (+f.payment_gateway_pct / 100) * net : 0;
    const want = l.status === 'cancelled' ? 0 : l.status === 'delivered' ? round((+f.commission_pct / 100) * net + +f.fixed_fee + pg) : round(+f.fixed_fee + pg);
    if (+l.channel_fee !== want) feeBad++;
    if (+l.gross_revenue !== +l.mrp * +l.qty || +l.mrp !== +P[l.sku].mrp || net !== round(+l.gross_revenue * (1 - +l.discount_pct / 100))) feeBad++;
    if (l !== l0 && +l.shipping_cost !== 0) shipBad++;
  }
  let ship = 0;
  if (l0.status !== 'cancelled') {
    const twice = l0.status === 'rto' || anyRet;
    if (l0.channel === 'Website') { const c = CARD[l0.courier + '|' + l0.zone]; ship = +c.cost_per_order + (cod && l0.status !== 'rto' ? +c.cod_fee : 0) + (twice ? +c.cost_per_order : 0); }
    else ship = +f.shipping_fee * (twice ? 2 : 1);
  }
  if (+l0.shipping_cost !== ship) shipBad++;
}
ok(feeBad === 0, `orders revenue math and channel_fee recompute from channel_fees.csv (${feeBad} bad)`);
ok(shipBad === 0, `orders shipping_cost recompute from couriers.csv / channel_fees.csv (${shipBad} bad)`);
let cBad = 0;
for (const c of couriers) {
  const os = [...byOrder.values()].map((l) => l[0]).filter((o) => o.channel === 'Website' && o.courier === c.courier && o.zone === c.zone);
  const rto = os.length ? Math.round((1000 * os.filter((o) => o.status === 'rto').length) / os.length) / 10 : 0;
  if (rto !== +c.rto_pct || os.length !== +c.orders) cBad++;
}
ok(cBad === 0, `couriers.rto_pct and orders observed from orders.csv (${cBad} bad)`);

// ---- 4. demand matches products.avg_daily_units (roughly) ----
for (const p of products) {
  const u = sum(orders.filter((o) => o.sku === p.sku && o.status !== 'cancelled'), (o) => +o.qty) / 92;
  ok(Math.abs(u / +p.avg_daily_units - 1) < 0.15, `${p.sku} avg units/day ${u.toFixed(1)} ~ ${p.avg_daily_units}`);
}

// ---- 5. customers ----
let custBad = 0;
const agg = new Map();
for (const lines of byOrder.values()) {
  const a = agg.get(lines[0].customer_id) || { orders: 0, spend: 0, first: '9999' };
  a.orders++; a.spend += sum(lines.filter((l) => l.status === 'delivered'), (l) => +l.net_revenue);
  if (lines[0].date < a.first) a.first = lines[0].date;
  agg.set(lines[0].customer_id, a);
}
for (const c of customers) { const a = agg.get(c.customer_id); if (!a || a.orders !== +c.orders || a.spend !== +c.total_spend || a.first !== c.first_order_date) custBad++; }
ok(custBad === 0, `customers.orders / total_spend / first_order_date tie to orders (${custBad} bad)`);

// ---- 6. creators ----
for (const i of load('influencers.csv')) {
  const c = creators.find((x) => x.name === i.name);
  ok(c && c.platform === i.platform && c.followers === i.followers && +c.engagement_pct === +i.engagement_pct && c.avg_views === i.avg_views && +c.fee_reel === +i.fee,
    `influencer ${i.name} present in creators.csv with same platform/followers/engagement/views/fee`);
}
ok(creators.length >= 35, `creators.csv has ${creators.length} creators (8 v1 + ~30)`);
const handles = new Set(creators.map((c) => c.handle));
ok(posts.every((p) => handles.has(p.handle)), 'every creator post handle is in creators.csv');
let postBad = 0;
for (const p of posts) {
  const ls = orders.filter((o) => o.coupon === p.coupon_code && o.status !== 'cancelled');
  if (new Set(ls.map((l) => l.order_id)).size !== +p.orders || sum(ls, (l) => +l.net_revenue) !== +p.revenue) postBad++;
}
ok(postBad === 0, `creator_posts orders/revenue tie to coupon orders (${postBad} bad)`);

// ---- 7. meta last 30 days = meta_campaigns.csv ----
for (const c of load('meta_campaigns.csv')) {
  const w = meta.filter((m) => m.campaign === c.campaign && m.date >= '2026-10-02' && m.date <= '2026-10-31');
  ok(sum(w, (m) => +m.spend) === +c.spend && sum(w, (m) => +m.revenue) === +c.revenue, `meta ${c.campaign} last-30 spend/revenue = ${c.spend}/${c.revenue}`);
}
ok([...meta, ...google, ...mkt].every((r) => +r.spend >= 0 && +r.revenue >= 0), 'ad rows non-negative');

// ---- 8. inventory ----
const WCOL = { Mumbai: 'stock_mumbai', Delhi: 'stock_delhi', Bangalore: 'stock_bangalore' };
for (const wh of Object.keys(WCOL)) for (const p of products) {
  const rs = inv.filter((r) => r.warehouse === wh && r.sku === p.sku).sort((a, b) => (a.date < b.date ? -1 : 1));
  ok(rs.at(-1)?.date === '2026-10-31' && +rs.at(-1).on_hand === +p[WCOL[wh]], `inventory ${wh} ${p.sku} ends at products.csv stock ${p[WCOL[wh]]}`);
  ok(rs.every((r) => +r.on_hand >= 0) && rs.slice(1).every((r, i) => +rs[i].on_hand === +r.on_hand + +r.shipped_week - +r.received_week), `inventory ${wh} ${p.sku} weekly flow balances`);
  const shipped = sum(orders.filter((o) => o.warehouse === wh && o.sku === p.sku && o.status !== 'cancelled'), (o) => +o.qty);
  ok(sum(rs, (r) => +r.shipped_week) === shipped, `inventory ${wh} ${p.sku} shipped_week sums to orders`);
}

// ---- 9. people ----
let empBad = 0;
for (const e of employees) {
  const fixed = round((+e.ctc_annual * (1 - +e.variable_pct / 100)) / 12);
  if (+e.basic_monthly + +e.hra_monthly + +e.special_monthly + +e.pf_employer_monthly !== fixed) empBad++;
  if (+e.pf_employer_monthly !== round(0.12 * Math.min(+e.basic_monthly, 15000))) empBad++;
  if (+e.basic_monthly < 0.4 * fixed || +e.basic_monthly > 0.5 * fixed) empBad++;
}
ok(empBad === 0, `employees: basic+HRA+special+employer PF = fixed CTC/12, PF 12% of min(basic,15000), basic 40-50% (${empBad} bad)`);
ok(employees.length >= 23 && employees.length <= 27, `~25 employees (${employees.length})`);
function tax(t) {
  const sl = [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]];
  let x = 0, lo = 0; for (const [hi, r] of sl) { if (t > lo) x += (Math.min(t, hi) - lo) * r; lo = hi; }
  return (t <= 1200000 ? 0 : Math.min(x, t - 1200000)) * 1.04;
}
let payBad = 0;
const E = Object.fromEntries(employees.map((e) => [e.emp_id, e]));
for (const p of payroll) {
  const e = E[p.emp_id], gross = +e.basic_monthly + +e.hra_monthly + +e.special_monthly;
  const pt = e.city === 'Mumbai' ? (e.gender === 'F' && gross <= 25000 ? 0 : gross <= 7500 ? 0 : gross <= 10000 ? 175 : 200) : e.city === 'Bangalore' ? (gross >= 25000 ? 200 : 0) : 0;
  const pf = round(0.12 * Math.min(+e.basic_monthly, 15000)), tds = round(tax(gross * 12 - 75000) / 12);
  if (p.month !== '2026-10' || +p.gross !== gross || +p.pf_employee !== pf || +p.professional_tax !== pt || +p.tds !== tds || +p.net_pay !== gross - pf - pt - tds) payBad++;
}
ok(payBad === 0, `payroll_2026_10 statutory math (${payBad} bad)`);
ok(payroll.length === employees.filter((e) => e.join_date <= '2026-10-01').length, 'payroll covers everyone joined by 2026-10-01');

// ---- 10. P&L recomputed from the files ----
const nonRestock = new Set(returns.filter((r) => r.restockable === 'no').map((r) => r.order_id + r.sku));
for (const p of pnl) {
  const m = p.month, o = orders.filter((x) => x.date.startsWith(m) && x.status !== 'cancelled');
  const gross = sum(o, (x) => +x.gross_revenue), disc = sum(o, (x) => +x.gross_revenue - +x.net_revenue);
  const ret = sum(o.filter((x) => x.status === 'rto' || x.status === 'returned'), (x) => +x.net_revenue);
  const net = gross - disc - ret;
  const cogs = sum(o.filter((x) => x.status === 'delivered' || (x.status === 'returned' && nonRestock.has(x.order_id + x.sku))), (x) => +x.qty * +P[x.sku].cogs);
  const cf = sum(o, (x) => +x.channel_fee), ship = sum(o, (x) => +x.shipping_cost);
  const mk = sum(meta.filter((x) => x.date.startsWith(m)), (x) => +x.spend) + sum(google.filter((x) => x.date.startsWith(m)), (x) => +x.spend)
    + sum(mkt.filter((x) => x.date.startsWith(m)), (x) => +x.spend) + sum(posts.filter((x) => x.date.startsWith(m)), (x) => +x.fee_paid);
  const sal = sum(employees.filter((e) => e.join_date <= m + '-01'), (e) => +e.basic_monthly + +e.hra_monthly + +e.special_monthly + +e.pf_employer_monthly);
  const ox = sum(opex.filter((x) => x.month === m), (x) => +x.amount);
  const want = { gross_revenue: gross, discounts: disc, returns: ret, net_revenue: net, cogs, channel_fees: cf, shipping: ship, marketing: mk, salaries: sal, opex: ox,
    ebitda: net - cogs - cf - ship - mk - sal - ox };
  for (const [k, v] of Object.entries(want)) ok(+p[k] === v, `pnl ${m} ${k} = ${v} (file ${p[k]})`);
  if (m === '2026-10') ok(sal === sum(payroll, (x) => +x.employer_cost), 'October P&L salaries = payroll employer cost');
  ok(Math.abs(+p.ebitda / net) < 0.2, `pnl ${m} EBITDA ${p.ebitda_pct}% is modest`);
}
ok(pnl.map((p) => p.month).join() === '2026-08,2026-09,2026-10', 'pnl months');

// ---- 11. finance policy ----
const pol = JSON.parse(fs.readFileSync(path.join(DATA, 'finance_policy.json'), 'utf8'));
ok(['max_marketing_pct_of_net_revenue', 'min_monthly_ebitda', 'max_blended_cac', 'cash_floor'].every((k) => typeof pol[k] === 'number'), 'finance_policy has marketing cap, min EBITDA, max CAC, cash floor');

// ---- 12. determinism and size ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kesar-data-'));
execFileSync(process.execPath, [path.join(HERE, 'generate.mjs'), tmp]);
for (const f of v2) ok(fs.existsSync(path.join(tmp, f)) && fs.readFileSync(path.join(tmp, f)).equals(fs.readFileSync(path.join(DATA, f))), `${f} regenerates byte-for-byte`);
fs.rmSync(tmp, { recursive: true, force: true });
const size = sum(fs.readdirSync(DATA).filter((f) => fs.statSync(path.join(DATA, f)).isFile()), (f) => fs.statSync(path.join(DATA, f)).size);
ok(size < 6.5e6, `data/ size ${(size / 1e6).toFixed(2)} MB < ~6 MB`);

console.log(`${fails ? 'FAILED' : 'OK'}: ${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
