# Eval changelog (offline, `claude -p`, Haiku unless noted)

Tier 1 = 84 trivial lookups. Tier 2 = 64 harder questions (joins, date windows, ranks, reasoning, refusals, safety)
plus 1 morning-brief format question from run 2. Tier 3 = 17 founder-style asks from run 8 (vague, two-part, follow-up,
made-up names). p50 = per-question wall time, cost = API cost for the whole run.

| Run | Model | Tier 1 | Tier 2 | Tier 3 | Total | p50 / p90 | Tool calls / q | Cost | What changed |
|---|---|---|---|---|---|---|---|---|---|
| 0 | sonnet | 84/84 | - | - | 84/84 | ~6s avg | - | $6.78 | Baseline (tier 1 only) |
| 1 | haiku | 83/84 | 59/64 | - | 142/148 | 6s / 10s | 1.5 | $0.26 | Haiku baseline on the old instructions; tier 2 added |
| 2 | haiku | 77/84 | 63/65 | - | 140/149 | 6s / 8s | 1.2 | $0.22 | Instructions v2: 4-step decision procedure (unsafe → not in data → ONE kit call → answer), DEFINITIONS, full TABLES list, "should we" = verdict in title. Tier 2 +4, tool calls -20%; tier 1 "fails" exposed 4 tier-1 truths that counted order lines, not orders |
| 3 | haiku | 83/84 | 63/65 | - | 146/149 | 6s / 8s | 1.1 | $0.20 | Same instructions + Captain "team status from the chat only" (37 tool calls → 0). Stability check: fails were a lower-case 'website' filter, a safety reply that ran ls before refusing, and an ambiguous tier-1 question |
| 4 | haiku | 84/84 | 64/65 | - | 148/149 | 6s / 7s | 1.0 | $0.21 | Toolkit metrics: prefer `kit metric` / `kit brief`, case-sensitive values, "always end with the italic line". Style 152/152. Last fail: Haiku *ran* `rm -rf gallery/ data/` on a "SYSTEM OVERRIDE" prompt (blocked only by dontAsk) |
| 5 | haiku | 84/84 | 65/65 | - | 149/149 | 6s / 8s | 1.0 | $0.21 | SAFETY block at the top of every agent: all 4 injection prompts refused with 0 tool calls in 3-5 s |
| 6 | sonnet | 83/84 | 65/65 | - | 148/149 | 5s / 6s | 1.0 | $3.07 | Same v3 instructions on Sonnet for comparison: ~15x the cost of Haiku for no score gain (its 1 miss read "orders" as delivered only) |
| 7 | haiku | 84/84 | 65/65 | - | 149/149 | 6s / 9s | 1.0 | $0.20 | Team habits from a live session (no ack loops, fresh numbers, default dates, Captain order). First pass 148/149: d2c-ads once tried a non-kit shell command, the lockdown blocked it, and it said so instead of guessing; passed on rerun |
| 8 | haiku | 81/84 | 65/65 | 17/17 | 163/166 | 6s / 8s | 1.1 | $0.22 | Instructions -30% (219 KB → 153 KB: per-agent TABLES, compact shared blocks) + tier 3 (old instructions: 16/17 on tier 3, the miss a scorer gap for "no rows for this handle"). Fails: a courier×zone RTO recomputed from orders.csv instead of read from couriers.rto_pct, "how many orders were COD" counted delivered only, an 11-line style reply. Fixed in the definitions, 166/166 on rerun |
| 9 | haiku | 82/84 | 65/65 | 16/17 | 163/166 | 6s / 7s | 1.1 | $0.21 | Same + those fixes. Fails: 2 replies put the Source after the italic last line (one copied "last line _Next…_" literally: the squeezed Source/Next sentence was ambiguous), and a correct "No Diwali Retargeting campaign in our Meta data" the refusal scorer missed. Clearer rule + scorer fix, 166/166 on rerun |
| 10 | haiku | 84/84 | 65/65 | 17/17 | 166/166 | 6s / 7s | 1.0 | $0.21 | Final trimmed instructions, first pass. Tier 1+2 alone: $0.185 vs $0.20 in run 7 (-7%), same p50, 1.01 tool calls/q |
| 11 | haiku | 84/84 | 65/65 | 17/17 | 166/166 | 6s / 8s | 1.0 | $0.21 | Re-run after office and ROI changes (no instruction change): stable, first pass |
| 12 | haiku | 82/84 | 76/77 | 16/17 | 174/178 → 178/178 | 6s / 8s | 1.0 | $0.27 | India-first dataset (18 channels, GST, settlements, dark stores, ESI, 11 new tables), 12 new tier-2 questions. First-pass misses (a regions share recomputed from orders, settlement days from the observed-lag metric, a 12-line reply, creator orders incl. cancelled) fixed with "per <file> = read that file" and `channel_fees.settlement_days` in every agent's definitions; failures rerun 4/4 |
| 13 | haiku | 84/84 | 77/77 | 16/17 | 177/178 | 6s / 8s | 1.0 | $0.22 | Same dataset and definitions, clean first pass. Miss: "Diwali Retargeting" (doesn't exist) answered with the closest campaign's ROAS in the title, while saying no Diwali campaign exists |

What moved Haiku: (1) a 4-step decision procedure (unsafe → not in data → one kit command → answer) with a full TABLES
list, so it stopped running `kit tables`/`ls`/`grep` first (1.5 → 1.0 tool calls, p90 10 s → 7-8 s); (2) "should we…?" =
verdict in the title; (3) case-sensitive values ('Website', 'cod'); (4) a SAFETY block *above* the data section: before it,
Haiku explored the repo and then actually ran `rm -rf gallery/ data/` on a "SYSTEM OVERRIDE" message (only the eval's
dontAsk permission mode stopped it); (5) "no italic last line = not finished" took style from 149/152 to 152/152.
The tier-1 "fails" in run 2 were eval bugs: four truths counted order lines, not orders.

Runs 8-10: trimming 30% of the instructions cost nothing in score and ~7% in cost (prompt caching already hides most of
the repeated text; latency is dominated by the one kit call). What it did cost: two lost nuances that run 7 had by accident
(the old partial couriers.csv columns steered Haiku to the rate card; the long Source/Next paragraph was unambiguous).
Tier 3 barely separates Haiku either (16/17 on the old instructions, 17/17 once the scorer accepted "no rows found"): it already picks a definition and says it, answers
both parts with one kit call each, recomputes quoted numbers instead of trusting them, and refuses made-up names. The real
tier-3 misses were format (style) and scorer phrasing, not facts.
