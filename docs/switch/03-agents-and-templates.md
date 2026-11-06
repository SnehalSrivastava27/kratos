# 03 · Agents and templates

**One idea:** the whole team is one YAML file. Console turns it into six running Claude Code
agents, and a script keeps the live agents in step when the rules change.

## The team

| Agent | Topic | Job |
|---|---|---|
| `d2c-captain` | War Room | Splits the founder's ask, assigns work, posts the final plan |
| `d2c-analyst` | Analytics | Forecasts units and revenue per SKU from `data/*.csv` |
| `d2c-ads` | Ads | Meta ad plan inside the budget |
| `d2c-influencers` | Creators | Picks creators and their cost |
| `d2c-ops` | Ops | Stock by city, transfers between warehouses |
| `d2c-design` | Design | Writes sale banners into `gallery/` |

Each one's instructions live in `switch/agents/<id>.md`, and the template inlines the same text.

## The template (Switch schema v1)

`switch/d2c-team.template.yaml` follows Switch's template format (`switch:docs/TEMPLATES.md`).
Two rules bite: it needs `version: 1` and a `params:` block, and every `{placeholder}` must name a
declared param (`TEMPLATES.md:83-111`). Every agent must also state `provider`, `location` and
`directory`, or the run refuses (`TEMPLATES.md:322-328`).

```yaml
version: 1
params:
  provider:  { type: provider, default: [claude, codex, opencode], input: advanced }
  location:  { type: location, default: local, input: advanced }
  directory: { type: directory, description: The repo checkout. All agents share it. }
  team_room: { type: room, label: "Team group (Telegram forum)", default: ["Kratos D2C"], input: advanced }

agents:
  - name: "d2c-captain"
    description: Coordinates the sale plan across departments
    addressing: anyone
    provider: "{provider}"
    location: "{location}"
    directory: "{directory}"
    join: ["{team_room}"]
    instructions: |
      You are the Sale Captain of Kesar & Co., a D2C skincare brand. …
```
(`switch/d2c-team.template.yaml:7-42`, trimmed)

Things worth knowing:

- **`join`, not `room` + `kickoff`.** A template `room:` would *create* a channel, and Telegram
  bots can't create chats (`switch:core/switch_core/room_service.py:621`). So the room is a
  `room`-typed param and each agent `join`s the existing group (`contracts/switch-protocol-notes.md:52`).
- **One shared `directory`.** All six agents run in the repo checkout so they read the same
  `data/` and write the same `gallery/`. Console writes one credentials file per agent, so a
  shared directory is fine (`switch:console/.../core/agents/add-agent.ts:217-220`).
- **Storing it.** `scripts/switch-up.sh` stores or updates the template through the gateway
  (`POST/PATCH /gateway/templates`, `scripts/switch-up.sh:76-83`) and prints a Console link to run
  it. Console must do the **Create** step itself, because Console runs the agents' sessions.

## Addressing: who can make an agent act

| Mode | Who can make it act |
|---|---|
| `owner` (default) | Only the person who deployed it |
| `owner-agents` | The owner and the owner's agents |
| `anyone` | Every member of the room |
| `{anyone_in: [rooms]}` (v2) | Anyone, but only in those rooms |

(`switch:docs/TEMPLATES.md:416-418,657-659`)

The team uses **`anyone`**, so other agents (the captain assigning work) and our `d2c-office`
poster can address them. Our two silent agents are the opposite: **owner only**, so nobody can
make them act:

```json
{"policy": {"rules": [{"rooms": "*", "room_groups": "*", "users": [], "agents": [],
  "owner": true, "owner_agents": false, "platform": false}]}}
```
`PUT /gateway/agents/{id}/addressing-policy` (`scripts/switch-up.sh:104`, `server/src/switch.ts:94-95`).
A hire is opened up with `{"policy": null}` (`server/src/switch.ts:192-196`).

Addressing controls **who can make an agent act**. It does not control **what it receives**;
that is the stream `filter` (`switch:docs/official/internals/agent-protocol.md:49`).

## Instructions and the shared Telegram style block

Every agent's instructions end with the same block, so all six read the same in Telegram. It is
written for a founder reading on a phone, and for what the bridge can render (see [02](02-telegram-bridge.md)):

```text
HOW YOU WRITE IN TELEGRAM (follow exactly; a busy founder must get it in 5 seconds)
- Very simple English. Short words, short lines, one idea per line. No jargon.
- Line 1: your department emoji and a **bold title** (3-6 words).
- Facts as bullets. Start each with "- ". Label in bold, then the value.
- Every number in **bold**. Money as ₹ in lakhs: **₹1.18L**, **₹20.4L**.
- The ONE most important line (a decision, a risk or an ask) in **_bold italic_**.
- Last line in _italic_: what happens next and who does it, with their @name.
- Inside those two lines add no extra ** or _ …: Telegram would show broken marks.
- Never use tables, # headings, code blocks or long paragraphs. Max one emoji per line.
```
(`switch/TELEGRAM_STYLE.md`, trimmed)

`switch/TELEGRAM_STYLE.md` is the single copy. A test fails if it drifts from `switch/agents/*.md`
(commit `a0a8ffa`), and every office hire gets it appended to its instructions
(`server/src/office.ts:27-28,92-103`).

The instructions also tell each agent where to post: "observer/topics.json maps each department
to its topic; `switch_thread_id` is the thread id for that topic. Reply in the topic that
addressed you" (`switch/agents/d2c-captain.md:40-43`).

## Syncing live agents: `scripts/switch-sync-agents.sh`

Editing a `.md` file doesn't change a running agent. In Switch, an agent created by Console is a
**managed agent**: its instructions live in a *definition* with a *revision* number, and Console's
**controller** applies each new revision. The sync script edits the definition the same way
Console's agent editor does:

```bash
gw GET /management/agents > "$TMP/managed"
# for each team agent: build {"definition": {...old, "instructions": <the .md body>}}
gw PATCH "/management/agents/$id" "$TMP/patch"
```
(`scripts/switch-sync-agents.sh:47-63`)

Then it reads back until the controller reports `applied_revision == revision` for every agent,
and checks the new rules text is really there:

```text
•   d2c-captain      rules=yes  revision 4, running 4 (running)
```
(`scripts/switch-sync-agents.sh:65-81`). It is idempotent: unchanged agents are left alone.

What happens to running sessions: "live Claude Code sessions under the old definition are
stopped and resume their conversation under the new instructions the next time they are needed.
No manual restart." (`scripts/switch-sync-agents.sh:8-12`)

## Console-managed sessions, in one line each

- Console runs a Claude Code session per agent, on this Mac, in `directory`.
- Provider settings (provider, model, `auto_mode`, approvals, isolation) are part of the
  definition. `auto_mode` defaults to on (`switch:core/switch_core/management/schemas.py:91`).
- Hires copy these settings from `d2c-captain`, so they behave like the team ([06](06-hiring-agents-from-the-office.md)).
