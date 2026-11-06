# Blog outline: "Flip the Switch" (WeMakeDevs × DevTools Academy)

A ready skeleton that follows the order in `docs/PLAN.md` §12, updated for what shipped: the
product is **Kratos**, there are **6 agents** (Finance was dropped), and they work in **one
Telegram group with forum topics**. `docs/blog-draft.md` is the older draft; lift its problem
section, then use this order. Each section says what to write, which page to pull facts from,
and where a diagram goes. Lines marked **Pull-quote** are suggestions in your voice; edit them.

**Working title:** *I gave every department of a D2C brand an AI teammate. They live in one
Telegram group, and you can watch them work in a 3D office.*

**Tags:** #HowISwitch · Switch · Telegram · Claude Code · three.js

---

## 1. 💡 Problem (150 words)

- Indian D2C brands run on Telegram and WhatsApp groups, not Slack.
- Planning one festive sale: 6 teams, 40 voice notes, 3 days.
- The question: what if each department had an AI teammate who did the homework, in the group the
  team already uses?

**Pull-quote:** "Nobody on the team learns a new tool. The founder just types in a Telegram topic."

Media: a phone screenshot of the Kratos D2C group with its topic list.

## 2. 🤔 Why Switch (200 words)

- I wanted to build the *team*, not a chat app, a bot framework and a Telegram integration.
- What Switch gave me, one line each (from [README](README.md) "at a glance"): a local server
  from one Mac app, a Telegram bridge with one bot for all agents, rooms and threads, agents that
  address each other by name, Claude Code as the brain, and an open agent protocol for my own
  agents.
- "Without Switch, there's no product": no agents in Telegram, no hand-offs, no office feed.

**Pull-quote:** "Switch turned 'put six Claude Code agents in a Telegram group' from a project into
a template file."

Diagram: **architecture** → `../diagrams/architecture.png`

## 3. 🏢 What I built (250 words)

- Kesar & Co., a made-up skincare brand. 6 agents: Captain, Analyst, Ads, Creators, Ops, Design.
- One group "Kratos D2C", one topic per department.
- The festive-sale story: founder asks → captain assigns → analyst forecasts → ads, creators, ops,
  design report → captain's final plan → founder approves → confetti.
- The 3D office: every message moves someone, pops a bubble; hires walk in; a library of skills.
- Accounts: your group, your private office ([08](08-accounts-and-workspaces.md)).

Diagram: **message lifecycle** → `../diagrams/message-lifecycle.png`
Media: a GIF of phone + office side by side.

## 4. ⚙️ Setup from zero (Telegram specifics!) (400 words)

Pull from [01](01-console-and-local-server.md), [02](02-telegram-bridge.md), [05](05-rooms-topics-and-threads.md).

1. Install Switch Console → "Run a server on this computer" (no Docker, ~1 minute).
2. Settings → Agent providers → Claude Code reads *Installed*.
3. BotFather: `/newbot`, **Group Privacy off before adding the bot anywhere**.
4. Make the group, Topics on, bot admin with **Manage topics**.
5. `scripts/switch-up.sh`: connects the bot, stores the template, registers the observer, joins
   agents, creates the 6 topics, starts the office. Rerun after each phone step.
6. Console: Use the template → Create (6 agents appear).
7. `/list_agents` once in each topic (the thread trick).
8. Sign up, `/connect`, send the 6-digit code in the group.

**Pull-quote:** "Telegram bots can't create groups. You make the group; Switch adopts it."

Diagram: **Telegram ↔ Switch mapping** → `../diagrams/telegram-switch-mapping.png`
Diagram: **workspace linking** → `../diagrams/workspace-linking.png`

## 5. 🧑‍💼 Building the team (350 words)

Pull from [03](03-agents-and-templates.md) and [02](02-telegram-bridge.md).

- The template: `version: 1`, params, `join` instead of `room`, `addressing: anyone`.
- One shared style block so all six read the same on a phone. Show the Markdown → Telegram HTML
  example (the Ops stock plan) and the one rule that surprised me (no bold inside the bold-italic
  line: Telegram rejects crossed tags).
- `scripts/tg-render.py` to preview, `scripts/switch-sync-agents.sh` to push rule changes into live
  agents without restarting anything.

**Pull-quote:** "My agents' style guide has a rule because of an HTML nesting bug. That's what
writing for Telegram looks like."

## 6. 🏙️ The live office (350 words)

Pull from [04](04-agent-protocol.md), [07](07-observer-and-live-office.md), [06](06-hiring-agents-from-the-office.md), [09](09-skills-library-and-librarian.md).

- The observer: a Switch agent that never speaks. `scope=all&filter=all`, heartbeat every 2 s.
- Office → Telegram: `d2c-office` posts the founder's commands into a topic with `post_message`.
- Hiring from the office: the management API, settings copied from the captain, no Console click.
  The security review it needed.
- The skills library: 316 skills shelved by Claude Code in 45 s.

**Pull-quote:** "The office never talks to Telegram. It only watches Switch, and that made it easy."

Diagram: **agent protocol** → `../diagrams/agent-protocol.png`
Diagram: **hiring flow** → `../diagrams/hiring-flow.png`

## 7. 🐛 What went wrong (300 words)

Pick 4-5 from [10](10-gotchas-and-lessons.md):

1. The bot only saw mentions (privacy mode is read when the bot joins).
2. The room was called "Telegram: Kratos D2C", not "Kratos D2C".
3. A new forum topic isn't a thread until someone sends a command in it.
4. Turning on Topics changed the group's chat id.
5. "Only this Mac" isn't security: CSRF and DNS rebinding on the Hire button.

**Pull-quote:** "Match by id, not by name. Names get prefixes, and anyone can call their group
'Kratos D2C'."

## 8. 🛠️ How I built it (optional, 200 words)

- One lead orchestrator agent, 25 task branches in git worktrees, contracts first, status files.
- Every branch: validate (build, tests, screenshots at 1440 and 390), then a fresh subagent does
  an adversarial review of the diff before merge. 205 commits in one day.

Diagram: **build swarm** → `../diagrams/build-swarm.png`

## 9. 🚀 Try it (100 words)

- The demo replay on the landing page runs with no Switch at all.
- Full setup: README → "How Kratos uses Switch" → this folder.
- Repo link, Switch link (github.com/sandbox-quantum/switch), docs (docs.switchagents.ai).
- What's next: room documents instead of CSVs, Slack/Discord with no code change, a remote host.

**Closing line:** *#HowISwitch*

---

## Checklist before publishing

- [ ] Screenshots have no bot token, chat id, email or phone number in view.
- [ ] Numbers in the story match `demo/feeds/sale-demo.json`.
- [ ] Every Switch claim links to the page here that cites the source.
