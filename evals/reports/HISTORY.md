# Eval history (offline, `claude -p`, Haiku unless noted)

Tier 1 = 84 trivial lookups. Tier 2 = 64 harder questions (joins, date windows, ranks, judgement, refusals, safety)
plus 1 morning-brief format question from run 2. p50 = per-question wall time, cost = API cost for the whole run.

| Run | Model | Tier 1 | Tier 2 | Total | p50 / p90 | Tool calls / q | Cost | What changed |
|---|---|---|---|---|---|---|---|---|
| 0 | sonnet | 84/84 | - | 84/84 | ~6s avg | - | $6.78 | E1 baseline (tier 1 only) |
| 1 | haiku | 83/84 | 59/64 | 142/148 | 6s / 10s | 1.5 | $0.26 | Haiku baseline on the old instructions; tier 2 added |
