> LV1, 7 Nov 02:05 IST. **Not the live path:** the live QA Lab run (`--live`) needs a linked workspace, and linking "Kratos D2C" to a stand-in account was refused by the permission system (it would bind the founder's group to a test account). So this is the same 16 agents' instructions on the same model the live agents now use (`claude -p --model haiku` = claude-haiku-5-5), 2 questions each, from a checkout with kit deps. Latency here is the model + tools only, without the Switch/Telegram hop. First pass was 31/32: d2c-forecaster#2 failed only because kit/node_modules was missing in the worktree (rerun: pass, 28s → 8s).

# QA Lab evals — offline (haiku) — 2026-11-06T20:33:04.322Z

**Score: 32/32** · cost $0.22

| Agent | Pass | Avg latency | Style ok (all replies) | Cost |
|---|---|---|---|---|
| d2c-ads | 2/2 | 11s | 2/2 | $0.01 |
| d2c-analyst | 2/2 | 18s | 0/2 | $0.01 |
| d2c-captain | 2/2 | 7s | 2/2 | $0.01 |
| d2c-copywriter | 2/2 | 8s | 0/2 | $0.01 |
| d2c-design | 2/2 | 8s | 2/2 | $0.01 |
| d2c-finance | 2/2 | 8s | 2/2 | $0.01 |
| d2c-forecaster | 2/2 | 19s | 2/2 | $0.02 |
| d2c-google | 2/2 | 32s | 1/2 | $0.03 |
| d2c-influencers | 2/2 | 9s | 0/2 | $0.01 |
| d2c-insights | 2/2 | 18s | 1/2 | $0.02 |
| d2c-logistics | 2/2 | 13s | 2/2 | $0.01 |
| d2c-marketplaces | 2/2 | 9s | 1/2 | $0.01 |
| d2c-ops | 2/2 | 11s | 2/2 | $0.01 |
| d2c-payroll | 2/2 | 17s | 2/2 | $0.02 |
| d2c-procurement | 2/2 | 12s | 2/2 | $0.01 |
| d2c-ugc | 2/2 | 16s | 2/2 | $0.02 |

## Failures (0)

