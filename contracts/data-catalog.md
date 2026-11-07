# Data catalog (v2)

Sample data for **Kesar & Co.**, an Indian skincare D2C brand selling on its website, 9 marketplaces, 5 quick-commerce
apps, 2 offline chains and Amazon Global. Everything lives flat in `data/`.
Agents (`switch/agents/*.md`), the toolkit (`kit/`) and the evals (`evals/`) build against
these **file names and columns**. New columns are added only at the end of a file; none is ever renamed or removed.

Rules:
- Deterministic: `node data/gen/generate.mjs` (seeded, no deps) rewrites every generated file byte-for-byte.
- The 8 v1 files below are **frozen** (the product tour and `switch/check_numbers.py` depend on them).
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
| `cities.csv` | city, state, region, tier, pincode, gst_state_code, is_metro, home_warehouse, zone_from_mumbai, zone_from_delhi, zone_from_bangalore, quick_commerce, offline_stores |
| `festive_calendar.csv` | event, start_date, end_date, type, focus_states, platforms, status, observed_uplift_x, expected_uplift_x, note |
| `gst_monthly.csv` | month, gstin, state, hsn, taxable_value, cgst, sgst, igst, output_gst, itc_on_fees, itc_on_marketing, itc_on_purchases, itc_on_opex, itc_total, itc_opening, itc_closing, tcs_credit, cash_payable, gstr1_due, gstr3b_due |
| `settlements.csv` | settlement_id, channel, payer, cycle_start, cycle_end, settlement_date, orders, gross_sales, fees, shipping, gst_on_fees, tcs, tds, net_payout, status |
| `qc_inventory.csv` | date, platform, city, sku, dark_stores, in_stock_stores, on_hand, units_sold_week, days_of_cover, availability_pct |
| `reviews.csv` | month, platform, sku, ratings, avg_rating, five_star, four_star, three_star, two_star, one_star, reviews_with_text, top_praise, top_complaint |
| `support_tickets.csv` | ticket_id, date, channel, order_id, sales_channel, category, language, first_response_mins, resolution_hours, status, csat, handled_by |
| `whatsapp_campaigns.csv` | campaign_id, date, bsp, flow, category, audience, language, sent, delivered, read, clicked, orders, revenue, cost |
| `cohort_retention.csv` | cohort_month, acquisition_channel, customers, m1_retained, m1_pct, m2_retained, m2_pct, repeat_customers, orders, revenue, revenue_per_customer |
| `vendors.csv` | vendor_id, name, type, category, city, state, gstin, msme_category, payment_terms_days, tds_section, tds_rate_pct |
| `compliance_calendar.csv` | due_date, filing, authority, period, gstin_state, amount, status, filed_on, late_fee, note |
| `finance_policy.json` | rules Finance enforces: max marketing % of net revenue, min EBITDA, max CAC, cash floor |
| `README.md` | data dictionary: every file, every column, how they tie together, and the "story" numbers |

`channel` values everywhere (18): `Website`, `Amazon`, `Flipkart`, `Nykaa`, `Myntra`, `Purplle`, `Meesho`, `Tata CLiQ`, `JioMart`,
`AJIO`, `Blinkit`, `Zepto`, `Instamart`, `BB Now`, `Flipkart Minutes`, `Health & Glow`, `Apollo Pharmacy`, `Amazon Global`.
`channel_fees.channel_group`: `D2C`, `Marketplace`, `Beauty marketplace`, `Quick commerce`, `Offline retail`, `Export`.
Columns added at the end since v2.0 (backward compatible): orders `state, pincode, payment_method, gst, tax_type`; channel_fees
`channel_group, tcs_pct, tds_pct, gst_on_fees_pct`; customers `state, pincode`; meta_ads_daily and creator_posts `language`;
marketplace_ads_daily `ad_type`; employees `esi_employer_monthly`; payroll_2026_10 `esi_employee, esi_employer`.
`status` in orders: `delivered`, `rto`, `returned`, `cancelled`. `payment`: `prepaid`, `cod`.
Ties that must hold: `pnl_monthly` is computed from orders, fees, ads, creator fees, payroll and opex; every
`orders.sku` is in `products.csv`; every `returns.order_id` is in `orders.csv`; every BOM material exists; `gst_monthly` ties to
`orders.gst`; `settlements` settle every delivered rupee once; `compliance_calendar` amounts come from GST and payroll.
