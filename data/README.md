# Sample brand data: Kesar & Co.

Everything here is **made-up but realistic** sample data for Kesar & Co., an Indian skincare D2C brand (₹4 Cr a year run rate,
5 SKUs, 3 warehouses with a GSTIN each, 18 sales channels, 28 people). History window **2026-08-01 to 2026-10-31**. Money is INR rupees
(integers unless the column says otherwise). Contract: `contracts/data-catalog.md`. Background on how Indian D2C works: `docs/d2c-primer.md`.

- Frozen v1 files (do not edit): products, past_sales, regions, warehouses, channels, meta_campaigns, influencers, budget.json.
- Generated v2 files: rebuild with `npm run data` (seeded, byte-for-byte deterministic). Verify with `npm run data:check`.
- Never edit a generated file by hand; change `data/gen/generate.mjs` and regenerate.

**Sales channels** (`channel_fees.channel_group`): D2C website (Shopify + Razorpay, COD via Shiprocket); marketplaces Amazon, Flipkart,
Myntra, Meesho, JioMart, AJIO; beauty marketplaces Nykaa, Purplle, Tata CLiQ (Palette); quick commerce Blinkit, Zepto, Instamart
(Swiggy), BB Now (BigBasket), Flipkart Minutes; offline modern trade Health & Glow, Apollo Pharmacy; export Amazon Global.

## Story numbers (computed by the generator, exact)

- **Net revenue** Aug ₹34,00,424, Sep ₹32,68,450, Oct ₹42,35,029 (quarter ₹1,09,03,903; annualised ≈ ₹4.36 Cr).
- **EBITDA** Aug ₹-3,10,992 (-9.1%), Sep ₹-5,28,751 (-16.2%), Oct ₹-4,11,749 (-9.7%). Marketing was 23.7% of net revenue in October.
- **Orders** 2026-08 3,482, 2026-09 3,213, 2026-10 4,434; units 5,075 / 4,815 / 6,566.
- **Peak day** 2026-10-21 (Dussehra week) with ₹2,81,461 net booked revenue vs a 92-day daily average of ₹1,31,435.
- **Top SKU by delivered revenue (quarter)**: SKU02 Sunscreen SPF 50 ₹33,77,419; then SKU01 ₹28,60,422, SKU03 ₹18,14,224, SKU05 ₹15,94,597, SKU04 ₹12,57,241.
- **October delivered revenue by channel**: Website ₹21,63,855, Amazon ₹5,25,507, Flipkart ₹2,49,300, Nykaa ₹3,01,382, Myntra ₹72,236, Purplle ₹1,01,711, Meesho ₹61,601, Tata CLiQ ₹37,340, JioMart ₹28,485, AJIO ₹33,551, Blinkit ₹2,13,684, Zepto ₹1,51,673, Instamart ₹91,995, BB Now ₹47,702, Flipkart Minutes ₹22,425, Health & Glow ₹76,990, Apollo Pharmacy ₹44,006, Amazon Global ₹11,586.
- **RTO % (orders shipped, by order date)**: Amazon Sep 4.9%, Website Sep 9.4%, Flipkart Sep 9.4%, Website Oct 10.5%.
- **Website COD**: 37.6% of shipped website orders are COD; COD RTO 23.9% vs prepaid 1.4%.
- **Website COD RTO by city tier**: tier 1 17.3%, tier 2 26.3%, tier 3 34.6%.
- **Courier RTO (website, all zones)**: worst India Post 15.7%, best Blue Dart 6.4%.
- **Returns**: 318 customer returns, refunds ₹2,53,864; top reason "Damaged or leaking on arrival" (76), then "Did not suit skin type" (55).
- **Best creator post ROAS**: Kavya Care (@kavyacare) P010 on 2026-08-22: 185 orders, ₹1,95,934 on ₹18,000 fee = 10.89x (coupon KAVYAC15).
- **Worst creator post ROAS (fee >= ₹25,000)**: Kritika Gupta (@kritika.naturally) P023 on 2026-09-28: 10 orders, ₹10,440 on ₹26,500 = 0.39x; fake followers 12%.
- **Creator fees**: Aug ₹1,56,500, Sep ₹2,79,000, Oct ₹3,00,500; 45 posts, 15 barter (product only).
- **Meta, last 30 days (2026-10-02..10-31)**: spend ₹4,50,000, revenue ₹14,02,000; Retargeting - cart abandoners 4.8x, Advantage+ Shopping 3.4x, Lookalike 1% buyers 2.9x, Broad prospecting 1.6x.
- **Meta creative types (last 30 days ROAS)**: ugc_video 4.02x, carousel 3.83x, catalogue 3.74x, reel 2.27x, static 2.14x.
- **Google October**: spend ₹1,02,298; Brand - Kesar & Co 7.19x, Generic - vitamin c serum 1.93x, Shopping - sunscreen 2.63x, PMax - all products 3.17x, YouTube - the kesar story 0.5x, Search - sunscreen Hindi keywords 2.28x, Demand Gen - festive (Hindi) 1.34x.
- **Marketplace ads October**: Amazon ₹63,362 spend, 3.69x ROAS; Flipkart ₹16,001 spend, 2.79x ROAS; Nykaa ₹19,662 spend, 3.32x ROAS; Myntra ₹3,398 spend, 2.51x ROAS; Purplle ₹2,603 spend, 2.67x ROAS; Meesho ₹3,879 spend, 3.39x ROAS; Blinkit ₹14,220 spend, 2.39x ROAS; Zepto ₹9,808 spend, 2.4x ROAS; Instamart ₹4,654 spend, 2.45x ROAS.
- **Fees + shipping as % of delivered revenue**: Amazon Global 54.8%, AJIO 33.9%, Nykaa 33.3%, Health & Glow 33%, Myntra 31.3%, Apollo Pharmacy 31.1%, Purplle 29.7%, Tata CLiQ 29%, Zepto 26.5%, Instamart 25.3%, Blinkit 24.5%, BB Now 22.5%, Flipkart Minutes 20.8%, JioMart 19.5%, Flipkart 17.8%, Amazon 15.4%, Meesho 7.9%, Website 5.7%.
- **Customers**: 9,589 unique; 17.6% ordered 2+ times in the quarter; website repeat 25.4%. October blended CAC ₹277 (marketing / new customers).
- **October payroll**: 28 people paid, gross ₹12,69,881, net pay ₹12,14,133, employee PF ₹46,706, TDS ₹4,628, PT ₹4,000; employer cost (gross + employer PF + employer ESI) ₹13,18,375 = P&L salaries. Headcount 28; 0 joining after Oct.
- **Highest TDS**: Ishaan Verma ₹4,628/month. Founders draw ₹9.6 L CTC each, so under the new regime their TDS is ₹0 (87A rebate to ₹12 L taxable).
- **Procurement**: 94 POs worth ₹80,20,784; 2 delayed now, 18 arrived late. Saffron (RM07) price moved from ₹257.75/g to ₹291.45/g; latest saffron PO PO-26077 expected 2026-11-04 (delayed).
- **Stock cover on 2026-10-31 (days, at last-4-weeks rate)**: lowest Delhi SKU01 250 units = 10.7 days; Delhi SKU05 80 units = 13 days; Bangalore SKU02 900 units = 36.3 days.

## India and platform story numbers

- **October channel mix (delivered revenue)**: D2C 51.1%, Marketplace 22.9%, Quick commerce 12.5%, Beauty marketplace 10.4%, Offline retail 2.9%, Export 0.3%. Quick commerce = Blinkit, Zepto, Instamart, BB Now, Flipkart Minutes.
- **Quick commerce October**: Blinkit ₹2,13,684, Zepto ₹1,51,673, Instamart ₹91,995, BB Now ₹47,702, Flipkart Minutes ₹22,425.
- **RTO by city tier (all channels)**: tier 1 4.9%, tier 2 9.8%, tier 3 17%. Meesho RTO 23.5% with 70.5% COD.
- **Top states by orders**: Maharashtra 2,108, Uttar Pradesh 1,194, Karnataka 1,119, Delhi 1,086, Tamil Nadu 857; East (Kolkata, Patna, Guwahati...) ships from Delhi.
- **Website prepaid instruments**: UPI 62.1%, Card 15.9%, Simpl 8.2%, LazyPay 5%, Wallet 4.9%, Netbanking 3.8% (Simpl + LazyPay = BNPL).
- **GST October (HSN 3304, 18%)**: output ₹6,44,122, ITC ₹7,68,987, marketplace TCS ₹8,214; cash payable Maharashtra ₹0, Delhi ₹2,19,098, Karnataka ₹1,36,914 (GSTR-3B due 2026-11-20). Maharashtra carries ₹11,85,779 unused ITC: credit cannot move between GSTINs.
- **Receivables on 2026-10-31 (settlements not yet paid)**: ₹15,84,468; biggest Website ₹4,78,275, Nykaa ₹2,04,223, Blinkit ₹1,75,162.
- **Dark-store availability on 2026-10-31 (lowest)**: Zepto Bangalore SKU02 36.4% (4/11 stores); Blinkit Mumbai SKU01 42.9% (6/14 stores); Instamart Hyderabad SKU05 50% (4/8 stores).
- **Ratings (quarter, weighted)**: platforms with 30+ ratings: best Purplle 4.36, worst Meesho 4.03; 1,621 new ratings in all.
- **Support**: 1,381 tickets (56.2% WhatsApp); top "Product question (pre-sale)" 508, "Where is my order (WISMO)" 302; CSAT 3.99/5.
- **WhatsApp**: 62 campaigns/flows, message cost ₹92,577; abandoned-cart flow ₹3,87,208 revenue on ₹8,171 (47.39x).
- **Cohorts**: August website cohort 1,658 customers, 25.9% bought again in September, 18.5% in October.
- **Festive uplift (booked revenue/day vs quarter average, same scope)**: Durga Puja 2.13x, Onam 1.94x, Dussehra week sale 1.71x. Next: Diwali sale 2026-11-01..11-08.
- **ESI**: 3 warehouse associates under ₹21,000 gross; October ESI ₹2,202 (0.75% + 3.25%).
- **Compliance due in November 2026**: 8 payments worth ₹5,27,303; 18 MSME (micro/small) vendors must be paid within 45 days.

## How the files tie together

- `orders.csv` has **one row per order line** (order_id repeats for multi-SKU orders). `status` is per line: an order is
  cancelled or RTO as a whole; a customer return marks one line `returned`. Order-level shipping sits on the order's **first line**.
- `orders.channel_fee` = commission_pct x net_revenue + fixed_fee + payment_gateway_pct x net_revenue (prepaid only) for delivered
  lines; RTO/returned lines keep only fixed_fee + gateway fee; cancelled = 0 (rates from `channel_fees.csv`). Fees are ex-GST; the 18% GST
  on them is input tax credit (`gst_monthly.itc_on_fees`), not a cost.
- `orders.shipping_cost` (first line only): Website = courier rate for the zone (`couriers.csv`) + COD fee if COD and not RTO,
  plus the same rate again if the order was RTO or had a return. Other channels = `channel_fees.shipping_fee`, doubled on RTO/return.
- Prices are **GST-inclusive** (MRP). `orders.gst` = 18/118 of net_revenue on delivered domestic lines (HSN 3304); `tax_type` CGST+SGST when the
  buyer's state = the shipping warehouse's state (Mumbai = Maharashtra, Delhi = Delhi, Bangalore = Karnataka), else IGST; exports zero-rated (LUT).
  Revenue in the P&L stays GST-inclusive, as most Indian D2C dashboards show it.
- `returns.csv` has one row per returned line; `refund` = that line's net_revenue.
- `pnl_monthly.csv` (by order month): gross_revenue = sum of gross on non-cancelled lines; discounts = gross - net; returns = net of
  RTO + returned lines; net_revenue = gross - discounts - returns; cogs = products.cogs x qty for delivered lines + returned lines that
  are not restockable; channel_fees and shipping = sums of the order columns; marketing = Meta + Google + marketplace ads spend (by
  date) + creator fee_paid (by post date); salaries = basic + HRA + special + employer PF + employer ESI for employees whose join_date is on
  or before the 1st of the month (variable pay is paid annually in April, not accrued); opex = opex.csv (WhatsApp message charges sit in the
  Interakt and WATI lines). ebitda = net_revenue - everything else.
- `creator_posts.orders/revenue` = non-cancelled website orders that used that post's `coupon_code` (net revenue, booked).
  Coupon codes are unique per post and attribution runs 7 days from the post date.
- `meta_ads_daily.csv` summed over 2026-10-02..2026-10-31 by campaign equals `meta_campaigns.csv` spend and revenue exactly.
  Meta revenue is Meta-attributed (7-day click, 1-day view) and overlaps with website, Google and creator revenue - do not add them up.
  The same goes for marketplace ads and WhatsApp revenue.
- `inventory_snapshot.csv` is weekly (Saturdays). on_hand(prev week) = on_hand + shipped_week - received_week. The 2026-10-31 rows equal
  the stock columns in `products.csv` exactly. in_transit = finished goods that land in the following week. Quick-commerce dark-store stock is
  the platforms' own (`qc_inventory.csv`), already counted as shipped from our warehouses.
- `bom.csv`: sum of qty_per_unit x the material's base cost equals products.cogs (the JW0x line is the contract manufacturer's
  conversion charge). raw_materials.unit_cost is the standard cost; last_po_cost is the latest PO price (saffron and vitamin C have crept up).
- `payroll_2026_10.csv`: gross = basic + HRA + special; pf_employee = 12% of min(basic, 15000); ESI when gross <= ₹21,000: employee 0.75%,
  employer 3.25% (rounded up); professional tax: Maharashtra ₹200 (women earning up to ₹25,000 exempt), Karnataka ₹200 if gross >= ₹25,000,
  Delhi none; TDS = new regime (₹75,000 standard deduction, slabs 0/5/10/15/20/25/30 at 4/8/12/16/20/24 L, 87A rebate to ₹12 L taxable with
  marginal relief, 4% cess) on gross x 12, divided by 12. net_pay = gross - pf_employee - esi_employee - professional_tax - tds;
  employer_cost = gross + pf_employer + esi_employer.
- `customers.csv`: customer_id is per channel (marketplaces do not share buyer identity, so the same person on Amazon and the website is two
  ids; offline buyers are one walk-in id per bill). orders = all orders incl. cancelled; total_spend = net revenue of delivered lines.
- `gst_monthly.csv`: per month x GSTIN. output_gst = sum of orders.gst shipped from that state; ITC = 18% of channel fees + shipping (that
  GSTIN) + ads, GST-registered creators (100k+ followers), received POs (5% saffron/botanicals, else 18%) and head-office opex (Maharashtra);
  blocked credits (insurance, travel, gifting, foreign SaaS) excluded. itc_closing rolls into next month's itc_opening; cash_payable =
  max(0, output - ITC available) - TCS credit (0.5% of taxable value sold through e-commerce operators), floored at 0.
- `settlements.csv`: one row per platform payout cycle (weekly; offline monthly) by order date. gross_sales = delivered net revenue,
  fees/shipping = the order columns, gst_on_fees = 18%, TCS 0.5% and TDS 0.1% (sec 194-O) of taxable value; net_payout = gross - all of
  those; settlement_date = cycle end + settlement_days; status pending if after 2026-10-31.
- `qc_inventory.csv`: units_sold_week = that platform's non-cancelled units in the city in the 7 days to the snapshot date;
  days_of_cover = on_hand / (units_sold_week / 7); availability_pct = in_stock_stores / dark_stores.
- `cohort_retention.csv` uses the same definition as `kit metric cohort_retention` (first non-cancelled order month).
- `compliance_calendar.csv` amounts come from the files: GSTR-3B = gst_monthly.cash_payable, TDS/PF/ESI/PT from the payroll of that month,
  vendor TDS from opex x vendors.tds_rate_pct + 10% of creator fees (194J) + 2% of job-work POs (194C).

## Data dictionary

- **orders.csv**: Order lines. coupon = creator coupon (website only); courier; zone A local, B regional, C metro-metro, D rest of India, E Kerala/J&K/North-East, INTL export; delivery_days for delivered/returned lines; shipping_cost; channel_fee; state and pincode of the buyer; payment_method (UPI, Card, Netbanking, Simpl, LazyPay, BNPL, Wallet, Cash, COD); gst inside net_revenue; tax_type.
- **channel_fees.csv**: Fee card per sales channel: commission %, fixed fee per line, shipping fee per order, payment gateway % (website prepaid), settlement days, notes, channel_group (D2C, Marketplace, Beauty marketplace, Quick commerce, Offline retail, Export), TCS % and TDS % the platform withholds, GST % on fees.
- **customers.csv**: One row per customer id: first order date, city, region, acquisition channel, orders, total_spend, last_order_date, city_tier (1 metro/tier-1, 2, 3), acquired_by (creator coupon of first order, if any), state, pincode.
- **returns.csv**: Customer returns after delivery: return date, reason, refund, restockable (yes/no), qty. RTO is not here; it is orders.status = rto.
- **meta_ads_daily.csv**: Meta (Facebook/Instagram) ads per day per ad: spend, impressions, clicks, add_to_cart, purchases, revenue (Meta-attributed), creative language.
- **google_ads_daily.csv**: Google Ads per day per campaign. type: search, shopping, performance_max, video (YouTube), demand_gen.
- **marketplace_ads_daily.csv**: Marketplace and quick-commerce ads per day per campaign (platform-attributed): Amazon Sponsored Products/Brands/Display, Flipkart PLA/PCA, Nykaa, Myntra, Purplle, Meesho, Blinkit, Zepto, Instamart. ad_type.
- **creators.csv**: Creator roster (8 from influencers.csv + 30 more + 12 regional-language creators on Instagram, YouTube, ShareChat, Moj, Josh). fee_reel/fee_story in ₹ per deliverable, fake_follower_pct from audit, tier nano/micro/mid/macro/mega, past_brand_roas only for v1 creators.
- **creator_posts.csv**: Every creator post Aug-Oct: views, likes, comments, link clicks, coupon_code, attributed orders/revenue, fee_paid (0 = barter), roas = revenue / fee_paid, language.
- **suppliers.csv**: Suppliers: contract manufacturer, chemicals, botanicals, saffron, packaging. payment_terms_days (0 = advance), rating out of 5.
- **raw_materials.csv**: Materials with unit, standard unit_cost, last_po_cost, supplier, MOQ, lead time, stock on hand (2026-10-31), monthly_usage at average demand.
- **bom.csv**: Bill of materials: qty of each material per finished unit.
- **purchase_orders.csv**: POs Aug-early Nov. status: received, received_late, in_transit, delayed (past expected date, not received), open. payment_due = received (or expected) + supplier terms.
- **inventory_snapshot.csv**: Weekly finished-goods stock per warehouse and SKU with shipped_week and received_week.
- **couriers.csv**: Rate card per courier and zone for website orders (via Shiprocket: Delhivery, Xpressbees, Blue Dart, Shadowfax, Ekart, Ecom Express, DTDC, India Post) plus observed rto_pct, avg_delivery_days, orders and cod_share_pct over the quarter.
- **employees.csv**: 28 people. ctc_annual includes variable pay; monthly fixed = basic + HRA + special + employer PF + employer ESI. gender is used only for Maharashtra professional tax.
- **payroll_2026_10.csv**: October 2026 payroll for everyone who had joined by 2026-10-01, with ESI.
- **opex.csv**: Monthly operating expenses by category and vendor (rent, 3PL warehousing, software incl. WhatsApp BSPs, creative, professional fees, trade marketing, etc.).
- **pnl_monthly.csv**: Monthly P&L computed from the files above, plus orders, units, new_customers, the marketing split, ebitda_pct and marketing_pct.
- **finance_policy.json**: Rules Finance enforces: marketing % cap, EBITDA floors, max CAC, cash floor and approval limits.
- **cities.csv**: 55 Indian cities: state, region, tier, base pincode, GST state code, metro flag, home warehouse, courier zone from each warehouse, quick-commerce platforms and offline chains present.
- **festive_calendar.csv**: Festivals and platform sales Aug 2026-Mar 2027 (Onam, Navratri, Durga Puja, Diwali, Pongal, Holi, Eid, wedding season, Big Billion Days, Great Indian Festival, Pink Friday, EORS...): focus states, platforms, observed uplift (past) and expected uplift (upcoming).
- **gst_monthly.csv**: GST per month per GSTIN (Maharashtra, Delhi, Karnataka): taxable value, CGST/SGST/IGST, ITC by source, ITC carried forward, marketplace TCS credit, cash payable, GSTR-1 and GSTR-3B due dates.
- **settlements.csv**: Payouts per platform cycle: gross sales, fees, shipping, GST on fees, TCS, TDS, net payout, settlement date, paid/pending.
- **qc_inventory.csv**: Quick-commerce dark-store stock per Saturday x platform x city x SKU: dark stores listing us, stores in stock, units, units sold that week, days of cover, availability %.
- **reviews.csv**: New ratings per month x platform x SKU: star counts, average rating, written reviews, top praise and top complaint.
- **support_tickets.csv**: Customer support tickets (WhatsApp, email, IVR, Instagram DM): category, language, first response (minutes), resolution (hours), status, CSAT 1-5, who handled it.
- **whatsapp_campaigns.csv**: WhatsApp broadcasts and automated flows (Interakt marketing, WATI utility): sent, delivered, read, clicked, orders, revenue, cost at Meta per-message rates.
- **cohort_retention.csv**: Acquisition cohorts (first non-cancelled order month x channel): customers, retained in month +1 / +2, repeat customers, orders, revenue.
- **vendors.csv**: Every supplier and service vendor: state, GSTIN, MSME (Udyam) category, payment terms, TDS section and rate.
- **compliance_calendar.csv**: Statutory due dates Aug 2026-Jan 2027: GSTR-1/3B per GSTIN, TDS, PF, ESI, professional tax, ROC; amount, status, filed_on, late fee.
