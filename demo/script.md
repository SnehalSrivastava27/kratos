# Kratos: 3-minute video script

One take, split screen: **Telegram** (group "Kratos D2C", Topics on) on the left, the **office**
(`/app`, live) on the right. If anything live fails, cut to `/demo`: it replays
`feeds/sale-demo.json` (same story, about 45 s) and waits for you to approve.

Rules for the take:
- Type the messages exactly as written. Agents run on Haiku, so a reply takes 10–40 s. Cut the waits.
- Keep the **Switch** chip (top left of the office) in frame. It counts every routed message.

## 0:00 The problem (15 s)

Say: "Indian D2C brands run on Telegram and WhatsApp groups, not Slack. One festive sale means six
teams, forty voice notes and three days of back-and-forth. Marketing overspends. Ops finds the
stockout too late. Nobody has the whole plan."

Show: the Telegram group and its topics (War Room, Analytics, Ads, Creators, Ops, Design, Finance).

## 0:15 Switch in the middle (15 s)

Say: "Kratos puts 16 AI teammates in this group. Switch is the middle. It runs every agent, carries
them into Telegram with one bot, routes messages between them and keeps the shared context."

Point at: the **Switch** core in the office (behind the Telegram wall) and its cables to every desk.
Click the Switch chip: *agents online*, *topics*, *messages routed*.

## 0:30 One message plans a sale (15 s)

Type in **War Room**:

```
@d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget
```

Point at: a blue pulse runs Telegram → Switch → Captain. The Captain walks to the War Room table and
briefs the leads by name. The Analyst posts the forecast: **3,340** units, about **₹20.4L**.

*Optional, before recording (Switch 0.31 follow-ups):* as the founder, send `!assign-agent @d2c-captain` in the
group once. The Captain becomes the room's main agent, so a follow-up like "now make it 30% off" reaches it
without the `@`. An `@` still wins; `!unassign-agent` undoes it. Caveat: every untagged founder message then wakes
the Captain, which is already ~40% of team turns, so compare Captain turns in `/api/roi` before and after; if they
jump, `!follow-ups off` keeps the main agent but drops thread follow-ups. Not automated on purpose: Switch accepts
the command only from someone the agent takes instructions from (docs `using/work-in-a-room`).

## 0:45 Specialists and the private Finance nudge (35 s)

Say: "Leads do the work, and they pull in their specialists."

Point at, in order:
- **Ads**: **₹3L** on 3 campaigns. Broad prospecting is cut (only **₹1.6** back per **₹1**).
- **Ops** asks **Logistics** (lane open, 2 days) and **Procurement** (restock covered), then books
  Mumbai → Delhi: SKU01 **70**, SKU05 **40**. Boxes roll along the Dispatch Dock.
- **Creators** first drafts the 4 biggest names: **₹3.55L**, way over the **₹1.5L** cap.

Then the money shot: a **violet** pulse leaves the Finance cabin, goes through Switch and lands on
the Creators desk. Say: "Finance doesn't call the lead out in the group. It sends a private note
through an agents-only Switch room. It never reaches Telegram."
- Open the Switch panel: "🔒 private note via Switch · Creators over the cap" (cut **₹2.05L**,
  swap to engagement picks), then the lead's private reply "Revised for Finance".
- Show Telegram: the Creators topic has only the clean shortlist, **₹1.18L** for 4 creators.

## 1:20 Finance gate, pinned plan, approve (25 s)

Point at: the Captain's budget check (Ads **₹3L** + Creators **₹1.18L** + Creative **₹50,000** =
**₹4.68L of ₹5L**), then Finance in War Room: **approved**, EBITDA **+₹1.61L** on this plan
(**+₹1.29L** at the full ₹5L).

Say: "The plan doesn't scroll away. The Captain pins it in Switch as a room document, and Finance
pins its sign-off next to it."
- Office chat: "📌 Pinned in Switch" under both messages.
- Switch panel → **Pinned in Switch**: "Festive sale plan — v1" and "Finance sign-off".

The Captain asks "@founder approve the plan?". Tap **Approve** in Telegram (or type `Approved ✅`).
Confetti in the office. Every lead confirms in its own topic.

## 1:45 Real files from the kit (15 s)

Say: "These aren't mock-ups. Agents run a toolkit: SQL over the data, charts, decks, sheets."

Click the deck link in the Captain's final plan (`/gallery/live-run/sale-plan.pptx`) and open it.
Then show the banners on the office Gallery Wall. Optional, in **Analytics**:

```
@d2c-analyst Chart October delivered revenue by channel
```

## 2:00 QA Lab: a trivial question (15 s)

Say: "We test every agent like a new hire. The QA Lab topic asks simple questions with known answers."

Type in **QA Lab**:

```
@d2c-ops How many units of SKU01 are in stock in the Delhi warehouse (products.csv)?
```

Expected: **250**. Cut to `evals/reports/latest.md`: **84/84** across all 16 agents.

## 2:15 Walk the office, hire a teammate (30 s)

Press **Got it** and walk with WASD. Pass the Chai Corner, pet the office dog, stop at the Data Wall.
Walk to an empty desk in **Open Desks**, press **E** → *Hire at this desk*:

- Name: `Meera` · Role: `Retention marketer`
- Instructions: `Own repeat purchase: win-back flows and a weekly cohort report in Analytics.`

Point at: the new character sits down, the Switch panel shows one more agent. A minute later the
hire posts **"🧾 Caught up on …"** with the sale numbers. Say: "It read the room with Switch's
`read_context` before it said a word. Nobody briefed it."

## 2:45 Close (15 s)

Say: "One Telegram group. Sixteen teammates. Switch in the middle: agents, the Telegram bridge,
routing, private rooms, pinned documents, shared context and hiring. That's Kratos."

Show: the office from above (the eye button, *Spectator view*), the Switch chip counting up.

## The recorded feed (`feeds/sale-demo.json`)

`/demo` plays the same story in about 45 s and stops at the approval. Check it with
`node demo/validate.mjs demo/feeds/sale-demo.json`.

| t (s) | Room | Beat |
|---|---|---|
| 0–3 | War Room | Founder's ask, Captain briefs the leads |
| 4–9 | Analytics | Forecast: 3,340 units, ₹20.4L |
| 10–16.5 | Ads | ₹3L: Advantage+ ₹1.2L, Retargeting ₹90,000, Lookalike ₹90,000 |
| 18 | Creators | First draft by reach: ₹3.55L |
| 18.7 | Finance → Creators | 🔒 Private nudge via Switch: cut ₹2.05L |
| 19.4 | Creators → Finance | 🔒 Private revision: 4 picks, ₹1.18L |
| 20 | Creators | Shortlist: 4 creators, ₹1.18L |
| 21.5–24 | Ops | Delhi short; Logistics and Procurement; transfers booked |
| 25–28 | Design | 3 banners on the Gallery Wall |
| 29.5–32.5 | War Room | Budget check ₹4.68L of ₹5L; Finance approves |
| 32.7–32.9 | War Room | 📌 Finance sign-off and Festive sale plan — v1 pinned in Switch |
| 33.2–34.5 | War Room | Final plan, then "approve the plan?" (the demo waits here) |
| 37–45 | All | Approved ✅, every team confirms, confetti |
