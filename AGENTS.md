# Rules for every coding agent on this repo

You are one of several agents building **D2C Agent HQ** in parallel. Each agent has ONE task
brief in `tasks/`. Read it fully, plus `docs/PLAN.md` sections it points to, before writing code.

## 1. Stay in your lane
- Only create or edit files under the paths your brief says you **own**.
- `contracts/` is **read-only** for workers. Build against it exactly.
- Need a contract change? Don't make it. Add it to `contract_requests` in your status file
  and work around it (mock it locally).

## 2. Report status
Keep `status/<TASK_ID>.json` updated at every milestone:
```json
{ "task": "T3", "state": "working", "progress": 40,
  "done": ["grey-box floor"], "next": "agent walking",
  "blockers": [], "contract_requests": [], "updated": "2026-11-06T18:20:00+05:30" }
```
`state` is one of: `queued`, `working`, `blocked`, `done`.

## 3. Commit small and often
- Commit messages start with your task id: `[T3] add zone meshes`.
- Never rewrite history. Never commit secrets (`.env` is gitignored).

## 4. Definition of done
- Every box in your brief's **Acceptance** list is true.
- `npm run build` (or the brief's check command) passes for your package.
- Status file says `"state": "done"` with a 3-line summary in `done`.

## 5. Style
- TypeScript for web and server. Small files. No new global installs.
- Copy shared types from `web/src/shared/types.ts` (generated from contracts by the orchestrator).
- Prefer working and simple over clever. The deadline is 7 Nov 2026, 9 PM IST.

## 6. Validation gate (orchestrator, before every merge)
Workflow per task: research → plan → implement → **validate**.
- UI work: screenshot at 1440 and 390, critique against the references
  (perplexity.ai/hub/products/teammate, gobblecube.ai), fix, repeat until it holds up.
- Every branch: a fresh subagent does an adversarial review of `git diff main...task/<id>`
  against the brief's intent and Acceptance list. Findings are fixed (or consciously waived
  in docs/ORCHESTRATION.md "Run log") before merge.
