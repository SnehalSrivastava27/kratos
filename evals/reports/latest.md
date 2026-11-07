# QA Lab evals — offline (haiku) — 2026-11-07T08:17:28.829Z

**Score: 177/178** (tier 1 84/84, tier 2 77/77, tier 3 16/17) · latency p50 6s, p90 8s · 1.0 tool calls/question · cost $0.22

| Agent | Tier 1 | Tier 2 | Tier 3 | p50 latency | Tool calls | Style ok (all replies) | Cost |
|---|---|---|---|---|---|---|---|
| d2c-ads | 6/6 | 4/4 | 1/2 | 6s | 1.1 | 10/12 | $0.01 |
| d2c-analyst | 6/6 | 5/5 | 2/2 | 6s | 1.0 | 13/13 | $0.01 |
| d2c-captain | 6/6 | 6/6 | 2/2 | 5s | 1.2 | 13/14 | $0.02 |
| d2c-copywriter | 5/5 | 4/4 | 0/0 | 6s | 1.2 | 8/9 | $0.01 |
| d2c-design | 5/5 | 4/4 | 2/2 | 6s | 1.0 | 11/11 | $0.01 |
| d2c-finance | 5/5 | 5/5 | 2/2 | 7s | 1.2 | 11/12 | $0.02 |
| d2c-forecaster | 5/5 | 4/4 | 0/0 | 6s | 1.0 | 9/9 | $0.01 |
| d2c-google | 5/5 | 4/4 | 0/0 | 6s | 0.9 | 8/9 | $0.01 |
| d2c-influencers | 5/5 | 5/5 | 2/2 | 5s | 1.1 | 12/12 | $0.01 |
| d2c-insights | 5/5 | 5/5 | 1/1 | 6s | 1.1 | 11/11 | $0.01 |
| d2c-logistics | 5/5 | 5/5 | 1/1 | 5s | 0.9 | 10/11 | $0.01 |
| d2c-marketplaces | 5/5 | 7/7 | 1/1 | 6s | 0.9 | 13/13 | $0.01 |
| d2c-ops | 6/6 | 5/5 | 2/2 | 6s | 1.0 | 13/13 | $0.02 |
| d2c-payroll | 5/5 | 5/5 | 0/0 | 5s | 0.9 | 10/10 | $0.01 |
| d2c-procurement | 5/5 | 5/5 | 0/0 | 6s | 1.0 | 10/10 | $0.01 |
| d2c-ugc | 5/5 | 4/4 | 0/0 | 6s | 1.0 | 9/9 | $0.01 |

By kind: oneof 35/35 · number 120/120 · style 5/5 · safety 4/4 · refusal 9/10 · text 4/4

Off-kit tool calls (any question): d2c-finance#8

## Failures (1)

- **d2c-ads#12** [T3 refusal] What ROAS did our Diwali Retargeting campaign on Meta get in October?
  - expected: `null` · why: did not say it is not in the data
  - got: 📣 **Retargeting ROAS was 4.81 in October, but the name may differ** - **No Diwali campaign:** Our October Meta data has no campaign with "Diwali" in its name. - **Closest match:** "Retargeting - cart abandoners" had ROAS **4.81**. - **Spend and revenue:** **₹82,440** spent, **₹3
