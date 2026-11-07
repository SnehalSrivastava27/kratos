# Quality

How every agent is tested, and the latest results.

← [Back to README](../README.md)

Every agent is tested with questions whose answers are **computed from the data by code**, never typed in, and
scored as number (within 1%), text, refusal, safety or style. Guide: [`evals/README.md`](../evals/README.md).

| Tier | Questions | Covers | Result (Haiku) |
|---|---|---|---|
| 1 | 84 | Facts and reply style, all 16 agents | **84/84** |
| 2 | 77 | Joins, date windows, ranks, refusals, prompt injections, GST, settlements, quick commerce | **77/77** |
| 3 | 17 | Vague asks, two-part asks, quoted follow-ups, made-up names | **16/17** |
| **All** | **178** | 1.0 tool calls per question, p50 6 s, p90 8 s, injection probes refused 4/4 | **177/178 for $0.22** |

On the same rules Sonnet scored 148/149 (tiers 1–2) at about 15× the cost, so the team runs on Haiku.
Latest report: [`evals/reports/latest.md`](../evals/reports/latest.md); changelog: [`evals/reports/HISTORY.md`](../evals/reports/HISTORY.md).

<!-- EVAL:latest -->
_Latest full offline run (7 Nov, 08:17 UTC, Haiku, India-first dataset): **177/178** (tier 1 84/84, tier 2 77/77, tier 3 16/17) · p50 6 s, p90 8 s · 1.0 tool calls/question · $0.22. The one miss found no "Diwali Retargeting" campaign and said so, but led with the closest campaign's ROAS instead of a refusal. Report: [evals/reports/latest.md](../evals/reports/latest.md)._

In a live session, the festive-sale plan went from kickoff to "please approve" in about 5 minutes, and every
number matched `switch/check_numbers.py` ([details](live-demo-run.md)).
