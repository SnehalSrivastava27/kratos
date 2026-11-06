# Data catalog (v2)

Demo data for **Kesar & Co.**, an Indian skincare D2C brand. Everything lives flat in `data/`.
Owner: task R1. Agents (`switch/agents/*.md`), the toolkit (`kit/`) and the evals (`evals/`) build against
these **file names and columns**. R1 may add columns at the end of a file; it never renames or removes one.

Rules:
- Deterministic: `node data/gen/generate.mjs` (seeded, no deps) rewrites every generated file byte-for-byte.
- The 8 v1 files below are **frozen** (the demo story and `switch/check_numbers.py` depend on them).
- History window: **2026-08-01 to 2026-10-31** (92 days). Money is INR, integers (rupees) unless named `_pct`.
- Dates `YYYY-MM-DD`. Months `YYYY-MM`. IDs are stable strings.
- 5 SKUs only (from `products.csv`): SKU01 Vitamin C Serum, SKU02 Sunscreen SPF 50, SKU03, SKU04, SKU05.

## v1 (frozen)
`products.csv`, `past_sales.csv`, `regions.csv`, `warehouses.csv`, `channels.csv`, `meta_campaigns.csv`,
`influencers.csv`, `budget.json`.

## v2 (generated)

| File | Columns (minimum) |
|---|---|
| `orders.csv` | order_id, date, channel, region, city, warehouse, sku, qty, mrp, discount_pct, gross_revenue, net_revenue, payment, status, customer_id |
| `channel_fees.csv` | channel, type, commission_pct, fixed_fee, shipping_fee, payment_gateway_pct, settlement_days |
| `customers.csv` | customer_id, first_order_date, city, region, acquisition_channel, orders, total_spend |
| `returns.csv` | order_id, date, sku, channel, reason, refund, restockable |
| `meta_ads_daily.csv` | date, campaign, adset, ad, creative_type, spend, impressions, clicks, add_to_cart, purchases, revenue |
| `google_ads_daily.csv` | date, campaign, type, spend, impressions, clicks, conversions, revenue |
| `marketplace_ads_daily.csv` | date, platform, campaign, spend, clicks, orders, revenue |
| `creators.csv` | handle, platform, followers, engagement_pct, avg_views, fee_reel, fee_story, niche, city, language, fake_follower_pct |
| `creator_posts.csv` | post_id, handle, date, format, views, likes, comments, link_clicks, coupon_code, orders, revenue, fee_paid |
| `suppliers.csv` | supplier_id, name, city, category, payment_terms_days, rating |
| `raw_materials.csv` | material_id, name, unit, unit_cost, supplier_id, moq, lead_time_days, stock |
| `bom.csv` | sku, material_id, qty_per_unit |
| `purchase_orders.csv` | po_id, date, supplier_id, material_id, qty, unit_cost, total, expected_date, received_date, status |
| `inventory_snapshot.csv` | date, warehouse, sku, on_hand, in_transit, reserved |
| `couriers.csv` | courier, zone, cost_per_order, cod_fee, avg_delivery_days, rto_pct |
| `employees.csv` | emp_id, name, dept, role, level, city, join_date, ctc_annual, basic_monthly, hra_monthly, special_monthly, pf_employer_monthly, variable_pct |
| `payroll_2026_10.csv` | emp_id, month, gross, pf_employee, professional_tax, tds, net_pay |
| `opex.csv` | month, category, vendor, amount |
| `pnl_monthly.csv` | month, gross_revenue, discounts, returns, net_revenue, cogs, channel_fees, shipping, marketing, salaries, opex, ebitda |
| `finance_policy.json` | rules Finance enforces: max marketing % of net revenue, min EBITDA, max CAC, cash floor |
| `README.md` | data dictionary: every file, every column, how they tie together, and the "story" numbers |

`channel` values everywhere: `Website`, `Amazon`, `Flipkart`, `Nykaa`, `Myntra`, `Blinkit`, `Zepto`.
`status` in orders: `delivered`, `rto`, `returned`, `cancelled`. `payment`: `prepaid`, `cod`.
Ties that must hold: `pnl_monthly` is computed from orders, fees, ads, creator fees, payroll and opex; every
`orders.sku` is in `products.csv`; every `returns.order_id` is in `orders.csv`; every BOM material exists.
