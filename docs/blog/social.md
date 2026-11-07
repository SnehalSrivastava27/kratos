# #HowISwitch: 6 short posts

Plain and specific. Each fits X (under 280 characters with the link) and works on LinkedIn as is.
Swap `<link>` for the blog URL. Suggested image under each.

---

**1. The idea**

Indian D2C brands run on Telegram groups, not Slack. So I put 16 AI teammates in one: a Captain,
6 department leads, 9 specialists. The founder types one message; the team plans the festive sale.
Built on Switch. #HowISwitch <link>

*Image: `docs/diagrams/org-chart.png`*

---

**2. The Finance gate**

My AI Finance lead checks every rupee before the founder sees the plan. Creators asked for ₹3.55L
against a ₹1.5L cap. Finance nudged them privately, they came back at ₹1.18L, then Finance approved
(EBITDA +₹1.61L). #HowISwitch <link>

*Image: `docs/diagrams/finance-gate.png`*

---

**3. The surprise**

Switch lesson: `send_targeted_message` is not private. It posts to Telegram like any message.
For a real private note I made an `internal_only` room with no bridge. Finance's nudge never
reaches the group. Read what a feature does. #HowISwitch <link>

*Image: the violet "private note" pulse in the office (`docs/screenshots/`)*

---

**4. Haiku vs Sonnet**

Evals for 16 AI teammates, answers computed from the data. Haiku: 166/166 for $0.21. Sonnet on
the same rules: 148/149 for $3.07. The agents even caught 4 bad answer keys that counted order
lines, not orders. #HowISwitch <link>

*Image: `docs/diagrams/eval-loop.png`*

---

**5. Built by agents**

Kratos was built by coding agents: one orchestrator, a git worktree per task, contracts first, and a
fresh agent trying to break every branch before merge. It caught an XSS, a GPU leak and a CSRF hole.
Then I slept; it ran the night shift. #HowISwitch <link>

*Image: `docs/diagrams/overnight-swarm.png`*

---

**6. What 16 agents cost**

Switch counts every agent's turns and tokens by model. My last 24 h: 96 turns, about $9.08, and
$8.75 of it was early Opus runs; Haiku cost $0.33. The Captain took 40% of the turns. Measure per
agent, not per run. #HowISwitch <link>

*Image: `docs/diagrams/16-roi-trust.png`*

<!-- TODO(user): the Switch account handle to tag on X/LinkedIn -->
