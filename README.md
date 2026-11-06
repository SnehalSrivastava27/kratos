# Kratos

AI teammates for every department of a D2C brand, in Telegram, powered by Switch.

> Every department of your D2C brand gets an AI teammate. They work together in your team's
> **Telegram** groups through **Switch**, and a live 3D office shows them planning your next sale.

<!-- GIF: phone with Telegram War Room + live office side by side -->

Built for **Flip the Switch** (WeMakeDevs × DevTools Academy), Track 1: Best Business Workflow.
Demo brand: **Kesar & Co.**, a fictional Indian skincare D2C brand.

---

## 1. The problem

Indian D2C teams don't run on Slack. They run on Telegram and WhatsApp groups. Planning one
festive sale means 6 teams, 40 voice notes and 3 days of back-and-forth: marketing overspends,
ops finds a stockout too late, finance says no after everything is booked.

**Kratos** puts an AI teammate in each department's Telegram group. The founder types one
message in the War Room, and the team plans the whole sale, including Finance pushing back when
the numbers don't work. Nobody on the team learns a new tool.

## 2. How Switch powers it

**Switch is the backbone.** It hosts the seven agents, connects them to the Telegram groups,
routes messages between them and gives them shared context. Everything else in this repo
(the office, the landing page, the event server) only *watches* what happens inside Switch.

```
Founder's phone (Telegram)
        │
        ▼
┌──────────────────────────┐  Telegram bridge  ┌──────────────────────────┐
│ Switch                   │◄─────────────────►│ 7 Telegram groups        │
│ 7 agents · rooms ·       │                   │ War Room · Analytics ·   │
│ shared context           │                   │ Ads · Creators · Ops ·   │
└────────────┬─────────────┘                   │ Design · Finance         │
             │ agent protocol                  └──────────────────────────┘
             ▼
   office-observer (silent agent) ──POST /api/events──► Office server :8787
                                                              │ WebSocket /ws
                                                              ▼
                                                   Landing page + 3D office :5173
```

Full diagram and data flow: [`docs/architecture.md`](docs/architecture.md).

### Without Switch, nothing works

| Switch provides | Without it |
|---|---|
| Telegram bridge for every agent | Agents can't read or post in the groups. No product. |
| Rooms that map to Telegram groups | No department groups, no War Room, no hand-offs. |
| Agent-to-agent addressing (`@d2c-finance`) | Captain can't assign work; Finance can't push back on Influencers. |
| Shared context across agents | Finance can't see the Analyst's forecast or the Ads plan, so EBITDA can't be checked. |
| Agent protocol for custom agents | The observer can't see messages, so the office stays empty (it can only replay the mock feed). |

The only part that runs without Switch is the **demo replay**: the office and landing page can
replay a recorded feed (`demo/feeds/sale-demo.json`) so you can see the UI offline.

### How Kratos uses Switch

Every Switch feature this project uses, with sources, snippets and Excalidraw diagrams:
**[docs/switch/](docs/switch/README.md)**. Console and the local server, the Telegram bridge,
templates, the agent protocol, topics and threads, hiring from the office, the live office feed,
workspaces, the skills library, gotchas, and a blog outline.

## 3. Agents and groups

| Agent | Emoji | Telegram group | Job |
|---|---|---|---|
| `d2c-captain` | 🎯 | Kesar HQ · War Room (+ all groups) | Takes the founder's ask, assigns work, posts the final plan |
| `d2c-analyst` | 📊 | Kesar HQ · Analytics | Forecasts units and revenue per SKU, picks live-sale metrics |
| `d2c-ads` | 📣 | Kesar HQ · Ads | Splits the Meta ads budget by ROAS |
| `d2c-influencers` | ⭐ | Kesar HQ · Creators | Shortlists creators; revises when Finance pushes back |
| `d2c-ops` | 📦 | Kesar HQ · Ops | Plans stock transfers so every region gets 1–2 day delivery |
| `d2c-design` | 🎨 | Kesar HQ · Design | Makes 3 sale banners into `gallery/` |
| `d2c-finance` | 💰 | Kesar HQ · Finance | Checks budget and EBITDA; pushes back or approves |

Instructions for each agent: `switch/agents/<agent-id>.md`. All of them load from
`switch/d2c-team.template.yaml`.

<!-- SCREENSHOT:telegram-groups -->

## 4. Setup

You need: Node 22.13+ (24 recommended), Docker, a Telegram account, and Python 3 (only for the number checker).

### 4a. Just see the office (no Switch, no Telegram)

```bash
git clone <this-repo-url> d2c-agent-hq && cd d2c-agent-hq
cp .env.example .env
npm install          # also installs server/ and web/ (same as `npm run setup`)
npm run demo         # server :8787 + web :5173, Ctrl+C stops both
```

- <http://localhost:5173/>: landing page; the hero loops the sale on its own.
- <http://localhost:5173/office>: the live office. It reads `/api/history` + `/ws`; if the
  server is down or idle for 3s it loops the recorded sale locally, and switches to live
  events as soon as they arrive (reconnects every ≤5s).
- Stream the recorded sale through the server into the office:
  ```bash
  curl -X POST localhost:8787/api/replay -H 'content-type: application/json' \
    -d '{"feed":"sale-demo","loop":true,"speed":1}'
  curl -X POST localhost:8787/api/replay/stop
  ```
- Other ports: `SERVER_PORT=8790 WEB_PORT=5176 npm run demo` (Vite proxies to the server port: `PORT`, else `SERVER_PORT`).

### 4b. Full setup with Switch and Telegram

1. **Install Switch.** Install Docker, then the Switch Console, and run Switch's 10-minute
   quickstart.
   <!-- TODO(HUMAN): exact install commands + Console URL from the Switch docs -->
2. **Create the Telegram bot(s)** with [@BotFather](https://t.me/BotFather): `/newbot`, then
   `/setprivacy` → **Disable** so the bot sees every group message. Put the token in `.env` as
   `TELEGRAM_BOT_TOKEN`.
   <!-- TODO(HUMAN): one bot per agent, or one bot with name prefixes? -->
3. **Create seven Telegram groups**, named exactly:
   `Kesar HQ · War Room`, `Kesar HQ · Analytics`, `Kesar HQ · Ads`, `Kesar HQ · Creators`,
   `Kesar HQ · Ops`, `Kesar HQ · Design`, `Kesar HQ · Finance`. Add the bot(s) to each.
4. **Connect Telegram in Switch** as a bridge.
   <!-- TODO(HUMAN): exact Console steps -->
5. **Load the team template** `switch/d2c-team.template.yaml` into Switch. Set the agents'
   working directory to this repo's root so they can read `data/` and write `gallery/`.
   <!-- TODO(HUMAN): exact Console/CLI step to load a template -->
6. **Create the department rooms** (Analytics, Ads, Creators, Ops, Design, Finance) and bridge
   each to its Telegram group. The template creates the War Room.
   <!-- TODO(HUMAN): via Console or switch-buddy? -->
7. **Start the office server and web app:** `npm run demo` (see 4a).
8. **Run the observer** so live messages reach the office. Fill `SWITCH_URL` and
   `OBSERVER_TOKEN` in `.env`, register the observer in Switch, add it to all seven rooms, then
   follow [`observer/README.md`](observer/README.md).
   <!-- TODO(HUMAN/T6): protocol endpoints + auth, see contracts/switch-protocol-notes.md -->
9. **Check:** post "hello" in the Telegram War Room. A speech bubble should appear in the
   office within 2 seconds.

### 4c. Production / deploy

One Node process serves the built site (with SPA fallback, so `/office` works), `/api`, `/ws`
and `/gallery`. Events are stored in SQLite (`node:sqlite`, Node ≥ 22.13) under `DATA_DIR`
(default `./.data`), so history survives restarts. Health: `GET /api/health`, readiness: `GET /api/ready`.

```bash
npm run build                 # vite build → web/dist, tsc → server/dist
PORT=8787 npm start           # http://localhost:8787 and /office
cd server && npm test         # node:test suite
```

Set `OBSERVER_TOKEN` (observer → `POST /api/events`) and `ADMIN_TOKEN` (replay) in production.
The observer sends its token from `OBSERVER_TOKEN` and finds the server with `SERVER_URL`.

Self-hosting and Docker: see [`docs/DEPLOY.md`](docs/DEPLOY.md).
Docker (`node:24-alpine`, data in `/data`):

```bash
docker build -t d2c-agent-hq .
docker run --rm -p 8787:8787 -v hq_data:/data -e OBSERVER_TOKEN=… -e ADMIN_TOKEN=… d2c-agent-hq
```

## 5. Run the demo

From your phone, in **Kesar HQ · War Room**, send:

```
Plan our festive sale: 30% off, 5 days, ₹5L marketing budget
```

What happens:
1. 🎯 Captain restates the goal and assigns work by name.
2. 📊 Analyst posts the forecast. 📣 Ads, ⭐ Creators, 📦 Ops and 🎨 Design start in their groups.
3. 💰 Finance adds it up: Creators are ₹2.05L over budget, EBITDA −₹0.76L. **Pushback.**
   The office shows a red beacon over Creators and the EBITDA meter swings red.
4. ⭐ Creators revise to a cheaper, higher-engagement shortlist.
5. 💰 Finance approves (EBITDA ≈ +₹1.29L). Meter swings green.
6. 🎯 Captain posts the final plan. Founder replies "Approved". 🎉 Confetti.

<!-- SCREENSHOT:finance-pushback -->
<!-- SCREENSHOT:office-confetti -->

## 6. Demo data

All files are in `data/`. The numbers are tuned so the Finance pushback always happens.

| File | What it holds |
|---|---|
| `products.csv` | 5 SKUs: price, COGS, daily sales, stock in Mumbai / Delhi / Bangalore |
| `past_sales.csv` | Uplift from the last sale (4× per SKU, 6× for the Glow Kit) |
| `regions.csv` | Order share per region and its home warehouse |
| `warehouses.csv` | Delivery days and 2-day transfer lead time |
| `channels.csv` | Order split: website, marketplaces, beauty, quick commerce |
| `meta_campaigns.csv` | 4 Meta campaigns with spend, revenue, ROAS, CTR |
| `influencers.csv` | 8 creators with reach, engagement, fee, past ROAS |
| `budget.json` | ₹5L marketing budget, unit costs, fixed costs, the rule Finance enforces |

Expected numbers (check with `python3 switch/check_numbers.py`):

- Forecast units: SKU01 800 · SKU02 1,400 · SKU03 600 · SKU04 240 · SKU05 300
- Revenue at 30% off ≈ ₹20.4L
- EBITDA at ₹5L marketing ≈ **+₹1.29L** ✅
- Top 4 creators by reach (₹3.55L) → marketing ₹7.05L → EBITDA ≈ **−₹0.76L** ❌
- Ops gaps: Delhi short on SKU01 (needs 320, has 250) and SKU05 (needs 120, has 80)

## 7. Repo map

| Path | What |
|---|---|
| `switch/` | Team template + one instruction file per agent |
| `data/` | Demo data |
| `observer/` | Silent Switch agent that forwards room messages to the office |
| `server/` | Node event server: WebSocket, replay, `/gallery` |
| `web/` | Landing page (`/`) and 3D office (`/office`) |
| `gallery/` | Banners written by the Design agent |
| `contracts/` | Shared shapes: roster, zones, event schema, API |
| `docs/` | Plan, architecture, blog draft, build notes |

## 8. Roadmap

- **WhatsApp bridge.** A production version would use the official WhatsApp Business API.
- **Returns triage:** an agent that sorts return requests and flags fraud patterns.
- **Restock alerts:** Ops warns before a SKU runs out in a region.
- **Weekly business review:** Analyst + Finance post a Monday summary in the War Room.
- **Live Shopify data** instead of CSVs.

## Credits

Powered by [Switch](https://github.com/sandbox-quantum/switch).
<!-- TODO(HUMAN): confirm Switch repo/docs URL -->
Office inspired by AgentSystemLabs/agent-office (our own build, not a fork).
