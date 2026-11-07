# 15 · Kratos vs the official Switch docs: gap audit

What docs.switchagents.ai says to do, what Kratos does, and what is left. 12 ([feature survey](12-feature-survey.md))
read the switch-core source. This audit reads the **official docs**: all 225 pages listed in
`https://docs.switchagents.ai/llms.txt`, fetched on 7 Nov 2026. That covers Switch Rooms (60 pages), Switch Trust (50),
the Trust CLI (18), the API reference (89) and data handling. Diagram:
[15-switch-coverage](../diagrams/15-switch-coverage.png).

**Version check.** The docs describe **Switch 0.31.0 / Console 0.40.0** (changelog, 20 Oct 2026), the same server we run
locally. Everything in the Rooms pillar applies as written. Switch Trust and Switch ROI are a separate **hosted**
product (app.switchagents.ai / api.switchagents.ai, Trust v1.0.1). The only place it touches our server is the
`trust-settings` guardrail hook.

Conventions:
- **Docs** links drop the `https://docs.switchagents.ai/` prefix and the `.md` suffix.
- `core:` is `~/Library/Application Support/switchdash/local-switch-server/native/switch-core/0.31.0/src/core/switch_core/`.
- **Status:** **done** means used the way the docs recommend. **partial** means used, but not all of it or not quite as
  recommended. **deviation** means used differently on purpose. **wrong** means it goes against the docs. **missing**
  means not used. **n/a** means it does not apply to a one-Mac, one-group setup.
- **Effort:** S is under 2 hours, M is half a day, L is days or needs an account.
- **Demo:** value in the 5-minute demo or the blog, from 1 to 5.

## Coverage table

### Rooms: the room and its context

| Feature | Docs | Kratos | Evidence | Gap | Effort | Demo |
|---|---|---|---|---|---|---|
| Adopt an existing chat as a room (Telegram: add the bot, Group Privacy off first) | `switch-rooms/deploy/messaging-apps/telegram`, `getting-started/create-a-room` | done | `scripts/switch-up.sh` (room lookup, prefers the `-100…` supergroup id), [02](02-telegram-bridge.md) | Done as documented. That includes "a group converted to a supergroup gets a new chat id": we pick the supergroup. | – | 2 |
| Forum topics as real threads | `deploy/messaging-apps/telegram` (Threads accordion) | done | `server/src/workspaces.ts:20-39` (one topic per roster room), `learnThread` `:330` | none | – | 4 |
| **Room Instructions** ("Write it once. Every agent that joins afterward gets the same briefing") | `using/shared-context#brief-every-agent-that-joins`, `building/payments-room#brief-every-agent-with-room-instructions` | **missing** | Never set. `server/src/switch.ts:190` even passes `include_general_instructions: false`. 81 identical lines (about 6.5K characters: SAFETY, Telegram style, topic map) are copied into all 16 agent instructions (`switch/agents/*.md`, built into the 2,228-line `switch/d2c-team.template.yaml`) | Room-wide conventions live in 16 copies, and a new hire only gets them because `office.ts` pastes them in. The docs' "Check that the briefing works" test (invite an agent that has never been here and ask what the room is for) would fail. | S | 4 |
| Room documents with instructions | `using/shared-context#add-a-document-to-the-room`, `internals/rooms-and-resources` | done | `switch/agents/d2c-captain.md:54-60` (create/update with `instructions`), `d2c-finance.md:46-50`, observer `observer/src/index.ts:149-160`, [11](11-room-documents.md) | none. Matches "Without instructions, agents have no reason to open the document", the 1 MB cap and "only the creating agent can change it". | – | 4 |
| References + custom reference type | `administer/shared-material#register-a-reference`, `#define-your-own-reference-type` | done | `kratos_file` type (a person defines it in the Gateway, as the docs require: "agents can't"), `d2c-captain.md:61-64` | The docs say a new type is **private to whoever defined it** until shared. Fine with one owner. Share it before a second account uses it. | S | 2 |
| Library documents, packages | `administer/shared-material#make-a-package-and-add-to-it` | n/a | – | One room, so nothing needs to be shared across rooms. See "Deliberately not used". | M | 1 |
| Room roles (shared / exclusive, written *to the agent*) | `building/payments-room#set-up-roles-any-agent-can-take`, `administer/rooms#set-up-a-rooms-jobs` | done | `server/src/roles.ts:10-33` (gateway `POST /rooms/{id}/roles`), `d2c-finance.md:41-44`, `d2c-ops.md` | partial: the docs warn "an agent holds one role at a time, across all its rooms", so Finance can't also hold a desk role. Editing a role reaches the next holder only. We never edit after creating, so that's fine. | – | 4 |
| Aliases (`!set-alias @d2c-finance @finance`) | `using/work-in-a-room#use-room-shortcuts`, `resources/room-commands` | missing | Only a suggestion in [12](12-feature-survey.md):178 | The founder types `@d2c-captain`. An alias `@captain` is one command. Templates can carry aliases, but ours is an agent group template and the room is adopted. | S | 3 |
| **Follow-ups + main agent** (`!assign-agent @d2c-captain`, `!follow-ups on/off`) | `using/work-in-a-room#keep-talking-without-tagging-the-agent` (Switch 0.31) | **doc'd** (SW7) | Optional founder step in `demo/script.md` and `docs/live-demo-run.md`, with the ROI caveat; not automated. The flag is on for Console-run servers (`core:config.py:237-240`, 300 s window) | The founder must `@`-tag every message. With the Captain as main agent, "make it 30% off" reaches him untagged. The catch: thread follow-ups also wake the last agent that spoke, which adds Captain turns (14: the Captain is already 40% of turns). | S | 5 |
| Room greeting (Notify on join) | `getting-started/create-a-room#have-an-agent-welcome-people-who-join` | missing | Gateway route `PATCH /gateway/rooms/{id}/agents/{agent_id} {receives_join_events}` (`core:gateway/rooms.py:1077-1100`) | When a co-founder joins the group, nobody greets them. The Captain could, from room instructions, but only while it has a live session. | S | 3 |
| Linked rooms (one-way, labelled) | `building/grow-into-an-organization#point-rooms-at-each-other` | missing | Finance desk is a second room (`d2c-finance.md:126`) with no link | Docs: "a link tells agents in one room that another room exists and why". A `team room → Finance desk ("finance sign-off")` link would replace the prose in Finance's instructions. | S | 2 |
| Room groups, archive | `administer/rooms#link-and-group-rooms`, `#retire-a-room` | n/a | – | Only pays off with several brands. | – | 1 |
| Room access (Private / read-only / read & write) | `administer/rooms#restrict-who-can-change-a-room`, `resources/shared-responsibility#set-the-visibility-you-intend` | partial | The adopted room keeps the default **public read & write** | Docs: an adopted room "has no owner, so only an admin can change its Access". Any future workspace member could edit roles or attach references. Set `write_visibility` private with `PATCH /gateway/rooms/{id}` (`rooms.py:832-870`). | S | 1 |
| "Give a room one job" (keep credentials away from outside content) | `resources/working-safely-with-agents#give-a-room-one-job` | partial | `internal_only` Finance desk (SW3) | Docs logic: everything in one room pools context. The team room mixes founder chat, web-ish content (UGC, influencer briefs) and agents with `Bash`. The lockdown covers that, see the Trust pillar. | – | 2 |
| Templates (agent / group, fields, v1+v2) | `administer/room-templates` | partial | `switch/d2c-team.template.yaml` (v1 group template, fields provider/location/directory/team_room), `scripts/build-template.mjs` | **Deviation:** `switch-up.sh` creates managed agents straight through `POST /gateway/management/agents` and uses the template only as a fallback. Reason: the lockdown has to be merged into each definition, and setup must be idempotent. The docs' "Capture as template" of the *room* (instructions, roles, docs) is unused. It would be the way to clone Kratos for brand two. | M | 3 |
| Room commands (`!roles`, `!agents-status`, `!agents-greet`, `!list-documents`, `!list-references`) | `resources/room-commands`, `using/agent-not-answering` | partial | Only `/list_agents` (`scripts/switch-up.sh:187`), [05](05-rooms-topics-and-threads.md) | Free, and they work with every agent offline. `!agents-status` (🟢 / ⚙️ working / ✋ awaiting input) is the docs' first diagnostic and isn't in our runbook. | S | 3 |
| Schedule recurring work | `using/work-in-a-room#schedule-recurring-work` ("Switch has no schedule of its own") | deviation | `server/src/brief.ts:40-67` posts as d2c-office at 09:00 IST | The docs suggest a messaging-app scheduled message, and "add that poster in the agent's settings". We post as an agent the Captain already accepts (open addressing). Same idea, but we can test it and it's idempotent. Telegram's own scheduled messages would also work and need no server. | – | 4 |

### Rooms: agents, addressing and the protocol

| Feature | Docs | Kratos | Evidence | Gap | Effort | Demo |
|---|---|---|---|---|---|---|
| Managed agents on Console's controller | `getting-started/what-keeps-your-agent-running`, `getting-started/agent-settings` | done | `server/src/switch.ts:221-237`, `scripts/switch-up.sh` | none. Matches 0.40's "your agents move to a managed machine". | – | 3 |
| Model in Advanced configuration | `getting-started/agent-settings#change-the-model-or-tools` | done | `definition.model = claude-haiku-5-5` (`switch.ts:211`) | none | – | 3 |
| Tools allowlist + Auto mode off | `agent-settings#let-the-agent-act-without-asking`, `resources/working-safely-with-agents#a-three-factor-test` | done | `switch/lockdown.json`, [13](13-agent-lockdown.md) | Matches the docs' advice: "if it has to take in outside content, take away any tools it doesn't need". | – | 4 |
| Max turns / Effort (Advanced configuration) | `agent-settings#change-the-model-or-tools`; `core:providers/advanced_fields.py:152-165` | **done** (SW7) | `lockdown.json` `advanced_config.maxTurns: 40` (Console's `agent-controller.mjs` `CLAUDE_ADVANCED_SETTINGS` passes it into the Claude Code agent definition). Applied by `createManagedAgent`, `switch-up.sh` and `switch-sync-agents.sh`. The live War Room run peaked at 10 model round-trips per prompt (Claude Code transcripts), so 40 has 4× headroom. Effort is left to the lead's settings | `maxTurns` caps a runaway session, a free cost guard that never silences an agent the way budgets do. | S | 2 |
| Permission requests (Allow once / for session / Decline; a bare `yes` or `no`) | `using/work-in-a-room#approve-or-decline-a-request`, `using/agent-not-answering#the-agent-is-waiting-for-a-response` | partial | Auto mode off makes every non-allowlisted tool post a request in Telegram | **Docs: "Anyone the agent takes messages from can answer its requests."** With open addressing, *any member of the group* can approve a tool call. SW7 scoped addressing to our rooms, so it is now any member of *our* groups; narrowing to the founder needs his Telegram linked (then `users: []` + `owner`). The runbook should also say "✋ awaiting input in `!agents-status` = scroll up and answer". | S | 3 |
| **Addressing policy** ("Who can talk to your agent") | `agent-settings#choose-who-can-instruct-the-agent`, `internals/identity-and-access#addressing-policy` | **done** (SW7) | Team: `switch.ts teamPolicy` / `switch-up.sh team_policy`: rule 1 anyone (people + agents) in our team rooms, rule 2 only agents + owner anywhere (the Finance desk is created at run time, so its id can't be listed). Platform stays denied, as under the open policy (the sketch below said `platform: true`, which would have widened it). Applied by `switch-up.sh` step 5, `activate` (hires) and `workspaces.ts` on every link/start; rooms only grow. Was: `addressing: anyone` (template) and `policy: null` (`switch-up.sh:147`, `switch.ts:263`). d2c-office and observer: owner-only (`switch.ts:150`, `switch-up.sh:163`), as recommended | Docs: "No rules at all means open", a legacy permissive state. They recommend "permit the room, not just the person" with custom rules. A rule `{rooms: [<team room>, <finance desk>], users: "*", agents: "*"}` keeps today's behaviour inside our rooms and refuses everywhere else. Why open: the founder talks from Telegram without a linked Switch account, and agents must address each other. | S | 2 |
| Link your Telegram account (identity claim) | `deploy/messaging-apps/telegram#link-your-telegram-account-after-posting`, `identity-and-access#identity-claims` | partial | GO_LIVE asks the host to link; open addressing makes it optional | Needed the moment any agent goes owner-only. Otherwise the agent says "I only take instructions from my owner" to its own owner. | S | 1 |
| Hand-offs with `send_targeted_message` / mentions (task tools removed in 0.31) | `resources/changelog` (0.31.0 Removed: Task tools) | done | `d2c-captain.md:137`, `d2c-finance.md:129` | none. We never used `delegate_task`. | – | 2 |
| `read_context` catch-up for new hires | `internals/agent-protocol` (operation catalog), `using/shared-context#check-that-the-briefing-works` | done | `server/src/office.ts:88-93`, [06](06-hiring-agents-from-the-office.md) | Room Instructions (above) would brief a hire *before* its first turn, not inside it. | – | 3 |
| Agent connection: **WebSocket** `/agents/{id}/connection/ws` (SSE is "for clients built before the WebSocket … for a compatibility window, then removes it") | `internals/agent-connection#clients-built-before-the-websocket` | partial | `observer/src/index.ts:284-300` (SSE + `connection/beat`), `server/src/switch.ts:173-191` (SSE per threaded post) | Works on 0.31.0. It breaks when SSE is removed: the observer logs a 410 hint but has no WebSocket path. | M | 1 |
| `taken_over` is final ("don't reconnect after it") | `internals/agent-connection#connections` (warning), `core:bridges/agent/api/handlers.py:1113-1133` | **done** (SW7) | `observer/src/index.ts` stops on `evicted {code: "taken_over"}` (the code is in `code`; `reason` is prose) and on beat `409 {detail: {code: "taken_over"}}`, logs FATAL and exits 3; other closes still reconnect. Test: `observer/src/taken-over.test.ts`. Was: any `evicted` / any 409 reconnected. Note: each observer process picks a random `connection_id`, so the trigger is rarer than the gap text says (only a client reusing our id). | If a second observer (a worktree, `bun --watch`) starts with the same `connection_id`, the two take the connection from each other forever. The docs describe exactly this loop. Stop on `reason == "taken_over"`, and on beat `409 {code: "taken_over"}`. | S | 1 |
| Declare rooms on the open URL, not after | `internals/agent-connection#claiming-a-room` | done (n/a) | Observer uses `scope=all` (covers every room without claiming) | none | – | – |
| Session activity (👀 + "Working…" status message) | `deploy/messaging-apps/telegram#see-when-an-agent-is-working` | done | free with Console | none | – | 3 |
| Attachments (images as photos, files as documents, albums) | `deploy/messaging-apps/telegram` (Attachments), `internals/agent-events#multi-file-attachments` | missing | Files go out as links (`kratos_file` reference, `/gallery/...`) | The deck could land in Telegram as a real `.pptx` document through `POST /agents/{id}/rooms/{room_id}/media` (`core:bridges/agent/api/handlers.py:509-560`, multipart, `caption`, `thread_id`). This is an HTTP route, **not an MCP op**: the office server would post it. | M | 4 |
| Room-wide mention (pages people, wakes no agent) | `resources/changelog` (0.30.0) | missing | – | Could page the founder when the plan is ready. Low value in a 1-person group. | S | 1 |
| Service connectors (GitHub, Atlassian, Google Workspace…) | `agent-settings#let-the-agent-use-your-services`, `deploy/self-host` (`service_connections`) | n/a | – | Shopify / Meta Ads aren't Switch connectors. Google Workspace could hold the sales sheet later. | L | 2 |
| Can manage agents (an agent hires agents) | `agent-settings#let-the-agent-create-agents`, `using/work-in-a-room#have-an-agent-set-up-a-new-agent` | deviation | Hiring goes through the office server's management API (`switch.ts:221`), [06](06-hiring-agents-from-the-office.md) | Docs: "nothing stops it from creating the agent without asking". We keep hiring as a founder button, not an agent power. | – | 2 |
| Several workspaces per server | `administer/people-and-agents#give-a-team-its-own-workspace`, changelog 0.30.0 | deviation | Kratos workspaces are ours (6-digit link code, `workspaces.ts:95-229`) on one Switch workspace, [08](08-accounts-and-workspaces.md) | Switch's isolation is row-level security per workspace, which is stronger than ours. We kept one Switch workspace because one team of agents serves every linked group. | L | 1 |
| Server public address (`GATEWAY_PUBLIC_URL`) for "Open in Switch Console" links | `deploy/self-host#set-the-servers-public-address` | n/a | local only | Without it, Console links arrive as plain text in Telegram. Expected locally. | – | 1 |

### Trust: guardrails, evals, approvals

| Feature | Docs | Kratos | Evidence | Gap | Effort | Demo |
|---|---|---|---|---|---|---|
| Rooms guardrail checks (`trust-settings`: endpoint + Trust policy id + Trust API key; every message checked before delivery) | `legal/data-handling` ("Switch Rooms guardrail checks"), `switch-rooms/use-cases/guardrails`, `switch-trust/guardrails/policies` | partial | Read only: `server/src/roi.ts:152` (`GET /gateway/trust-settings`, shows "disabled"), [14](14-roi-trust.md) | Needs a hosted Trust account (Free plan: up to 5 managed agents, no card). Docs/source caveats: the check **fails open** on timeout (`core:config.py:694-704`, `trust/client.py`), skips messages with attachments, covers room messages and not the Haiku calls inside a session, and applies server-wide. The key must be Ingest-only or Editor and above (Trust 1.0 rejects Viewer). | M (account) | 5 |
| Guardrail policies: Jailbreak, PII, Secrets, Regex, Topic control, Tool permissions; Block / Redact / Alert | `switch-trust/guardrails/policies` | missing | We have our own: SAFETY block (all 16 agents), tool lockdown | A PII-redact policy is the strongest demo: a customer list pasted into the group arrives `[redacted]` (the docs' own scenario). Every org starts with "Baseline Monitoring (Alert)". | M | 5 |
| Approval "on the record" by a person in the thread | `switch-rooms/use-cases/incident-response` | done | Finance gate (`@finance-approver`) then the founder's reply, [12](12-feature-survey.md) SW4 | Matches the docs' pattern: agents' instructions hold the change back, and the approval sits in the thread with a name on it. | – | 4 |
| Session approval cards API (`/agent-sessions/{sid}/approvals`) | not in the official docs (source only, `core:session_activity/service.py:345-520`) | missing | Rejected in [12](12-feature-survey.md) | Undocumented, so it's likely to change. Keep the chat approval. | L | 4 |
| Working-safely checklist (working directory, tools, reach, Auto mode, room contents, who can address) | `resources/working-safely-with-agents#agent-safety-checklist` | partial | 7 of 7 items are *answered* across [10](10-gotchas-and-lessons.md), [13](13-agent-lockdown.md) but not as one checklist | Addressing is the open item (above). Every agent shares the repo as its working directory, which the docs call "the strongest control you have". | S | 2 |
| Hosted agent evaluation (HTTP endpoint, attacker + judge supplied, schedules, OWASP) | `switch-trust/evaluation/connect-and-run`, `getting-started/evaluate` | missing | Our own `evals/` (166 questions, 4 injection asks), [14](14-roi-trust.md) | Needs an HTTP endpoint per agent that Trust can reach (a tunnel from this Mac). Our 166 questions could be uploaded as a custom Probe/Metric CSV. On Free, evals run weekly or monthly only. | L | 3 |
| Switch Trust CLI `eval` (local, free, BYO key, `generic_http` / `anthropic` types, built-in OWASP LLM01-09 + garak probes) | `switch-trust-cli/eval/*`, `reference/builtin-evaluations` | missing | – | `switch-trust eval run --model anthropic` against bare Haiku plus our SAFETY prompt is a cheap, local, third-party jailbreak score for the blog. Testing a full agent needs a `generic_http` shim in front of the Rooms API. | M | 3 |
| Switch Trust CLI `scan` | `switch-trust-cli/scan/*` | n/a | – | **Python only** (framework imports). Agents defined as markdown + YAML are invisible to it. It exits 23 "found nothing it can analyze". | – | 1 |
| Discovery (GitHub Action, AWS / GCP) | `switch-trust/getting-started/discover`, `discovery/how-discovery-works` | n/a | – | Python only, hosted. | – | 1 |

### ROI: cost and value

| Feature | Docs | Kratos | Evidence | Gap | Effort | Demo |
|---|---|---|---|---|---|---|
| Per-agent spend (MTD, $/session, by month) | `switch-trust/cost/index`, `cost/spending-and-caps` | partial | Our own version: `server/src/roi.ts:140-176` reads the Rooms usage counters (`GET /gateway/tenants/{id}/usage`) and prices them with hardcoded list prices (`roi.ts:12`) | Docs' ROI is hosted and needs traces in Trust. Ours is local and counts tokens per agent, which the docs' ROI can't do for Rooms traffic (Rooms shows up as **one** agent). | – | 5 |
| **Claude Code OpenTelemetry → Trust** (`CLAUDE_CODE_ENABLE_TELEMETRY=1`, OTLP `…/agent/otel`, `Authorization=ApiKey …`, `gen_ai.agent.name`) | `switch-trust/admin/data-sources/opentelemetry` | missing | – | The documented way to get per-agent sessions, turns and cost for Claude Code into Trust without an SDK. Catch: all 16 agents share one working directory and `.claude/settings.json`, and managed-agent definitions have no `env` field (`core:providers/advanced_fields.py`). Per-agent `gen_ai.agent.name` needs a per-agent directory or a launcher wrapper. Leave out `OTEL_LOG_*` to send usage only. | M | 4 |
| Monthly spend cap per agent + forecast (burn rate, days to cap) | `cost/spending-and-caps` | n/a (hosted) | – | Advisory only: "A cap doesn't stop an agent from spending". The opposite of Rooms budgets (below). | M | 3 |
| Rooms budgets (`/gateway/tenants/{id}/budgets`, enforced at delivery) | **not in the official docs** (source: `core:budgets.py`, `gateway/tenants.py:711-805`) | partial | Listed read-only; create behind `ROI_BUDGETS=on` (`roi.ts:179-193`) | Undocumented, so call it "switch-core feature" in the blog, not "Switch ROI". | – | 2 |
| Model pricing overrides (negotiated / unpriced models) | `cost/model-pricing` | deviation | `PRICES` table in `roi.ts:12` | Same idea, kept locally. An unknown model counts tokens but $0 in both. | – | 1 |
| ROI analyses / Improvements (context_cache_waste, verbosity, model_optimizer, tool_bloat, retry_loop_waste) | `switch-trust/inventory/agents#improvements`, `mcp/playbooks` | partial | `recommend()` (`roi.ts:89-110`): model share, cost centre | Ours is two heuristics. The docs' `model_optimizer` + `tool_bloat` are exactly our two findings (Opus → Haiku, Captain wake-ups). | – | 3 |
| Value side (deliverables per $) | not in the docs ("Switch ROI … shows what every agent costs", cost only) | **beyond the docs** | `groupUsage` joins posts + pinned docs per agent (`roi.ts:32-88`) | Kratos's "cost per deliverable" is something the hosted ROI doesn't do. Good blog point. | – | 4 |
| Trust MCP server (`uvx switch-trust-mcp`: `list_llm_sessions`, `get_latest_roi_analyses`, `get_guardrail_outcomes` …, read-only) | `switch-trust/mcp/tools`, `mcp/connect` | missing | – | Only useful once Trust has data. A Viewer key in the *developer's* Claude Code, not the team's. | S (after OTel) | 2 |

### Platform

| Feature | Docs | Kratos | Evidence | Gap | Effort | Demo |
|---|---|---|---|---|---|---|
| Switch Console local server (no Docker) | `getting-started/add-a-server`, changelog Console 0.40.0 | done | [01](01-console-and-local-server.md), `scripts/switch-up.sh` | none | – | 2 |
| Gateway admin API (cookie session) | `internals/identity-and-access#gateway-sign-in` | done | `server/src/switch.ts:102-123` (re-login once on 401) | none. The docs say sessions expire after 24 h, which is what the 401 retry covers. | – | – |
| Switch MCP tools (`/mcp`, agent key) = every op | `internals/agent-protocol#operations`, `internals/connectors-and-runtime` | done | agents call `mcp__switch__*` (instructions), d2c-office calls ops over HTTP (`switch.ts:187-191`) | none | – | 3 |
| Docs MCP server (`https://docs.switchagents.ai/mcp`) / Switch expert template | `llms.txt` header, `getting-started/switch-expert` | missing | – | A "switch-expert" agent in a *dev* room could answer Switch questions. We read the source instead. | S | 1 |
| Server OTLP metrics (`otlp_endpoint`, metrics only, no traces) | source only (`core:config.py:438-457`) | n/a | – | Server health metrics, not agent cost. | – | – |
| Audit log (membership, keys, apps) | `identity-and-access#audit-log` | n/a | – | Could back a "who changed what" card later. | S | 1 |

## Close next (ranked)

1. **Make the Captain the room's main agent (follow-ups).** Demo 5, effort S. **Status: doc'd (SW7)** as an optional
   founder step in `demo/script.md` and `docs/live-demo-run.md`; not automated.
   - In the group, as the founder: `!assign-agent @d2c-captain`. Then "now make it 30% off" reaches the Captain
     untagged. An `@` still wins, and `!unassign-agent` undoes it.
   - Code: add the command to `docs/GO_LIVE.md` and the demo script.
   - Optional: d2c-office could post it, but commands are only accepted from senders the agent accepts. Prefer the
     founder, since the docs say "You can assign only an agent that takes instructions from you".
   - Watch the cost: thread follow-ups also reach the last agent that spoke in a topic. Measure Captain turns in
     `/api/roi` before and after. If they jump, `!follow-ups off` keeps the main agent and drops thread follow-ups.
2. **Room Instructions for the team room.** Demo 4, effort S. **Status: deliberately skipped (SW7)**, see
   "Deliberately not used".
   - Move the 81 shared lines (SAFETY, Telegram style, topic map, "Next:" line rule) out of `switch/agents/*.md` into one
     `switch/ROOM_INSTRUCTIONS.md`.
   - In `server/src/workspaces.ts` `joinTeam` (next to `rolesFor`, `:381-392`), call
     `gw("PATCH", /rooms/${id}, { instructions })` once per workspace, with a kv marker like `roles:`. Never overwrite a
     human edit: compare against the last value we wrote.
   - `scripts/build-template.mjs` then stops prepending them. Drop `include_general_instructions: false` from
     `switch.ts:190`; that one is for d2c-office and may stay.
   - Verify with the docs' own test: hire a fresh agent and ask "what is this room for?".
   - Caveat from the docs: an agent already in the room keeps its old briefing "until it reconnects", so restart the
     sessions once.
3. **Stop the observer on `taken_over`.** Demo 1, effort S, but it's a correctness bug. **Status: done (SW7).** The
   frame carries the code in `data.code`, not `data.reason`.
   - `observer/src/index.ts:300`: when `data.reason === "taken_over"` (or the code), log it and exit the loop instead
     of throwing.
   - `:233`: read the beat body. On `409 {code:"taken_over"}`, stop. On anything else, abort and reopen.
   - Add a test in `observer/src/docs.test.ts` with a fake frame.
4. **Scope addressing to our rooms.** Demo 2, effort S. **Status: done (SW7)**, with two changes to this sketch: the
   Finance desk is covered by an agents-only rule for every room (it is created at run time), and `platform` stays
   false (it was denied under the open policy too).
   - Replace `policy: null` in `switch-up.sh:147` and `switch.ts:263` (`activate`) with
     `{rules:[{rooms:[<team room id>, <finance desk id>], room_groups:"*", users:"*", agents:"*", owner:true, owner_agents:true, platform:true}]}`.
   - Behaviour in the Kratos rooms is unchanged. Elsewhere they're refused, visibly.
   - This also narrows who can answer permission requests to people in our rooms.
   - Re-apply when a workspace links a new group (`workspaces.ts` `joinTeam`).
5. **Real files in Telegram.** Demo 4, effort M.
   - After the Captain pins the plan (the observer sees "📄 created room document"), the office server uploads
     `gallery/live-run/sale-plan.pptx`.
   - Route: `POST /agents/{d2c-office id}/rooms/{room}/media`, multipart `files`, `caption`, `thread_id` = the War
     Room topic. Bearer is d2c-office's key; never log it.
   - Put it in `server/src/switch.ts` next to `postAsOffice`.
   - The docs: "everything else goes as a document with its bytes intact". The 20 MB cap applies to incoming files only.
6. **Switch Trust guardrails, hosted, opt-in.** Demo 5, effort M (needs a Trust account).
   - Create a Free org and a policy: PII Redact plus Jailbreak Block plus Secrets Redact.
   - As the instance admin: `PUT /gateway/trust-settings {endpoint, policy_id, api_key}`. The api_key is Ingest-only or
     Editor and above.
   - `/api/roi` already shows "enabled" with no code change ([14](14-roi-trust.md)).
   - Demo line: paste "call Priya on 98xxxxxx12, priya@…" and the agents see `[redacted]`.
   - Caveats to state on screen: it fails open on timeout, files are not checked, and it applies to every room on the
     server.
7. **Claude Code OTel to Switch Trust, per agent.** Demo 4, effort M.
   - Put `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_LOGS_EXPORTER=otlp`, `OTEL_TRACES_EXPORTER=otlp`,
     `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, `OTEL_EXPORTER_OTLP_ENDPOINT=<…/agent/otel>` and
     `OTEL_EXPORTER_OTLP_HEADERS` in `.claude/settings.json` `env`. Leave out the `OTEL_LOG_*` content flags.
   - The hard part is `gen_ai.agent.name` per agent: one shared directory means one name. Options: a per-agent
     subdirectory with its own `.claude/settings.local.json` (changes `definition.directory`), or accept one "kratos-team"
     agent in Trust and keep the per-agent split in our `/api/roi`.
   - Don't also wrap with the SDK, or the cost is counted twice.
8. **`maxTurns` in the lockdown + the runbook commands.** Demo 2, effort S. **Status: `maxTurns` tried in SW7, then removed at review**: Console applies it only as agent frontmatter; Claude Code clearly honours it for subagents, but for a long-lived `--agent` session it is either ignored or a whole-session cap (the Captain took 38 of 96 turns in one run), so it could stop the Captain mid-demo. Verify on a throwaway agent (maxTurns 2, three prompts) before turning it on;
   the GO_LIVE runbook commands are still open.
   - Add `"maxTurns": 40` to `switch/lockdown.json` `advanced_config`. It flows through `createManagedAgent` and
     `switch-up.sh` unchanged.
   - Add `!agents-status`, `!roles`, `!list-documents` and `!set-alias @d2c-captain @captain` to GO_LIVE.

## Deliberately not used

- **Room Instructions (close-next 2).** The offline evals read the per-agent prompts in `switch/agents/*.md`; moving
  the shared blocks into the room would make the evaluated prompt differ from what runs live.
- **Packages, library documents, room groups, archive.** These share material across rooms. Kratos is one room plus a
  private desk, so there's nothing to share. Revisit at brand two, together with "Capture as template".
- **Switch workspaces per brand.** Switch's per-workspace row-level security is better isolation than our link codes.
  But one team of 16 agents serves every linked group, and an agent belongs to one workspace. Fine for one founder;
  multi-tenant SaaS would need Switch workspaces.
- **Can manage agents.** The docs themselves warn "nothing stops it from creating the agent without asking". Hiring
  stays a founder button.
- **Bypass permissions.** The docs: "only for an agent you'd trust alone with its working directory". Ours share the
  repo with `.env`.
- **Approval-cards API.** It isn't in the official docs, it needs a live session host, and the docs' own incident
  scenario does approval as a chat reply on the record. That is what we do.
- **Rooms budgets in the demo.** These are an undocumented switch-core feature, enforced at delivery: a reached cap
  silences an agent mid-demo. Trust's documented caps are advisory, which is the safer model to copy.
- **Trust CLI scan and Discovery.** Python only. Markdown/YAML agents are invisible to them.
- **Hosted agent evals.** They need a reachable HTTP endpoint per agent. Our local 166-question harness already
  covers it, and the CLI `eval` is the cheaper third-party check.
- **Service connectors.** No Shopify / Meta Ads / Razorpay connector exists.
- **WebSocket migration now.** SSE works on 0.31.0. It's queued for when the compatibility window closes; the
  observer already flags a 410.

## Blog-ready findings

1. **The docs and the server agree, and the version matters.** The docs describe Switch 0.31.0 / Console 0.40.0, the
   same build we run. That's rare: every Rooms feature we found in the source is documented, except two that aren't
   (session approval cards and tenant budgets). We treat those as internal.
2. **Switch has two different "budgets."** switch-core's tenant budgets *enforce* (an addressed message is refused
   after the cap), are undocumented and are local. Switch Trust's per-agent caps are *advisory* ("a cap doesn't stop
   an agent from spending"), documented and hosted. Pick the one that fails the way you want.
3. **Kratos's ROI does something the hosted ROI can't: value.** Switch ROI is cost-only (cache waste, verbosity, model
   choice, tool bloat, retries). Kratos joins Switch's usage counters with what each agent *delivered* (posts and
   pinned documents) to get cost per deliverable. And Switch ROI counts all Rooms traffic as one agent; the local usage
   counters split it by agent.
4. **Our two cost findings are two of Switch ROI's five analyses.** "Opus was 96% of the bill" is `model_optimizer`.
   "The Captain is woken by every report" is close to `tool_bloat` / `verbosity`. We found them by hand from
   `/gateway/tenants/{id}/usage`.
5. **The biggest unused feature is one line of chat.** `!assign-agent @d2c-captain` (Switch 0.31 follow-ups) turns the
   group into a chat with the Captain. We built 16 agents and still made the founder type `@d2c-captain` every time.
6. **We briefed 16 agents and not the room.** The docs' first building block is Room Instructions, "written once, read
   by every agent that joins". We copied 81 identical lines into 16 agent prompts instead.
7. **Addressing is also approval authority.** Per the docs, whoever may address an agent may answer its permission
   prompts. "Anyone" is convenient, but it means anyone in the Telegram group can click "Allow" on a tool call.
   Scoping addressing to our rooms is a one-object change.
8. **Guardrails are server-wide, fail open and skip files.** Switch Trust's room guardrails check every message on the
   server before delivery. On a timeout they let the message through, and messages with attachments aren't checked
   (data-handling page; `core:config.py:694-704`). They're good for PII redaction in chat, but they don't replace the
   tool lockdown, which runs where the agent acts. The docs say the same: "Put the control where the agent runs."
9. **Claude Code is a first-class Trust source.** The OpenTelemetry page names Claude Code by its env vars. The
   catch for a team on one repo is the agent name: one working directory means one `gen_ai.agent.name`.
10. **Switch has no scheduler, and the docs say so.** "Recurring work comes from your messaging app." Our 09:00 brief
    is the office server posting as an agent the Captain accepts, the same pattern with a testable clock.
