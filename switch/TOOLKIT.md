# Toolkit (`kit`): your superpowers

Run from the repo root. Every command prints **one JSON object**: `{"ok":true,...}` or `{"ok":false,"error":"..."}`.
Files you make land in `gallery/live-run/` and come back as `{"path":"gallery/live-run/x.pptx","url":"/gallery/live-run/x.pptx"}`.
Share the `url` in your message.

```
node kit/bin/kit.mjs <command> [args]      # or: npm run -s kit -- <command> ...  (-s keeps stdout pure JSON)
node kit/bin/kit.mjs help deck             # usage + a working example spec for any command
```

Specs are inline JSON (`'{"title":...}'`) or a path to a `.json` file (in the repo or `/tmp`). Write long specs to
`/tmp/<name>.json` first. `out` (or `--out`) names the file: `a-z 0-9 - _ .` only, the extension is added for you.

## Ask in one command (start here)

Most questions are **one** `kit metric` call. It returns the number, its exact definition, the filters, the source tables and
the SQL that ran. Only write SQL when no metric fits. Full definitions and Indian D2C conventions: `switch/METRICS.md`.

```
node kit/bin/kit.mjs metric list                                    # every metric + one line
node kit/bin/kit.mjs metric <name> [--channel X] [--sku Y] [--month YYYY-MM | --from D --to D | --last N] [--by dim[,dim]]
node kit/bin/kit.mjs brief <analytics|ads|creators|ops|design|finance|captain>   # your dept's numbers, month vs previous
```

| Area | Metrics |
|---|---|
| Sales | `net_revenue` (delivered, = P&L), `gross_revenue`, `booked_revenue`, `discounts`, `discount_pct`, `orders`, `orders_all`, `order_lines`, `units`, `units_all`, `aov`, `cod_share` |
| RTO and returns | `rto_pct` (undelivered, by order date), `return_pct` (customer returns), `returns`, `return_reasons` |
| Margin | `cogs`, `channel_fees`, `shipping_cost`, `fees_pct`, `cm1`, `cm2`, `cm3` |
| Finance | `ebitda`, `ebitda_pct`, `opex`, `runway_months` |
| Marketing | `marketing_spend`, `marketing_pct`, `ad_spend`, `roas`, `meta_roas`, `google_roas`, `marketplace_roas`, `ctr_pct`, `cpc`, `cpm`, `blended_roas`, `mer`, `cac` |
| Creators | `creator_fees`, `creator_orders`, `creator_roas`, `creator_cpm`, `creator_cost_per_order` |
| Customers | `new_customers`, `repeat_rate`, `new_vs_returning`, `cohort_retention`, `ltv` |
| Ops | `stock_on_hand`, `days_of_cover`, `stockout_risk`, `sell_through`, `po_value`, `po_delays`, `supplier_lead_time`, `rm_cost_change` |
| People | `salary_bill` (gross, net, employer cost), `headcount` |

| Question | Command |
|---|---|
| October net revenue? | `metric net_revenue --month 2026-10` |
| Revenue by channel last 30 days? | `metric net_revenue --by channel --last 30` |
| Website RTO, COD vs prepaid? | `metric rto_pct --channel Website --by payment` |
| RTO by city tier / courier? | `metric rto_pct --by tier` · `metric rto_pct --channel Website --by courier` |
| Best Meta campaign? | `metric meta_roas --by campaign --month 2026-10` |
| Amazon ads spend and ROAS? | `metric marketplace_roas --channel Amazon --month 2026-10` (spend is in the result) |
| Are we within the marketing cap? CAC? | `metric marketing_pct --month 2026-10` · `metric cac --month 2026-10` |
| CM per order by channel? | `metric cm2 --by channel --month 2026-10` (`per_order`, `pct_of_net`) |
| Which creator paid back? | `metric creator_roas --by creator` |
| Which SKU runs out first? | `metric days_of_cover` · `metric stockout_risk` |
| Saffron price change? | `metric rm_cost_change` |
| Payroll by dept? | `metric salary_bill --by dept` |

Rules: `--channel` is a sales channel (Website, Amazon, Flipkart, Nykaa, Myntra, Blinkit, Zepto); for ads metrics it is the
platform (Meta, Google, Amazon, ...). `--sku` takes SKU01 or part of a name. No window = all data (2026-08-01..2026-10-31);
`--last N` ends on 2026-10-31. Unknown metric, filter or `--by` → an error that lists what is valid. Quote the `display` value.
Meta/Google/marketplace revenue is platform-attributed and overlaps: never add them up.

## Commands

**Find data.** Every `data/*.csv` is a table named after the file (`products`, `orders`, `meta_ads_daily`, ...).
Number columns are numbers. SQLite dialect. One `SELECT`/`WITH` only, read-only, max 200 rows (`--limit` up to 10000).
```
node kit/bin/kit.mjs tables
node kit/bin/kit.mjs sql "SELECT sku, name, mrp, avg_daily_units FROM products ORDER BY avg_daily_units DESC"
node kit/bin/kit.mjs sql "SELECT channel, SUM(net_revenue) rev FROM orders WHERE status='delivered' GROUP BY 1 ORDER BY 2 DESC"
```

**Stats.** count, sum, mean, median, p10, p90, min, max (optionally per group).
```
node kit/bin/kit.mjs stats meta_campaigns roas
node kit/bin/kit.mjs stats orders net_revenue --by channel
```

**Forecast.** Daily totals → linear trend × day-of-week pattern (needs 14+ days) × `--uplift`, for `--days` after the last date.
```
node kit/bin/kit.mjs forecast --table orders --date date --value qty --by sku --days 5 --uplift 4
```

**Chart** (Vega-Lite → `.svg` + `.png`, Kesar theme). Data inline (`"values"`) or from SQL (`"data":{"sql":"..."}`). No URLs.
```
node kit/bin/kit.mjs chart '{"out":"units-by-sku","title":"Daily units by product","data":{"sql":"SELECT name, avg_daily_units FROM products"},"mark":"bar","encoding":{"x":{"field":"name","type":"nominal","sort":"-y","title":null},"y":{"field":"avg_daily_units","type":"quantitative","title":"Units / day"}}}'
```
Line chart over time: `"mark":"line"`, `"x":{"field":"date","type":"temporal"}`. Colour by group: `"color":{"field":"sku"}`.

**Deck** (`.pptx`, 16:9, saffron/cream/ink). Slide types: `title`, `kpis` (up to 8 tiles: label, value, delta `+`/`-` turns green/red),
`bullets` (+ optional dark `callout`), `table` (`sql` or `columns`+`rows`, 14 rows shown), `chart` (a Vega-Lite spec or path to one), all with optional `notes`. Max 40 slides.
```
node kit/bin/kit.mjs deck '{"out":"sale-plan","slides":[
  {"type":"title","title":"Diwali sale plan","subtitle":"5 days · 25% off"},
  {"type":"kpis","title":"The plan in numbers","kpis":[{"label":"Revenue","value":"₹30.6L","delta":"+4x"},{"label":"Stock gap","value":"70","delta":"-Delhi serum"}]},
  {"type":"bullets","title":"What we do","bullets":["Move 70 serums to Delhi","Shift ₹50k to retargeting"],"callout":"Approve the transfer today."},
  {"type":"table","title":"Products","sql":"SELECT sku, name, mrp FROM products"},
  {"type":"chart","title":"Daily units","chart":{"data":{"sql":"SELECT name, avg_daily_units FROM products"},"mark":"bar","encoding":{"x":{"field":"name","type":"nominal"},"y":{"field":"avg_daily_units","type":"quantitative"}}},"caption":"Sunscreen sells most."}]}'
```

**Excel** (`.xlsx`). Each sheet from `sql` or `columns`+`rows`. Dark header, frozen, autofilter, auto widths.
Formats per column: `inr` (₹12,34,567), `lakh` (cell holds value ÷ 1,00,000, shows ₹1.23L), `int`, `num`, `pct` (25 → 25%), `ratio` (0.25 → 25%), `text`.
Money-named columns get `inr` automatically, `*_pct` get `pct`. Formula columns: `{col}` = that column in the same row, `{r}` = row number.
`"totals":true` adds a SUBTOTAL row that follows the filter.
```
node kit/bin/kit.mjs xlsx '{"out":"campaigns","sheets":[{"name":"Meta","sql":"SELECT campaign, spend, revenue, roas FROM meta_campaigns","formulas":[{"header":"Profit","formula":"{revenue}-{spend}","format":"inr"}],"totals":true}]}'
```

**Brief** (`.docx` or `.pdf`, one page, same spec). `title`, `subtitle`, `date`, `kpis` (max 4), `blocks`:
`{"h":...}`, `{"p":...}`, `{"bullets":[...]}`, `{"callout":...}`, `{"table":{"sql":...}}`, `{"chart":{vega-lite}}`, plus `footer`.
```
node kit/bin/kit.mjs pdf '{"out":"sale-brief","title":"Diwali sale brief","subtitle":"For the founder","kpis":[{"label":"Revenue","value":"₹30.6L"}],"blocks":[{"h":"Summary"},{"p":"We expect 4x sales for 5 days."},{"callout":"Approve the stock transfer today."},{"table":{"sql":"SELECT sku, name, mrp FROM products"}}]}'
node kit/bin/kit.mjs docx /tmp/sale-brief.json
```

**Banner** (1080×1080 `.svg` + `.png`). `template`: `sale` (dark, round badge), `launch` (cream + saffron panel), `quote` (testimonial).
Fields: `headline`, `sub`, `badge`, `cta`, `footnote`, `brand`, `accent` (`#RRGGBB`).
```
node kit/bin/kit.mjs banner '{"out":"diwali","template":"sale","headline":"Glow this Diwali","sub":"Vitamin C Serum + Sunscreen","badge":"25% OFF","cta":"Shop now","footnote":"Till 14 Nov"}'
```

## Who uses what

| Agent | Typical commands |
|---|---|
| d2c-analyst, d2c-forecaster, d2c-insights | `metric`, `brief analytics`, `sql`, `stats`, `forecast`, `chart`, `xlsx` |
| d2c-ops, d2c-logistics, d2c-procurement | `metric`, `brief ops`, `sql`, `forecast`, `xlsx` (transfer / PO sheets) |
| d2c-ads, d2c-google, d2c-marketplaces | `metric` (ROAS, CAC, MER), `brief ads`, `sql`, `chart`, `deck` |
| d2c-influencers, d2c-ugc | `metric` (creator_*), `brief creators`, `sql` (creators, posts), `xlsx` (shortlist) |
| d2c-design, d2c-copywriter | `brief design`, `banner`, `chart` |
| d2c-finance, d2c-payroll | `metric` (cm1-3, ebitda, salary_bill), `brief finance`, `xlsx`, `pdf` |
| d2c-captain | `brief captain`, `deck`, `docx` / `pdf` (founder brief) |

## Rules the kit enforces
- SQL: one read-only `SELECT`/`WITH`. No `ATTACH`, `PRAGMA`, writes, `load_extension`, file functions, or `;` chains.
  The data is a read-only SQLite copy (`data/.cache/kratos.db`, rebuilt automatically when a CSV changes), so nothing you run can change `data/`.
  Besides the CSV tables you can query the marts (`m_lines`, `m_orders`, `channel_daily`, `ads_daily_all`, ...; see `kit tables`).
- Files only go to `gallery/live-run/`. Specs ≤ 1 MB, ≤ 10,000 rows, ≤ 40 slides, 60 s per command.
- No network: charts take inline data or SQL only.

## Library shelf

| Library | What it is good for | In kit |
|---|---|---|
| pptxgenjs 4.0.1 | PowerPoint decks from code | yes (`deck`) |
| exceljs 4.4.0 | Excel with styles, formulas, filters | yes (`xlsx`) |
| docx 9.13.0 | Word documents | yes (`docx`) |
| pdfkit 0.20.2 | PDFs drawn from code | yes (`pdf`) |
| vega 6.4.0 + vega-lite 6.5.0 | Charts from a JSON grammar, rendered headless | yes (`chart`) |
| sharp 0.35.5 | SVG → PNG, resize/crop/compress images | yes (`chart`, `banner`) |
| simple-statistics 7.12.1 | Mean, quantiles, regression | yes (`stats`, `forecast`) |
| csv-parse 7.0.3 | Robust CSV parsing | yes (tables) |
| node:sqlite (built in) | SQL engine for `sql` | yes |
| pdf-lib | Edit/merge/fill existing PDFs (invoices, forms) | no, suggest |
| danfojs | Pandas-style dataframes in JS | no, suggest |
| date-fns | Date maths (sale windows, settlement days) | no, suggest |
| mjml | Responsive email HTML that works in Gmail/Outlook | no, suggest |
| satori | HTML/JSX → SVG for richer banners and OG images | no, suggest |
| qrcode | QR codes for packaging, offline posters | no, suggest |
| jsbarcode | Barcodes (EAN/Code128) for SKUs and labels | no, suggest |
| papaparse | CSV parsing in the browser | no, suggest |
| chart.js | Interactive charts in web pages | no, suggest |

Need something on the "suggest" list? Say so in your reply; a human adds it to `kit/` (agents do not run `npm install`).
