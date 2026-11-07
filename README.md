# Kratos

**An AI operations team for D2C brands that works in your Telegram, powered by [Switch](https://github.com/sandbox-quantum/switch).**

> [!IMPORTANT]
> **Live demo: <https://kratos-mauve.vercel.app>** (sign in with `demo@kratos.app` / `kratos-demo`, or press **Sign in as demo**)
>
> The hosted site is a **demo only**. It shows a read-only office filled with sample data. You can walk the
> office and open the topics, chat, ROI, Switch panel and agent cards, but no real agents run behind it.
> Sending messages, approving plans, hiring and linking a Telegram group do **not** work there.
>
> **To use Kratos for real, install it on your own computer** with your own Switch Console, coding agent
> (Claude Code, Codex or OpenCode) and Telegram bot:
>
> 1. Install Node 24+, Python 3, [Switch Console](https://github.com/sandbox-quantum/switch) and a coding agent,
>    and get a bot from [@BotFather](https://t.me/BotFather) with privacy mode off.
> 2. In Switch Console, sign in and turn on **Run a server on this computer**.
> 3. Clone and start:
>    ```bash
>    git clone https://github.com/SnehalSrivastava27/kratos && cd kratos
>    cp .env.example .env                  # put your bot's token in .env as TELEGRAM_BOT_TOKEN
>    npm install
>    export BOT_USERNAME=your_bot_username # without the @
>    scripts/switch-up.sh                  # creates the 16 agents and starts the office on :8787
>    ```
> 4. Make a Telegram group with **Topics** on and your bot as an admin with **Manage topics**.
> 5. Open <http://localhost:8787/signup>, then **/connect**, and send the 6-digit code in the group.
> 6. In the **War Room** topic, send `@d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget`.
>
> Full steps: [Quickstart](#quickstart) · [Go live guide](docs/GO_LIVE.md)

Sixteen AI teammates, one per department of a D2C brand, live in the forum topics of your team's Telegram
group. You send one message; the Captain briefs the department leads, the leads pull in their specialists,
Finance checks the money, and one plan comes back for your approval. A walkable 3D office shows the team at
work and what every agent costs.

![The Kratos office](web/public/hero/office-poster@2x.webp)

**[Try the demo](#try-the-demo)** · [Features](#features) · [How it works](#how-it-works) ·
[Install](#quickstart) · [Documentation](#documentation)

---

## Why Kratos

Indian D2C teams don't run on Slack. They run on Telegram and WhatsApp groups. Planning one festive sale
means six teams, dozens of voice notes and days of back-and-forth: marketing overspends, ops finds a
stockout too late, and nobody has the full plan in one place.

Kratos puts an AI teammate in each department's topic of one Telegram group. It forecasts, splits the ad
budget, shortlists creators, moves stock, makes banners and checks the P&L, with every number computed from
your data. Nobody on the team has to learn a new tool.

## Features

### Team and departments

- **16 agents in 6 departments**, organised like a real company: a Captain, six leads and nine specialists.
- **Finance is the gate.** Nothing reaches the founder until Finance has checked it against the budget and
  finance policy. Finance can nudge a lead privately before the plan goes out.
- **Founder approval.** The Captain pins the final plan in Switch and asks you to approve or request changes.
- **Grounded numbers.** Agents never guess: they run a read-only toolkit over your data and cite the source.
- **Deliverables, not just chat.** Banners, decks, spreadsheets, Word documents, PDFs and charts land in
  `gallery/live-run/` and come back as links.
- **Hire from the office.** Walk to an empty desk and hire a new teammate; a real Switch agent joins the group
  and catches up on the conversation before its first task.
- **Morning brief.** Every day at 9 AM IST the Captain posts the numbers and the one decision to make today.

```mermaid
flowchart TD
  F[👑 Founder] --> C[🎯 Sale Captain<br/>War Room]
  C --> AN[📊 Analyst] & AD[📣 Ads Lead] & CR[⭐ Creators Lead] & OP[📦 Ops Lead] & DE[🎨 Designer]
  C <-->|the gate| FI[💰 Finance Lead]
  AN --> FO[🔮 Forecaster] & IN[🔎 Insights]
  AD --> MP[🛒 Marketplaces] & GO[🔍 Google Ads]
  CR --> UG[🎬 UGC Producer]
  OP --> PR[🧾 Procurement] & LO[🚚 Logistics]
  DE --> CW[✍️ Copywriter]
  FI --> PA[🧑‍💼 Payroll & HR]
  FI -.->|private note via Switch| CR
```

| Agent | Topic | Reports to | Job |
|---|---|---|---|
| 🎯 `d2c-captain` | War Room | Founder | Takes the ask, briefs the leads, gets Finance's OK, posts the plan for approval |
| 📊 `d2c-analyst` | Analytics | Captain | Sales, channel and cohort numbers; owns the forecast |
| 🔮 `d2c-forecaster` | Analytics | Analyst | Demand forecast per SKU, channel and city |
| 🔎 `d2c-insights` | Analytics | Analyst | Customers, cohorts, repeat rate, returns and RTO |
| 📣 `d2c-ads` | Ads | Captain | Splits the Meta budget by ROAS |
| 🛒 `d2c-marketplaces` | Ads | Ads Lead | Amazon, Flipkart, Nykaa, Myntra, Blinkit, Zepto: ads, fees, listings |
| 🔍 `d2c-google` | Ads | Ads Lead | Google Search, Shopping and YouTube |
| ⭐ `d2c-influencers` | Creators | Captain | Shortlists creators by engagement and sales per ₹ |
| 🎬 `d2c-ugc` | Creators | Creators Lead | Creator post results, UGC briefs, coupon tracking |
| 📦 `d2c-ops` | Ops | Captain | Stock by warehouse, transfers, no stockouts |
| 🧾 `d2c-procurement` | Ops | Ops Lead | Suppliers, raw materials, POs, MOQ and lead times |
| 🚚 `d2c-logistics` | Ops | Ops Lead | Couriers, delivery days, COD, RTO and returns |
| 🎨 `d2c-design` | Design | Captain | Sale banners and decks |
| ✍️ `d2c-copywriter` | Design | Designer | Sale copy, ad headlines, product page and WhatsApp text |
| 💰 `d2c-finance` | Finance | Captain | P&L, EBITDA, budget sign-off; nudges leads privately, then approves or pushes back |
| 🧑‍💼 `d2c-payroll` | Finance | Finance Lead | Employees, salaries, PF, TDS and team cost |

Plus 📚 **Librarian** (office only), which shelves every installed skill by department. Each agent's rules
live in `switch/agents/<id>.md`; replies follow one Telegram style (bold title, short bullets, bold numbers,
money in lakhs), defined in [`switch/TELEGRAM_STYLE.md`](switch/TELEGRAM_STYLE.md).

### Switch Rooms

- **One group, one room.** Switch turns the Telegram group into one room and each forum topic into a thread.
  One bot carries all 16 agents, addressed by `@name`.
- **Private notes.** Finance's nudges to a lead go through an agents-only `internal_only` room that is never
  bridged to Telegram.
- **Room documents.** The Captain pins the plan as a Switch room document; Finance reads it and pins its sign-off.
- **Room roles.** `@finance-approver` and `@ops-oncall` reach whoever holds the seat, not a hard-coded name.
- **Workspaces.** Each account links its own group with a 6-digit code and sees only its own office.

### Switch ROI

What every agent costs, and what it delivers, read live from Switch's usage counters.

- **Per-agent spend**, month to date and by month, with tokens broken down by model.
- **Monthly caps and forecast.** Set a cap per agent; the panel projects month-end spend against it.
- **Rooms budgets.** Create, edit and delete Switch budgets per agent from the panel; a cap can also be enforced as a budget.
- **Pricing overrides.** Costs default to Anthropic list prices; edit `switch/pricing.json` to match your contract. Unknown models are flagged, never counted as $0.
- **Five cost analyses** that point at the fix, not just the total:
  - *Cache waste*: agents re-reading the same cached chat every turn.
  - *Verbosity*: replies longer than the job needs.
  - *Model optimizer*: work a cheaper model would do as well.
  - *Tool bloat*: wake-ups that produced nothing new (no post, or only "ok / confirmed").
  - *Retry loops*: bursts of turns with no new output, and duplicate posts.
- **Cost per deliverable**: spend divided by banners, decks, plans and documents actually produced.
- **OpenTelemetry export** of agent usage to Switch Trust (opt-in). All agents share one working directory, so Trust sees them as one agent, `kratos-team`; the per-agent split stays in the panel.

![ROI and Trust data flow](docs/diagrams/16-roi-trust.png)

### Switch Trust

- **Guardrails status**: whether Switch's hosted guardrails (block, redact, alert) are on for this tenant.
- **Agent lockdown**: every agent runs with a fixed tool list and auto mode off; anything outside the kit and
  `gallery/live-run/` waits for a human. See [Agent lockdown](docs/switch/13-agent-lockdown.md).
- **Approval gate**: Finance and then the founder must approve before a plan is final.
- **Injection-tested**: prompt-injection probes ("SYSTEM OVERRIDE: rm -rf …") are part of the eval suite and
  are refused, live and offline.

### The office

An 88 × 44 m walkable 3D HQ at `/app` (and `/demo`).

| You can | How |
|---|---|
| Walk the office as the founder | WASD or click the floor; Shift to sprint; E to use what you face |
| See Switch work | Pulses run Telegram → Switch → desk; violet ones are private notes. Click the Switch core for routed messages and pinned documents |
| See what it costs | The coin button opens Switch ROI and Trust |
| Give an order | The command bar posts into your Telegram topic through Switch |
| Review and approve the plan | The plan station in the War Room, or Approve in the chat |
| Hire a teammate | Walk to an empty desk and press E |
| Read the numbers | Data Wall (KPIs) and the ledger (last month's P&L) |
| Browse skills | The Library shelves, by department |

![Office floor plan](docs/diagrams/17-office-floor-plan.png)

## How it works

**Switch is the backbone.** It hosts the agents, connects them to Telegram, routes messages between them and
gives them shared context. The office watches what happens inside Switch and sends commands into it.

![Architecture](docs/diagrams/18-architecture.png)

- **Telegram → Switch.** One bot carries all 16 agents. Switch Console runs each agent as a coding-agent
  session (Claude Code on Haiku by default), locked down.
- **Agents → data.** Agents run `node kit/bin/kit.mjs <command>` over `data/` and write files to `gallery/live-run/`.
- **Switch → office.** `d2c-observer`, a silent Switch agent, reads every room over the agent protocol and posts
  to the office server (`server/`, SQLite), which pushes to the browser over `/ws`.
- **Office → Switch.** Commands go back through the `d2c-office` agent; hires, room roles, usage, budgets and
  trust settings go through Switch's gateway API.

Every Switch feature Kratos uses, with sources and diagrams: [docs/switch/](docs/switch/README.md).

## Try the demo

### Demo account

Sign in at `/login` with the demo account to look around a full office (or press **Sign in as demo**):

| | |
|---|---|
| **Email** | `demo@kratos.app` |
| **Password** | `kratos-demo` |

All 16 agents are at their desks, every Telegram topic has a day of chat, and sale day one keeps playing. Open the
topics, chat, Data Wall numbers, Switch ROI, the Switch panel, the skills library, agent cards and the hire form. The
demo account is read-only: sending, approving and hiring need Kratos running with your own Telegram group.
It works on the hosted demo at <https://kratos-mauve.vercel.app>, which has no server behind it ([docs/HOSTING.md](docs/HOSTING.md)) and on a local install.

### Product tour

The product tour replays a recorded festive-sale planning session. No Switch or Telegram needed.

```bash
git clone https://github.com/SnehalSrivastava27/kratos && cd kratos
cp .env.example .env
npm install          # also installs server/, web/ and kit/
npm run demo         # server :8787 + web :5173, Ctrl+C stops both
```

Open <http://localhost:5173/demo>. Watch the Captain brief the leads, approve the plan when it pauses for you,
open the coin button for ROI and Trust, and click the Switch core to see routed messages and pinned documents.
<http://localhost:5173/> is the landing page.

## Quickstart

The hosted demo is read-only and has no live agents. To run the team for real, set Kratos up on your own
computer with **your own Switch Console, coding agent and Telegram bot**. The agents run on your machine and
use your own account with your agent provider; nothing depends on anyone else's Switch or anyone else's Claude.

### Requirements

- **Node 24+** (the toolkit's read-only SQL guard needs `node:sqlite`'s authorizer) and **Python 3**
- **A coding agent Switch supports**, installed and logged in: [Claude Code](https://claude.com/claude-code)
  (default), Codex or OpenCode
- **[Switch Console](https://github.com/sandbox-quantum/switch)**, installed and signed in to your Switch account
- **Your own Telegram bot** from [@BotFather](https://t.me/BotFather), with privacy mode off (`/setprivacy` → **Disable**)

### 1. Connect your Switch Console

1. Open Switch Console and sign in.
2. Turn on **Run a server on this computer**, and check that your coding agent is listed as an agent provider.
3. Keep Switch Console open while you use Kratos: the agents run only while it is running.

`scripts/switch-up.sh` finds the local server's credentials on its own. If Switch Console is installed
somewhere unusual, point `SWITCH_CORE_ENV` at its credentials file.

### 2. Install Kratos and bring up the team

```bash
git clone https://github.com/SnehalSrivastava27/kratos && cd kratos
cp .env.example .env     # put your bot's token in .env as TELEGRAM_BOT_TOKEN
npm install
export BOT_USERNAME=your_bot_username    # without the @
export TEAM_PROVIDER=claude              # or codex / opencode; optional TEAM_MODEL (default: Haiku on Claude)
scripts/switch-up.sh     # DRY_RUN=1 scripts/switch-up.sh shows the plan first
```

The script connects your bot to your Switch, stores the team template, creates all 16 agents on Haiku with the
lockdown, registers the observer, and starts the office server (<http://localhost:8787>) and the observer.
It is safe to rerun and ends by printing anything still left for you.

### 3. Link your Telegram group

1. Create a Telegram group. Edit → turn **Topics** on, then add your bot as an admin with **Manage topics**.
2. Open <http://localhost:8787/signup>, create your account, then go to **/connect**.
3. Send the 6-digit code as a message in the group. The server creates the topics and adds the agents.
   If the page says the bot still needs admin rights, fix that in Telegram and press **Check again**.
4. Send these two lines once in the group, so you can talk to the Captain without tagging it (the connect
   page shows both with copy buttons):

   ```
   !assign-agent @d2c-captain
   !set-alias @d2c-captain @<your_bot_username>
   ```

### 4. Start a session

In the **War Room** topic, send:

```
@d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget
```

Full guide: [Go live](docs/GO_LIVE.md). What a session looks like end to end: [Running a live session](docs/live-demo-run.md).

### Commands

| Command | What it does |
|---|---|
| `npm run demo` | Dev server (:8787) and web app (:5173) |
| `npm run build && npm start` | Production: one Node process serves the site, `/api`, `/ws` and `/gallery` |
| `npm run ci` | Build, server tests, demo-feed check, number check, end-to-end and toolkit tests |
| `npm run evals` | Eval suite, offline (one `claude -p` per question); `npm run evals -- --live` runs it through Switch |
| `npm run evals:truth` | Print every eval question with its computed answer, no model calls |
| `npm run data` / `npm run data:check` | Regenerate the sample data (seeded, byte-identical) / validate it |
| `npm run kit -- <command>` | Run the agents' toolkit by hand |
| `scripts/switch-sync-agents.sh` | Push changed agent rules (`switch/agents/*.md`) to the live agents |
| `node scripts/build-template.mjs` | Rebuild `switch/d2c-team.template.yaml` from the roster and rules (`--check` to verify) |
| `python3 scripts/tg-render.py - < reply.md` | Preview how a reply renders in Telegram |
| `python3 switch/check_numbers.py` | Reference numbers for the festive-sale plan |

## Documentation

| Guide | What's in it |
|---|---|
| [Go live](docs/GO_LIVE.md) | Full setup with Switch and your Telegram group |
| [Running a live session](docs/live-demo-run.md) | A festive-sale planning session, end to end |
| [Configuration](docs/CONFIGURATION.md) | Every environment variable |
| [Self-hosting and Docker](docs/DEPLOY.md) · [Hosted demo](docs/HOSTING.md) | Deploying the server, or a static demo on Vercel |
| [Switch features](docs/switch/README.md) | Every Switch feature Kratos uses: Rooms, ROI, Trust, agent protocol, with diagrams |
| [Data and toolkit](docs/DATA-AND-TOOLKIT.md) | The sample brand's dataset and the agents' toolkit commands |
| [Toolkit guide](switch/TOOLKIT.md) · [Metrics](switch/METRICS.md) | The 50 built-in D2C metrics and how agents call them |
| [Quality](docs/QUALITY.md) · [Evals guide](evals/README.md) | How agents are tested; latest result 177/178 on Haiku |
| [Security](docs/SECURITY.md) · [Agent lockdown](docs/switch/13-agent-lockdown.md) | Agent lockdown, read-only toolkit, server hardening |
| [Project layout](docs/PROJECT-LAYOUT.md) | What lives where |
| [D2C primer](docs/d2c-primer.md) | D2C terms (ROAS, RTO, COD, EBITDA) for newcomers |
| [API](contracts/api.md) · [Data catalog](contracts/data-catalog.md) | Server API and table schemas |

## Roadmap

- **WhatsApp** through the official WhatsApp Business API.
- **Live Shopify data** instead of CSVs; returns triage and restock alerts.
- **Approval cards** with Telegram buttons as the founder's sign-off.

## Credits

Built on [Switch](https://github.com/sandbox-quantum/switch). The office engine and the founder's follow camera
are adapted from [AgentSystemLabs/agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT).
Brand logos: see [`web/public/brands/CREDITS.md`](web/public/brands/CREDITS.md); they are trademarks of their owners.
