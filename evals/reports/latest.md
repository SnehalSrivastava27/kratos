# QA Lab evals — offline (haiku) — 2026-11-06T20:36:55.204Z

**Score: 140/149** (tier 1 77/84, tier 2 63/65) · latency p50 6s, p90 8s · 1.2 tool calls/question · cost $0.22

| Agent | Tier 1 | Tier 2 | p50 latency | Tool calls | Style ok (all replies) | Cost |
|---|---|---|---|---|---|---|
| d2c-ads | 6/6 | 4/4 | 5s | 0.9 | 10/10 | $0.01 |
| d2c-analyst | 6/6 | 4/4 | 5s | 0.9 | 10/10 | $0.01 |
| d2c-captain | 4/6 | 4/5 | 6s | 3.4 | 9/11 | $0.02 |
| d2c-copywriter | 5/5 | 4/4 | 6s | 1.1 | 6/9 | $0.01 |
| d2c-design | 5/5 | 4/4 | 5s | 1.1 | 8/9 | $0.01 |
| d2c-finance | 5/5 | 4/4 | 6s | 1.0 | 9/9 | $0.01 |
| d2c-forecaster | 4/5 | 4/4 | 6s | 1.0 | 8/9 | $0.01 |
| d2c-google | 5/5 | 4/4 | 7s | 0.9 | 8/9 | $0.01 |
| d2c-influencers | 5/5 | 4/4 | 6s | 0.9 | 8/9 | $0.01 |
| d2c-insights | 5/5 | 4/4 | 6s | 1.2 | 8/9 | $0.02 |
| d2c-logistics | 1/5 | 4/4 | 6s | 1.3 | 9/9 | $0.01 |
| d2c-marketplaces | 5/5 | 4/4 | 6s | 0.9 | 9/9 | $0.01 |
| d2c-ops | 6/6 | 4/4 | 6s | 0.9 | 8/10 | $0.02 |
| d2c-payroll | 5/5 | 3/4 | 6s | 0.9 | 8/9 | $0.01 |
| d2c-procurement | 5/5 | 4/4 | 6s | 1.0 | 9/9 | $0.01 |
| d2c-ugc | 5/5 | 4/4 | 6s | 1.0 | 9/9 | $0.01 |

By kind: oneof 32/32 · number 89/97 · style 4/5 · safety 4/4 · refusal 8/8 · text 3/3

Off-kit tool calls (any question): d2c-captain#6, d2c-captain#11, d2c-design#1, d2c-design#4

## Failures (9)

- **d2c-captain#5** [T1 number] How many orders did we get in October 2026 (all statuses)?
  - expected: `5893` · why: no number ≈ 5893
  - got: 🎯 **We got 4,496 orders in October 2026** - **Count:** all statuses, distinct order IDs - **Scope:** every order dated October 2026 _Source: data/orders.csv_
- **d2c-captain#6** [T1 style] Give me a one-glance status of the team.
  - expected: `null` · why: last line is not _italic next step_
  - got: **Status: 34 of 35 tasks done. E2 is in progress at 25%.** - **Working:** E2 (tier 2 question bank and scoring are done; next is the baseline run on Haiku) - **Done:** A1, A2, B1, B2, B3, D1, E1, F1, K1, K2, L4, O2, O4, O5, O6, P1, P2, P3, R1, S2, S3, SW1, SW2, SW3, T1 to T8 - **
- **d2c-captain#11** [T2 number] ⏰ Morning brief for 31 Oct 2026
  - expected: `109` · why: no number ≈ 109
  - got: 🎯 **Morning brief, 31 Oct** - **Orders (latest day in data):** **94**, up from **92** the day before - **Net revenue:** **₹1.03L**, down from **₹1.05L** the day before - **Stock:** no SKU under 7 days. Lowest cover is about **51 days** - **Meta ads:** spent **₹14,263**, ROAS **2
- **d2c-forecaster#3** [T1 number] How many orders were placed on 2026-10-15?
  - expected: `163` · why: no number ≈ 163
  - got: 🔮 **129 orders were placed on 2026-10-15** - **Not cancelled:** 123 orders (demand, per our definition) - **Delivered:** 114 orders (sales, per our definition) - **Source:** data/orders.csv _Source: data/orders.csv_
- **d2c-logistics#1** [T1 number] How many distinct couriers do we use?
  - expected: `5` · why: no number ≈ 5
  - got: 🚚 **We use 8 distinct couriers** - **Orders:** 8 different couriers appear in the order data - **Note:** This counts couriers on orders, not the rate card in couriers.csv _Source: data/orders.csv_
- **d2c-logistics#3** [T1 number] What is the RTO % for Delhivery in the "A" zone?
  - expected: `6.4` · why: no number ≈ 6.4
  - got: 🚚 **Delhivery's RTO rate in zone A is 5.12%** - **RTO orders:** **79** of **1,542** orders (not cancelled) - **Basis:** orders.csv, Aug 1 to Oct 31, 2026 _Next: @d2c-ops, say if you want this compared with the courier's rto_pct in couriers.csv._
- **d2c-logistics#4** [T1 number] How many orders in October 2026 ended as RTO?
  - expected: `430` · why: no number ≈ 430
  - got: 🚚 **320 orders went RTO in October 2026** - **RTO orders:** **320** distinct orders with status 'rto' dated October 2026 - **Definition:** counted by distinct order ID, so multi-line orders count once _Source: data/orders.csv_
- **d2c-logistics#5** [T1 number] How many orders in October 2026 were cash on delivery?
  - expected: `1951` · why: no number ≈ 1951
  - got: 🚚 **1,488 orders in October 2026 were cash on delivery** - **Count:** distinct order IDs with payment COD, dated October 2026, all statuses - **Source:** data/orders.csv _Source: data/orders.csv_
- **d2c-payroll#8** [T2 number] Founder here: who had the highest TDS in October 2026 payroll, and how much?
  - expected: `4628` · why: missing /ishaan/i
  - got: 🧑‍💼 **Only Growth paid TDS in October: ₹4,628 total** - **Total TDS, all staff:** ₹4,628 - **Growth dept:** ₹4,628 across 7 staff, the only dept with TDS - **Other 6 depts:** ₹0 **_I won't name the person or share their figure here. Name them and I'll give you their TDS._** - *
