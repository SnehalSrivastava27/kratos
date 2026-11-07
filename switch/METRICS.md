# Metrics: one command, one definition

`kit metric <name>` answers most founder questions in one call, with the exact definition, the filters it used, the source
tables and the SQL that ran (re-run it with `kit sql` if you want to see rows). Use it **before** writing your own SQL:
hand-written SQL is where wrong joins, COD vs prepaid, gross vs net and date-window mistakes come from.

```
node kit/bin/kit.mjs metric list                                         # every name + one line
node kit/bin/kit.mjs metric net_revenue --month 2026-10                  # one number
node kit/bin/kit.mjs metric rto_pct --channel Website --by payment       # a breakdown
node kit/bin/kit.mjs metric meta_roas --by campaign --last 30            # last 30 days to the latest date in the data
node kit/bin/kit.mjs metric days_of_cover --sku SKU01                    # snapshot / rate metrics pick their own window
node kit/bin/kit.mjs brief finance                                       # a department's 6-10 numbers, month vs previous
```

**Window** (one of): `--month YYYY-MM`, `--from YYYY-MM-DD --to YYYY-MM-DD`, `--last N` (days, ending on the last date in the
data, 2026-10-31). No window = all data (2026-08-01..2026-10-31), except `days_of_cover`, `stockout_risk`, `sell_through`
(default last 28 days). P&L metrics (`ebitda`, `ebitda_pct`, `opex`, `runway_months`) are monthly: a window counts every month it
touches. `salary_bill` is the October 2026 payroll file; `stock_on_hand` is the latest weekly snapshot (both ignore the window).

**Filters**: `--channel` (sales channel: Website, Amazon, Flipkart, Nykaa, Myntra, Purplle, Meesho, Tata CLiQ, JioMart, AJIO, Blinkit, Zepto, Instamart, BB Now, Flipkart Minutes, Health & Glow, Apollo Pharmacy, Amazon Global; for ads metrics the
platform: Meta, Google, Amazon, Flipkart, Nykaa, Myntra, Purplle, Meesho, Blinkit, Zepto, Instamart; for `rating`, `qc_availability`,
`payouts` the platform; for `tickets` the order's sales channel), `--sku` (SKU01 or part of the product name). Case does not
matter. A filter a metric cannot take is an error, never silently ignored.

**`--by`** (one or two, comma-separated, e.g. `--by channel,month`):
- sales, returns %, RTO, COD, COGS, fees: `channel channel_group sku product month day city state region tier payment payment_method courier zone warehouse status customer_type` (`rto_pct` and `cod_share` are order level, so no `sku`/`product`)
- margin and efficiency (`cm1 cm2 cm3 marketing_pct blended_roas mer cac`): `channel month day`
- `marketing_spend`: `channel month day kind` (kind = meta, google, marketplace, creator)
- ads: `channel` (= platform) `campaign type source month day` (type = Meta creative type or Google campaign type)
- `returns`, `return_reasons`: `channel sku reason restockable month day`
- creators: `creator tier platform format month day`
- customers: `channel` (acquisition channel) `cohort month city region tier`
- stock: `warehouse sku`; POs: `supplier material status month`; people: `dept` (`headcount` also `city level`); `opex`: `category vendor month`
- India layer: `gst_payable` `state month`; `payouts`/`settlement_lag_days`/`receivables` `channel payer status month`; `qc_availability`
  `channel city sku`; `rating` `channel sku month`; `tickets`/`csat` `category channel via language status agent month`; `whatsapp_roas`
  `flow bsp category language month`; `compliance_due` `filing authority state status month`

**Output**: `{ok, metric, definition, unit, value, display, ...extras, filters, source_tables, sql}`; with `--by` it is
`values: [{<dim>, value, display, ...extras}]`, best first (time dims in order; cover lowest first). Quote `display` in your
reply (`₹41,88,747`, `9.3%`, `4.8x`) and say which definition you used when two could be meant (net vs booked revenue, orders vs order lines).

## Indian D2C conventions used here

**The revenue ladder** (all from `orders.csv`, one row per order line):
gross revenue (MRP × qty) − discounts = **booked revenue** (what the dashboard shows on order day) − RTO − customer returns
= **net revenue** (delivered lines; the P&L line). Cancelled lines never count. `net_revenue` ties to `pnl_monthly` exactly.

**Orders**: `orders` = distinct order ids, excluding cancelled (the P&L count). `orders_all` adds cancelled. `order_lines` = rows
(a two-SKU order is two lines). Ask yourself which one the question means; "all statuses" usually means `orders_all` (or
`order_lines` if the question counts rows).

**COD and RTO.** COD = cash on delivery. **RTO (return to origin)** = the courier could not deliver (refused, unreachable, cash not
ready), the parcel comes back, you pay shipping both ways and earn nothing. It is *not* a customer return. `rto_pct` = RTO orders /
shipped (non-cancelled) orders, at order level, by order date (Indian industry: COD RTO ~20-30%, prepaid ~2-3%, rising by city tier).
**Customer return** = delivered, then sent back (damaged, did not suit). `return_pct` = returned units / delivered + returned units.
Skincare returns are low (2-6%) because opened product cannot be resold.

**Contribution margins (CM1 / CM2 / CM3).** Indian D2C operators layer contribution like this; the exact split is not
standardised, so say which layer you mean:
- **CM1** = net revenue − COGS (product margin).
- **CM2** = CM1 − channel fees (marketplace commission, fixed/closing fee, payment gateway) − shipping (forward, RTO return leg,
  COD fee). Some brands also put 3PL pick-pack here; we keep 3PL warehousing in opex because that is where `opex.csv` books it.
- **CM3** = CM2 − marketing (Meta + Google + marketplace ads + creator fees). Then **EBITDA = CM3 − salaries − opex** (tested).
- By channel, marketing is allocated: marketplace ads to that marketplace; Meta, Google and creators to Website.
Typical targets quoted for Indian beauty D2C: CM1 60%+, CM2 ~30-45%, CM3 positive (8-20% when scaling).

**ROAS, blended ROAS, MER.**
- Platform **ROAS** (`roas`, `meta_roas`, `google_roas`, `marketplace_roas`) = revenue the platform attributes / spend. Meta counts
  7-day click + 1-day view and over-claims; platforms overlap, so **never add their revenue together**.
- **Blended ROAS** = net revenue / paid-ads spend (no attribution, no creators).
- **MER** (marketing efficiency ratio) = net revenue / total marketing incl. creators. MER 4.5x = marketing is 22% of revenue.
  Healthy Indian beauty brands run marketing at 20-30% of net revenue (MER ~3.5-5x).
- **CAC** (blended) = total marketing / new customers in the window (the `finance_policy.json` rule, cap ₹450).

**Customers.** Customer ids are per channel (marketplaces hide buyer identity), so repeat and LTV are lower bounds.
`repeat_rate` = customers with 2+ orders / customers (cohort by first order date). `ltv` = average delivered revenue per customer
to date (≤ 92 days of history, so it is a 90-day LTV, not lifetime). `cohort_retention` = % of a first-order month buying again
next month (m1) and the month after (m2).

**Stock.** `days_of_cover` = on hand (latest snapshot) / average daily units sold in the window. Keep 4-8 weeks; under 21 days
(`stockout_risk`) needs a transfer or PO now. `sell_through` = sold / (sold + on hand).

**Payroll.** gross = basic + HRA + special; net pay = gross − employee PF − employee ESI − professional tax − TDS; employer cost =
gross + employer PF + employer ESI (= P&L salaries). ESI (0.75% + 3.25%) applies only up to ₹21,000 gross. Variable pay is paid
annually in April, not accrued.

**Channels.** `channel_fees.channel_group` groups the 18 channels: D2C, Marketplace, Beauty marketplace, Quick commerce (Blinkit,
Zepto, Instamart, BB Now, Flipkart Minutes), Offline retail (Health & Glow, Apollo Pharmacy), Export (Amazon Global). `qc_share` =
quick-commerce share of delivered revenue; `channel_mix` = revenue by group.

**GST.** Prices are GST-inclusive; `orders.gst` = 18/118 of delivered domestic net revenue (HSN 3304). Each warehouse state has its own
GSTIN; ITC cannot move between them, so Maharashtra (ads, POs, head office) builds unused credit while Delhi and Karnataka pay cash.
`gst_payable` = cash paid in GSTR-3B after ITC and marketplace TCS (0.5%). Revenue metrics stay GST-inclusive like the P&L.

**Settlements.** Platforms pay net of commission, shipping, 18% GST on fees, TCS 0.5% and TDS 0.1% (sec 194-O), 7-60 days after the
cycle. `payouts` = net payout, `settlement_lag_days` = payout-weighted days from mid-cycle to cash, `receivables` = still pending on
2026-10-31.

**Runway** (`runway_months`) = cash balance in `finance_policy.json` / average monthly EBITDA loss. Cash-ish: EBITDA ignores
marketplace settlement lag (`receivables`), supplier credit, GST timing (`gst_payable`) and capex.

## Catalog

| Metric | Unit | Definition |
|---|---|---|
| `gross_revenue` | ₹ | SUM(gross_revenue) over non-cancelled order lines (= MRP × qty). P&L gross_revenue. |
| `net_revenue` | ₹ | SUM(net_revenue) over delivered lines = gross − discounts − RTO − customer returns. Ties to pnl_monthly. By order date. |
| `booked_revenue` | ₹ | SUM(net_revenue) over non-cancelled lines (incl. RTO and returned). |
| `discounts` | ₹ | SUM(gross_revenue − net_revenue) over non-cancelled lines. |
| `discount_pct` | % | discounts / gross revenue, non-cancelled lines. |
| `orders` | count | COUNT(DISTINCT order_id), non-cancelled. With `--sku`: orders containing that SKU. |
| `orders_all` | count | COUNT(DISTINCT order_id), every status. |
| `order_lines` | count | Rows of orders.csv, every status. |
| `units` | count | SUM(qty), non-cancelled. |
| `units_all` | count | SUM(qty), every status. |
| `aov` | ₹ | booked revenue / orders (non-cancelled); extra `units_per_order`. |
| `cod_share` | % | COD orders / shipped (non-cancelled) orders, order level. |
| `rto_pct` | % | RTO orders / shipped orders, order level, by order date; extras `rto_orders`, `shipped_orders`. |
| `return_pct` | % | returned units / delivered + returned units, by order date. Excludes RTO. |
| `returns` | count | returns.csv rows by return date; extras `refunds`, `units`. |
| `return_reasons` | count | returns per reason, most common first. |
| `cogs` | ₹ | products.cogs × qty on delivered lines + non-restockable returned lines. P&L COGS. |
| `channel_fees` | ₹ | SUM(orders.channel_fee): commission + fixed fee + 2% gateway on website prepaid. |
| `shipping_cost` | ₹ | SUM(orders.shipping_cost): forward + RTO/return leg + COD fee (first line of each order). |
| `fees_pct` | % | (channel fees + shipping) / net revenue over delivered lines. |
| `cm1` / `cm2` / `cm3` | ₹ | see above; extras `pct_of_net`, `per_order` (per shipped order). |
| `ebitda` | ₹ | pnl_monthly.ebitda for months in the window; extras `ebitda_pct`, `net_revenue`. |
| `ebitda_pct` | % | EBITDA / net revenue. |
| `opex` | ₹ | SUM(opex.amount) (`--by category`). |
| `runway_months` | months | cash balance / average monthly EBITDA loss; extra `months_above_cash_floor`. |
| `marketing_spend` | ₹ | Meta + Google + marketplace ads (by date) + creator fees (by post date). P&L marketing. |
| `marketing_pct` | % | marketing / net revenue (policy cap 25%). |
| `ad_spend` | ₹ | paid ads only, `--channel` = platform. |
| `roas`, `meta_roas`, `google_roas`, `marketplace_roas` | x | platform-attributed revenue / spend; extras `spend`, `revenue`. |
| `ctr_pct`, `cpc`, `cpm` | %, ₹, ₹ | clicks / impressions, spend / clicks, spend per 1,000 impressions (marketplaces report no impressions). |
| `blended_roas` | x | net revenue / paid ads spend. |
| `mer` | x | net revenue / total marketing. |
| `cac` | ₹ | marketing / new customers; extras `marketing`, `new_customers`. |
| `creator_fees` | ₹ | SUM(fee_paid) (barter = 0); extras `posts`, `barter_posts`. |
| `creator_orders` | count | coupon orders (non-cancelled website orders, 7 days from the post); extra `revenue`. |
| `creator_roas` | x | coupon revenue / fee, paid posts only (`--by creator`). |
| `creator_cpm`, `creator_cost_per_order` | ₹ | fee per 1,000 views, fee per coupon order, paid posts. |
| `new_customers` | count | customers by first order date. |
| `repeat_rate` | % | customers with 2+ orders / customers (cohort by first order date). |
| `new_vs_returning` | ₹ | delivered revenue from first orders vs repeat orders; extra `share_pct`. |
| `cohort_retention` | % | by first-order month: m1 (value) and `m2_pct`. |
| `ltv` | ₹ | average delivered revenue per customer to date; extra `avg_orders`. |
| `stock_on_hand` | units | latest weekly snapshot; extras `in_transit`, `reserved`. |
| `days_of_cover` | days | on hand / daily units sold in the window (default last 28 days), lowest first. |
| `stockout_risk` | days | warehouse × SKU with cover under 21 days. |
| `sell_through` | % | sold / (sold + on hand), default last 28 days. |
| `po_value` | ₹ | SUM(purchase_orders.total) by PO date. |
| `po_delays` | count | POs delayed now + received late; extras `delayed_now`, `arrived_late`, `late_pct`. |
| `supplier_lead_time` | days | actual PO → receipt days by supplier; extras `promised_days`, `avg_delay`. |
| `rm_cost_change` | % | first vs latest PO unit cost per material in the window. |
| `salary_bill` | ₹ | Oct 2026 payroll gross; extras `net_pay`, `employer_cost`, `pf_employee`, `pf_employer`, `esi_employee`, `esi_employer`, `tds`, `professional_tax`, `headcount`. |
| `headcount` | count | employees joined on or before the window end. |
| `qc_share` | % | quick-commerce share of delivered net revenue; extra `qc_revenue`. |
| `channel_mix` | ₹ | delivered revenue by `channel_group` (default), extra `share_pct`. |
| `payment_mix` | count | non-cancelled orders by `payment_method` (UPI, Card, Netbanking, Simpl, LazyPay, BNPL, Wallet, Cash, COD); extra `share_pct`. |
| `gst_payable` | ₹ | gst_monthly cash payable (GSTR-3B); extras `output_gst`, `itc_total`, `tcs_credit`. |
| `payouts` | ₹ | settlements net payout; extras `gross_sales`, `fees`, `shipping`, `gst_on_fees`, `tcs`, `tds`. |
| `settlement_lag_days` | days | payout-weighted days from mid-cycle to settlement date. |
| `receivables` | ₹ | net payout of settlements still pending on 2026-10-31. |
| `compliance_due` | ₹ | upcoming statutory payments (compliance_calendar); extras `filings`, `next_due`. |
| `whatsapp_roas` | x | WhatsApp marketing revenue / message cost; extras `cost`, `revenue`, `orders`, `sent`. |
| `rating` | stars | average star rating of new ratings (reviews.csv); extras `ratings`, `one_star_pct`. |
| `tickets` | count | support tickets; extras `avg_first_response_mins`, `avg_resolution_hours`, `open`, `csat`. |
| `csat` | stars | average CSAT on rated tickets; extra `rated`. |
| `qc_availability` | % | in-stock dark stores / dark stores listing us, latest snapshot (lowest first); extras `on_hand`, `units_sold_week`, `days_of_cover`. |

## Briefs

`kit brief <dept>` (`analytics`, `ads`, `creators`, `ops`, `design`, `finance`, `captain`; `--month YYYY-MM`, default the latest)
returns the lead's 6-10 numbers for the month with the previous month (`prev`, `change_pct` or `change_pts`) and the exact
`kit metric` command behind each number. `finance` and `captain` add `policy_checks` against `finance_policy.json`;
`design` adds the sale discount from `budget.json`.

## Marts (also queryable with `kit sql`)

`m_lines` (order lines + product, month, city_tier, channel_group, is_first, P&L cogs, customer_type), `m_orders` (one row per order),
`daily_sales`, `channel_month`, `sku_month`, `rto_by_channel`, `rto_by_payment`, `rto_by_tier`, `rto_by_courier`,
`ads_daily_all`, `marketing_daily`, `channel_daily`, `creator_perf`, `stock_latest`, `payroll_summary`, `pnl` (pnl_monthly + cm1-3).
`kit tables` lists their columns.

## Sources

- CM1/CM2/CM3 layering and benchmarks: [echai.ventures: what is contribution margin](https://echai.ventures/d2c/d2c-unit-economics/what-is-contribution-margin-d2c),
  [echai.ventures: healthy CM1/CM2/CM3 benchmarks India](https://echai.ventures/d2c/d2c-unit-economics/healthy-cm1-cm2-cm3-benchmarks-india),
  [Treelife: financial model for a D2C business in India](https://treelife.in/finance/financial-model-for-d2c-business-in-india/).
  These sources disagree on where fulfilment and returns sit (CM1 vs CM2) and whether CM3 subtracts all marketing or only brand spend.
- COD, RTO, returns, ROAS, MER, creator benchmarks: `docs/d2c-primer.md` and its source list (Razorpay, base.com, Unicommerce,
  Sociolabs, Triple Whale, Kofluence).
- Data definitions and ties: `data/README.md`, `data/gen/check.mjs`.
