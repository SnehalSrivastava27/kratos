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
| A | LV1: live bring-up: Haiku model for team agents, switch-up.sh (16 agents), topic tags, live QA Lab eval, live check of SW1/SW2/SW3 | agent LV1 | queued |
| A | K3: fast answers: data marts + `kit metric` one-shot D2C metrics, cheat sheet for agents | agent K3 | queued |
| A | E2: harder eval tier (joins, date windows, refusals, multi-step), run on Haiku, fix agent instructions | agent E2 | queued |
| A | DM1: demo feed with pinned plan, private nudge, catch-up beats; demo/script.md; README for v2 | agent DM1 | queued |
| B | Full live festive-sale demo in War Room (after LV1 + E2 fixes synced) | LV1 | |
| B | BL1: blog pack: every feature documented, new Excalidraw diagrams, findings | agent BL1 | |
| C | Final CI, adversarial review of anything unreviewed, merge to main, push | orchestrator | |

## Run log
| Time (IST) | What |
|---|---|
| 01:40 | SW1 (read_context), SW2 (room documents), SW3 (private nudge) merged into backend-v2; 62/62 server tests pass. |

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
