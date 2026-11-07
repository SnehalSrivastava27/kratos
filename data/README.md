# Sample brand data: Kesar & Co.

Everything here is **made-up but realistic** sample data for Kesar & Co., an Indian skincare D2C brand (₹3-4 Cr a year run rate,
5 SKUs, 3 warehouses, 7 sales channels, 25 people). History window **2026-08-01 to 2026-10-31**. Money is INR rupees (integers
unless the column says otherwise). Contract: `contracts/data-catalog.md`. Background on how Indian D2C works: `docs/d2c-primer.md`.

- Frozen v1 files (do not edit): products, past_sales, regions, warehouses, channels, meta_campaigns, influencers, budget.json.
- Generated v2 files: rebuild with `npm run data` (seeded, byte-for-byte deterministic). Verify with `npm run data:check`.
- Never edit a generated file by hand; change `data/gen/generate.mjs` and regenerate.

## Story numbers (computed by the generator, exact)

- **Net revenue** Aug ₹34,26,999, Sep ₹34,76,814, Oct ₹41,88,747 (quarter ₹1,10,92,560; annualised ≈ ₹4.44 Cr).
- **EBITDA** Aug ₹-1,30,060 (-3.8%), Sep ₹-2,48,899 (-7.2%), Oct ₹-2,29,795 (-5.5%). Marketing was 22.4% of net revenue in October.
- **Orders** 2026-08 3,401, 2026-09 3,454, 2026-10 4,329; units 4,969 / 5,090 / 6,370.
- **Peak day** 2026-10-21 (Dussehra week) with ₹2,66,479 net booked revenue vs a 92-day daily average of ₹1,32,924.
- **Top SKU by delivered revenue (quarter)**: SKU02 Sunscreen SPF 50 ₹34,29,699; then SKU01 ₹29,26,823, SKU03 ₹17,72,655, SKU05 ₹16,89,645, SKU04 ₹12,73,738.
- **October delivered revenue by channel**: Website ₹20,82,389, Amazon ₹7,19,418, Flipkart ₹2,88,167, Nykaa ₹6,04,769, Myntra ₹1,08,128, Blinkit ₹2,16,773, Zepto ₹1,69,103.
- **RTO % (orders shipped, by order date)**: Amazon Sep 5.6%, Website Sep 9.3%, Flipkart Sep 8.4%, Website Oct 9.9%.
- **Website COD**: 38% of shipped website orders are COD; COD RTO 23.2% vs prepaid 1.3%.
- **Website COD RTO by city tier**: tier 1 18.3%, tier 2 27.2%, tier 3 36.7%.
- **Courier RTO (website, all zones)**: worst Shadowfax 11.4%, best Blue Dart 6.7%.
- **Returns**: 287 customer returns, refunds ₹2,35,660; top reason "Damaged or leaking on arrival" (68), then "Did not suit skin type" (47).
- **Best creator post ROAS**: Desi Skin Desk (@desiskindesk) P027 on 2026-10-19: 184 orders, ₹1,97,164 on ₹30,000 fee = 6.57x (coupon DESISK15B).
- **Worst creator post ROAS (fee >= ₹25,000)**: Riya Glows (@riyaglows) P020 on 2026-10-08: 83 orders, ₹89,684 on ₹1,20,000 = 0.75x; fake followers 24.5%.
- **Creator fees**: Aug ₹1,22,000, Sep ₹2,31,000, Oct ₹2,75,500; 33 posts, 6 barter (product only).
- **Meta, last 30 days (2026-10-02..10-31)**: spend ₹4,50,000, revenue ₹14,02,000; Retargeting - cart abandoners 4.8x, Advantage+ Shopping 3.4x, Lookalike 1% buyers 2.9x, Broad prospecting 1.6x.
- **Meta creative types (last 30 days ROAS)**: ugc_video 4.02x, carousel 3.83x, catalogue 3.74x, reel 2.25x, static 2.16x.
- **Google October**: spend ₹93,058; Brand - Kesar & Co 7.28x, Generic - vitamin c serum 1.91x, Shopping - sunscreen 2.77x, PMax - all products 2.92x, YouTube - the kesar story 0.52x.
- **Marketplace ads October**: Amazon ₹51,331 spend, 3.72x ROAS; Flipkart ₹11,469 spend, 3.06x ROAS; Nykaa ₹19,991 spend, 3.66x ROAS; Blinkit ₹14,725 spend, 2.81x ROAS; Zepto ₹9,377 spend, 2.45x ROAS.
- **Fees + shipping as % of delivered revenue**: Nykaa 33.1%, Myntra 31.7%, Zepto 26.5%, Blinkit 24.4%, Flipkart 18%, Amazon 15%, Website 5.8%.
- **Customers**: 9,286 unique; 21.2% ordered 2+ times in the quarter; website repeat 27.4%. October blended CAC ₹280 (marketing / new customers).
- **October payroll**: 25 people paid, gross ₹12,14,909, net pay ₹11,62,815, employee PF ₹43,466, TDS ₹4,628, PT ₹4,000; employer cost (gross + employer PF) ₹12,58,375 = P&L salaries. Headcount 25; 0 joining after Oct.
- **Highest TDS**: Ishaan Verma ₹4,628/month. Founders draw ₹9.6 L CTC each, so under the new regime their TDS is ₹0 (87A rebate to ₹12 L taxable).
- **Procurement**: 94 POs worth ₹80,20,784; 2 delayed now, 18 arrived late. Saffron (RM07) price moved from ₹257.75/g to ₹291.45/g; latest saffron PO PO-26077 expected 2026-11-04 (delayed).
- **Stock cover on 2026-10-31 (days, at last-4-weeks rate)**: lowest Delhi SKU01 250 units = 13.3 days; Delhi SKU05 80 units = 14.6 days; Bangalore SKU02 900 units = 38 days.

## How the files tie together

- `orders.csv` has **one row per order line** (order_id repeats for multi-SKU orders). `status` is per line: an order is
  cancelled or RTO as a whole; a customer return marks one line `returned`. Order-level shipping sits on the order's **first line**.
- `orders.channel_fee` = commission_pct x net_revenue + fixed_fee + payment_gateway_pct x net_revenue (prepaid only) for delivered
  lines; RTO/returned lines keep only fixed_fee + gateway fee; cancelled = 0 (rates from `channel_fees.csv`).
- `orders.shipping_cost` (first line only): Website = courier rate for the zone (`couriers.csv`) + COD fee if COD and not RTO,
  plus the same rate again if the order was RTO or had a return. Marketplaces = `channel_fees.shipping_fee`, doubled on RTO/return.
- `returns.csv` has one row per returned line; `refund` = that line's net_revenue.
- `pnl_monthly.csv` (by order month): gross_revenue = sum of gross on non-cancelled lines; discounts = gross - net; returns = net of
  RTO + returned lines; net_revenue = gross - discounts - returns; cogs = products.cogs x qty for delivered lines + returned lines that
  are not restockable; channel_fees and shipping = sums of the order columns; marketing = Meta + Google + marketplace ads spend (by
  date) + creator fee_paid (by post date); salaries = basic + HRA + special + employer PF for employees whose join_date is on or before
  the 1st of the month (variable pay is paid annually in April, not accrued); opex = opex.csv. ebitda = net_revenue - everything else.
- `creator_posts.orders/revenue` = non-cancelled website orders that used that post's `coupon_code` (net revenue, booked).
  Coupon codes are unique per post and attribution runs 7 days from the post date.
- `meta_ads_daily.csv` summed over 2026-10-02..2026-10-31 by campaign equals `meta_campaigns.csv` spend and revenue exactly.
  Meta revenue is Meta-attributed (7-day click, 1-day view) and overlaps with website, Google and creator revenue - do not add them up.
- `inventory_snapshot.csv` is weekly (Saturdays). on_hand(prev week) = on_hand + shipped_week - received_week. The 2026-10-31 rows equal
  the stock columns in `products.csv` exactly. in_transit = finished goods that land in the following week.
- `bom.csv`: sum of qty_per_unit x the material's base cost equals products.cogs (the JW0x line is the contract manufacturer's
  conversion charge). raw_materials.unit_cost is the standard cost; last_po_cost is the latest PO price (saffron and vitamin C have crept up).
- `payroll_2026_10.csv`: gross = basic + HRA + special; pf_employee = 12% of min(basic, 15000); professional tax: Maharashtra ₹200
  (women earning up to ₹25,000 exempt), Karnataka ₹200 if gross >= ₹25,000, Delhi none; TDS = new regime (₹75,000 standard deduction,
  slabs 0/5/10/15/20/25/30 at 4/8/12/16/20/24 L, 87A rebate to ₹12 L taxable with marginal relief, 4% cess) on gross x 12, divided by 12.
  net_pay = gross - pf_employee - professional_tax - tds.
- `customers.csv`: customer_id is per channel (marketplaces do not share buyer identity, so the same person on Amazon and the website is two
  ids). orders = all orders incl. cancelled; total_spend = net revenue of delivered lines.

## Data dictionary

- **orders.csv**: Order lines. coupon = creator coupon (website only); courier; zone A local, B regional, C metro-metro, D rest of India, E Kerala/J&K; delivery_days for delivered/returned lines; shipping_cost; channel_fee.
- **channel_fees.csv**: Fee card per sales channel: commission %, fixed fee per line, shipping fee per order (marketplaces), payment gateway % (website prepaid), settlement days, notes.
- **customers.csv**: One row per customer id: first order date, city, region, acquisition channel, orders, total_spend, last_order_date, city_tier (1 metro/tier-1, 2, 3), acquired_by (creator coupon of first order, if any).
- **returns.csv**: Customer returns after delivery: return date, reason, refund, restockable (yes/no), qty. RTO is not here; it is orders.status = rto.
- **meta_ads_daily.csv**: Meta (Facebook/Instagram) ads per day per ad: spend, impressions, clicks, add_to_cart, purchases, revenue (Meta-attributed).
- **google_ads_daily.csv**: Google Ads per day per campaign. type: search, shopping, performance_max, video (YouTube).
- **marketplace_ads_daily.csv**: Amazon Sponsored Products/Brands, Flipkart PLA, Nykaa, Blinkit and Zepto ads per day per campaign (platform-attributed).
- **creators.csv**: Creator roster (8 from influencers.csv + 30 more). fee_reel/fee_story in ₹ per deliverable, fake_follower_pct from audit, tier nano/micro/mid/macro/mega, past_brand_roas only for v1 creators.
- **creator_posts.csv**: Every creator post Aug-Oct: views, likes, comments, link clicks, coupon_code, attributed orders/revenue, fee_paid (0 = barter), roas = revenue / fee_paid.
- **suppliers.csv**: Suppliers: contract manufacturer, chemicals, botanicals, saffron, packaging. payment_terms_days (0 = advance), rating out of 5.
- **raw_materials.csv**: Materials with unit, standard unit_cost, last_po_cost, supplier, MOQ, lead time, stock on hand (2026-10-31), monthly_usage at average demand.
- **bom.csv**: Bill of materials: qty of each material per finished unit.
- **purchase_orders.csv**: POs Aug-early Nov. status: received, received_late, in_transit, delayed (past expected date, not received), open. payment_due = received (or expected) + supplier terms.
- **inventory_snapshot.csv**: Weekly finished-goods stock per warehouse and SKU with shipped_week and received_week.
- **couriers.csv**: Rate card per courier and zone for website orders (via Shiprocket) plus observed rto_pct, avg_delivery_days, orders and cod_share_pct over the quarter.
- **employees.csv**: 25 people. ctc_annual includes variable pay; monthly fixed = basic + HRA + special + employer PF. gender is used only for Maharashtra professional tax.
- **payroll_2026_10.csv**: October 2026 payroll for everyone who had joined by 2026-10-01.
- **opex.csv**: Monthly operating expenses by category and vendor (rent, 3PL warehousing, software, creative, professional fees, etc.).
- **pnl_monthly.csv**: Monthly P&L computed from the files above, plus orders, units, new_customers, the marketing split, ebitda_pct and marketing_pct.
- **finance_policy.json**: Rules Finance enforces: marketing % cap, EBITDA floors, max CAC, cash floor and approval limits.
