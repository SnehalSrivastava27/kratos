# Kratos: every feature

One section per feature: what it does, how to use it, the files, and the Switch feature behind it.
"Switch: none" means the feature is ours alone. Doc numbers point at [`docs/switch/`](../switch/README.md).

Contents: [Team](#1-the-16-agent-team) · [Finance gate](#2-the-finance-gate) ·
[Private nudge](#3-finances-private-nudge) · [Pinned plan](#4-the-pinned-plan-room-documents) ·
[Telegram style](#5-the-telegram-style) · [Topics](#6-one-group-a-topic-per-department) ·
[Bring-up and sync](#7-bring-up-and-sync-scripts) · [Haiku](#8-the-team-on-haiku) ·
[Observer](#9-the-observer) · [Commands](#10-orders-from-the-office) · [Hiring](#11-hiring-from-the-office) ·
[Catch-up](#12-new-hires-catch-up) · [Roles](#13-room-roles) · [Morning brief](#14-the-morning-brief) ·
[Accounts](#15-accounts-and-linked-groups) · [3D office](#16-the-3d-office) · [Switch hub](#17-the-switch-hub-in-the-office) ·
[Demo replay](#18-the-demo-replay) · [Skills library](#19-the-skills-library-and-librarian) · [Toolkit](#20-the-toolkit-kit) ·
[Data](#21-the-data) · [Evals](#22-qa-lab-evals) · [KPIs](#23-the-data-wall-kpis) · [Landing](#24-the-landing-page) ·
[Security](#25-server-and-security) · [Build swarm](#26-the-build-swarm) · [Lockdown](#27-the-agent-lockdown)

---

## 1. The 16-agent team

**What it does.** A Sale Captain, 6 department leads and 9 specialists for Kesar & Co. The Captain
talks only to leads; a lead splits work to its specialists by `@name` in its topic, merges the
replies and sends one report to the Captain in War Room.

**How to use it.** In the War Room topic: `@d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget`.
Ask any agent a direct question in its topic, e.g. `@d2c-logistics Which courier has the worst RTO?`

**Files.** `contracts/roster.json` (who, topic, reports_to) · `switch/agents/<id>.md` (one rules file per agent) ·
`scripts/build-template.mjs` → `switch/d2c-team.template.yaml` (generated; `--check` in CI).

**Switch.** Agent templates (YAML), managed agents, addressing policy `anyone`, Claude Code as the provider. [03](../switch/03-agents-and-templates.md)

![Org chart](../diagrams/org-chart.png)

## 2. The Finance gate

**What it does.** Before the founder is asked to approve, the Captain asks Finance to check the plan:
marketing = ads + creators + creative; EBITDA from the Analyst's forecast; every rule in
`data/finance_policy.json`. Finance approves, or pushes back by name with the exact rupees to cut.

**How to use it.** Nothing to do: it is part of every plan. To see a pushback, ask for a plan whose
creator spend breaks the cap (the demo's first creator draft is ₹3.55L against ₹1.5L).

**Files.** `switch/agents/d2c-finance.md` (YOUR JOB, the gate) · `switch/agents/d2c-captain.md` ·
`data/budget.json`, `data/finance_policy.json` · `switch/check_numbers.py` (prints EBITDA +₹1.29L at the full ₹5L).

**Switch.** Addressing by `@name`; room roles (`@finance-approver`).

![Finance gate](../diagrams/finance-gate.png)

## 3. Finance's private nudge

**What it does.** Finance first tells the lead privately ("Creators at ₹3.55L, cap ₹1.5L: cut ₹2.05L"),
waits one turn for the lead's revised numbers, then posts its verdict in War Room. The nudge never
reaches Telegram. The office shows it as a violet pulse and lists it in the Switch panel.

**How to use it.** Automatic. Watch the Switch panel in the office for "🔒 private note via Switch".

**Files.** `switch/agents/d2c-finance.md` (PRIVATE NUDGE FIRST) · `switch/agents/d2c-influencers.md` and the
other leads (IF FINANCE NUDGES YOU PRIVATELY) · `observer/src/index.ts:160-246` (desk messages → `meta.private`).

**Switch.** `create_room(internal_only: true)`, `connect_to_room`, `send_targeted_message`.
`send_targeted_message` alone is **not** private: it posts to Telegram. [04](../switch/04-agent-protocol.md#targeted-messages-and-finances-private-nudge)

## 4. The pinned plan (room documents)

**What it does.** On Finance's approval the Captain pins "Festive sale plan — v1" as a Switch room
document (v2 on a revision) and attaches the deck and forecast as references. Finance reads that
pinned copy before it checks, and pins "Finance sign-off". The office lists both under "Pinned in Switch".

**How to use it.** In Telegram: `!list-documents`. In the office: click the Switch core or chip.
API: `GET /api/documents`.

**Files.** `switch/agents/d2c-captain.md` (PIN THE PLAN) · `switch/agents/d2c-finance.md` (THE PINNED PLAN) ·
`observer/src/index.ts:149-158` (`switchDocument` parser) · `server/test/documents.test.mjs`.

**Switch.** `create_room_document`, `update_room_document`, `load_internal_documents`, `list_references`,
`create_reference`, `attach_reference_to_room` (a `kratos_file` reference type). [11](../switch/11-room-documents.md)

## 5. The Telegram style

**What it does.** Every reply reads the same on a phone: emoji + **bold title**, short bullets with bold
numbers, money in lakhs (rupees under ₹1 lakh), one **_bold italic_** key line, an italic `Next: @name` line.
No tables, no headings, under 10 lines.

**How to use it.** Preview any reply exactly as Telegram will show it: `python3 scripts/tg-render.py`.

**Files.** `switch/TELEGRAM_STYLE.md` (copied verbatim into every agent's rules, drift-tested) ·
`scripts/tg-render.py` (a dry run of Switch 0.31.0's `_render_outbound`).

**Switch.** The Telegram bridge's Markdown → Telegram HTML conversion and 4,096-character split. [02](../switch/02-telegram-bridge.md)

## 6. One group, a topic per department

**What it does.** One forum supergroup, "Kratos D2C", with 8 topics: War Room, Analytics, Ads, Creators,
Ops, Design, Finance, QA Lab. Agents reply in the topic that addressed them and post their own work
in their department topic.

**How to use it.** The server creates the topics when you link a group. Send `/list_agents` once in a
topic so Switch learns it as a thread.

**Files.** `server/src/workspaces.ts` (topic creation, thread learning) · `observer/topics.json` (per install, gitignored).

**Switch.** One room per chat, forum topics as threads, `/list_agents`. [05](../switch/05-rooms-topics-and-threads.md)

## 7. Bring-up and sync scripts

**What it does.** `switch-up.sh` connects the bot, stores the team template, creates any of the 16 agents
that are missing, registers the observer and starts the office server and observer. Safe to rerun; it
ends with a "Left for you" list of phone steps. `switch-sync-agents.sh` pushes rule changes into the live
agents and waits for each controller to apply the new revision.

**How to use it.** `scripts/switch-up.sh` (`DRY_RUN=1` to preview) · after editing `switch/agents/*.md`:
`node scripts/build-template.mjs && scripts/switch-sync-agents.sh`.

**Files.** `scripts/switch-up.sh` · `scripts/switch-sync-agents.sh` · `docs/GO_LIVE.md`.

**Switch.** Gateway admin API: bridges, templates, `POST /gateway/management/agents`, `PATCH` definitions,
`applied_revision`. [01](../switch/01-console-and-local-server.md), [03](../switch/03-agents-and-templates.md)

## 8. The team on Haiku

**What it does.** Every Telegram-facing agent runs on `claude-haiku-5-5` to keep replies cheap.

**How to use it.** `TEAM_MODEL=<model> scripts/switch-sync-agents.sh` moves the whole team.

**Files.** `scripts/switch-up.sh:24` · `scripts/switch-sync-agents.sh:21` · `switch/d2c-team.template.yaml` (`model:`).

**Switch.** A managed agent's `definition.model` is passed straight to `claude --model`.

## 9. The observer

**What it does.** A silent Switch agent that sees every message in every room and forwards it to the
office server, tagged with room, topic, speaker, private notes, documents, roles and catch-ups.

**How to use it.** Started by `switch-up.sh` (one process, pid file). `npm run mock` in `observer/` tests it
without Switch.

**Files.** `observer/src/index.ts` (stream at `:272`, heartbeat at `:219`) · `observer/src/docs.test.ts`.

**Switch.** Agent protocol: register, SSE event stream with `scope=all&filter=all`, heartbeat, passive agent
(`channels_enabled: false`). [04](../switch/04-agent-protocol.md), [07](../switch/07-observer-and-live-office.md)

![Agent protocol](../diagrams/agent-protocol.png)

## 10. Orders from the office

**What it does.** The founder types in the office command bar (⌘K); the message is posted into the
founder's Telegram topic by our `d2c-office` agent. If it names nobody, the topic's lead is added.

**How to use it.** ⌘K in `/app`, or "Assign task" on an agent's card.

**Files.** `server/src/office.ts` (`/api/command`) · `server/src/switch.ts` (`postAsOffice`) · `web/src/office/CommandBar.tsx`.

**Switch.** Agent protocol `post_message` with a `thread_id`.

## 11. Hiring from the office

**What it does.** Walk to an empty desk, press E, fill in name, department and "reports to". A real
Switch agent is created with the team's settings and the Telegram style, joins the group and appears
at that desk. At most 24 people, 3 hires per 10 minutes.

**How to use it.** `/app` → empty desk → E. Remove with `DELETE /api/employees/:id`.

**Files.** `server/src/office.ts` · `server/src/switch.ts` (`createManagedAgent`, `waitLive`) · `web/src/office/HireDialog.tsx`.

**Switch.** Management API (`POST /gateway/management/agents`), Console's controller, agent status. [06](../switch/06-hiring-agents-from-the-office.md)

![Hiring flow](../diagrams/hiring-flow.png)

## 12. New hires catch up

**What it does.** A new hire's first turn reads the last 100 messages of the room and posts one
"Caught up on the sale plan" message before it takes any work. The server sends the kickoff only once
Switch reports the hire `live`, because a message sent earlier would never reach it.

**How to use it.** Automatic on every hire.

**Files.** `server/src/office.ts:88-115` (`catchUpBlock`, `KICKOFF_WAIT_MS`) · `server/src/switch.ts:266` (`waitLive`) · `server/test/office.test.mjs`.

**Switch.** `read_context` (`mcp__switch__read_context`), `rooms[].status == "live"`. [06](../switch/06-hiring-agents-from-the-office.md#joining-already-briefed-read_context)

## 13. Room roles

**What it does.** Two Switch room roles, `finance-approver` (held by d2c-finance) and `ops-oncall`
(held by d2c-ops), defined for every linked group. `@finance-approver` reaches whoever holds the seat.

**How to use it.** In the group: `!roles` shows the holders. Write `@ops-oncall` for a stock or courier problem.

**Files.** `server/src/roles.ts` · `server/test/sw4.test.mjs` · observer tags "🎭 assumed the `x` role." as `meta.switch_role`.

**Switch.** `define_role`, `assume_role`, `list_roles`; role-mention delivery. `docs/switch/12-feature-survey.md`


## 14. The morning brief

**What it does.** At 09:00 IST the office server asks the Captain, through Switch, for a morning brief:
orders and revenue vs the day before, SKUs under 7 days of stock, ad spend and ROAS, and one decision
for the founder. Once per workspace per day.

**How to use it.** Automatic; `MORNING_BRIEF_AT` to change the time, `MORNING_BRIEF=off` to disable,
`POST /api/brief?ws=<id>` to ask now.

**Files.** `server/src/brief.ts` · `switch/agents/d2c-captain.md` (MORNING BRIEF).

**Switch.** None for the clock: Switch 0.31.0 has no scheduler. The brief itself is `post_message` + addressing.


## 15. Accounts and linked groups

**What it does.** Sign up with email and password, then link your own Telegram group by sending a
6-digit code in it. The server checks the group is a forum and the bot is an admin, creates the topics
and adds the agents. Your chats and office are private to your workspace.

**How to use it.** `/signup` → `/connect` → send the code in the group.

**Files.** `server/src/auth.ts` (scrypt, hashed sessions) · `server/src/workspaces.ts` · `web/src/auth/` · `contracts/api.md`.

**Switch.** Gateway rooms and agents; the observer forwards `switch_room_id` and `chat_id` so the server can
link by id. [08](../switch/08-accounts-and-workspaces.md)

![Workspace linking](../diagrams/workspace-linking.png)

## 16. The 3D office

**What it does.** A 44 × 22 m toon-shaded office: three rows of pods, a west wing with the Library,
Finance cabin and open desks. Every message makes someone walk, type or talk. You walk it as the founder.

**How to use it.** `/app` (live) or `/demo`. WASD or click to walk, Shift to sprint, E to use what you face,
the eye button for the spectator view.

**Files.** `web/src/office/` (`Office.tsx`, `engine/`, `officeState.ts`) · `contracts/zones.json` · checks:
`officeState.check.mjs`, `nav.check` (all 21 desks reachable).

**Switch.** None directly: it reads Switch through the observer and the office server.

## 17. The Switch hub in the office

**What it does.** A Switch core sits behind the Telegram wall, with cables to every desk. Each event
sends a pulse Telegram → Switch → desk (violet for private notes). Click it for counters, the last
routed hops and the documents pinned in Switch.

**Files.** `web/src/office/SwitchPanel.tsx`, `switch.css`, `engine/`.

**Switch.** Visualises routing, private rooms and room documents.

## 18. The demo replay

**What it does.** `/demo` plays the recorded festive sale (48 events) with no Switch or Telegram, pauses at
the approval and waits for you. "Ask for changes" plays a revision round.

**How to use it.** `npm run demo`, open `http://localhost:5173/demo`.

**Files.** `demo/feeds/sale-demo.json` · `demo/validate.mjs` (order, numbers, style) · `web/src/office/demoDirector.ts` · `demo/script.md`.

**Switch.** None (that is the point).

## 19. The skills library and librarian

**What it does.** Every installed Claude Code skill (316 here) is shelved by department in the office
library. A Claude Code "librarian" sorted them in 45.5 s, in batches of 40.

**How to use it.** Walk to the Library shelves, or `npm run librarian [--dry-run]`.

**Files.** `server/src/library/` · `librarian/` · `web/src/office/LibraryWindow.tsx`.

**Switch.** Skills available to Switch-run agents. [09](../switch/09-skills-library-and-librarian.md)

## 20. The toolkit (`kit`)

**What it does.** One CLI for agents: `metric` (50 named D2C metrics, each with its definition and the SQL
that ran), `brief <dept>` (a department's 6–10 numbers, month vs previous), `sql`, `tables`, `stats`,
`forecast`, `chart`, `deck`, `xlsx`, `docx`, `pdf`, `banner`. One JSON object out. Files land in
`gallery/live-run/` and come back as a link. CSVs and 17 marts are cached in a read-only SQLite file
(`data/.cache/kratos.db`, rebuilt when a CSV changes): a cold `kit sql` takes ~60 ms (was 199 ms).

**How to use it.** `node kit/bin/kit.mjs metric list` · `node kit/bin/kit.mjs metric rto_pct --channel Website --by payment` ·
`node kit/bin/kit.mjs brief finance` · `node kit/bin/kit.mjs help <command>` prints a working example · `node kit/bench.mjs` for timings.

**Files.** `kit/bin/kit.mjs` · `kit/lib/*.mjs` (`metrics.mjs`, `marts.mjs`, `data.mjs`) · `kit/test/` · guides:
`switch/TOOLKIT.md`, `switch/METRICS.md` (definitions and Indian D2C conventions).

**Switch.** None; agents run it through Claude Code's Bash tool (the offline evals allow only `Bash(node kit/bin/kit.mjs:*)`).

![Toolkit](../diagrams/toolkit.png)

## 21. The data

**What it does.** Three months of seeded, realistic Indian D2C data for Kesar & Co.: orders, customers,
returns, ads, creators, suppliers, POs, couriers, P&L, opex, payroll.

**How to use it.** `npm run data` rebuilds (byte-identical); `npm run data:check` runs 191 tie checks.

**Files.** `data/gen/generate.mjs` · `data/gen/check.mjs` · `data/README.md` (story numbers) ·
`contracts/data-catalog.md` · `docs/d2c-primer.md` (how Indian D2C works, with sources).

**Switch.** None.

## 22. QA Lab evals

**What it does.** Questions per agent with truths computed from `data/`, scored by number, text, one-of,
style, refusal and safety. Offline with `claude -p`, or live through Switch in the QA Lab topic.

**How to use it.** `npm run evals:truth` (no LLM) · `npm run evals -- --model haiku` · `--agent d2c-ops` ·
`--failed` · `--live`.

**Files.** `evals/questions.mjs` · `evals/run.mjs` · `evals/lib.mjs` · `evals/reports/latest.md` · `evals/reports/HISTORY.md`.

**Switch.** Live mode posts into the QA Lab topic through `d2c-office` and reads replies via the observer.

![Eval loop](../diagrams/eval-loop.png)

## 23. The Data Wall KPIs

**What it does.** The office Data Wall and the Finance ledger show last month's numbers from the data.

**Files.** `server/src/kpis.ts` (`GET /api/kpis`) · `web/src/office/KpiPanel.tsx` · `web/src/office/inr.ts`.

**Switch.** None.

## 24. The landing page

**What it does.** A light, Supercut-style page with the live office as the hero, a cycling Telegram
notification stack, the 7-person leadership and real channel logos. Private notes are hidden.

**Files.** `web/src/landing/` · `web/public/hero/` · `web/public/brand/`.

**Switch.** None.

## 25. Server and security

**What it does.** One Node process serves the site, `/api`, `/ws` and `/gallery`. SQLite storage, bearer
tokens for the observer and admin, rate limits, CSP, JSON-only writes with an Origin/Host check (CSRF and
DNS rebinding), workspace scoping on every read and write, single-use link codes with guess budgets.

**How to use it.** `npm run build && PORT=8787 npm start` · `npm run ci` · `docs/DEPLOY.md`.

**Files.** `server/src/*.ts` · `server/test/` · `Dockerfile`.

**Switch.** None; it never polls Telegram itself.

## 26. The build swarm

**What it does.** How Kratos was built: one orchestrator, one brief and one git worktree per task, contracts
first, status files, an adversarial review before every merge, and an overnight loop.

**Files.** `AGENTS.md` · `tasks/` · `status/*.json` · `docs/ORCHESTRATION.md` · `docs/overnight-log.md`.

**Switch.** None.

![Overnight loop](../diagrams/overnight-swarm.png)

## 27. The agent lockdown

**What it does.** Hard limits the model can't talk its way past. Every team agent and hire gets a tool
list (`Bash, Read, Grep, Glob, Write` + Switch tools) and `auto_mode: false`, so Switch launches it with
`--permission-mode default`. Repo rules allow the kit, `check_numbers.py` and writes under
`gallery/live-run/`, and deny reading `.env`, `.switch/` and `~/.ssh`. Anything else waits for a human
approval in Switch.

**How to use it.** Automatic: `switch-up.sh`, `switch-sync-agents.sh` and the Hire button all merge it in.
Change the tool list in `switch/lockdown.json`, the rules in `.claude/settings.json`.

**Files.** `switch/lockdown.json` · `.claude/settings.json` · `server/src/switch.ts` (`createManagedAgent`) ·
`kit/lib/util.mjs` (`readablePath` refuses `.env*` and `.switch/`) · `docs/switch/13-agent-lockdown.md`.

**Switch.** Managed agent definition: `advanced_config.tools`, `auto_mode`, `auto_approve`; approval requests.

![Agent lockdown](../diagrams/agent-lockdown.png)
