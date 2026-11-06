// Named D2C metrics: one command, one exact definition, citable SQL. Definitions + sources: switch/METRICS.md.
// Every metric reads the marts built in marts.mjs (cached DB). Filter values are validated, then inlined as quoted literals,
// so the returned `sql` is exactly what ran and can be re-run with `kit sql`.
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './data.mjs';
import { fail } from './util.mjs';

const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";
const NC = "status <> 'cancelled'";
const MONTH = 'substr(date, 1, 7)';

// ---------- sources: table, date handling, filterable columns, --by dimensions ----------
const SALES_DIMS = { channel: 'channel', sku: 'sku', product: 'product', month: 'month', day: 'date', city: 'city', region: 'region', tier: 'city_tier', payment: 'payment', courier: 'courier', zone: 'zone', warehouse: 'warehouse', status: 'status', customer_type: 'customer_type' };
const SRC = {
  lines: { table: 'm_lines', date: 'date', filters: { channel: 'channel', sku: 'sku' }, dims: SALES_DIMS, tables: ['orders', 'products', 'returns', 'customers'] },
  orders: { table: 'm_orders', date: 'date', filters: { channel: 'channel' }, dims: { ...SALES_DIMS, sku: undefined, product: undefined }, tables: ['orders', 'customers'] },
  cd: { table: 'channel_daily', date: 'date', filters: { channel: 'channel' }, dims: { channel: 'channel', month: 'month', day: 'date' }, tables: ['orders', 'products', 'returns', 'meta_ads_daily', 'google_ads_daily', 'marketplace_ads_daily', 'creator_posts', 'customers'] },
  mkt: { table: 'marketing_daily', date: 'date', filters: { channel: 'channel' }, dims: { channel: 'channel', month: 'month', day: 'date', kind: 'kind' }, tables: ['meta_ads_daily', 'google_ads_daily', 'marketplace_ads_daily', 'creator_posts'] },
  ads: { table: 'ads_daily_all', date: 'date', filters: { channel: 'platform' }, dims: { channel: 'platform', platform: 'platform', campaign: 'campaign', type: 'type', source: 'source', month: 'month', day: 'date' }, tables: ['meta_ads_daily', 'google_ads_daily', 'marketplace_ads_daily'] },
  returns: { table: 'returns', date: 'date', filters: { channel: 'channel', sku: 'sku' }, dims: { channel: 'channel', sku: 'sku', reason: 'reason', restockable: 'restockable', month: MONTH, day: 'date' }, tables: ['returns'] },
  posts: { table: 'creator_perf', date: 'date', filters: {}, dims: { creator: 'handle', tier: 'tier', platform: 'platform', format: 'format', month: 'month', day: 'date' }, tables: ['creator_posts', 'creators'] },
  customers: { table: 'customers', date: 'first_order_date', filters: { channel: 'acquisition_channel' }, dims: { channel: 'acquisition_channel', cohort: 'substr(first_order_date, 1, 7)', month: 'substr(first_order_date, 1, 7)', city: 'city', region: 'region', tier: 'city_tier' }, tables: ['customers'] },
  pos: { table: '(SELECT p.*, s.name AS supplier, m.name AS material FROM purchase_orders p LEFT JOIN suppliers s ON s.supplier_id = p.supplier_id LEFT JOIN raw_materials m ON m.material_id = p.material_id)', date: 'date', filters: {}, dims: { supplier: 'supplier', material: 'material', status: 'status', month: MONTH }, tables: ['purchase_orders', 'suppliers', 'raw_materials'] },
  stock: { table: 'stock_latest', filters: { sku: 'sku' }, dims: { warehouse: 'warehouse', sku: 'sku' }, tables: ['inventory_snapshot'], snapshot: 'latest inventory snapshot' },
  payroll: { table: 'payroll_2026_10', filters: {}, dims: { dept: 'dept' }, tables: ['payroll_2026_10'], snapshot: 'October 2026 payroll (the only payroll file)' },
  employees: { table: 'employees', asOf: 'join_date', filters: {}, dims: { dept: 'dept', city: 'city', level: 'level' }, tables: ['employees'] },
  opex: { table: 'opex', month: 'month', filters: {}, dims: { category: 'category', vendor: 'vendor', month: 'month' }, tables: ['opex'] },
  pnl: { table: 'pnl', month: 'month', filters: {}, dims: { month: 'month' }, tables: ['pnl_monthly'] },
};

// Cover / sell-through: stock now vs units sold (non-cancelled) in the window, per warehouse x SKU.
const coverSrc = (c) => ({ ...SRC.stock, table: `(SELECT s.warehouse, s.sku, s.on_hand, COALESCE((SELECT SUM(l.qty) FROM m_lines l WHERE l.warehouse = s.warehouse AND l.sku = s.sku AND l.${NC} AND l.date BETWEEN ${lit(c.from)} AND ${lit(c.to)}), 0) AS sold FROM stock_latest s)`, tables: ['inventory_snapshot', 'orders'], snapshot: null });
const cover = { src: coverSrc, defaultLast: 28, defaultBy: ['warehouse', 'sku'], asc: true, unit: 'days',
  value: (c) => `ROUND(SUM(on_hand) / NULLIF(SUM(sold) / ${c.days}.0, 0), 1)`, extra: (c) => ({ on_hand: 'SUM(on_hand)', daily_units: `ROUND(SUM(sold) / ${c.days}.0, 1)` }) };
const cm = (k, expr, def) => ({ group: 'margin', unit: 'INR', src: 'cd', desc: `${k.toUpperCase()} (₹, also % of net revenue and per order)`, def, value: expr,
  extra: { pct_of_net: `ROUND(100.0 * (${expr}) / NULLIF(SUM(net_revenue), 0), 1)`, per_order: `ROUND((${expr}) / NULLIF(SUM(orders), 0))` } });
const CM1 = 'SUM(net_revenue) - SUM(cogs)', CM2 = `${CM1} - SUM(channel_fees) - SUM(shipping)`, CM3 = `${CM2} - SUM(marketing)`;
const adsRoas = (src, label) => ({ group: 'ads', unit: 'x', src: 'ads', where: src && `source = '${src}'`, desc: `${label} ROAS = platform-attributed revenue / spend`,
  def: `SUM(revenue) / SUM(spend) on ${label} rows of ads_daily_all. Revenue is what the platform claims (Meta: 7-day click + 1-day view), so it overlaps with other channels: never add platforms' revenue together.`,
  value: 'ROUND(1.0 * SUM(revenue) / NULLIF(SUM(spend), 0), 2)', extra: { spend: 'SUM(spend)', revenue: 'SUM(revenue)' } });

// ---------- the catalog ----------
export const METRICS = {
  // sales
  gross_revenue: { group: 'sales', unit: 'INR', src: 'lines', where: NC, desc: 'MRP x qty before discounts, RTO and returns', def: 'SUM(gross_revenue) over non-cancelled order lines (= MRP x qty). P&L gross_revenue.', value: 'SUM(gross_revenue)' },
  net_revenue: { group: 'sales', unit: 'INR', src: 'lines', where: "status = 'delivered'", desc: 'Revenue kept: delivered lines at selling price (P&L net revenue)', def: 'SUM(net_revenue) over delivered lines = gross - discounts - RTO - customer returns. Ties to pnl_monthly.net_revenue. By order date.', value: 'SUM(net_revenue)' },
  booked_revenue: { group: 'sales', unit: 'INR', src: 'lines', where: NC, desc: 'Net selling price of every non-cancelled line, before RTO/returns', def: 'SUM(net_revenue) over non-cancelled lines (incl. RTO and returned). What a dashboard shows on order day.', value: 'SUM(net_revenue)' },
  discounts: { group: 'sales', unit: 'INR', src: 'lines', where: NC, desc: 'Rupees given away as discount', def: 'SUM(gross_revenue - net_revenue) over non-cancelled lines. P&L discounts.', value: 'SUM(gross_revenue - net_revenue)' },
  discount_pct: { group: 'sales', unit: 'pct', src: 'lines', where: NC, desc: 'Discounts as % of gross revenue', def: '100 x discounts / gross_revenue, non-cancelled lines.', value: 'ROUND(100.0 * SUM(gross_revenue - net_revenue) / NULLIF(SUM(gross_revenue), 0), 1)' },
  orders: { group: 'sales', unit: 'count', src: 'lines', where: NC, desc: 'Orders placed, excluding cancelled (P&L orders)', def: 'COUNT(DISTINCT order_id) over non-cancelled lines. With --sku: orders containing that SKU.', value: 'COUNT(DISTINCT order_id)' },
  orders_all: { group: 'sales', unit: 'count', src: 'lines', desc: 'Orders placed, all statuses incl. cancelled', def: 'COUNT(DISTINCT order_id), every status.', value: 'COUNT(DISTINCT order_id)' },
  order_lines: { group: 'sales', unit: 'count', src: 'lines', desc: 'Rows in orders.csv (one per order x SKU), all statuses', def: 'COUNT(*) of order lines, every status. A multi-SKU order is several lines.', value: 'COUNT(*)' },
  units: { group: 'sales', unit: 'count', src: 'lines', where: NC, desc: 'Units sold, excluding cancelled (P&L units)', def: 'SUM(qty) over non-cancelled lines.', value: 'SUM(qty)' },
  units_all: { group: 'sales', unit: 'count', src: 'lines', desc: 'Units ordered, all statuses incl. cancelled', def: 'SUM(qty) over every line.', value: 'SUM(qty)' },
  aov: { group: 'sales', unit: 'INR', src: 'lines', where: NC, desc: 'Average order value (net of discount, non-cancelled orders)', def: 'SUM(net_revenue) / COUNT(DISTINCT order_id) over non-cancelled lines (booked AOV).', value: 'ROUND(1.0 * SUM(net_revenue) / NULLIF(COUNT(DISTINCT order_id), 0))', extra: { units_per_order: 'ROUND(1.0 * SUM(qty) / NULLIF(COUNT(DISTINCT order_id), 0), 2)' } },
  cod_share: { group: 'sales', unit: 'pct', src: 'orders', where: NC, desc: '% of shipped orders paid cash on delivery', def: '100 x COD orders / shipped (non-cancelled) orders, order level.', value: "ROUND(100.0 * SUM(payment = 'cod') / COUNT(*), 1)", extra: { cod_orders: "SUM(payment = 'cod')", shipped_orders: 'COUNT(*)' } },
  // returns
  rto_pct: { group: 'returns', unit: 'pct', src: 'orders', where: NC, desc: 'RTO % = orders returned to origin undelivered / orders shipped', def: "100 x orders with status 'rto' / non-cancelled orders, order level, by order date. RTO = courier could not deliver (refused, unreachable, COD not paid); not a customer return.", value: "ROUND(100.0 * SUM(status = 'rto') / COUNT(*), 1)", extra: { rto_orders: "SUM(status = 'rto')", shipped_orders: 'COUNT(*)' } },
  return_pct: { group: 'returns', unit: 'pct', src: 'lines', where: "status IN ('delivered', 'returned')", desc: 'Customer return % = units returned after delivery / units delivered', def: "100 x qty of 'returned' lines / qty of delivered + returned lines, by order date. Excludes RTO.", value: "ROUND(100.0 * SUM(CASE WHEN status = 'returned' THEN qty ELSE 0 END) / NULLIF(SUM(qty), 0), 1)", extra: { returned_units: "SUM(CASE WHEN status = 'returned' THEN qty ELSE 0 END)" } },
  returns: { group: 'returns', unit: 'count', src: 'returns', desc: 'Customer returns logged (by return date), with refunds', def: 'COUNT(*) of returns.csv rows, by return date; refunds = SUM(refund).', value: 'COUNT(*)', extra: { refunds: 'SUM(refund)', units: 'SUM(qty)' } },
  return_reasons: { group: 'returns', unit: 'count', src: 'returns', defaultBy: ['reason'], desc: 'Customer returns by reason, most common first', def: 'COUNT(*) of returns.csv rows per reason, by return date.', value: 'COUNT(*)', extra: { refunds: 'SUM(refund)' } },
  // costs and margin
  cogs: { group: 'margin', unit: 'INR', src: 'lines', desc: 'Product cost of goods (P&L COGS)', def: 'products.cogs x qty on delivered lines + returned lines that are not restockable. P&L cogs.', value: 'SUM(cogs)' },
  channel_fees: { group: 'margin', unit: 'INR', src: 'lines', desc: 'Marketplace commission + fixed fees + payment gateway', def: 'SUM(orders.channel_fee) (commission, fixed/closing fee, 2% gateway on website prepaid). P&L channel_fees.', value: 'SUM(channel_fee)' },
  shipping_cost: { group: 'margin', unit: 'INR', src: 'lines', deny: ['sku'], desc: 'Forward + RTO/return shipping + COD fees', def: 'SUM(orders.shipping_cost) (sits on the first line of each order; RTO/returns pay twice). P&L shipping.', value: 'SUM(shipping_cost)' },
  fees_pct: { group: 'margin', unit: 'pct', src: 'lines', where: "status = 'delivered'", deny: ['sku'], desc: 'Channel fees + shipping as % of delivered revenue', def: '100 x SUM(channel_fee + shipping_cost) / SUM(net_revenue) over delivered lines (README convention).', value: 'ROUND(100.0 * SUM(channel_fee + shipping_cost) / NULLIF(SUM(net_revenue), 0), 1)' },
  cm1: cm('cm1', CM1, 'CM1 = net revenue - COGS (product margin).'),
  cm2: cm('cm2', CM2, 'CM2 = CM1 - channel fees (commission, gateway) - shipping (forward, RTO, COD). 3PL warehousing stays in opex.'),
  cm3: cm('cm3', CM3, 'CM3 = CM2 - marketing (Meta + Google + marketplace ads + creator fees). By channel: marketplace ads go to that marketplace; Meta, Google and creators to Website. EBITDA = CM3 - salaries - opex.'),
  ebitda: { group: 'finance', unit: 'INR', src: 'pnl', desc: 'EBITDA from the monthly P&L (month granularity)', def: 'SUM(pnl_monthly.ebitda) for months in the window = net revenue - COGS - fees - shipping - marketing - salaries - opex.', value: 'SUM(ebitda)', extra: { ebitda_pct: 'ROUND(100.0 * SUM(ebitda) / NULLIF(SUM(net_revenue), 0), 1)', net_revenue: 'SUM(net_revenue)' } },
  ebitda_pct: { group: 'finance', unit: 'pct', src: 'pnl', desc: 'EBITDA as % of net revenue (monthly P&L)', def: '100 x SUM(ebitda) / SUM(net_revenue), months in the window.', value: 'ROUND(100.0 * SUM(ebitda) / NULLIF(SUM(net_revenue), 0), 1)' },
  opex: { group: 'finance', unit: 'INR', src: 'opex', desc: 'Operating expenses (rent, 3PL, software, ...) by category', def: 'SUM(opex.amount), months in the window.', value: 'SUM(amount)' },
  runway_months: { group: 'finance', unit: 'months', src: 'pnl', desc: 'Cash runway = cash balance / average monthly EBITDA burn (cash-ish)', def: 'finance_policy.cash_balance / -AVG(monthly ebitda) over months in the window. EBITDA is a proxy for cash burn (ignores working capital, capex, GST). Null if EBITDA is positive.', value: 'ROUND(AVG(ebitda))', post: runway },
  // marketing
  marketing_spend: { group: 'ads', unit: 'INR', src: 'mkt', desc: 'Total marketing = Meta + Google + marketplace ads + creator fees', def: 'SUM(spend) of marketing_daily (ads by date, creator fee_paid by post date). P&L marketing. --by kind splits it.', value: 'SUM(spend)' },
  marketing_pct: { group: 'ads', unit: 'pct', src: 'cd', desc: 'Marketing as % of net revenue (finance policy cap)', def: '100 x marketing / net revenue.', value: 'ROUND(100.0 * SUM(marketing) / NULLIF(SUM(net_revenue), 0), 1)' },
  ad_spend: { group: 'ads', unit: 'INR', src: 'ads', desc: 'Paid ads spend (Meta, Google, marketplaces), no creators', def: 'SUM(spend) of ads_daily_all. --channel takes a platform: Meta, Google, Amazon, Flipkart, Nykaa, Blinkit, Zepto.', value: 'SUM(spend)', extra: { revenue: 'SUM(revenue)' } },
  roas: adsRoas(null, 'all paid-ads'),
  meta_roas: adsRoas('meta', 'Meta'),
  google_roas: adsRoas('google', 'Google'),
  marketplace_roas: adsRoas('marketplace', 'marketplace (Amazon, Flipkart, Nykaa, Blinkit, Zepto)'),
  ctr_pct: { group: 'ads', unit: 'pct', src: 'ads', where: 'impressions IS NOT NULL', desc: 'Click-through rate (Meta + Google; marketplaces report no impressions)', def: '100 x SUM(clicks) / SUM(impressions).', value: 'ROUND(100.0 * SUM(clicks) / NULLIF(SUM(impressions), 0), 2)' },
  cpc: { group: 'ads', unit: 'INR', src: 'ads', desc: 'Cost per click', def: 'SUM(spend) / SUM(clicks).', value: 'ROUND(1.0 * SUM(spend) / NULLIF(SUM(clicks), 0), 1)' },
  cpm: { group: 'ads', unit: 'INR', src: 'ads', where: 'impressions IS NOT NULL', desc: 'Cost per 1,000 impressions (Meta + Google)', def: '1000 x SUM(spend) / SUM(impressions).', value: 'ROUND(1000.0 * SUM(spend) / NULLIF(SUM(impressions), 0))' },
  blended_roas: { group: 'ads', unit: 'x', src: 'cd', desc: 'Net revenue / paid ads spend (all channels, no attribution)', def: 'SUM(net_revenue, delivered) / SUM(paid ads spend: Meta + Google + marketplace ads). Creators excluded (see mer).', value: 'ROUND(1.0 * SUM(net_revenue) / NULLIF(SUM(ad_spend), 0), 2)' },
  mer: { group: 'ads', unit: 'x', src: 'cd', desc: 'Marketing efficiency ratio = net revenue / total marketing', def: 'SUM(net_revenue, delivered) / SUM(marketing incl. creator fees). 1 / MER = marketing % of revenue.', value: 'ROUND(1.0 * SUM(net_revenue) / NULLIF(SUM(marketing), 0), 2)' },
  cac: { group: 'ads', unit: 'INR', src: 'cd', desc: 'Blended CAC = marketing / new customers', def: 'SUM(marketing) / customers whose first order falls in the window (finance_policy rule). By channel: allocated marketing / new customers acquired on that channel.', value: 'ROUND(1.0 * SUM(marketing) / NULLIF(SUM(new_customers), 0))', extra: { marketing: 'SUM(marketing)', new_customers: 'SUM(new_customers)' } },
  // creators
  creator_fees: { group: 'creators', unit: 'INR', src: 'posts', desc: 'Fees paid to creators (by post date)', def: 'SUM(creator_posts.fee_paid); barter posts are 0.', value: 'SUM(fee_paid)', extra: { posts: 'COUNT(*)', barter_posts: "SUM(barter = 'yes')" } },
  creator_orders: { group: 'creators', unit: 'count', src: 'posts', desc: 'Orders driven by creator coupon codes', def: 'SUM(creator_posts.orders): non-cancelled website orders using the post coupon within 7 days.', value: 'SUM(orders)', extra: { revenue: 'SUM(revenue)' } },
  creator_roas: { group: 'creators', unit: 'x', src: 'posts', where: 'fee_paid > 0', desc: 'Coupon revenue / fee on paid creator posts', def: 'SUM(revenue) / SUM(fee_paid) over posts with fee_paid > 0 (barter posts excluded). Coupon attribution undercounts.', value: 'ROUND(1.0 * SUM(revenue) / NULLIF(SUM(fee_paid), 0), 2)', extra: { fee_paid: 'SUM(fee_paid)', revenue: 'SUM(revenue)', orders: 'SUM(orders)' } },
  creator_cpm: { group: 'creators', unit: 'INR', src: 'posts', where: 'fee_paid > 0', desc: 'Creator fee per 1,000 views (paid posts)', def: '1000 x SUM(fee_paid) / SUM(views), paid posts.', value: 'ROUND(1000.0 * SUM(fee_paid) / NULLIF(SUM(views), 0))' },
  creator_cost_per_order: { group: 'creators', unit: 'INR', src: 'posts', where: 'fee_paid > 0', desc: 'Creator fee per coupon order (paid posts)', def: 'SUM(fee_paid) / SUM(orders), paid posts.', value: 'ROUND(1.0 * SUM(fee_paid) / NULLIF(SUM(orders), 0))' },
  // customers
  new_customers: { group: 'customers', unit: 'count', src: 'customers', desc: 'Customers whose first order is in the window', def: 'COUNT(*) of customers by first_order_date (ids are per channel: marketplaces hide buyer identity).', value: 'COUNT(*)' },
  repeat_rate: { group: 'customers', unit: 'pct', src: 'customers', desc: '% of customers (first order in window) with 2+ orders', def: '100 x customers with orders >= 2 / customers, cohort = first_order_date in the window; orders count every status.', value: 'ROUND(100.0 * SUM(orders >= 2) / COUNT(*), 1)', extra: { customers: 'COUNT(*)' } },
  new_vs_returning: { group: 'customers', unit: 'INR', src: 'lines', where: "status = 'delivered'", defaultBy: ['customer_type'], desc: 'Delivered revenue from first orders vs repeat orders', def: "SUM(net_revenue) of delivered lines, split by whether the order is the customer's first (new) or not (returning).", value: 'SUM(net_revenue)', extra: { share_pct: 'ROUND(100.0 * SUM(net_revenue) / SUM(SUM(net_revenue)) OVER (), 1)' } },
  cohort_retention: { group: 'customers', unit: 'pct', src: () => ({ ...SRC.orders, table: `(SELECT f.*, CASE WHEN substr(date(f.cohort || '-01', '+1 month'), 1, 7) <= x.mx THEN MAX(o.month = substr(date(f.cohort || '-01', '+1 month'), 1, 7)) END AS m1, CASE WHEN substr(date(f.cohort || '-01', '+2 month'), 1, 7) <= x.mx THEN MAX(o.month = substr(date(f.cohort || '-01', '+2 month'), 1, 7)) END AS m2 FROM (SELECT customer_id, MIN(channel) AS channel, MIN(date) AS date, substr(MIN(date), 1, 7) AS cohort FROM m_orders WHERE ${NC} GROUP BY customer_id) f JOIN m_orders o ON o.customer_id = f.customer_id AND o.${NC} CROSS JOIN (SELECT MAX(month) AS mx FROM m_orders) x GROUP BY f.customer_id)`, dims: { cohort: 'cohort', channel: 'channel' } }), defaultBy: ['cohort'], desc: '% of a first-order-month cohort ordering again in month +1 / +2', def: 'Cohort = month of first non-cancelled order. m1_pct = % who placed a non-cancelled order in the next calendar month (value), m2_pct = month +2. Null where that month is past the data.', value: 'ROUND(100.0 * AVG(m1), 1)', extra: { m2_pct: 'ROUND(100.0 * AVG(m2), 1)', customers: 'COUNT(*)' } },
  ltv: { group: 'customers', unit: 'INR', src: 'customers', desc: 'Revenue LTV to date = avg delivered revenue per customer', def: 'AVG(customers.total_spend) (delivered net revenue since first order; at most 92 days of history), cohort = first_order_date in the window.', value: 'ROUND(AVG(total_spend))', extra: { avg_orders: 'ROUND(AVG(orders), 2)', customers: 'COUNT(*)' } },
  // ops
  stock_on_hand: { group: 'ops', unit: 'count', src: 'stock', desc: 'Finished-goods units on hand in the latest weekly snapshot', def: 'SUM(on_hand) of inventory_snapshot at its latest date (= products.csv stock columns).', value: 'SUM(on_hand)', extra: { in_transit: 'SUM(in_transit)', reserved: 'SUM(reserved)' } },
  days_of_cover: { group: 'ops', desc: 'Days of stock left at the recent sales rate (default last 28 days)', def: 'on_hand (latest snapshot) / (units sold, non-cancelled, in the window / days in window). Lowest first.', ...cover },
  stockout_risk: { group: 'ops', desc: 'Warehouse x SKU with under 21 days of cover', def: 'days_of_cover < 21 (3 weeks: a PO/transfer cycle plus safety). Lowest first.', ...cover, having: 'value < 21' },
  sell_through: { group: 'ops', unit: 'pct', src: coverSrc, defaultLast: 28, defaultBy: ['sku'], desc: 'Units sold / (sold + on hand now), default last 28 days', def: '100 x units sold (non-cancelled) in window / (sold + latest on_hand).', value: 'ROUND(100.0 * SUM(sold) / NULLIF(SUM(sold) + SUM(on_hand), 0), 1)', extra: { sold: 'SUM(sold)', on_hand: 'SUM(on_hand)' } },
  po_value: { group: 'ops', unit: 'INR', src: 'pos', desc: 'Purchase orders placed (by PO date)', def: 'SUM(purchase_orders.total) by PO date.', value: 'SUM(total)', extra: { pos: 'COUNT(*)' } },
  po_delays: { group: 'ops', unit: 'count', src: 'pos', desc: 'POs late: delayed now + received late', def: "value = POs with status 'delayed' (past expected, not received) or 'received_late'. late_pct = received_late / all received.", value: "SUM(status IN ('delayed', 'received_late'))", extra: { delayed_now: "SUM(status = 'delayed')", arrived_late: "SUM(status = 'received_late')", late_pct: "ROUND(100.0 * SUM(status = 'received_late') / NULLIF(SUM(status IN ('received', 'received_late')), 0), 1)", pos: 'COUNT(*)' } },
  supplier_lead_time: { group: 'ops', unit: 'days', src: 'pos', where: 'received_date IS NOT NULL', defaultBy: ['supplier'], desc: 'Actual days from PO to receipt, vs promised', def: 'AVG(received_date - PO date) over received POs; promised_days = AVG(expected_date - PO date); avg_delay = actual - promised.', value: 'ROUND(AVG(julianday(received_date) - julianday(date)), 1)', extra: { promised_days: 'ROUND(AVG(julianday(expected_date) - julianday(date)), 1)', avg_delay: 'ROUND(AVG(julianday(received_date) - julianday(expected_date)), 1)', pos: 'COUNT(*)' } },
  rm_cost_change: { group: 'ops', unit: 'pct', src: (c) => ({ ...SRC.pos, table: `(SELECT DISTINCT p.material_id, m.name AS material, FIRST_VALUE(p.unit_cost) OVER w AS first_cost, LAST_VALUE(p.unit_cost) OVER w AS last_cost, m.unit_cost AS standard_cost FROM purchase_orders p JOIN raw_materials m ON m.material_id = p.material_id WHERE p.date BETWEEN ${lit(c.from)} AND ${lit(c.to)} WINDOW w AS (PARTITION BY p.material_id ORDER BY p.date, p.po_id ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING))`, date: null, dims: { material: 'material' } }), defaultBy: ['material'], desc: 'Raw-material price change: first vs latest PO unit cost in window', def: '100 x (latest PO unit_cost - first PO unit_cost) / first, per material, POs in the window.', value: 'ROUND(100.0 * (MAX(last_cost) - MAX(first_cost)) / MAX(first_cost), 1)', extra: { first_cost: 'MAX(first_cost)', last_cost: 'MAX(last_cost)', standard_cost: 'MAX(standard_cost)' } },
  // people
  salary_bill: { group: 'people', unit: 'INR', src: 'payroll', desc: 'October 2026 payroll: gross, net pay, employer cost', def: 'value = SUM(gross) (basic + HRA + special). net_pay = gross - employee PF - PT - TDS. employer_cost = gross + employer PF (= P&L salaries).', value: 'SUM(gross)', extra: { net_pay: 'SUM(net_pay)', employer_cost: 'SUM(employer_cost)', pf_employee: 'SUM(pf_employee)', pf_employer: 'SUM(pf_employer)', tds: 'SUM(tds)', professional_tax: 'SUM(professional_tax)', headcount: 'COUNT(*)' } },
  headcount: { group: 'people', unit: 'count', src: 'employees', desc: 'People employed (joined on or before the window end)', def: 'COUNT(*) of employees with join_date <= window end (today if no window).', value: 'COUNT(*)' },
};

function runway(row, c) {
  const pol = readJson(c.dir, 'finance_policy.json');
  const avg = row.value;
  const burn = avg < 0 ? -avg : 0;
  return { value: burn ? Math.round((pol.cash_balance / burn) * 10) / 10 : null, cash_balance: pol.cash_balance, avg_monthly_ebitda: avg,
    months_above_cash_floor: burn ? Math.round(((pol.cash_balance - pol.cash_floor) / burn) * 10) / 10 : null, ...(burn ? {} : { note: 'EBITDA is positive: no burn' }) };
}

export function readJson(dir, f) {
  const p = path.join(dir, f);
  try { if (!fs.lstatSync(p).isFile()) throw 0; return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { fail(`cannot read data/${f}`); }
}

// ---------- helpers ----------
const fmtNum = (v, d = 0) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: d });
export function display(v, unit) {
  if (v == null) return 'n/a';
  if (unit === 'INR') return (v < 0 ? '-₹' : '₹') + fmtNum(Math.abs(v));
  if (unit === 'pct') return `${v}%`;
  if (unit === 'x') return `${v}x`;
  if (unit === 'days') return `${v} days`;
  if (unit === 'months') return `${v} months`;
  return fmtNum(v, 2);
}

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function suggest(name, pool = Object.keys(METRICS)) {
  const n = String(name).toLowerCase();
  return pool.map((k) => [k, k.includes(n) || n.includes(k) ? 0 : lev(n, k)]).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([k]) => k);
}

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

function windowOf(db, o, m) {
  const set = [o.month, o.from || o.to, o.last].filter((x) => x != null).length;
  if (set > 1) fail('use one of --month, --from/--to, --last');
  const maxDate = db.prepare('SELECT MAX(date) d FROM m_lines').get()?.d;
  if (o.month != null) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(o.month)) fail('--month must be YYYY-MM');
    const to = addDays(addDays(o.month + '-01', 32).slice(0, 7) + '-01', -1);
    return { from: o.month + '-01', to, label: o.month };
  }
  if (o.from || o.to) {
    for (const d of [o.from, o.to]) if (d && !DATE.test(d)) fail('--from/--to must be YYYY-MM-DD');
    const w = { from: o.from || '2000-01-01', to: o.to || maxDate };
    if (w.from > w.to) fail('--from is after --to');
    return w;
  }
  const last = o.last ?? m.defaultLast;
  if (last != null) {
    const n = Number(last);
    if (!Number.isInteger(n) || n < 1 || n > 366) fail('--last must be a whole number of days, 1-366');
    return { from: addDays(maxDate, 1 - n), to: maxDate, label: `last ${n} days to ${maxDate}` };
  }
  return null; // all data
}

function canon(db, src, col, val, what) {
  const rows = db.prepare(`SELECT DISTINCT ${col} AS v FROM ${src.table} WHERE ${col} IS NOT NULL`).all().map((r) => String(r.v));
  const hit = rows.find((r) => r.toLowerCase() === String(val).toLowerCase());
  if (hit) return hit;
  if (what === 'sku') {
    const p = db.prepare('SELECT sku FROM products WHERE lower(name) LIKE ?').all(`%${String(val).toLowerCase()}%`);
    if (p.length === 1) return p[0].sku;
  }
  fail(`unknown ${what} "${val}". Valid: ${rows.sort().join(', ')}`);
}

// ---------- run one metric ----------
export function metric(dir, name, o = {}) {
  const m = METRICS[name];
  if (!m) fail(`unknown metric "${name}". Did you mean: ${suggest(name).join(', ')}? (kit metric list)`);
  const { db } = openDb(dir);
  let w;
  try { w = windowOf(db, o, m); } catch (e) { if (/no such table/.test(e.message)) fail('metrics need the full data/ (orders, products, customers, ...)'); throw e; }
  const ctx = { ...(w || { from: '2000-01-01', to: '9999-12-31' }), dir };
  ctx.days = w ? daysBetween(w.from, w.to) : null;
  const src = typeof m.src === 'function' ? m.src(ctx) : SRC[m.src];
  const by = o.by ? String(o.by).split(',').map((s) => s.trim()).filter(Boolean) : m.defaultBy || [];
  if (by.length > 2) fail('--by takes at most 2 dimensions, e.g. --by channel,month');
  for (const b of by) if (!src.dims[b] || m.deny?.includes(b)) fail(`--by ${b} not available for ${name}. Use: ${Object.keys(src.dims).filter((k) => src.dims[k] && !m.deny?.includes(k)).join(', ')}`);
  const where = m.where ? [`(${m.where})`] : [];
  const filters = {};
  for (const k of ['channel', 'sku']) {
    if (o[k] == null) continue;
    const col = src.filters[k];
    if (!col || m.deny?.includes(k)) fail(`--${k} not available for ${name}${Object.keys(src.filters).length ? ` (filters: ${Object.keys(src.filters).map((f) => '--' + f).join(', ')})` : ''}`);
    filters[k] = canon(db, src, col, o[k], k);
    where.push(`${col} = ${lit(filters[k])}`);
  }
  let note;
  if (w) {
    if (src.date) where.push(`${src.date} BETWEEN ${lit(w.from)} AND ${lit(w.to)}`);
    else if (src.month) where.push(`${src.month} BETWEEN ${lit(w.from.slice(0, 7))} AND ${lit(w.to.slice(0, 7))}`);
    else if (src.asOf) where.push(`${src.asOf} <= ${lit(w.to)}`);
    else if (src.snapshot) note = `snapshot metric (${src.snapshot}): date filters ignored`;
    if (src.month && !(w.from.endsWith('-01') && addDays(w.to, 1).endsWith('-01'))) note = 'month-granular source: every month touching the window is counted';
  }
  const value = typeof m.value === 'function' ? m.value(ctx) : m.value;
  const extra = typeof m.extra === 'function' ? m.extra(ctx) : m.extra || {};
  const dimSel = by.map((b) => `${src.dims[b]} AS ${b}`);
  const sel = [...dimSel, `${value} AS value`, ...Object.entries(extra).map(([k, e]) => `${e} AS ${k}`)].join(', ');
  const timeDim = by.find((b) => ['month', 'day', 'cohort'].includes(b));
  const order = by.length ? ` GROUP BY ${by.map((b) => src.dims[b]).join(', ')}${m.having ? ` HAVING ${m.having}` : ''} ORDER BY ${timeDim ? `${timeDim}, ` : ''}value IS NULL, value ${m.asc ? 'ASC' : 'DESC'}` : '';
  const sql = `SELECT ${sel} FROM ${src.table} AS t${where.length ? ` WHERE ${where.join(' AND ')}` : ''}${order}`;
  let rows;
  try { rows = db.prepare(sql).all(); } catch (e) { fail(`metric ${name} failed: ${e.message}`); }
  const unit = m.unit;
  const out = { metric: name, definition: m.def, unit };
  if (by.length) {
    out.values = rows.slice(0, 200).map((r) => { const x = m.post ? { ...r, ...m.post(r, ctx) } : r; return { ...x, display: display(x.value, unit) }; });
    if (rows.length > 200) out.truncated = true;
  } else {
    const r0 = rows[0] || { value: null };
    const r = m.post ? { ...r0, ...m.post(r0, ctx) } : r0;
    Object.assign(out, r, { display: display(r.value, unit) });
  }
  out.filters = { ...filters, ...(w ? { from: w.from, to: w.to } : { window: 'all data' }), ...(by.length ? { by: by.join(',') } : {}) };
  if (note) out.note = note;
  out.source_tables = src.tables;
  out.sql = sql;
  return out;
}

export function list() {
  return { metrics: Object.entries(METRICS).map(([name, m]) => ({ name, group: m.group, unit: m.unit, desc: m.desc })),
    usage: 'kit metric <name> [--channel X] [--sku Y] [--month YYYY-MM | --from D --to D | --last N] [--by dim[,dim]]', more: 'Definitions + conventions: switch/METRICS.md' };
}

// ---------- kit brief <dept>: the numbers a lead needs, month vs previous month ----------
// Item: [label, metric, opts, how]. how: 'cmp' = month + change vs previous month; 'top' = top 3 rows for the month;
// 'topall' / 'bottom' = top / bottom 3 over all data; 'fixed' = one value, no --month added.
// Metrics with their own default window (days_of_cover, ...) or an explicit --last never get --month.
const BRIEFS = {
  analytics: [['Net revenue', 'net_revenue', {}, 'cmp'], ['Orders', 'orders', {}, 'cmp'], ['AOV', 'aov', {}, 'cmp'], ['Units', 'units', {}, 'cmp'],
    ['Net revenue by channel', 'net_revenue', { by: 'channel' }, 'top'], ['Net revenue by product', 'net_revenue', { by: 'product' }, 'top'],
    ['New vs returning revenue', 'new_vs_returning', {}, 'top'], ['RTO %', 'rto_pct', {}, 'cmp'], ['Customer return %', 'return_pct', {}, 'cmp'],
    ['Repeat rate (all customers, quarter)', 'repeat_rate', {}, 'fixed']],
  ads: [['Marketing spend', 'marketing_spend', {}, 'cmp'], ['Marketing % of net revenue', 'marketing_pct', {}, 'cmp'], ['MER', 'mer', {}, 'cmp'],
    ['Blended CAC', 'cac', {}, 'cmp'], ['Meta ROAS', 'meta_roas', {}, 'cmp'], ['Google ROAS', 'google_roas', {}, 'cmp'], ['Marketplace ads ROAS', 'marketplace_roas', {}, 'cmp'],
    ['Best campaigns by ROAS', 'roas', { by: 'campaign' }, 'top'], ['Meta CTR', 'ctr_pct', { channel: 'Meta' }, 'cmp']],
  creators: [['Creator fees', 'creator_fees', {}, 'cmp'], ['Creator ROAS (paid posts)', 'creator_roas', {}, 'cmp'], ['Coupon orders', 'creator_orders', {}, 'cmp'],
    ['Cost per coupon order', 'creator_cost_per_order', {}, 'cmp'], ['Creator CPM', 'creator_cpm', {}, 'cmp'],
    ['Best creators by ROAS (quarter)', 'creator_roas', { by: 'creator' }, 'topall'], ['Worst creators by ROAS (quarter)', 'creator_roas', { by: 'creator' }, 'bottom']],
  ops: [['Lowest days of cover (last 28 days rate)', 'days_of_cover', {}, 'top'], ['Stockout risk (< 21 days)', 'stockout_risk', {}, 'top'],
    ['RTO %', 'rto_pct', {}, 'cmp'], ['Website RTO by courier', 'rto_pct', { channel: 'Website', by: 'courier' }, 'top'], ['COD share', 'cod_share', {}, 'cmp'],
    ['Late POs (quarter)', 'po_delays', {}, 'fixed'], ['Raw-material price moves (quarter)', 'rm_cost_change', {}, 'topall'], ['Stock on hand', 'stock_on_hand', {}, 'fixed']],
  design: [['Meta ROAS by creative type (last 30 days)', 'meta_roas', { by: 'type', last: '30' }, 'top'], ['Net revenue by product', 'net_revenue', { by: 'product' }, 'top'],
    ['Top return reasons (packaging cues)', 'return_reasons', {}, 'top'], ['Meta CTR', 'ctr_pct', { channel: 'Meta' }, 'cmp'], ['AOV', 'aov', {}, 'cmp']],
  finance: [['Net revenue', 'net_revenue', {}, 'cmp'], ['EBITDA', 'ebitda', {}, 'cmp'], ['CM1 (after COGS)', 'cm1', {}, 'cmp'], ['CM2 (after fees + shipping)', 'cm2', {}, 'cmp'],
    ['CM3 (after marketing)', 'cm3', {}, 'cmp'], ['Marketing % of net revenue', 'marketing_pct', {}, 'cmp'], ['Blended CAC', 'cac', {}, 'cmp'],
    ['Opex', 'opex', {}, 'cmp'], ['Salary bill (Oct payroll)', 'salary_bill', {}, 'fixed'], ['Cash runway', 'runway_months', {}, 'fixed']],
  captain: [['Net revenue', 'net_revenue', {}, 'cmp'], ['EBITDA', 'ebitda', {}, 'cmp'], ['Orders', 'orders', {}, 'cmp'], ['Marketing % of net revenue', 'marketing_pct', {}, 'cmp'],
    ['Blended CAC', 'cac', {}, 'cmp'], ['RTO %', 'rto_pct', {}, 'cmp'], ['Net revenue by channel', 'net_revenue', { by: 'channel' }, 'top'],
    ['Stockout risk (< 21 days)', 'stockout_risk', {}, 'top'], ['Cash runway', 'runway_months', {}, 'fixed']],
};
const ALIAS = { analyst: 'analytics', insights: 'analytics', marketing: 'ads', influencers: 'creators', ugc: 'creators', operations: 'ops', war: 'captain', founder: 'captain' };

const cmdOf = (name, o) => ['kit metric', name, ...Object.entries(o).map(([k, v]) => `--${k} ${/\s/.test(v) ? `"${v}"` : v}`)].join(' ');
const short = (rows, unit) => rows.map((r) => `${Object.entries(r).filter(([k, v]) => k !== 'display' && typeof v === 'string').map(([, v]) => v).join(' ')}: ${display(r.value, unit)}`);

export function brief(dir, dept, o = {}) {
  const d = ALIAS[String(dept).toLowerCase()] || String(dept).toLowerCase();
  if (!BRIEFS[d]) fail(`unknown dept "${dept}". Use: ${Object.keys(BRIEFS).join(', ')}`);
  const { db } = openDb(dir);
  let month = o.month;
  try { month ??= db.prepare('SELECT MAX(month) m FROM m_lines').get().m; } catch { fail('brief needs the full data/ (orders, products, customers, ...)'); }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('--month must be YYYY-MM');
  const prev = addDays(month + '-01', -1).slice(0, 7);
  const numbers = BRIEFS[d].map(([label, name, opts, how]) => {
    const windowed = (how === 'cmp' || how === 'top') && !opts.last && !METRICS[name].defaultLast;
    const run = { ...opts, ...(windowed ? { month } : {}) };
    const r = metric(dir, name, run);
    const item = { label, cmd: cmdOf(name, run) };
    if (r.values) {
      const rows = how === 'bottom' ? r.values.filter((x) => x.value != null).slice(-3).reverse() : r.values.slice(0, 3);
      item.top = short(rows, r.unit);
    } else {
      Object.assign(item, { value: r.value, display: r.display });
      if (how === 'cmp') {
        const p = metric(dir, name, { ...opts, month: prev });
        item.prev = p.display;
        if (p.value && r.value != null && r.unit !== 'pct') item.change_pct = Math.round((1000 * (r.value - p.value)) / Math.abs(p.value)) / 10;
        if (r.unit === 'pct' && p.value != null && r.value != null) item.change_pts = Math.round(10 * (r.value - p.value)) / 10;
      }
    }
    return item;
  });
  const out = { dept: d, month, vs: prev, numbers };
  if (d === 'finance' || d === 'captain') {
    const pol = readJson(dir, 'finance_policy.json');
    const v = (n) => metric(dir, n, { month }).value;
    out.policy_checks = [
      { rule: `marketing <= ${pol.max_marketing_pct_of_net_revenue}% of net revenue`, value: v('marketing_pct'), ok: v('marketing_pct') <= pol.max_marketing_pct_of_net_revenue },
      { rule: `monthly EBITDA >= ₹${pol.min_monthly_ebitda.toLocaleString('en-IN')}`, value: v('ebitda'), ok: v('ebitda') >= pol.min_monthly_ebitda },
      { rule: `blended CAC <= ₹${pol.max_blended_cac}`, value: v('cac'), ok: v('cac') <= pol.max_blended_cac },
    ];
  }
  if (d === 'design') {
    const b = readJson(dir, 'budget.json');
    out.sale = `${b.sale.discount_pct}% off for ${b.sale.days} days (budget.json)`;
  }
  out.note = 'Every number comes from the kit metric command next to it; definitions in switch/METRICS.md.';
  return out;
}
