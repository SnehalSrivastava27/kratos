# How the build is orchestrated

Several coding agents build D2C Agent HQ **at the same time**, each in its own git worktree and
branch, coordinated by one **lead orchestrator** session and one **human**.

```
                    ┌──────────────────────────────┐
                    │  HUMAN (you)                 │
                    │  Switch + Telegram setup,    │
                    │  protocol notes, final calls │
                    └──────────────┬───────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │  LEAD ORCHESTRATOR (agent)   │
                    │  status · nudge · contracts  │
                    │  review · merge · waves      │
                    └──────────────┬───────────────┘
        ┌──────────┬──────────┬────┴─────┬──────────┬──────────┐
     ┌──▼──┐   ┌───▼──┐   ┌───▼──┐   ┌───▼──┐   ┌───▼──┐   ┌───▼──┐
     │ T1  │   │ T2   │   │ T3   │   │ T4   │   │ T5   │   │ T7   │   Wave 1
     │data │   │feed  │   │3D    │   │land- │   │server│   │docs  │
     │agent│   │      │   │office│   │ing   │   │      │   │      │
     └─────┘   └──────┘   └──────┘   └──────┘   └──────┘   └──────┘
                          ┌──────┐   ┌──────┐
                          │ T6   │   │ T8   │                         Wave 2
                          │obser-│   │integ-│
                          │ver   │   │ration│
                          └──────┘   └──────┘
```

## Why this works in parallel
- **Contracts first.** `contracts/` (roster, zones, event schema, sample feed, API) was written
  before any worker starts. Everyone builds against the same shapes, so pieces fit at merge time.
- **Strict ownership.** Each task owns its own folders (see each brief). No two agents edit the same file.
- **Mocks everywhere.** The office and landing page run on `contracts/sample-feed.json`, so they
  never wait for Switch, Telegram or the server.
- **Status files.** Each worker reports in `status/<id>.json`; the orchestrator reads them all.

## Waves
| Wave | Tasks | Depends on |
|---|---|---|
| 0 | Contracts + web shell + briefs | done (this repo) |
| 1 | T1 data/agents · T2 feed · T3 3D office · T4 landing · T5 server · T7 docs | contracts only |
| HUMAN | Switch + Telegram + protocol notes (`tasks/HUMAN.md`) | runs alongside wave 1 |
| 2 | T6 observer · T8 integration | wave 1 merged + protocol notes |
| 3 | Polish, video, submit | everything |

## Commands
```bash
./orchestrator/orchestrate.sh init         # once: commit scaffold, create worktrees
./orchestrator/orchestrate.sh launch 1     # start wave 1 (6 agents)
./orchestrator/orchestrate.sh status       # the board
./orchestrator/orchestrate.sh logs T3
./orchestrator/orchestrate.sh nudge T3 "use instancing for the boxes"
./orchestrator/orchestrate.sh merge 1
./orchestrator/orchestrate.sh launch 2
```
Use another CLI with `AGENT_CMD='codex exec --full-auto' ./orchestrator/orchestrate.sh launch 1`
(check your CLI's `--help` for its headless flags). Mixing is fine: launch tasks one at a time with
different `AGENT_CMD` values.

## Cost and machine tips
- Six agents at once burns usage fast. If you hit limits, run wave 1 as two batches:
  T3 + T4 + T5 first (longest), then T1 + T2 + T7.
- Each worktree gets its own `node_modules`. Run `npm install` per worktree that needs it.

## Run log
| Time (IST) | Decision |
|---|---|
| | |
