# Kratos

AI teammates for every department of a D2C brand, working in your team's Telegram group, powered by Switch.

> The founder types one message. Six AI teammates (Captain, Analyst, Ads, Creators, Ops and Design) plan
> the whole festive sale in **Telegram forum topics** through **Switch**. A live 3D office shows
> them at work, and you can walk around it, give orders, hire new teammates and browse their skills library.

![Kratos office](web/public/hero/office-poster@2x.webp)

Built for **Flip the Switch** (WeMakeDevs × DevTools Academy), **Track 1: Best Business Workflow**.
Demo brand: **Kesar & Co.**, a fictional Indian skincare D2C brand.

---

## 1. The problem

Indian D2C teams don't run on Slack. They run on Telegram and WhatsApp groups. Planning one
festive sale means 6 teams, 40 voice notes and 3 days of back-and-forth. Marketing overspends,
ops finds a stockout too late, and nobody has the full plan in one place.

**Kratos** puts an AI teammate in each department's topic of one Telegram group. The founder sends
one message in the War Room. The team forecasts, splits the ad budget, shortlists creators, moves
stock and makes banners. Then the Captain posts one final plan for the founder to approve. Nobody
on the team has to learn a new tool.

## 2. How Switch powers it

**Switch is the backbone.** It hosts the agents, connects them to Telegram, routes messages between
them and gives them shared context. Everything else in this repo (the office, the landing page and the
event server) watches what happens inside Switch or sends commands into it.

![Architecture](docs/diagrams/architecture.png)

```
Founder's phone (Telegram, group "Kratos D2C" with forum topics)
        │
        ▼
┌──────────────────────────┐  Telegram bridge  ┌──────────────────────────────┐
│ Switch (Console + core)  │◄─────────────────►│ War Room · Analytics · Ads · │
│ 6 agents · rooms ·       │                   │ Creators · Ops · Design      │
│ threads · shared context │                   └──────────────────────────────┘
└──────┬─────────────▲─────┘
       │ agent       │ management API (hire) + agent message API (commands)
       │ protocol    │
       ▼             │
 d2c-observer ──POST /api/events──► Office server :8787 ──/ws──► 3D office (/app)
 (silent agent)                     (accounts, SQLite)          landing page (/)
```

### Without Switch, nothing works

| Switch provides | Without it |
|---|---|
| Telegram bridge (one bot for every agent) | Agents can't read or post in the group. No product. |
| Rooms and threads that map to forum topics | No department topics, no War Room, no hand-offs. |
| Agent-to-agent addressing (`@d2c-analyst`) | The Captain can't assign work or collect results. |
| Shared context across agents | The Captain can't see the forecast, ads plan and creator fees, so the budget can't be checked. |
| Agent protocol (SSE) for custom agents | The observer can't see messages, so the office stays empty. |
| Management API | "Hire" in the office can't create a new agent. |

The only part that runs without Switch is the **demo replay** at `/demo`: it plays a recorded
feed (`demo/feeds/sale-demo.json`) so anyone can see the UI offline.

### Every Switch feature we used

Written up for a blog, with sources, snippets and 7 Excalidraw diagrams:
**[docs/switch/](docs/switch/README.md)**. It covers Console and the local server, the Telegram bridge,
templates, the agent protocol, topics and threads, hiring from the office, the live office feed,
workspaces, the skills library, and gotchas.

## 3. The team

One Telegram supergroup, **Kratos D2C**, with one forum topic per department.

| Agent | Topic | Job |
|---|---|---|
| 🎯 `d2c-captain` | War Room (+ all topics) | Takes the founder's ask, assigns work, posts the final plan for approval |
| 📊 `d2c-analyst` | Analytics | Forecasts units and revenue per SKU |
| 📣 `d2c-ads` | Ads | Splits the Meta ads budget by ROAS |
| ⭐ `d2c-influencers` | Creators | Shortlists creators by engagement and sales per ₹ |
| 📦 `d2c-ops` | Ops | Finds stock gaps and books transfers so every region gets 1–2 day delivery |
| 🎨 `d2c-design` | Design | Makes 3 sale banners into `gallery/` |
| 📚 Librarian | (office only) | Reads every installed skill and shelves it by department in the office library |

Each agent's instructions: `switch/agents/<agent-id>.md`. They all load from
`switch/d2c-team.template.yaml`. Replies follow one Telegram style (bold title, short bullets,
bold numbers, one bold-italic key line): [`switch/TELEGRAM_STYLE.md`](switch/TELEGRAM_STYLE.md).

## 4. The office (`/app`)

- **Full-screen and walkable.** You walk with WASD. Each agent sits at their department desk and walks
  to the War Room when assigned work. Speech bubbles show their real Telegram messages.
- **Command bar.** Type an order and pick a topic. It is posted into your Telegram group through Switch,
  and the agents answer it there.
- **Hire.** You can add a new teammate (name, department, job). The server creates the agent through
  Switch's management API and adds it to the group. Nothing has to be clicked in Console.
- **Skills library.** The bookshelves hold every installed agent skill (316 of them), shelved by department by the Librarian.
- **Private by default.** You sign up with email and password, then link your own Telegram group by
  sending a 6-digit code in it. Your chats appear only in your office. The public site shows only the demo.

## 5. Setup

You need: Node 22.13+ (24 recommended), Python 3, and for the live version Switch Console and a Telegram account.

### 5a. Just see it (no Switch, no Telegram)

```bash
git clone https://github.com/SnehalSrivastava27/kratos && cd kratos
cp .env.example .env
npm install          # also installs server/ and web/
npm run demo         # server :8787 + web :5173, Ctrl+C stops both
```

- <http://localhost:5173/>: the landing page.
- <http://localhost:5173/demo>: the office replaying the recorded sale.

### 5b. Live with Switch and Telegram

1. Install [Switch Console](https://github.com/sandbox-quantum/switch) and start its local server.
2. Create a bot with [@BotFather](https://t.me/BotFather) and turn privacy off with `/setprivacy` → **Disable**.
   Put the token in `.env` as `TELEGRAM_BOT_TOKEN`.
3. Run `scripts/switch-up.sh`. It connects the bot, stores the team template, registers the
   observer, and starts the office server and the observer. It is safe to rerun, and it prints what's left.
4. Create a Telegram group, turn **Topics** on, add the bot as an admin with **Manage topics**.
5. Open <http://localhost:8787/signup>, then **/connect**, and send the 6-digit code in the group.
   The server creates the six topics and adds the agents.

Step by step, with troubleshooting: [`docs/GO_LIVE.md`](docs/GO_LIVE.md).

### 5c. Production

```bash
npm run build && PORT=8787 npm start   # one Node process: site, /api, /ws, /gallery
npm run ci                             # build, server tests, demo-feed check, number check, e2e
```

Self-hosting and Docker: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## 6. Run the demo

In the **War Room** topic, send:

```
@d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget
```

1. 🎯 Captain restates the goal and assigns work by name.
2. 📊 Analyst posts the forecast: **3,340** units, about **₹20.4L**.
3. 📣 Ads, ⭐ Creators, 📦 Ops and 🎨 Design work in their topics. Ops finds that Delhi is short
   and books transfers from Mumbai. Design pins 3 banners.
4. 🎯 Captain checks the total against the ₹5L budget and posts one final plan.
5. The founder replies "Approved". 🎉 Every teammate confirms launch, and the office celebrates.

## 7. Demo data

All files are in `data/`: `products.csv`, `past_sales.csv`, `regions.csv`, `warehouses.csv`,
`channels.csv`, `meta_campaigns.csv`, `influencers.csv`, `budget.json`. Check the expected numbers
with `python3 switch/check_numbers.py`.

## 8. Challenges we faced

What broke while we built this, why it broke, and how we fixed it. More detail on the Switch
ones: [`docs/switch/10-gotchas-and-lessons.md`](docs/switch/10-gotchas-and-lessons.md).

### Switch and Telegram

| Problem | Why | Fix |
|---|---|---|
| The office missed every message from the group | Switch names bridged rooms `Telegram: Kratos D2C`, not `Kratos D2C` | The observer matches room names by suffix |
| Agents ignored normal messages | The bot only sees messages that mention it, and agents only act when addressed | Privacy mode off in BotFather; the Captain addresses each agent by `@name` |
| A template can't create Telegram groups or topics | Templates define agents, not chats | The office server creates the forum topics itself when you link a group |
| The chat id changed mid-build | Turning Topics on upgrades a group to a supergroup with a new id | Link groups by code, not by a hard-coded id |
| A new forum topic isn't a Switch thread yet | Switch only learns a thread after a message arrives in it | Commands fall back to General with a `#Topic` tag until the thread is known |
| Duplicate "Kratos D2C" rooms | The old basic group and the new supergroup both stayed in Switch | Match by chat id stored per workspace |
| Bot replies looked ugly in Telegram | Agents wrote Markdown tables and headings, and Telegram shows broken `**` and `_` | One strict style block in every agent's rules, plus Markdown → Telegram HTML with a 4096-char limit; `scripts/tg-render.py` previews a reply |
| Editing an agent's `.md` changed nothing | Live agents keep the instructions they were created with | `scripts/switch-sync-agents.sh` pushes changes to the live agents and checks each one |
| Hiring needed a click in Switch Console | Templates are applied from the Console UI | The office hires through Switch's management API (`POST /gateway/management/agents`) |
| Two observers posted every event twice | A restarted observer left the old one running | One observer process, started by `switch-up.sh` |
| We can't check that whoever sends a link code is a group admin | Switch passes only the sender's display name | The code is private to your account, and setup only finishes once an admin makes the bot an admin |

### The office and landing page

| Problem | Why | Fix |
|---|---|---|
| First office looked like a toy | Plain boxes and spheres | Rebuilt it on an imperative three.js engine in the style of agent-office: toon shading, path-finding, walkable player |
| 3D models didn't load in production | Our CSP blocked the WASM mesh decoder | Added `'wasm-unsafe-eval'` to `script-src` |
| GPU memory grew from 318 MB to 1.1 GB | Meshes and textures weren't disposed when people left the scene | Dispose meshes, materials and textures when the office unmounts |
| Agent text could inject HTML | Bubbles rendered agent output as HTML | A small safe Markdown renderer, with no `innerHTML` |
| The landing page went blank | Adding the Librarian to the roster gave the hero an agent without a room | Only agents with a department room are shown |
| The rotating WhatsApp / Telegram / Slack logo clipped and jumped | Fixed `em` widths, and a flex column stretched every word to the widest | Measure each word's real width and use `items-start`; `1lh` height for the baseline |
| Brand logos had uneven padding | The Flipkart SVG's viewBox was much larger than the logo | Cropped the viewBox to the logo's pixel bounds |
| Design was rejected twice | A dark theme and then a flat one didn't fit the brand | Light shadcn/ui in a Supercut-style layout, with Lucide icons and real brand logos |

### Server and security

| Problem | Why | Fix |
|---|---|---|
| "Only on this Mac" wasn't safe | Any website you open can POST to `localhost` (CSRF, DNS rebinding) | Writes need JSON, an allowed Origin/Host, and a session cookie or admin token |
| A hire leaked into another workspace | Hires weren't scoped to the account | Every write is scoped to the signed-in workspace |
| A bad WebSocket frame crashed the server | No validation on incoming frames | ajv validation, and errors are dropped per socket |
| Link codes could be guessed | 6 digits with no limit | Single-use codes, claimed atomically, with brute-force budgets |
| Unlimited hiring | Each hire creates a real agent | At most 12 agents, and 3 hires per 10 minutes |
| The live Design agent overwrote committed banners | It wrote into the same `gallery/` folder | Live output goes to `gallery/live-run/` (gitignored) |

### Building with a swarm of agents

| Problem | Why | Fix |
|---|---|---|
| Agents edited each other's files | Many coding agents in one repo | One git worktree and branch per task, file ownership in each brief, and read-only `contracts/` |
| `claude -p` workers stalled | Headless runs can't approve shell commands | Ran the workers as subagents inside their worktrees instead |
| Removing Finance broke the build | Office state still referenced the `finance` zone | Removed the zone everywhere; CI now builds every package on each push |
| Confident bugs slipped through | Agents mark their own work "done" | A fresh subagent adversarially reviews every branch before merge. It caught the XSS, the GPU leak, CSRF and the workspace leak above |
| CI failed but local passed | A library test wiped a shared fixture, and the CI runner has no skills installed | Tests rewrite their fixtures on every start |

How the build was split: [`docs/ORCHESTRATION.md`](docs/ORCHESTRATION.md) and
[`docs/diagrams/build-swarm.png`](docs/diagrams/build-swarm.png).

## 9. Repo map

| Path | What |
|---|---|
| `switch/` | Team template, one instruction file per agent, Telegram style |
| `scripts/` | `switch-up.sh`, `switch-sync-agents.sh`, `tg-render.py` |
| `observer/` | Silent Switch agent that forwards room messages to the office |
| `server/` | Node server: accounts, workspaces, events (SQLite), WebSocket, hiring, commands, library |
| `web/` | Landing page, login and connect pages, 3D office |
| `contracts/` | Shared shapes: roster, zones, event schema, API |
| `data/`, `demo/` | Demo data and the recorded sale |
| `docs/` | Switch feature docs, diagrams, deploy and go-live guides |

## 10. Roadmap

- **WhatsApp bridge** through the official WhatsApp Business API.
- **Finance teammate** that checks EBITDA and pushes back before the Captain's plan.
- **Live Shopify data** instead of CSVs.
- **Returns triage** and **restock alerts**.

## Credits

Powered by [Switch](https://github.com/sandbox-quantum/switch).
Office style inspired by [AgentSystemLabs/agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT).
Brand logos: see [`web/public/brands/CREDITS.md`](web/public/brands/CREDITS.md). They are trademarks of their owners.
