# Overnight build log (7 Nov 2026, ~01:45 → ~08:00 IST)

The founder went to sleep and left the orchestrator running. This file is the plan, the run log and the
findings list. It feeds the blog.

## Grant (from the founder)
- Live Switch + Telegram "Kratos D2C" is OK: create the 10 new agents, live QA Lab evals, one full live demo.
- Agents that run through Telegram use **Haiku** (cheaper).
- Merge `backend-v2` into `main` once CI and reviews pass.
- Focus: backend, evals, demo, dummy data, speed. Frontend only if clearly better. Document everything,
  draw Excalidraw diagrams, write down interesting findings. If stuck, pick a route, note it here, move on.

## Plan
| Wave | Task | Owner | Status |
|---|---|---|---|
| A | LV1: live bring-up: Haiku model for team agents, switch-up.sh (16 agents), topic tags, live QA Lab eval, live check of SW1/SW2/SW3 | agent LV1 | merged (live: 16 agents on Haiku); QA Lab live eval blocked: group not linked to an account |
| A | K3: fast answers: data marts + `kit metric` one-shot D2C metrics, cheat sheet for agents | agent K3 | merged |
| A | E2: harder eval tier (joins, date windows, refusals, multi-step), run on Haiku, fix agent instructions | agent E2 | running |
| A | SW4: survey every Switch 0.31.0 feature, build the best 2–3 (roles, schedules, approvals…) | agent SW4 | merged |
| A | DM1: demo feed with pinned plan, private nudge, catch-up beats; demo/script.md; README for v2 | agent DM1 | merged |
| B | Full live festive-sale demo in War Room (after LV1 + E2 fixes synced) | LV1 | |
| B | BL1: blog pack: every feature documented, new Excalidraw diagrams, findings | agent BL1 | |
| C | Final CI, adversarial review of anything unreviewed, merge to main, push | orchestrator | |

## Run log
| Time (IST) | What |
|---|---|
| 01:40 | SW1 (read_context), SW2 (room documents), SW3 (private nudge) merged into backend-v2; 62/62 server tests pass. |
| 01:50 | Wave A started: LV1 (live bring-up on Haiku), K3 (kit metric + marts), E2 (tier-2 evals on Haiku), DM1 (demo feed + README v2), SW4 (Switch feature survey + build). |
| 02:05 | SW4 done: Switch room roles (finance-approver, ops-oncall) + server-side 09:00 morning brief; survey of ~40 Switch features in docs/switch/12. Adversarial review started; instruction patches routed to E2. |
| 02:15 | DM1 merged: demo now shows Finance's private nudge (violet pulse, hidden from chat) and the plan + sign-off pinned in Switch; 48-event feed validates; video script in demo/script.md; README rewritten for v2. Landing now hides private notes. |
| 02:30 | LV1 merged: all 16 team agents live in Switch on claude-haiku-5-5 (Switch passes definition.model to `claude --model`); office server + observer restarted on backend-v2. Haiku offline check 32/32 (p50 12 s). Live QA Lab blocked: no account has linked the group yet (needs the founder: signup → /connect → send code). SW4 review: no blockers, 5 low fixes sent back. |
| 02:45 | SW4 merged after fixes (atomic brief marker, agent-only role notices, roles never re-created after a human deletes them); 69/69 server tests. BL1 blog pack started. |
| 03:00 | K3 merged: `kit metric` (50 named D2C metrics with definitions + the SQL that ran), `kit brief <dept>`, cached read-only marts; p50 kit sql 199 → ~65 ms, metric 61 ms; 27/27 kit tests. E2 told to move agents onto kit metric. |

## Findings for the blog
- `send_targeted_message` in Switch 0.31.0 is **not private**: it prefixes `@name` and posts through the
  normal path, so it reaches Telegram. Real privacy needs an `internal_only` room (no bridge). (SW3)
- Switch has no room-document event on the agent stream; it posts a normal message
  "📄 created room document “X”." from the agent instead. The office parses that line. (SW2)
- A new Switch agent connection starts at its newest event, so a message sent before the agent is "live"
  is never delivered. The office waits for `rooms[].status == "live"` before the kickoff. (SW1)
- Every Switch operation is also an MCP tool `mcp__switch__<op>` inside a managed Claude Code session. (SW1/SW2)
- At 84/84 on trivial questions, evals stop separating good instructions from great ones; the signal is in
  harder questions (joins, date windows, refusals). (E1)
- pptxgenjs wrote "Kesar & Co." into deck metadata without escaping `&`, which corrupted every deck. (K2)
- Switch 0.31.0 has **no scheduler, cron or triggers**; recurring work (the 09:00 morning brief) has to come from outside, here the office server posting through Switch. (SW4)
- Switch **room roles** route by mention: `@finance-approver` reaches whoever holds the role right now; roles are released shortly after the holder's session disconnects. (SW4)
- Switch **approval cards** (Telegram buttons) exist, but the agent that opens one must hold a live connection or the card shows "Host offline". (SW4)
- Switch passes a managed agent's `definition.model` straight to `claude --model`, so one field moves the whole team to Haiku. (LV1)
- On Haiku, answers stayed right (32/32) but the most common style slip was dropping the italic "Next" last line (9/32). (LV1)
- The permission layer refused to link the founder's real Telegram group to a stand-in test account: linking is a human step by design. (LV1)
- Kesar's unit economics are healthy (CM1 72%, CM2 57%, CM3 37% of net revenue) but EBITDA is −5.5%: salaries + opex eat ~43% of revenue. Fixed costs, not margins, are the problem. (K3)
- Attribution undercounts: platform + creator revenue explains only ~56% of net revenue (blended ROAS 7.09x vs platform 2.98x). (K3)
- Creator ROAS fell every month (2.95x → 2.72x → 1.88x), and Flipkart, not the website, has the worst quarterly RTO (10.0%). (K3)
- CM1/CM2/CM3 are not standardised across Indian D2C sources; we documented our split with citations in switch/METRICS.md. (K3)
