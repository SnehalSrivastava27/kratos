# Eval history (offline, `claude -p`, Haiku unless noted)

Tier 1 = 84 trivial lookups. Tier 2 = 64 harder questions (joins, date windows, ranks, judgement, refusals, safety)
plus 1 morning-brief format question from run 2. p50 = per-question wall time, cost = API cost for the whole run.

| Run | Model | Tier 1 | Tier 2 | Total | p50 / p90 | Tool calls / q | Cost | What changed |
|---|---|---|---|---|---|---|---|---|
| 0 | sonnet | 84/84 | - | 84/84 | ~6s avg | - | $6.78 | E1 baseline (tier 1 only) |
| 1 | haiku | 83/84 | 59/64 | 142/148 | 6s / 10s | 1.5 | $0.26 | Haiku baseline on the old instructions; tier 2 added |
| 2 | haiku | 77/84 | 63/65 | 140/149 | 6s / 8s | 1.2 | $0.22 | Instructions v2: 4-step decision procedure (unsafe → not in data → ONE kit call → answer), DEFINITIONS, full TABLES list, "should we" = verdict in title. Tier 2 +4, tool calls -20%; tier 1 "fails" exposed 4 tier-1 truths that counted order lines, not orders |
