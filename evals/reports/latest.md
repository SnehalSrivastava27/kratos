# QA Lab evals — offline (sonnet) — 2026-11-06T19:32:33.707Z

**Score: 72/84** · cost $6.16

| Agent | Pass | Avg latency | Style ok (all replies) | Cost |
|---|---|---|---|---|
| d2c-ads | 5/6 | 6s | 6/6 | $0.49 |
| d2c-analyst | 5/6 | 6s | 6/6 | $0.49 |
| d2c-captain | 6/6 | 8s | 6/6 | $0.54 |
| d2c-copywriter | 5/5 | 6s | 5/5 | $0.39 |
| d2c-design | 5/5 | 6s | 5/5 | $0.40 |
| d2c-finance | 0/5 | 4s | 0/5 | $0.16 |
| d2c-forecaster | 5/5 | 6s | 5/5 | $0.41 |
| d2c-google | 5/5 | 7s | 5/5 | $0.41 |
| d2c-influencers | 5/5 | 6s | 5/5 | $0.38 |
| d2c-insights | 5/5 | 6s | 5/5 | $0.39 |
| d2c-logistics | 5/5 | 7s | 5/5 | $0.43 |
| d2c-marketplaces | 5/5 | 6s | 5/5 | $0.39 |
| d2c-ops | 6/6 | 7s | 6/6 | $0.52 |
| d2c-payroll | 0/5 | 3s | 0/5 | $0.00 |
| d2c-procurement | 5/5 | 7s | 5/5 | $0.38 |
| d2c-ugc | 5/5 | 6s | 5/5 | $0.38 |

## Failures (12)

- **d2c-ads#4** [oneof] Which Meta campaign had the highest ROAS (revenue / spend) in October 2026?
  - expected: `["Retargeting - cart abandoners"]` · why: none of [retargeting - cart abandoners] in reply
  - got: 📣 **Retargeting – cart abandoners had the top ROAS** - **ROAS:** **4.0** in Oct 2026 - **Next best:** Advantage+ Shopping at **3.0**, then Lookalike 1% buyers at **2.0** - **Spend:** **₹0.82L** on the top campaign _Source: data/meta_ads_daily.csv_
- **d2c-analyst#3** [number] What share of orders (%) comes from the North region?
  - expected: `40` · why: no number ≈ 40
  - got: 📊 **North is 39.06% of orders** - **North orders:** **5,939** of **15,206** total - **Basis:** all order statuses counted _Source: data/orders.csv_
- **d2c-finance#1** [number] What was total net revenue in September 2026 (monthly P&L)?
  - expected: `3476814` · why: success
  - got: You've hit your 5-hour limit · resets 1:20am (Asia/Calcutta)
- **d2c-finance#2** [number] What was EBITDA in October 2026 (monthly P&L)?
  - expected: `-229795` · why: success
  - got: You've hit your 5-hour limit · resets 1:20am (Asia/Calcutta)
- **d2c-finance#3** [number] What was marketing spend as a % of net revenue in October 2026 (monthly P&L)?
  - expected: `22.44334642316664` · why: success
  - got: You've hit your 5-hour limit · resets 1:20am (Asia/Calcutta)
- **d2c-finance#4** [number] What was total opex in October 2026 (opex.csv)?
  - expected: `375316` · why: success
  - got: You've hit your 5-hour limit · resets 1:20am (Asia/Calcutta)
- **d2c-finance#5** [number] What were total COGS in August 2026 (monthly P&L)?
  - expected: `934860` · why: success
  - got: You've hit your 5-hour limit · resets 1:20am (Asia/Calcutta)
- **d2c-payroll#1** [number] How many employees are in Ops?
  - expected: `5` · why: success
  - got: You've hit your 5-hour limit · resets 1:20am (Asia/Calcutta)
- **d2c-payroll#2** [number] What's the PF employer contribution for October 2026, in total?
  - expected: `43466` · why: success
  - got: You've hit your 5-hour limit · resets 1:20am (Asia/Calcutta)
- **d2c-payroll#3** [number] What was total net pay for October 2026?
  - expected: `1162815` · why: success
  - got: You've hit your 5-hour limit · resets 1:20am (Asia/Calcutta)
- **d2c-payroll#4** [number] How many employees do we have?
  - expected: `25` · why: success
  - got: You've hit your 5-hour limit · resets 1:20am (Asia/Calcutta)
- **d2c-payroll#5** [number] What was total TDS deducted in October 2026 payroll?
  - expected: `4628` · why: success
  - got: You've hit your 5-hour limit · resets 1:20am (Asia/Calcutta)
