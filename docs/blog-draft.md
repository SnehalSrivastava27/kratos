# I gave every team at a D2C brand an AI teammate, and they live in Telegram

*How I built D2C Agent HQ with Switch for the Flip the Switch hackathon.*

<!-- GIF: phone with Telegram + office side by side -->

## 💡 The problem

If you've worked at an Indian D2C brand, you know where the work happens: not in Slack, but in
Telegram and WhatsApp groups. "Ads team", "Ops – warehouse", "Founders only".

Planning one festive sale goes like this: the founder drops a voice note, marketing books
influencers, ops realises Delhi will run out of the best-seller, and finance says the whole thing
loses money after half of it is booked. Six teams, forty voice notes, three days.

I wanted to see what happens if every one of those groups had an AI teammate who did the
homework, and they talked to each other in the same groups the humans already use.

## 🤔 Why Switch

I didn't want to build a chat app, a bot framework and a Telegram integration. I wanted to build
the team. Switch gave me:

- **A Telegram bridge**, so agents post in real groups on a real phone.
- **Rooms**, which map one-to-one to Telegram groups.
- **Agents that address each other by name** (`@d2c-finance`), which is how hand-offs and
  pushback happen.
- **Shared context**, so Finance can see the Analyst's forecast and the Ads plan.
- **An agent protocol** for custom agents, which I used for a silent observer that feeds a live
  office.

Without Switch, there is no product here: no groups, no hand-offs, no Finance pushback.

## 🏢 What I built

- **Seven agents** for a fictional skincare brand, Kesar & Co.: Sale Captain, Analyst, Ads,
  Creators, Ops, Design and Finance. Each has its own Telegram group, plus a shared War Room.
- **A live 3D office.** Every message moves an agent, pops a speech bubble, or swings the EBITDA
  meter in the Finance Cabin. When the founder approves, confetti.
- **A landing page** with the office on autoplay as the hero.

<!-- SCREENSHOT:office-overview -->

## ⚙️ Setup from zero (Telegram specifics!)

This is the part I wish someone had written for me.

1. **Install Switch.** Docker, then the Switch Console, then the 10-minute quickstart.
   <!-- TODO(HUMAN): exact commands and what the Console looks like first time -->
2. **Make a Telegram bot** with @BotFather (`/newbot`).
3. **Turn privacy mode off** (`/setprivacy` → Disable). Otherwise a bot in a group only sees
   commands and replies to itself, and your agents look deaf.
4. **Create the groups** and add the bot to each.
5. **Connect Telegram in Switch.**
   <!-- TODO(HUMAN): exact Console steps + screenshot -->
6. **Load the team template** (`switch/d2c-team.template.yaml`) and point the agents' working
   directory at the repo, so they can read `data/` and write banners to `gallery/`.

Telegram gotchas I hit:

- **Telegram doesn't render markdown tables.** Every agent has a formatting rule: under 12 lines,
  one item per line, one emoji up front.
- **Bots usually don't see messages from other bots.** So a normal Telegram bot can't watch the
  agents talk. That's why the office is fed by an observer agent *inside* Switch instead.
- **How agents show up in Telegram:** <!-- TODO(HUMAN): one bot per agent, or one bot with name prefixes? -->

<!-- SCREENSHOT:botfather-privacy -->
<!-- SCREENSHOT:switch-telegram-bridge -->

## 🧑‍💼 Building the team

Each agent is a short instruction file (under 40 lines). The trick was giving each one a narrow
job and an explicit hand-off:

- **Captain** never invents numbers. It assigns work by name and waits.
- **Analyst** forecasts: `avg_daily_units × past uplift × days`, then hands off to Ops and Finance.
- **Ads** splits budget by ROAS, capped at 45% per campaign.
- **Creators** optimises for reach and engagement. *Cost is Finance's job.* (This line matters.)
- **Ops** checks stock + 15% buffer per region and proposes transfers with a start date.
- **Design** writes three HTML banners into the gallery.
- **Finance** computes EBITDA and pushes back by name with the exact amount to cut.

The demo data is tuned so the story always plays out. I checked every number with a small script
(`switch/check_numbers.py`) before trusting the agents.

## 💰 The Finance pushback

This is the moment that made it feel like a team.

The founder says: *"Plan our festive sale: 30% off, 5 days, ₹5L marketing budget."*

Creators picks the four biggest names by reach: ₹3.55L. Finance adds it up:

```
💰 Marketing ₹7.05L vs budget ₹5L
EBITDA −₹0.76L ❌
@d2c-influencers cut ₹2.05L
```

In the office, a red beacon lights up over Creators and the EBITDA meter swings red. Creators
comes back with smaller creators who have better engagement and past ROAS per rupee. Finance
re-runs the numbers, EBITDA lands around +₹1.29L, and approves. The Captain posts the final plan,
the founder replies "Approved", and the office throws confetti.

Nobody scripted that exchange. It comes from two instructions that disagree on purpose.

<!-- SCREENSHOT:finance-pushback-telegram -->
<!-- SCREENSHOT:ebitda-meter -->

## 🐛 What went wrong

<!-- TODO(HUMAN): pull the best 3–5 rows from docs/build-notes.md. Problem → cause → fix. -->

1. …
2. …
3. …

## 🚀 Try it yourself

- Repo: <!-- TODO: repo URL -->
- See the office without any setup: `npm run demo`, then open `http://localhost:5173/`.
- Full Switch + Telegram setup: the README walks through it step by step.

Next up: a WhatsApp bridge (official Business API for production), returns triage, restock
alerts, and live Shopify data.

#HowISwitch
