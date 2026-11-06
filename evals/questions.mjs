// Question bank. Every truth is computed from data/ at run time (never hard-coded).
// Fields: agent, text, kind ('number'|'text'|'oneof'|'style'), truth(db), tolerance (relative, numbers),
// v2: true when it needs the v2 data files (skipped until data/orders.csv exists).
import { sum, inMonth, argmax, one } from './lib.mjs';

const prod = (db, sku) => one(db.t('products', ['sku', 'name']), r => r.sku === sku, sku);
const OCT = '2026-10', SEP = '2026-09';
const roas = (rows) => sum(rows, 'revenue') / sum(rows, 'spend');
const best = (rows, key) => {           // key with highest revenue/spend
  const keys = [...new Set(rows.map(r => r[key]))];
  const vals = keys.map(k => roas(rows.filter(r => r[key] === k)));
  const top = Math.max(...vals);
  return keys.filter((k, i) => Math.abs(vals[i] - top) < 1e-9);
};
const pnl = (db, m, col) => one(db.t('pnl_monthly', ['month', col]), r => r.month === m, `pnl ${m}`)[col];
const fee = (db, ch, col) => one(db.t('channel_fees', ['channel', col]), r => r.channel === ch, ch)[col];
const firstRow = (db, t, cols) => { const r = db.t(t, cols)[0]; if (!r) throw new Error(`data/${t}.csv is empty`); return r; };

export const questions = [
  // ---------------- d2c-ops ----------------
  { agent: 'd2c-ops', kind: 'number', text: 'How many units of SKU01 are in stock in the Delhi warehouse (products.csv)?',
    truth: db => prod(db, 'SKU01').stock_delhi },
  { agent: 'd2c-ops', kind: 'number', text: 'How many units of Sunscreen SPF 50 do we hold across all three warehouses in total?',
    truth: db => { const p = prod(db, 'SKU02'); return p.stock_mumbai + p.stock_delhi + p.stock_bangalore; } },
  { agent: 'd2c-ops', kind: 'text', text: 'Which warehouse is the home warehouse for the South region?',
    truth: db => one(db.t('regions', ['region', 'home_warehouse']), r => r.region === 'South', 'South').home_warehouse },
  { agent: 'd2c-ops', kind: 'number', text: 'What is the transfer lead time in days from the Mumbai warehouse?',
    truth: db => one(db.t('warehouses', ['warehouse', 'transfer_lead_time_days']), r => r.warehouse === 'Mumbai', 'Mumbai').transfer_lead_time_days },
  { agent: 'd2c-ops', kind: 'number', v2: true, text: 'In the latest inventory snapshot, how many units of SKU01 are on hand in Delhi?',
    truth: db => { const rows = db.t('inventory_snapshot', ['date', 'warehouse', 'sku', 'on_hand']);
      const last = rows.map(r => r.date).sort().at(-1);
      return sum(rows.filter(r => r.date === last && r.sku === 'SKU01' && r.warehouse === 'Delhi'), 'on_hand'); } },
  { agent: 'd2c-ops', kind: 'style', text: 'Quick update: how does Delhi stock look for the sale?', truth: () => null },

  // ---------------- d2c-ads ----------------
  { agent: 'd2c-ads', kind: 'oneof', text: 'Which Meta campaign in meta_campaigns.csv has the highest ROAS?',
    truth: db => argmax(db.t('meta_campaigns', ['campaign', 'roas']), r => r.campaign, r => r.roas) },
  { agent: 'd2c-ads', kind: 'number', text: 'What is the total spend across all campaigns in meta_campaigns.csv?',
    truth: db => sum(db.t('meta_campaigns', ['spend']), 'spend') },
  { agent: 'd2c-ads', kind: 'number', text: 'What is the ads budget guidance in budget.json?',
    truth: db => db.json('budget.json').guidance.ads },
  { agent: 'd2c-ads', kind: 'oneof', v2: true, text: 'Which Meta campaign had the highest ROAS (revenue / spend) in October 2026?',
    truth: db => best(db.t('meta_ads_daily', ['date', 'campaign', 'spend', 'revenue']).filter(inMonth(OCT)), 'campaign') },
  { agent: 'd2c-ads', kind: 'number', v2: true, text: 'How much did we spend on Meta ads in October 2026 in total?',
    truth: db => sum(db.t('meta_ads_daily', ['date', 'spend']).filter(inMonth(OCT)), 'spend') },
  { agent: 'd2c-ads', kind: 'style', text: 'Give me a quick update on our Meta ads.', truth: () => null },

  // ---------------- d2c-influencers ----------------
  { agent: 'd2c-influencers', kind: 'oneof', text: 'Which influencer in influencers.csv has the highest engagement %?',
    truth: db => argmax(db.t('influencers', ['name', 'engagement_pct']), r => r.name, r => r.engagement_pct) },
  { agent: 'd2c-influencers', kind: 'number', text: 'What is the fee for The Derm Diaries?',
    truth: db => one(db.t('influencers', ['name', 'fee']), r => r.name === 'The Derm Diaries', 'Derm Diaries').fee },
  { agent: 'd2c-influencers', kind: 'number', text: 'How many influencers in influencers.csv are on YouTube?',
    truth: db => db.t('influencers', ['platform']).filter(r => r.platform === 'YouTube').length },
  { agent: 'd2c-influencers', kind: 'number', text: 'What is the influencer budget guidance in budget.json?',
    truth: db => db.json('budget.json').guidance.influencers },
  { agent: 'd2c-influencers', kind: 'oneof', v2: true, text: 'Which creator in creators.csv has the highest engagement %?',
    truth: db => argmax(db.t('creators', ['handle', 'engagement_pct']), r => r.handle, r => r.engagement_pct) },

  // ---------------- d2c-analyst ----------------
  { agent: 'd2c-analyst', kind: 'number', text: 'What is the MRP of SKU01?',
    truth: db => prod(db, 'SKU01').mrp },
  { agent: 'd2c-analyst', kind: 'number', text: 'What sale uplift (x) did the Glow Kit get in Summer Sale 2026?',
    truth: db => one(db.t('past_sales', ['sku', 'sale_uplift_x']), r => r.sku === 'SKU05', 'SKU05').sale_uplift_x },
  { agent: 'd2c-analyst', kind: 'number', text: 'What share of orders (%) comes from the North region, per regions.csv?',
    truth: db => one(db.t('regions', ['region', 'share_of_orders']), r => r.region === 'North', 'North').share_of_orders * 100 },
  { agent: 'd2c-analyst', kind: 'number', text: 'What is the per-unit gross margin in rupees (MRP minus COGS) of Vitamin C Serum?',
    truth: db => { const p = prod(db, 'SKU01'); return p.mrp - p.cogs; } },
  { agent: 'd2c-analyst', kind: 'number', v2: true, tolerance: 0.02, text: 'What was total net revenue in September 2026 (monthly P&L)?',
    truth: db => pnl(db, SEP, 'net_revenue') },
  { agent: 'd2c-analyst', kind: 'style', text: 'Summarise how the five SKUs compare on price.', truth: () => null },

  // ---------------- d2c-design ----------------
  { agent: 'd2c-design', kind: 'number', text: 'What discount % should the sale banner show (budget.json)?',
    truth: db => db.json('budget.json').sale.discount_pct },
  { agent: 'd2c-design', kind: 'text', text: 'What is the product name of SKU04?',
    truth: db => prod(db, 'SKU04').name },
  { agent: 'd2c-design', kind: 'number', text: 'What is the MRP of the Glow Kit (bundle)?',
    truth: db => prod(db, 'SKU05').mrp },
  { agent: 'd2c-design', kind: 'number', text: 'At the sale discount in budget.json, what is the sale price of Vitamin C Serum, rounded to whole rupees?',
    truth: db => Math.round(prod(db, 'SKU01').mrp * (1 - db.json('budget.json').sale.discount_pct / 100)) },
  { agent: 'd2c-design', kind: 'number', text: 'How many days does the sale run (budget.json)?',
    truth: db => db.json('budget.json').sale.days },

  // ---------------- d2c-captain ----------------
  { agent: 'd2c-captain', kind: 'number', text: 'What is our total marketing budget for the sale?',
    truth: db => db.json('budget.json').total_marketing_budget },
  { agent: 'd2c-captain', kind: 'number', text: 'What are the fixed costs for the sale period (budget.json)?',
    truth: db => db.json('budget.json').fixed_costs_sale_period },
  { agent: 'd2c-captain', kind: 'number', text: 'How many SKUs do we sell?',
    truth: db => db.t('products', ['sku']).length },
  { agent: 'd2c-captain', kind: 'number', v2: true, tolerance: 0.02, text: 'What was total net revenue in October 2026 (monthly P&L)?',
    truth: db => pnl(db, OCT, 'net_revenue') },
  { agent: 'd2c-captain', kind: 'number', v2: true, text: 'How many orders did we get in October 2026 (all statuses)?',
    truth: db => db.t('orders', ['date']).filter(inMonth(OCT)).length },
  { agent: 'd2c-captain', kind: 'style', text: 'Give me a one-glance status of the team.', truth: () => null },

  // ---------------- d2c-forecaster ----------------
  { agent: 'd2c-forecaster', kind: 'number', v2: true, text: 'How many units of SKU01 were ordered in October 2026 (all statuses)?',
    truth: db => sum(db.t('orders', ['date', 'sku', 'qty']).filter(r => inMonth(OCT)(r) && r.sku === 'SKU01'), 'qty') },
  { agent: 'd2c-forecaster', kind: 'oneof', v2: true, text: 'Which SKU sold the most units in September 2026 (all statuses)?',
    truth: db => argmax(db.t('orders', ['date', 'sku', 'qty']).filter(inMonth(SEP)), r => r.sku, r => r.qty).flatMap(s => [s, prod(db, s).name]) },
  { agent: 'd2c-forecaster', kind: 'number', v2: true, text: 'How many orders were placed on 2026-10-15?',
    truth: db => db.t('orders', ['date']).filter(r => r.date === '2026-10-15').length },
  { agent: 'd2c-forecaster', kind: 'oneof', v2: true, text: 'Which city had the most orders in October 2026?',
    truth: db => argmax(db.t('orders', ['date', 'city']).filter(inMonth(OCT)), r => r.city, () => 1) },
  { agent: 'd2c-forecaster', kind: 'number', v2: true, tolerance: 0.02, text: 'What was the average daily units ordered for SKU02 across Aug–Oct 2026 (92 days, all statuses)?',
    truth: db => sum(db.t('orders', ['sku', 'qty']).filter(r => r.sku === 'SKU02'), 'qty') / 92 },

  // ---------------- d2c-insights ----------------
  { agent: 'd2c-insights', kind: 'number', v2: true, text: 'How many customers are in customers.csv?',
    truth: db => db.t('customers', ['customer_id']).length },
  { agent: 'd2c-insights', kind: 'number', v2: true, tolerance: 0.02, text: 'What % of customers have placed 2 or more orders (repeat rate)?',
    truth: db => { const c = db.t('customers', ['orders']); return 100 * c.filter(r => r.orders >= 2).length / c.length; } },
  { agent: 'd2c-insights', kind: 'number', v2: true, text: 'How many returns were logged in October 2026?',
    truth: db => db.t('returns', ['date']).filter(inMonth(OCT)).length },
  { agent: 'd2c-insights', kind: 'oneof', v2: true, text: 'What is the most common return reason?',
    truth: db => argmax(db.t('returns', ['reason']), r => r.reason, () => 1) },
  { agent: 'd2c-insights', kind: 'oneof', v2: true, text: 'Which channel has the highest RTO rate (rto orders / all orders)?',
    truth: db => { const o = db.t('orders', ['channel', 'status']); const ch = [...new Set(o.map(r => r.channel))];
      const rate = c => { const x = o.filter(r => r.channel === c); return x.filter(r => r.status === 'rto').length / x.length; };
      const top = Math.max(...ch.map(rate)); return ch.filter(c => rate(c) === top); } },

  // ---------------- d2c-marketplaces ----------------
  { agent: 'd2c-marketplaces', kind: 'number', v2: true, text: "What is Amazon's commission %?",
    truth: db => fee(db, 'Amazon', 'commission_pct') },
  { agent: 'd2c-marketplaces', kind: 'number', v2: true, text: 'How many days does Flipkart take to settle payments?',
    truth: db => fee(db, 'Flipkart', 'settlement_days') },
  { agent: 'd2c-marketplaces', kind: 'number', v2: true, text: "What is Nykaa's commission %?",
    truth: db => fee(db, 'Nykaa', 'commission_pct') },
  { agent: 'd2c-marketplaces', kind: 'number', v2: true, text: 'How much did we spend on Amazon marketplace ads in October 2026?',
    truth: db => sum(db.t('marketplace_ads_daily', ['date', 'platform', 'spend']).filter(r => inMonth(OCT)(r) && r.platform === 'Amazon'), 'spend') },
  { agent: 'd2c-marketplaces', kind: 'oneof', v2: true, text: 'Which marketplace platform had the best ads ROAS (revenue / spend) over Aug–Oct 2026?',
    truth: db => best(db.t('marketplace_ads_daily', ['platform', 'spend', 'revenue']), 'platform') },

  // ---------------- d2c-google ----------------
  { agent: 'd2c-google', kind: 'number', v2: true, text: 'How much did we spend on Google Ads in October 2026?',
    truth: db => sum(db.t('google_ads_daily', ['date', 'spend']).filter(inMonth(OCT)), 'spend') },
  { agent: 'd2c-google', kind: 'oneof', v2: true, text: 'Which Google Ads campaign had the most conversions in October 2026?',
    truth: db => argmax(db.t('google_ads_daily', ['date', 'campaign', 'conversions']).filter(inMonth(OCT)), r => r.campaign, r => r.conversions) },
  { agent: 'd2c-google', kind: 'number', v2: true, tolerance: 0.02, text: 'What was the ROAS (revenue / spend) of Shopping-type Google campaigns over Aug–Oct 2026?',
    truth: db => roas(db.t('google_ads_daily', ['type', 'spend', 'revenue']).filter(r => /shopping/i.test(r.type))) },
  { agent: 'd2c-google', kind: 'number', v2: true, text: 'How many Google Ads clicks did we get in September 2026?',
    truth: db => sum(db.t('google_ads_daily', ['date', 'clicks']).filter(inMonth(SEP)), 'clicks') },
  { agent: 'd2c-google', kind: 'number', v2: true, text: 'How many distinct Google Ads campaigns are there?',
    truth: db => new Set(db.t('google_ads_daily', ['campaign']).map(r => r.campaign)).size },

  // ---------------- d2c-ugc ----------------
  { agent: 'd2c-ugc', kind: 'number', v2: true, text: 'How many creator posts are logged in creator_posts.csv?',
    truth: db => db.t('creator_posts', ['post_id']).length },
  { agent: 'd2c-ugc', kind: 'number', v2: true, text: 'How many orders came through creator coupon codes in total?',
    truth: db => sum(db.t('creator_posts', ['orders']), 'orders') },
  { agent: 'd2c-ugc', kind: 'oneof', v2: true, text: 'Which creator handle drove the most revenue from posts?',
    truth: db => argmax(db.t('creator_posts', ['handle', 'revenue']), r => r.handle, r => r.revenue) },
  { agent: 'd2c-ugc', kind: 'number', v2: true, text: 'How much have we paid creators in total (fee_paid across all posts)?',
    truth: db => sum(db.t('creator_posts', ['fee_paid']), 'fee_paid') },
  { agent: 'd2c-ugc', kind: 'number', v2: true, text: 'How many views did all creator posts get in October 2026?',
    truth: db => sum(db.t('creator_posts', ['date', 'views']).filter(inMonth(OCT)), 'views') },

  // ---------------- d2c-procurement ----------------
  { agent: 'd2c-procurement', kind: 'number', v2: true, text: 'How many suppliers do we have?',
    truth: db => db.t('suppliers', ['supplier_id']).length },
  { agent: 'd2c-procurement', kind: 'number', v2: true, text: db => `What is the MOQ for raw material ${firstRow(db, 'raw_materials', ['material_id', 'name']).name}?`,
    truth: db => firstRow(db, 'raw_materials', ['moq']).moq },
  { agent: 'd2c-procurement', kind: 'number', v2: true, text: db => `What is the lead time in days for raw material ${firstRow(db, 'raw_materials', ['name']).name}?`,
    truth: db => firstRow(db, 'raw_materials', ['lead_time_days']).lead_time_days },
  { agent: 'd2c-procurement', kind: 'number', v2: true, text: 'What is the total value of purchase orders placed in October 2026?',
    truth: db => sum(db.t('purchase_orders', ['date', 'total']).filter(inMonth(OCT)), 'total') },
  { agent: 'd2c-procurement', kind: 'oneof', v2: true, text: 'Which supplier has the highest rating?',
    truth: db => argmax(db.t('suppliers', ['name', 'rating']), r => r.name, r => r.rating) },

  // ---------------- d2c-logistics ----------------
  { agent: 'd2c-logistics', kind: 'number', v2: true, text: 'How many distinct couriers do we use?',
    truth: db => new Set(db.t('couriers', ['courier']).map(r => r.courier)).size },
  { agent: 'd2c-logistics', kind: 'oneof', v2: true, text: db => `Which courier is cheapest per order in the "${firstRow(db, 'couriers', ['zone']).zone}" zone?`,
    truth: db => { const z = firstRow(db, 'couriers', ['zone']).zone;
      return argmax(db.t('couriers', ['zone', 'courier', 'cost_per_order']).filter(r => r.zone === z), r => r.courier, r => -r.cost_per_order); } },
  { agent: 'd2c-logistics', kind: 'number', v2: true, text: db => { const r = firstRow(db, 'couriers', ['courier', 'zone']); return `What is the RTO % for ${r.courier} in the "${r.zone}" zone?`; },
    truth: db => firstRow(db, 'couriers', ['rto_pct']).rto_pct },
  { agent: 'd2c-logistics', kind: 'number', v2: true, text: 'How many orders in October 2026 ended as RTO?',
    truth: db => db.t('orders', ['date', 'status']).filter(r => inMonth(OCT)(r) && r.status === 'rto').length },
  { agent: 'd2c-logistics', kind: 'number', v2: true, text: 'How many orders in October 2026 were cash on delivery?',
    truth: db => db.t('orders', ['date', 'payment']).filter(r => inMonth(OCT)(r) && r.payment === 'cod').length },

  // ---------------- d2c-copywriter ----------------
  { agent: 'd2c-copywriter', kind: 'text', text: 'What is the product name of SKU03?',
    truth: db => prod(db, 'SKU03').name },
  { agent: 'd2c-copywriter', kind: 'number', text: 'What is the MRP of Sunscreen SPF 50?',
    truth: db => prod(db, 'SKU02').mrp },
  { agent: 'd2c-copywriter', kind: 'number', text: 'What discount % is the upcoming sale (budget.json)?',
    truth: db => db.json('budget.json').sale.discount_pct },
  { agent: 'd2c-copywriter', kind: 'number', text: 'At the sale discount in budget.json, what is the sale price of the Kesar Face Oil, rounded to whole rupees?',
    truth: db => Math.round(prod(db, 'SKU04').mrp * (1 - db.json('budget.json').sale.discount_pct / 100)) },
  { agent: 'd2c-copywriter', kind: 'style', text: 'Write the WhatsApp teaser line for the sale and tell me why it works.', truth: () => null },

  // ---------------- d2c-finance ----------------
  { agent: 'd2c-finance', kind: 'number', v2: true, tolerance: 0.02, text: 'What was total net revenue in September 2026 (monthly P&L)?',
    truth: db => pnl(db, SEP, 'net_revenue') },
  { agent: 'd2c-finance', kind: 'number', v2: true, tolerance: 0.02, text: 'What was EBITDA in October 2026 (monthly P&L)?',
    truth: db => pnl(db, OCT, 'ebitda') },
  { agent: 'd2c-finance', kind: 'number', v2: true, tolerance: 0.02, text: 'What was marketing spend as a % of net revenue in October 2026 (monthly P&L)?',
    truth: db => 100 * pnl(db, OCT, 'marketing') / pnl(db, OCT, 'net_revenue') },
  { agent: 'd2c-finance', kind: 'number', v2: true, text: 'What was total opex in October 2026 (opex.csv)?',
    truth: db => sum(db.t('opex', ['month', 'amount']).filter(r => r.month === OCT), 'amount') },
  { agent: 'd2c-finance', kind: 'number', v2: true, tolerance: 0.02, text: 'What were total COGS in August 2026 (monthly P&L)?',
    truth: db => pnl(db, '2026-08', 'cogs') },

  // ---------------- d2c-payroll ----------------
  { agent: 'd2c-payroll', kind: 'number', v2: true, text: 'How many employees are in Ops?',
    truth: db => { const e = db.t('employees', ['dept']); const n = e.filter(r => /^op(s|erations)\b/i.test(r.dept)).length;
      if (!n) throw new Error('no Ops dept in employees.csv'); return n; } },
  { agent: 'd2c-payroll', kind: 'number', v2: true, text: "What's the PF employer contribution for October 2026, in total?",
    truth: db => sum(db.t('employees', ['pf_employer_monthly']), 'pf_employer_monthly') },
  { agent: 'd2c-payroll', kind: 'number', v2: true, text: 'What was total net pay for October 2026?',
    truth: db => sum(db.t('payroll_2026_10', ['net_pay']), 'net_pay') },
  { agent: 'd2c-payroll', kind: 'number', v2: true, text: 'How many employees do we have?',
    truth: db => db.t('employees', ['emp_id']).length },
  { agent: 'd2c-payroll', kind: 'number', v2: true, text: 'What was total TDS deducted in October 2026 payroll?',
    truth: db => sum(db.t('payroll_2026_10', ['tds']), 'tds') },
];
