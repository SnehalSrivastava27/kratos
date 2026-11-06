# 12 · Switch feature survey (switch-core 0.31.0)

Every capability we found in the Switch server that Switch Console runs on this Mac, whether Kratos uses
it, and how much it would be worth to a D2C team. Read from the source, not the marketing pages.

- `core:` = `~/Library/Application Support/switchdash/local-switch-server/native/switch-core/0.31.0/src/core/switch_core/`
- `ops:` = `core:bridges/agent/operations/definitions.py` (every op is also the MCP tool `mcp__switch__<op>`,
  `core:bridges/agent/mcp/server.py:161-169`)
- **V** = value to a D2C founder (1-5), **E** = effort for us tonight (1 = an hour, 5 = days). **Not ready** = the
  source or docs say so, or it needs something we don't have.
- docs.switchagents.ai (`/llms.txt`) has no scheduler, cron or trigger page. Its incident-response use case
  does "approval" with a plain chat reply, gated only by the agent's instructions.

## Rooms, messages and context

| Capability | Where | Kratos | V | E | Note |
|---|---|---|---|---|---|
| `list_rooms`, `connect_to_room` | `ops:214,246` | yes | – | – | observer + d2c-office |
| `post_message(body, thread_id)` | `ops:768` | yes | – | – | d2c-office posts into forum topics |
| `send_targeted_message(target_names, target_roles)` | `ops:795` | yes | 3 | 1 | not private (SW3); now also reaches roles |
| Room-wide mention (`target_names: ["everyone"]`) | `core:room_wide_mention.py` | no | 2 | 1 | top level only; pages people, wakes no agent |
| `read_context` (room history) | `ops:640` | yes | – | – | new hires catch up (SW1) |
| `list_participants` | `ops:738` | no | 1 | 1 | |
| `create_room(internal_only)` | `ops:877,906` | yes | – | – | private Finance desk (SW3) |
| `create_room_from_yaml`, room tree "runs" | `ops:1551`, `core:agent_runs.py` | no | 2 | 3 | a room per campaign; runs can be paused/stopped |
| `archive_room` / `unarchive_room`, `update_room` | `ops:2477,2505,2396` | no | 1 | 1 | |
| `add_users_to_room`, `invite_agent_to_room`, `remove_agent_from_room` | `ops:1418,1369,1393` | partly | 2 | 1 | we use the gateway equivalent |
| Linked rooms (`link_rooms`, `list_linked_rooms`) | `ops:1292,496`, `core:gateway/room_links.py:31-95` | no | 2 | 2 | one brand room ↔ a leadership room; Kratos is one room, so little gain |
| Room groups | `ops:1479-1532`, `core:gateway/room_groups.py` | no | 1 | 2 | addressing rules per group; useful only with many brands |
| Threads ↔ Telegram forum topics | bridge map | yes | – | – | [05](05-rooms-topics-and-threads.md) |

## Roles, aliases and addressing

| Capability | Where | Kratos | V | E | Note |
|---|---|---|---|---|---|
| **Room roles** (`define_role`, `assume_role`, `release_role`, `list_roles`) | `ops:1016-1140`; gateway `core:gateway/rooms.py:878-955` | **built (SW4)** | 4 | 1 | `@role` reaches the live holder (`core:delivery/addressing.py:246-269`) |
| Role notice "🎭 assumed the \`x\` role." | `core:bridges/agent/protocol/agent_core.py:1816-1824,3536,3562` | **built (SW4)** | 3 | 1 | observer → `meta.switch_role` |
| Roles in room YAML | `core:rooms_yaml.py:429` | no | 1 | 2 | we define them from the gateway instead |
| Per-room aliases (`!set-alias @d2c-finance @finance`) | `core:aliases.py`, `core:bridges/agent/commands.py:1995` | no | 3 | 1 | chat command only, no gateway route: a manual step (below) |
| `!assign-agent` (every message goes to one agent) | `commands.py:1979` | no | 2 | 1 | could make the Captain the default listener |
| Addressing policies (anyone / owner only) | gateway | yes | – | – | [03](03-agents-and-templates.md) |

## Documents, references, files

| Capability | Where | Kratos | V | E | Note |
|---|---|---|---|---|---|
| Room documents | `ops:549-635` | yes | – | – | the pinned plan (SW2) |
| References + `attach_reference_to_room` | `ops:1143-1290` | yes | – | – | `kratos_file` type (SW2) |
| `!list-documents`, `!list-references` | `commands.py:1952` | no | 2 | 0 | free: the founder can type them today |
| Attachments (multi-file messages) | `core:attachments.py` | no | 2 | 3 | bots could post the deck as a Telegram file; ops send text only |

## Session activity, approvals and reactions

| Capability | Where | Kratos | V | E | Note |
|---|---|---|---|---|---|
| Turn activity cards ("⚙️ working", steps, stop button) | `core:session_activity/publisher.py`, Telegram `draws_session_activity` | yes (Console does it) | – | – | free with Console |
| 👀 "working" reaction on the asking message | `core:bridges/collaboration/telegram/adapter.py:279-282,566,2068` | yes (free) | – | – | one reaction per bot, so not per agent |
| **Approval cards** with Telegram buttons (`POST /agent-sessions/{sid}/approvals`, outcomes at `GET /agent-sessions/approvals/outcomes`) | `core:bridges/agent/api/activity_routes.py:231,264,286`; `core:session_activity/service.py:345-520` | no | 5 | 4 | **not ready for us**: see "Rejected" |
| Approval answered by typing (`A3 yes`, or a bare "yes") | `core:session_activity/bridge_answers.py:1-12` | no | – | – | comes with the cards |
| Claude Code permission prompts as cards (`auto_approve: false`) | managed agent definition | indirectly | 2 | 1 | gates tool calls, not business decisions |
| Bot reactions / polls as an agent op | – | **not in 0.31.0** | – | – | no op; reactions in are only routed to clients (`core:clients/consumer.py:195`) |

## Agents and management

| Capability | Where | Kratos | V | E | Note |
|---|---|---|---|---|---|
| Managed agents, controllers, revisions | gateway `/management/*` | yes | – | – | hiring (06) |
| Templates (`run_template`, `save_template` …) | `ops:1796-2095` | yes | – | – | team template |
| `list_agents`, `get_agent_detail`, `update_agent_detail`, `request_agent_deletion` | `ops:2097-2202` | partly | 1 | 1 | |
| `set_agent_service` / `remove_agent_service` (GitHub, Atlassian … grants) | `core:bridges/agent/operations/agent_services.py:43,113` | no | 2 | 3 | Shopify isn't a Switch service |
| `get_my_context` | `core:bridges/agent/operations/my_context.py:45` | no | 1 | 1 | |
| Chat commands `!reset`, `!compact`, `!interrupt`, `!agents-status`, `!agents-greet`, `!roles` … | `core:bridges/agent/commands.py:1845-2135` | `/list_agents` only | 3 | 0 | `!agents-greet` is a nice demo opener |
| Tasks (`delegate_task` …) | protocol docs | no | – | – | **not ready** (marked so in the protocol) |

## Cost, trust, transport

| Capability | Where | Kratos | V | E | Note |
|---|---|---|---|---|---|
| Budgets: per-agent / workspace spend caps | `core:budgets.py`, `core:gateway/tenants.py:711-792` | no | 4 | 2 | "Ads may spend ₹X of tokens a month". Next candidate |
| Switch Trust guardrails / ROI | `core:trust/`, docs.switchagents.ai | no | 2 | 4 | hosted product |
| Agent protocol: SSE + heartbeat (compat window), WebSocket `/connection/ws` | `core:bridges/agent/api/handlers.py:773-781` | SSE | – | – | move to WS if SSE ever answers 410 |
| Inbound webhooks for push-style bridges (WhatsApp, SMS, email…) | `core:bridges/collaboration/webhooks.py:1-10` | no | 3 | 5 | only the routing exists; no WhatsApp adapter ships in 0.31.0 |
| Bridges: Slack, Teams, Discord, Mattermost, Telegram | `core:bridges/collaboration/*` | Telegram | 3 | 3 | same team in Slack needs no code in Kratos |
| **Scheduler / cron / triggers** | – | **not in 0.31.0** | – | – | grep for cron/schedul finds only internal timers. We built the clock in the office server |

## What we built tonight (SW4)

1. **Room roles.** When the team joins a workspace's room (and on every server start for ready workspaces), the
   office server defines two exclusive roles through the admin gateway, idempotently, never editing one a human
   tuned: `finance-approver` (held by d2c-finance) and `ops-oncall` (held by d2c-ops) (`server/src/roles.ts`,
   hooked in `server/src/workspaces.ts` joinTeam + upgradeAll). The Captain then writes `@finance-approver`;
   Switch delivers it to whoever holds the seat. When an agent assumes a role, Switch posts
   "🎭 assumed the \`finance-approver\` role." from that agent; the observer tags it `meta.switch_role`.
2. **Morning brief.** Switch has no scheduler, so the office server is the clock (`server/src/brief.ts`): at
   09:00 IST (`MORNING_BRIEF_AT`, `MORNING_BRIEF=off` to disable) it asks `@d2c-captain` through Switch, as
   d2c-office, in the War Room topic, once per workspace per day, only inside a 2-hour window.
   `POST /api/brief` (session + `?ws=`, JSON, once a minute) asks now. The Captain's reply
   ("🎯 **Morning brief, 7 Nov**") is tagged `meta.kind: "morning_brief"` by the observer.

Tests: `server/test/sw4.test.mjs` (4, fake Switch), `observer/src/docs.test.ts` (role + brief parsers).

### Office event shapes (for `web/`)

```json
{ "type": "message", "room": "finance", "speaker": "d2c-finance",
  "text": "🎭 assumed the `finance-approver` role.",
  "meta": { "switch_role": { "role": "finance-approver", "action": "assumed" }, "switch_room_id": "…" } }

{ "type": "message", "room": "war_room", "speaker": "founder",
  "text": "@d2c-captain ⏰ Morning brief for 2026-11-07. Post today's morning brief in War Room, …" }

{ "type": "message", "room": "war_room", "speaker": "d2c-captain",
  "text": "🎯 **Morning brief, 7 Nov**\n\n- **Orders:** **412** …",
  "meta": { "kind": "morning_brief", "switch_thread_id": "…" } }
```
Suggested rendering: a small badge over the holder's desk ("💰 approver", "📦 on call") while the last
`switch_role` for that person is `assumed`; a sunrise card in War Room for `morning_brief`. The d2c-office
request is spoken by `founder` (observer config maps d2c-office → founder).

## Rejected (and why)

- **Approval cards as the founder's sign-off.** The most visible feature, but not low-risk tonight. The API is
  the session host's: the opening agent must have a **live connection** or the card says "Host offline"
  (`core:session_activity/publisher.py:130,576`); the answerer must be allowed to **address** that agent
  (`service.py:452-520`), which for our owner-only d2c-office/observer means changing addressing policies; and
  we would need a session id and an outcomes poller. A good v2: a dedicated passive `d2c-approvals` agent,
  addressing = people in the room, held live by the observer process, opening one card when the Captain posts
  the final plan, then posting "Founder approved" on the outcome.
- **Reactions / polls.** No agent op for either in 0.31.0; the only reaction is the built-in 👀 working mark.
- **Linked rooms / room groups.** Kratos is one room with topics; linking pays off only with several brands.
- **Budgets.** Real value (cost cap per teammate), but spend comes from Console's usage reports and caps stop an
  agent mid-demo. Next after the hackathon.
- **Native scheduler.** Doesn't exist; built server-side instead.

## Instruction patches (for the orchestrator to apply to `switch/agents/*.md`, then rebuild the template)

**d2c-finance.md**, new section after YOUR JOB:
```
YOUR SWITCH ROLE: finance-approver
- You hold the Finance approver seat, a Switch room role. "@finance-approver" in any message means you.
- At the start of a turn in the team room, if you have not yet this session: call
  mcp__switch__assume_role(role="finance-approver"). Switch posts "🎭 assumed the ..." itself; don't repeat it.
  "already hold a role" or "held by another" is fine: carry on. Never call release_role.
```

**d2c-ops.md**, new section after YOUR JOB:
```
YOUR SWITCH ROLE: ops-oncall
- You are Ops on call, a Switch room role. "@ops-oncall" in any message means you.
- At the start of a turn in the team room, if you have not yet this session: call
  mcp__switch__assume_role(role="ops-oncall"). Switch posts "🎭 assumed the ..." itself; don't repeat it.
  "already hold a role" or "held by another" is fine: carry on. Never call release_role.
- A stock-out, courier delay, RTO spike or stuck transfer addressed to @ops-oncall: answer first, in that thread.
```

**d2c-captain.md**, in YOUR JOB steps 4-5 replace "ask @d2c-finance" with "ask @finance-approver", and add:
```
ROLES (Switch room roles; the seat, not the name)
- Finance sign-off: write @finance-approver. Stock or delivery trouble: write @ops-oncall.
- Before you rely on a role, mcp__switch__list_roles: if its held_by is empty, write the
  name instead (@d2c-finance, @d2c-ops).

MORNING BRIEF (d2c-office asks at 9 AM IST: "⏰ Morning brief for <date>")
- Post ONE message in War Room. Line 1 exactly: 🎯 **Morning brief, <d Mon>**
- Bullets, numbers from kit sql on the LATEST date in the data (say "latest day in data"):
  orders and net revenue vs the day before (orders.csv); SKUs with under 7 days of stock
  (products.csv avg_daily_units vs stock); ad spend and ROAS (meta_ads_daily.csv,
  google_ads_daily.csv, marketplace_ads_daily.csv).
- The bold-italic line: the one decision the founder should make today.
- Last line: _Next: @founder ..._ . No assignments, no files, no plan.
```

**Founder-facing (docs/GO_LIVE.md or the demo script), optional, one manual step each:**
- In the group: `!roles` shows who holds each seat.
- In the group: `!set-alias @d2c-finance @finance` and `!set-alias @d2c-ops @ops` so the founder can type the short
  names (an alias may not collide with a role name, `core:aliases.py`).

## What to verify live (LV1 / orchestrator)

1. After the server starts: `GET /gateway/rooms/<room>/roles` lists both roles; Console → room → Roles shows them.
2. Finance's and Ops's first turn posts "🎭 assumed the `finance-approver` role." to Telegram, and `!roles` shows the
   holders. The office gets an event with `meta.switch_role`.
3. A Captain message with `@finance-approver` wakes d2c-finance (addressed). Then let Finance's session go idle:
   does Console keep the lease (exclusive leases auto-release "shortly after you disconnect", `ops:1112-1131`)?
   If not, the Captain's list_roles fallback to the name covers it.
4. `POST /api/brief?ws=<id>` → a "⏰ Morning brief" post in War Room → the Captain's "🎯 **Morning brief, …**" reply
   tagged `morning_brief` in `/api/history`.
