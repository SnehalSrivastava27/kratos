# 14. Switch ROI and Switch Trust

Switch has two pillars beyond rooms: **ROI** ("see what every agent costs and delivers") and **Trust** (guardrails:
block, redact, alert; approval required). Kratos brings both into the office as one panel, the coin button in the
HUD (`web/src/office/RoiPanel.tsx`), backed by `GET /api/roi` (`server/src/roi.ts`, maths in `server/src/roi-calc.ts`).

Switch ROI is a hosted Switch Trust capability that reads traces. Kratos runs the same views locally from Switch's own
usage counters, so it works with no Trust account, and it adds the part the hosted product leaves out: what each agent
delivered. Where the hosted product has a hook (OpenTelemetry, the Trust MCP), Kratos wires it in as an opt-in.

## The panel

| Tab | What it shows | Hosted equivalent |
|---|---|---|
| **Overview** | Spent this month, month-end projection and burn rate, turns, deliverables per dollar; a daily spend chart (at least 7 days, up to 30); the last three months; the two headline changes; unpriced models | Agents page: Total AI spend, Cost by month |
| **Agents** | Per agent: month to date, the window's cost and turns, $/turn, $/session, what it delivered (posts, pinned documents, files), $ per deliverable, cap status | Agents table: Cost (MTD), $/session (MTD), Cap usage (MTD) |
| **Improvements** | The five analyses, each with agent, finding, estimated 30-day saving, confidence and one action | Agent → Improvements tab |
| **Caps & budgets** | Monthly caps with burn rate, month-end projection, days to cap and Below / Near / Over cap; Switch Rooms budgets (list, add, edit, delete) | Monthly cap, Burn rate, Spending cap summary |
| **Trust** | Hosted guardrails on/off, telemetry to Trust on/off, our own guardrails (lockdown, approval, SAFETY block), the Trust MCP | Trust settings, Data sources |

The demo office (no workspace) shows the same five tabs with numbers modelled on a live War Room run, labelled
"Demo" and read-only.

## Where the numbers come from

| Switch piece | Route (switch-core 0.31.0) | How we use it |
|---|---|---|
| Tenant usage | `GET /gateway/tenants/{id}/usage?since=&until=` (`gateway/tenants.py:647`) | Totals per metric, agent and model over a window; Switch counts in whole UTC hours. One `/api/roi` reads the window, month to date, the two previous months, one call per day for the trend and one per hour for the last 24 h (at most 6 at a time). Past windows are cached in memory, since a closed hour never changes. Metrics: `messages`, `turns`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`. Tokens carry the model; turns and messages have `model: ""`. A turn is counted when it starts, its tokens when it ends. |
| Current tenant | `GET /gateway/tenants/current` | The tenant id for the paths above. |
| Budgets | `GET/POST/PUT/DELETE /gateway/tenants/{id}/budgets[/{id}]` (`tenants.py:711-805`) | Listed always; created, edited and deleted from the panel only with `ROI_BUDGETS=on`, host owner only. |
| Trust settings | `GET /gateway/trust-settings` (`gateway/trust_settings.py:69`) | Read only: whether hosted guardrails are on. |

Our side adds: messages each agent posted in the workspace, room documents it pinned, and gallery files it produced
(an event's `meta.artifact_url` or a `/gallery/…` link it posted).

`/api/roi` answers per workspace (`?ws=`, session cookie). Usage is tenant-wide, so only the host owner (or
`ADMIN_TOKEN`) gets live numbers and can edit; other accounts get `unavailable` without Switch being asked. `?hours=`
sets the window (default 24, max 720). Everything fails soft: Switch down, a non-admin login (403) or an older Switch
(404) gives `200 { source: "unavailable", reason }`, never a 500, and Switch's own answer is never passed through.

## Spend views

- **Month to date** per agent and in total, from the 1st of the month (UTC).
- **By month**: the two previous calendar months and this one.
- **Daily trend**: one bar per UTC day.
- **$/turn**: month-to-date cost over month-to-date turns. A Switch turn is one wake-up of the agent.
- **$/session**: Switch counts turns, not Claude Code sessions, so a *work session* here is a run of consecutive active
  hours in the last 24 h; $/session is that day's cost over those runs. With telemetry on (below), Trust's own
  $/session per Claude Code session is the exact figure.

## Monthly caps and forecast

Like Switch Trust's spending caps, and advisory in the same way: a cap tracks and forecasts, it never stops an agent.

- **Burn rate** = month-to-date spend ÷ days the month has run, including today.
- **Month-end** = burn rate × days in the month (flagged red when it passes the cap).
- **Days to cap** = (cap − spent) ÷ burn rate.
- **Status**: under 80% of the cap *Below cap* (`ok`), 80% or more *Near cap* (`warn`), 100% or more *Over cap* (`over`).
- The Caps tab sums the caps, what they've used, and how many agents are in each status.

Caps live in the office server's kv store (`roi:caps`). Set or clear them in the panel, or:

```
POST   /api/roi/caps?ws=<id>   { "agent": "d2c-captain", "usd": 1.5 }
DELETE /api/roi/caps?ws=<id>   { "agent": "d2c-captain" }
```

Host owner only, JSON only, foreign origins refused (the same checks as every write route). Setting a cap again edits it.

**Enforcement, opt-in.** With `ROI_BUDGETS=on`, `"enforce": true` also mirrors the cap into a Switch Rooms budget:
Switch budgets count units, not dollars, so the cap becomes a `turns` budget over 720 hours at the agent's
month-to-date $/turn (a $1.50 cap at $0.0018/turn is 822 turns). Setting the cap again updates that budget; clearing the
cap deletes it.

## Rooms budgets

A switch-core feature, not in the hosted docs: a budget covers one agent (or the whole workspace), one metric and
optionally one model (token metrics only), over a rolling period. A reached budget **refuses** the agent's addressed
messages until the period turns over (`budgets.py`), and usage is counted after a turn ends, so a budget can overshoot
by one turn. That is why editing is off by default. With `ROI_BUDGETS=on` the host owner can, from the panel or the API:

```
POST   /api/roi/budgets?ws=<id>        { "agent": "d2c-ads", "metric": "turns", "amount_limit": 200, "period_hours": 24, "model": "" }
PUT    /api/roi/budgets/<budget>?ws=<id> { "amount_limit": 300, "period_hours": 48 }
DELETE /api/roi/budgets/<budget>?ws=<id>
```

What a budget covers is fixed once created (Switch's own rule); to cover something else, add another.

## Pricing

Switch counts tokens, not money. `switch/pricing.json` holds the price of each model in USD per million tokens (input,
output, cache read, cache write), like Trust's Model pricing page. It ships with Anthropic's list prices:

| Model | Input | Output | Cache read | Cache write (5 min) |
|---|---|---|---|---|
| `claude-haiku-5-5` | $0.10 | $0.50 | $0.01 | $0.125 |
| `claude-sonnet-5-5` | $2 | $10 | $0.20 | $2.50 |
| `claude-opus-5-5` | $4 | $20 | $0.20 | $5 |

Haiku 5.5's card is for prompts up to 100K tokens; over 100K it is 5× ($0.50 / $2.50 / $0.05 / $0.625). Switch's
counters don't say which prompts crossed 100K, so a long-chat estimate is a floor.

Change a row to set a negotiated rate (the API reports it under `pricing.negotiated`); add a row to price a new model.
Edits apply on the next request. A model with no row is flagged **unpriced** on its agent and in the Overview: its
tokens are counted, its dollars aren't, and the panel says so instead of showing a quiet $0. Invalid rows are skipped
and logged.

## Improvements: the five analyses

Each finding names the agent, the numbers behind it, an estimated 30-day saving (the window's saving scaled to 720
hours, at your prices) and one action. Confidence follows how many turns back it: 50+ High, 10+ Medium, else Low.

| Analysis | Fires when | Saving |
|---|---|---|
| `context_cache_waste` | Cache hit rate (cache reads ÷ everything read) under 70%; or the agent re-reads over 50K cached tokens a turn and cache reads are 40%+ of its cost | Half of the full-price input and cache writes moved to cache-read price; or 30% of the re-read cost (a shorter history) |
| `verbosity` | Output tokens per turn over twice the team median, or 3+ posts over 900 characters | Output above the median, at the output price. Verdict "Candidate for verbosity optimization: Yes", as in the hosted panel |
| `model_optimizer` | Any spend on a model other than `claude-haiku-5-5` | That spend minus the same tokens at Haiku prices |
| `tool_bloat` | 40%+ of 5+ wake-ups produced no post, or only an acknowledgement ("ok", "confirmed") | Those turns at the agent's $/turn |
| `retry_loop_waste` | An hour with 6+ turns and at most one real post, or the same post twice within 15 minutes | Those turns at the agent's $/turn |

`tool_bloat` is measured differently on purpose. The hosted analysis counts tool definitions an agent offers but never
calls; Rooms usage carries no tool definitions. Its Rooms equivalent is the wake-up that produces nothing, which in a
16-agent room is the bigger cost (the panel calls it "Wake-up bloat").

## Value: cost per deliverable

The hosted ROI is cost-only. Kratos joins cost with output: **deliverables** = posts in the workspace + pinned room
documents + gallery files the agent produced, in the window. Per agent: cost per deliverable and deliverables per dollar;
in total, deliverables per dollar on the Overview.

## OpenTelemetry to Switch Trust (opt-in)

Switch Trust reads Claude Code's built-in telemetry. To send it, set two variables before running
`scripts/switch-up.sh` or `scripts/switch-sync-agents.sh`:

```
export TRUST_OTLP_ENDPOINT=https://<your instance>/agent/otel   # Trust → Settings → Data sources → OpenTelemetry → Setup
export TRUST_API_KEY=<an Ingest-only key>                        # Trust → Settings → API keys (a Viewer key is rejected)
scripts/switch-sync-agents.sh
```

`scripts/trust-otel.py` writes the documented variables into the agents' `.claude/settings.local.json` `env` (in
`AGENT_DIR`, the main checkout; gitignored, mode 600): `CLAUDE_CODE_ENABLE_TELEMETRY=1`,
`CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`, `OTEL_METRICS_EXPORTER=none`, `OTEL_LOGS_EXPORTER=otlp`,
`OTEL_TRACES_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, the endpoint, `OTEL_SERVICE_NAME=kratos`,
`OTEL_RESOURCE_ATTRIBUTES=gen_ai.agent.name=kratos-team` and the `Authorization=ApiKey …` header.

- **Usage only.** No `OTEL_LOG_*` variables (prompts, responses, tool content); any found are removed. Trust still gets
  the model, tokens, timing and cost of every turn.
- **One agent name.** Console's controller starts every managed agent with an empty `env`, the agent's directory as its
  working directory and Claude Code's default setting sources, and a managed-agent definition has no `env` field. All 16
  agents share the repository as their directory, so the shared `settings.local.json` is the only place telemetry can
  go, and there is no per-agent `gen_ai.agent.name`. Trust shows the team as one agent, **kratos-team**; the per-agent
  split stays in `/api/roi`. Giving each agent its own directory would fix it, at the cost of the shared repository the
  lockdown relies on. Any other Claude Code session started in that directory also reports under that name.
- **Never printed.** `DRY_RUN=1` shows every variable with the key redacted. The key is never logged or committed.
- **Applies to new sessions.** Running sessions keep their settings until they restart.
- **Off again**: run the script with both variables unset; it removes what it wrote.
- Don't also add the Switch Trust SDK to the same agents: Trust would count every call twice.

The Trust tab shows **Telemetry to Switch Trust: on/off** with the endpoint host and agent name (`trust.telemetry`,
`endpointHost`, `agentName`, `contentLogged` in `/api/roi`), read from that file; never the key.

## Trust MCP, for the developer

`switch-trust-mcp` lets a coding agent read a Switch Trust workspace: sessions with cost, tokens and turns
(`list_llm_sessions`, `get_llm_session`), Switch ROI's analyses (`list_roi_agents`, `get_latest_roi_analyses`,
`get_roi_analysis`), guardrail outcomes (`get_guardrail_outcomes`, `get_guardrail_categories`), evaluations and issues.
It is read-only. It belongs in **your** Claude Code, not the team's: the team has no use for it, and session data holds
prompts and customer messages.

1. In Trust: Settings → API keys → Create key, role **Viewer**.
2. Add to `.mcp.json` in your own checkout (gitignored: it holds the key in plain text):

   ```json
   { "mcpServers": { "switch-trust-mcp": { "command": "uvx", "args": ["switch-trust-mcp"],
     "env": { "SWITCH_TRUST_API_KEY": "sk_...", "SWITCH_TRUST_INSTANCE": "https://app.switchagents.ai" } } } }
   ```

3. Needs `uv` and Python 3.11+. Ask: "Use switch-trust-mcp to show which Switch Trust instance and workspace you're
   connected to." Then, with telemetry on: "What are the latest ROI analyses for kratos-team?" to compare Trust's
   findings with the Improvements tab.

## Switch Trust guardrails

- **Hosted guardrails** are a Switch Trust service (`trust/client.py`): before a message is delivered
  (`bridges/agent/protocol/agent_core.py:1722`, `bridges/collaboration/collaboration_core.py:1069`) Switch sends it to the
  check endpoint and gets back ok / blocked / redacted / alerted / errored. With no settings it allows everything. To turn
  them on, as the Switch instance admin:

  ```
  PUT /gateway/trust-settings
  { "endpoint": "https://api.switchagents.ai", "policy_id": "<policy id>", "api_key": "<key>" }
  ```

  `enabled` becomes true once a policy id and a key are stored; `DELETE /gateway/trust-settings` turns it off. The
  panel then shows "Hosted guardrails: enabled" with no code change. The check fails open on timeout and skips messages
  with attachments.
- **Our own guardrails** run either way:
  - **Agent lockdown** (`switch/lockdown.json`, [13](13-agent-lockdown.md)): tools `Bash, Read, Grep, Glob, Write` only,
    auto mode off, so anything `.claude/settings.json` doesn't allow waits for a person.
  - **Approval required:** the Captain runs the Finance gate (`@finance-approver`), then asks the founder once.
  - **SAFETY block** at the top of all 16 agents' instructions. Evals: injection asks refused 4/4
    (`evals/reports/latest.md`, read live).

## Findings

From the live local Switch (read-only, 7 Nov 2026):

1. **Model choice is the whole bill.** 96 team turns cost an estimated **$9.08**: **$8.75 on Opus 5.5** (runs before
   the team moved to Haiku) and **$0.33 on Haiku 5.5**. Per token Opus is 40x Haiku. This is `model_optimizer`.
2. **Agents mostly re-read.** 31.4M cache-read tokens against 126K output tokens: about 250 tokens read for every token
   written. The Captain reads 96% of its input from cache. Prompt caching is what makes a chatty 16-agent room
   affordable; on Haiku a cached read is $0.01 per million. This is the re-read side of `context_cache_waste`.
3. **The Captain is the cost centre:** 40% of all turns (38 of 96), because every report wakes it. Fewer wake-ups (no
   "confirmed" replies, one ask per plan) cut more than any prompt trim. This is wake-up bloat.
4. **A War Room run on Haiku is cents.** The 5-minute festive-sale run (63 agent messages, about 74 turns) models at
   about **$0.14**; the full 166-question eval costs $0.21.
5. **Switch has two kinds of cap.** Rooms budgets enforce at delivery and silence an agent; Trust's caps are advisory.
   Kratos defaults to advisory and makes enforcement a separate, explicit switch.
6. **Value is the half the hosted ROI leaves out.** Cost per deliverable is the number a founder asks about, and it
   needs the room's messages, which Kratos already has.
