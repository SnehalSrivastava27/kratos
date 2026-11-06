# Kratos — Telegram Edition

> Every corner of your D2C brand gets an AI teammate. They work together in your team's **Telegram** groups through **Switch**, and a live office shows them planning your next sale.

**Hackathon:** Flip the Switch (WeMakeDevs × DevTools Academy)
**Deadline:** 7 Nov 2026, 11:59 PM IST → **submit by 9:00 PM IST**
**Track:** Track 1, Best Business Workflow (+ Best Blog, + #HowISwitch post)

---

## 0. Status of decisions

| Decision | Status |
|---|---|
| Chat platform | ✅ Telegram (WhatsApp = bonus phase / roadmap) |
| Brand | ✅ Kesar & Co. (fictional skincare D2C) |
| Hero workflow | ✅ "Plan the festive sale" with Finance pushback |
| Office style | ✅ Our own **3D** D2C office, inspired by agent-office (not a fork), see 9.6 |
| Landing page look | ✅ **Light**, bright, Perplexity-style scroll animations, see 9.7 |
| Landing hero | ✅ **Looping clip of agents planning the sale** (the live office on autoplay), see 9.7 |

---

## 1. The pitch

**Problem:** Indian D2C teams don't run on Slack. They run on Telegram and WhatsApp groups, where planning a sale means 6 teams, 40 voice notes and 3 days of chaos.

**Solution:** D2C Agent HQ gives every department an AI teammate inside the Telegram groups the team already uses. Switch connects the agents to the groups and gives them shared context. A live office shows who's working on what.

**Why it matters:** non-technical teams (founders, marketers, ops managers) get agent teammates without learning any new tool.

## 2. Platforms

- **Telegram: main platform.** Supported by Switch out of the box.
- **WhatsApp: bonus phase.** Unofficial bridge with Baileys (TS) or whatsmeow (Go). Only after the core demo is recorded, time-boxed to 3 hours. Use a **spare number** (ban risk), and say in the README that a production version would use the official WhatsApp Business API.

## 3. Hero workflow

```
Founder (Telegram, "Kesar HQ · War Room"):
"Plan our festive sale: 30% off, 5 days, ₹5L marketing budget"
        │
        ▼
Sale Captain ──► assigns work in each department group
        ├──► Analytics   → forecast per SKU + live-sale dashboard metrics
        ├──► Ads         → Meta campaign plan + budget split
        ├──► Influencers → creator shortlist from proposed list
        ├──► Ops         → stock transfers for 1–2 day delivery, no stockouts
        └──► Design      → sale banners pinned to the gallery
        ▼
Finance ──► ❌ "Influencers ₹2.05L over budget, EBITDA −₹0.76L"
        ▼
Influencers ──► revised cheaper shortlist
        ▼
Finance ──► ✅ approved
        ▼
Sale Captain ──► final plan in War Room → Founder: "Approved" → 🎉
```

## 4. Architecture

```
┌────────────────────────┐   Telegram bridge   ┌───────────────────────────┐
│ Switch (Console+Core)  │◄───────────────────►│ Telegram groups           │
│ 7 agents + rooms       │                     │ War Room · Ads · Creators │
│ shared context         │                     │ Ops · Design · Analytics  │
└──────┬──────────┬──────┘                     │ Finance                   │
       │          │ agent protocol             └───────────────────────────┘
       │          │ (SSE in, HTTP out)
       │   ┌──────▼──────────────┐
       │   │ office-observer     │  silent custom agent in every room
       │   │ forwards events     │
       │   └──────┬──────────────┘
       ▼          │ WebSocket
┌────────────┐  ┌─▼──────────────────────────────┐
│ /data      │  │ Office server (Node)            │
│ /gallery   │◄─┤ events → office, serves gallery │
└────────────┘  └─┬──────────────────────────────┘
                  ▼
        ┌──────────────────────────┐
        │ Landing page + Office UI │
        └──────────────────────────┘
```

### How the office sees messages (pick in Phase 1)
1. **Observer agent (preferred).** A tiny custom agent that joins every Switch room and forwards each message to the office. Uses Switch more deeply, which helps the "Use of Switch" score. **Check the agent protocol doc first:** does an agent receive every room message, or only ones addressed to it? Is there a silent/listen-only addressing option?
2. **Telegram user account** read with Telethon (Python) or GramJS (JS). Sees everything, including bot messages.
3. **Mattermost fallback:** read Switch's bundled Mattermost while showing Telegram on the phone.

⚠️ **Telegram gotchas to verify early**
- Bots in groups only see all messages if privacy mode is off (BotFather → `/setprivacy`).
- Bots generally don't receive messages sent by other bots, so a plain Telegram bot can't watch agents talk. That's why option 1 or 2.
- Check how Switch shows agents in Telegram: one bot per agent, or one bot with name prefixes. This decides avatar mapping.
- Telegram does **not** render markdown tables. Agents must format with short lines and emoji (instructions below already do this).

## 5. Repo structure

```
d2c-agent-hq/
├── README.md
├── data/                      # demo data (section 7)
├── switch/
│   ├── d2c-team.template.yaml
│   └── agents/*.md            # one instruction file per agent
├── observer/                  # office-observer agent (agent protocol)
├── gallery/                   # Design agent writes banners here
├── web/
│   ├── landing/               # Perplexity-Teammates-style landing page
│   └── office/                # the live office
├── server/                    # events → WebSocket, serves /gallery
├── docs/build-notes.md        # errors + fixes, written AS YOU GO
├── docs/screenshots/
└── demo/script.md
```

---

## 6. Phases

### Phase 1 — Prove the pipe (1–2 h)
- [ ] Docker + Switch Console + 10-minute quickstart (Mattermost)
- [ ] Create Telegram bot(s) with BotFather; connect Telegram in Switch
- [ ] One agent replying in a Telegram group
- [ ] Note how agents appear in Telegram (bot per agent? names?)
- [ ] Read the agent protocol doc; decide office feed option (section 4)
- [ ] Screenshot everything → `docs/screenshots/`

### Phase 2 — Core loop, 4 agents (3–4 h)
- [ ] `data/` files
- [ ] Captain, Influencers, Ops, Finance + War Room + their department groups
- [ ] Run founder prompt; tune instructions
- [ ] Finance pushback works **3 runs in a row**
- [ ] 🎥 Record a backup video on the phone

### Phase 3 — Full team (2–3 h)
- [ ] Analytics, Ads, Design; gallery banners

### Phase 4 — Office + landing page (4–5 h)
- [ ] Event feed (observer or Telethon)
- [ ] Office: rooms, avatars, bubbles, walking, beacons, confetti
- [ ] Landing page
- [ ] **Feature freeze 4 PM IST tomorrow**

### Phase 5 — Ship (3–4 h, never cut)
- [ ] Video: phone (Telegram) + office side by side, under 3 min
- [ ] README, submit by 9 PM IST, #HowISwitch post, blog

### Bonus — WhatsApp bridge (max 3 h, only after backup video)

**Cut order if behind:** landing page polish → Design agent → Analytics → walking animation → WhatsApp. Never cut Phase 5.

---

## 7. Demo data (tuned so the story works)

### `data/products.csv`
```csv
sku,name,mrp,cogs,avg_daily_units,stock_mumbai,stock_delhi,stock_bangalore
SKU01,Vitamin C Serum,899,210,40,1200,250,600
SKU02,Sunscreen SPF 50,599,140,70,2000,1500,900
SKU03,Hydrating Moisturiser,749,180,30,900,700,500
SKU04,Kesar Face Oil,1299,320,12,400,300,250
SKU05,Glow Kit (bundle),1999,520,10,300,80,150
```

### `data/past_sales.csv`
```csv
event,sku,discount_pct,days,sale_uplift_x
Summer Sale 2026,SKU01,25,5,4
Summer Sale 2026,SKU02,25,5,4
Summer Sale 2026,SKU03,25,5,4
Summer Sale 2026,SKU04,25,5,4
Summer Sale 2026,SKU05,25,5,6
```

### `data/regions.csv`
```csv
region,share_of_orders,home_warehouse
North,0.40,Delhi
West,0.35,Mumbai
South,0.25,Bangalore
```

### `data/warehouses.csv`
```csv
warehouse,region,same_region_delivery_days,cross_region_delivery_days,transfer_lead_time_days
Mumbai,West,1,3,2
Delhi,North,1,4,2
Bangalore,South,1,3,2
```

### `data/channels.csv` (powers the office's channel board and landing icons)
```csv
channel,type,share_of_orders
Brand website (Shopify),D2C site,0.45
Marketplaces,E-commerce,0.30
Beauty marketplaces,Beauty commerce,0.15
Quick commerce,Quick commerce,0.10
```

### `data/meta_campaigns.csv`
```csv
campaign,objective,audience,spend,revenue,roas,ctr_pct
Retargeting - cart abandoners,Sales,Website visitors 30d,80000,384000,4.8,2.9
Advantage+ Shopping,Sales,Broad,150000,510000,3.4,1.8
Lookalike 1% buyers,Sales,LAL purchasers,120000,348000,2.9,1.5
Broad prospecting,Awareness,18-34 women metro,100000,160000,1.6,0.9
```

### `data/influencers.csv`
```csv
name,platform,followers,engagement_pct,avg_views,fee,niche,past_brand_roas
Riya Glows,Instagram,1200000,2.1,310000,120000,beauty,2.2
SkinBySana,Instagram,650000,3.8,240000,95000,skincare,3.1
The Derm Diaries,YouTube,480000,4.5,180000,80000,skincare,3.6
Meera Minimal,Instagram,300000,4.9,120000,60000,minimal beauty,3.4
GlowWithAnu,Instagram,150000,6.2,85000,45000,skincare,3.9
Desi Skin Desk,YouTube,90000,7.1,60000,30000,skincare,4.2
Tanvi Tries,Instagram,70000,5.8,40000,25000,beauty,3.0
Kavya Care,Instagram,45000,8.0,30000,18000,skincare,4.4
```

### `data/budget.json`
```json
{
  "total_marketing_budget": 500000,
  "guidance": { "ads": 300000, "influencers": 150000, "creative_production": 50000 },
  "sale": { "discount_pct": 30, "days": 5 },
  "unit_costs": { "shipping_per_order": 60, "payment_gateway_pct": 2, "returns_pct_of_revenue": 8, "units_per_order": 1.3 },
  "fixed_costs_sale_period": 350000,
  "rule": "Total marketing spend must not exceed the budget and EBITDA must be positive."
}
```

### Expected numbers (to check agents)
- Forecast units: SKU01 800 · SKU02 1,400 · SKU03 600 · SKU04 240 · SKU05 300
- Revenue at 30% off ≈ ₹20.4L; contribution before marketing ≈ ₹6.29L
- EBITDA at ₹5L marketing ≈ **+₹1.29L** ✅
- Influencers pick top 4 by reach (₹3.55L) → marketing ₹7.05L → EBITDA ≈ **−₹0.76L** ❌
- Ops gaps: Delhi short on SKU01 (needs 320, has 250) and SKU05 (needs 120, has 80)

---

## 8. Agents

**Telegram formatting rule (add to every agent):**
```
You are posting in Telegram. Telegram does not show tables. Keep messages under
12 lines. Use one line per item, like "SKU01 · 800 units · ₹5.03L". Start with one
emoji that matches your department. Mention teammates by name.
```

| Agent | Emoji | Group |
|---|---|---|
| d2c-captain | 🎯 | War Room (+ all groups) |
| d2c-analyst | 📊 | Analytics |
| d2c-ads | 📣 | Ads |
| d2c-influencers | ⭐ | Creators |
| d2c-ops | 📦 | Ops |
| d2c-design | 🎨 | Design |
| d2c-finance | 💰 | Finance |

### 🎯 d2c-captain
```
You are the Sale Captain of Kesar & Co., a D2C skincare brand. When the founder asks
to plan a sale:
1. Restate the goal in one line.
2. Assign work by name: @d2c-analyst first; then @d2c-ads, @d2c-influencers,
   @d2c-ops, @d2c-design (they need the forecast); then @d2c-finance.
3. Track replies; nudge anyone blocked.
4. When Finance approves, post ONE final plan in War Room (forecast, ads, creators,
   transfers, banners, budget, EBITDA) and ask the founder to approve.
Never invent numbers; use teammates' outputs.
```

### 📊 d2c-analyst
```
Read data/products.csv and data/past_sales.csv.
Forecast 5-day units per SKU = avg_daily_units × sale_uplift_x × days, and revenue
at the sale discount. Suggest 4 metrics to watch live during the sale, and why.
Hand the forecast to @d2c-ops and @d2c-finance.
```

### 📣 d2c-ads
```
Read data/meta_campaigns.csv and data/budget.json. Split the ads budget across
campaigns favouring higher ROAS; cap any campaign at 45% of the ads budget.
Post campaign · budget · expected ROAS · expected revenue. Report total to @d2c-finance.
```

### ⭐ d2c-influencers
```
Read data/influencers.csv. Pick 4 creators that maximise reach and fit for a skincare
sale. Optimise for reach and engagement; cost is Finance's job. Post name · why · fee ·
expected views. Report total fee to @d2c-finance. If Finance pushes back, revise within
the budget Finance gives you, favouring engagement and past ROAS per rupee.
```

### 📦 d2c-ops
```
Read data/products.csv, data/regions.csv, data/warehouses.csv. Split the analyst's
forecast by region. Where stock + 15% buffer is below demand, propose a transfer from
a surplus warehouse (2-day lead time; give the latest start date) so every order ships
from its home warehouse in 1–2 days with no stockouts. Flag risks to @d2c-captain.
```

### 🎨 d2c-design
```
Create 3 banners as self-contained HTML files (inline CSS, 1080×1080) in gallery/:
hero sale banner, best-seller (SKU01), Glow Kit bundle. Saffron + cream palette.
Post file names and tell @d2c-captain they're on the gallery wall.
```

### 💰 d2c-finance
```
Read data/budget.json and data/products.csv. When Ads and Influencers report:
total marketing = ads + influencers + creative_production;
EBITDA = revenue − COGS − shipping − gateway − returns − marketing − fixed costs
(analyst forecast + unit_costs). Post the calculation in short lines.
If marketing > budget OR EBITDA < 0, push back by name with the exact amount to cut.
Approve only when both pass, then tell @d2c-captain "Finance approved".
```

### Switch template (starting point — check field names against `examples/agent-templates/` in the Switch repo)
```yaml
agents:
  - name: "d2c-captain"
    description: Coordinates the sale plan across departments
    addressing: anyone
    provider: "{provider}"
    instructions: |
      <captain instructions + Telegram formatting rule>
  # ...repeat for the other six agents
room:
  name: "Kesar HQ · War Room"
  bridge: "{bridge}"        # Telegram
  agents: ["d2c-captain", "d2c-analyst", "d2c-ads", "d2c-influencers",
           "d2c-ops", "d2c-design", "d2c-finance"]
  users: ["{$creator}"]
kickoff: |
  Team, this is the Kesar & Co. war room. @d2c-captain coordinates sale plans.
```
Create department rooms afterwards (e.g. ask switch-buddy). Agents need the project folder as working directory to read `data/` and write `gallery/`.

---

## 9. Frontend design

Two surfaces: a **landing page** (inspired by Perplexity Teammates) and the **live office** (inspired by AgentSystemLabs/agent-office, customised for D2C).

### 9.1 Landing page

**Section A — Hero (day → night).** Morning: a bright D2C office, founder on a beanbag with a phone. As you scroll, the lights go off and only the agents' desks stay lit, still working. Headline: *"Your brand never sleeps. Neither do your teammates."* CTA: *"Watch them plan a sale"* (jumps to the office).

**Section B — "Sells everywhere you sell."** Icon strip of the channels the agents understand:

| Group | Shown as |
|---|---|
| D2C website | Shopify store |
| E-commerce marketplaces | Amazon, Flipkart, Myntra |
| Beauty commerce | Nykaa, Purplle |
| Quick commerce | Blinkit, Zepto, Swiggy Instamart |
| Ads & creators | Meta Ads, Instagram, YouTube |

Use **generic category icons** (bolt for quick commerce, storefront for website, bag for marketplaces, lipstick/sparkle for beauty) with the platform **names as text**. Don't copy brand logos into the design unless you follow each brand's official guidelines.

**Section C — "Works where your team works."** Telegram (live), WhatsApp (coming soon), plus "Powered by Switch".

**Section D — "Every corner of your brand has a teammate."** An illustrated cut-away of the HQ with numbered hotspots. Clicking one opens a card:

| Teammate | What it takes off your plate | When it acts on its own |
|---|---|---|
| 📣 Ads | Plans Meta campaigns, splits budget by ROAS | A campaign's ROAS drops below target: drafts a fix |
| ⭐ Creators | Shortlists influencers, compares fees and reach | A creator's engagement dips: suggests a swap |
| 📦 Ops | Places stock so every region gets 1–2 day delivery | A SKU will run out in a region: proposes a transfer |
| 📊 Analytics | Forecasts sales, sets live dashboard metrics | Sales pace falls behind forecast: alerts the captain |
| 🎨 Design | Makes sale banners and creatives | A new campaign starts: drafts creatives for it |
| 💰 Finance | Keeps every plan in budget and EBITDA positive | Spend goes over plan: pushes back with the exact cut |

**Section E — Use-case cards with live "Thinking…" checklists.** Each card shows the request, then ticks through steps, then the result. Example (Ops): *"Pulled forecast → split by region → Delhi short on Vitamin C Serum → transfer 120 units from Mumbai by 9 Nov → ✅ 1–2 day delivery everywhere."*

**Section F — How it works:** Telegram → Switch → agents → office (simple 4-step diagram).

### 9.2 The live office (D2C-customised)

**Floor plan:**

| Zone | Agent | Props |
|---|---|---|
| 🎯 War Room (glass cabin) | Captain | Big screen with the live sale plan |
| 📣 Growth Pod | Ads | Monitors with campaign graphs |
| ⭐ Creator Studio | Influencers | Ring light, phone on tripod, creator polaroid wall |
| 📦 Dispatch Dock | Ops | Boxes, conveyor, India map with 3 warehouse pins |
| ⚡ Dark-store corner | Ops | Quick-commerce rack, "10-min delivery" sign |
| 📊 Data Wall | Analytics | Wall of charts |
| 🎨 Design Studio | Design | Mood board → **Gallery Wall** (clickable banners) |
| 💰 Finance Cabin | Finance | Ledger, calculator, EBITDA meter (green/red) |
| 👑 Founder's Desk | Founder (human) | Phone showing Telegram |
| ☕ Chai Pantry | — | Idle agents hang out here |

**Behaviours (borrowed from agent-office, adapted):**
- 🔴 **Red beacon** over an agent waiting for a human approval, plus a banner: *"Finance needs the founder."*
- 🎉 Agent **jumps and dings** when its task is done.
- 🚶 Agent **walks** to another zone when it posts in another group.
- 💬 Speech bubble with the first ~80 characters of each message.
- 📈 **EBITDA meter** in Finance Cabin turns red on pushback, green on approval.
- 🗺️ India map pins pulse when Ops proposes transfers.
- 📺 **Channel board** shows order split by channel (from `channels.csv`).
- 📱 **Lite 2D view** for phones (agent list + what each is waiting on).

**Side panel (Perplexity-style):** a sidebar of all teammates; clicking one opens its **persistent thread** (all its messages across groups) with a "Thinking…" step list.

### 9.3 Design tokens (starting point)
- Colours: saffron `#F4A300`, cream `#FFF6E5`, deep plum night `#1E1328`, mint success `#3CCB8B`, alert red `#E5484D`
- Type: a rounded display font for headings, clean sans for body
- Style: warm, Indian-D2C, playful but premium

### 9.4 Build tips
- Build the office against a **mock event feed** first (JSON file replayed on a timer), so it works before Switch/Telegram is ready. Also makes the video reliable.
- Event shape: `{ ts, room, speaker, text, type: "message" | "approval_needed" | "done" }`

### 9.5 Design decisions
| Question | Decision |
|---|---|
| Office style | Our own 3D D2C office, inspired by agent-office |
| Landing vibe | Light, bright, Perplexity-style animations (not dark) |
| Hero | Looping clip of agents planning the sale |
| Channel icons | Default: generic icons + names (change if you prefer) |
| Founder avatar | Default: generic founder (change if you prefer) |
| Telegram in office | Default: small phone on the Founder's Desk showing the War Room feed |

### 9.6 3D office spec

**Stack:** React + react-three-fiber + drei (camera controls, text, HTML overlays), Vite. One scene, no physics.

**Look:** cartoon low-poly, soft daylight, warm saffron/cream walls, rounded furniture. Tilted overhead camera (3/4 view) with gentle orbit; click a zone to fly the camera there.

**Assets (keep it fast):**
- Characters: capsule body + sphere head + coloured shirt per department + emoji badge floating above. No rigging needed; "walk" = move along a path with a small bob.
- Furniture: boxes/cylinders, or free CC0 low-poly kits (check each pack's licence before using).
- Speech bubbles and beacons: drei `<Html>` overlays, so they're crisp text and easy to style.

**Scene layout (one floor, open plan):**
```
┌────────────────────────────────────────────────────────┐
│  🎨 Design Studio      📊 Data Wall      💰 Finance Cabin│
│  (Gallery Wall)        (chart screens)   (EBITDA meter) │
│                                                        │
│  ⭐ Creator Studio      🎯 WAR ROOM        📣 Growth Pod  │
│  (ring light)          (glass, big screen) (monitors)   │
│                                                        │
│  📦 Dispatch Dock  ⚡ Dark-store   ☕ Chai Pantry  👑 Founder│
│  (boxes, India map)  corner                     Desk    │
└────────────────────────────────────────────────────────┘
```

**Animation states per agent:** `idle` (in pantry or at desk, slight sway) → `working` (at desk, screen glows, typing bob) → `walking` (to another zone) → `waiting` (🔴 beacon + pulse) → `done` (jump + ding + ✅).

**Scene events driven by the feed:**
| Event | Visual |
|---|---|
| Captain assigns work | Captain walks desk to desk; each agent switches to `working` |
| Ops proposes transfer | India map pins pulse; a box slides along the conveyor |
| Design saves a banner | Frame appears on the Gallery Wall (click → opens banner) |
| Finance pushback | EBITDA meter swings red; Influencer agent gets 🔴 beacon |
| Finance approves | Meter swings green; mint glow over Finance Cabin |
| Founder approves | Confetti over the whole floor; everyone jumps |

**Performance guardrails:** under ~150 meshes, no shadows except one soft directional light, instance repeated props, cap pixel ratio at 2. It must run smoothly during screen recording.

**Scope guard:** build the floor with grey boxes first, wire the event feed, *then* make it pretty. If 3D is not moving by tomorrow noon, flatten the same scene to a fixed-camera view and keep going.

### 9.7 Landing page spec (light, animated)

**Feel:** bright cream background, saffron + mint accents, lots of white space, soft shadows, rounded cards. Motion is smooth and purposeful, inspired by Perplexity Teammates' scroll storytelling but in daylight.

**Stack:** same React app, a `/` route; Framer Motion (or GSAP ScrollTrigger) for scroll animations.

**Sections and motion:**
1. **Hero:** headline + CTA on the left; on the right, the **live 3D office on autoplay**, replaying the sale-planning feed in a ~45-second loop inside a rounded "window" frame. No video file to record or maintain, and it's always in sync with the real office.
2. **"Sells everywhere you sell":** channel icons float in from the edges and settle into a row; on hover each shows its order share from `channels.csv`.
3. **"Works where your team works":** a phone mockup slides up showing Telegram messages appearing one by one; WhatsApp tab greyed "coming soon".
4. **"Every corner of your brand has a teammate":** isometric snapshot of the office; scrolling highlights each zone in turn and its card (takes off your plate / acts on its own) slides in beside it.
5. **Thinking cards:** cards flip in; inside, checklist steps tick one by one, then the result fades in.
6. **"The Finance moment":** a mini timeline where the EBITDA number counts down to −₹0.76L in red, then up to +₹1.29L in green.
7. **How it works:** Telegram → Switch → Agents → Office, with a line that draws itself as you scroll.
8. **Final CTA:** "Open the office" + GitHub link + "Powered by Switch".

**Motion rules:** ease-out, 300–600 ms, nothing loops except the hero; respect `prefers-reduced-motion`.

---

## 10. Building with a swarm of coding agents

Run parallel coding-agent sessions, each on its own git branch/worktree:

| Builder | Owns | Prompt |
|---|---|---|
| 1 | `data/`, `switch/` | "Create the demo data and agent files exactly as in sections 7–8." |
| 2 | `observer/`, `server/` | "Build the office-observer agent using Switch's agent protocol, and a Node server that broadcasts events over WebSocket and serves /gallery." |
| 3 | `web/office/` | "Build the D2C office in section 9.2 against a mock event feed (section 9.4)." |
| 4 | `web/landing/` | "Build the landing page in section 9.1." |
| 5 | `README.md`, `docs/` | "Draft README (section 11) and keep build-notes updated." |

You review, merge, and run the full flow.

## 11. README outline
1. Pitch + GIF (phone with Telegram + office)
2. The problem: D2C teams live in Telegram/WhatsApp
3. How Switch powers it (diagram; "without Switch, nothing works")
4. Agents and groups
5. Setup: Switch, Telegram, template, observer, office
6. Run the demo: the founder message
7. Demo data explained
8. Roadmap: WhatsApp bridge, returns triage, restock alerts, weekly business review, live Shopify data

## 12. Blog outline
💡 Problem → 🤔 Why Switch → 🏢 What I built → ⚙️ Setup from zero (Telegram specifics!) → 🧑‍💼 Building the team → 💰 The Finance pushback → 🐛 What went wrong → 🚀 Try it yourself

## 13. Demo video (under 3 min)
| Time | Show |
|---|---|
| 0:00–0:15 | Problem: sale planning chaos in Telegram groups |
| 0:15–0:30 | Landing page hero → office |
| 0:30–0:45 | Founder sends the prompt from a real phone |
| 0:45–1:45 | Phone + office side by side: agents working |
| 1:45–2:15 | Finance pushback → red beacon → revision → approval |
| 2:15–2:35 | Final plan, gallery banners, confetti |
| 2:35–3:00 | Architecture: "Powered by Switch" |
