# QA Lab evals — offline (haiku) — 2026-11-06T21:48:17.228Z

**Score: 16/17** (tier 1 0/0, tier 2 0/0, tier 3 16/17) · latency p50 7s, p90 9s · 1.4 tool calls/question · cost $0.02

| Agent | Tier 1 | Tier 2 | Tier 3 | p50 latency | Tool calls | Style ok (all replies) | Cost |
|---|---|---|---|---|---|---|---|
| d2c-ads | 0/0 | 0/0 | 2/2 | 7s | 1.5 | 2/2 | $0.00 |
| d2c-analyst | 0/0 | 0/0 | 2/2 | 5s | 1.0 | 2/2 | $0.00 |
| d2c-captain | 0/0 | 0/0 | 2/2 | 7s | 1.5 | 2/2 | $0.00 |
| d2c-design | 0/0 | 0/0 | 2/2 | 6s | 1.0 | 2/2 | $0.00 |
| d2c-finance | 0/0 | 0/0 | 2/2 | 7s | 2.0 | 2/2 | $0.00 |
| d2c-influencers | 0/0 | 0/0 | 1/2 | 7s | 1.5 | 2/2 | $0.00 |
| d2c-insights | 0/0 | 0/0 | 1/1 | 6s | 1.0 | 1/1 | $0.00 |
| d2c-logistics | 0/0 | 0/0 | 1/1 | 6s | 2.0 | 1/1 | $0.00 |
| d2c-marketplaces | 0/0 | 0/0 | 1/1 | 6s | 1.0 | 1/1 | $0.00 |
| d2c-ops | 0/0 | 0/0 | 2/2 | 6s | 1.5 | 2/2 | $0.00 |

By kind: number 12/12 · refusal 3/4 · oneof 1/1

## Failures (1)

- **d2c-influencers#11** [T3 refusal] How did the paid posts with @glowwithsara do for us in October?
  - expected: `null` · why: did not say it is not in the data
  - got: ⭐ **No October posts found for glowwithsara** - **Creator posts:** no rows for this handle in any month, paid or barter. - **Closest data:** creator_posts.csv has all our creator posts, but none match "glowwithsara" or any handle with "sara". - **Next step:** check the handle spe
