# Go live: what only you can do

`scripts/switch-up.sh` does the rest. It connects the bot, creates any of the 16 team agents that don't exist
yet, registers the observer, joins the agents to "Kratos D2C", and starts the office server and the observer.
The team and the topics come from `contracts/roster.json`. `DRY_RUN=1 scripts/switch-up.sh` prints the plan
without calling anything. It is safe to rerun, and it prints
whatever is still left. The office is private now: you sign in, and you link your Telegram group to
your account once (contracts/api.md "v3").

## Link your Telegram group (once per group)
1. **On your phone, in the group:** Edit → **Topics ON**. Then Edit → Administrators → Add Admin →
   **@kratosd2c_bot** with **Manage topics** on. (A new group: add @kratosd2c_bot to it first.)
2. **In a browser on the Mac:** open http://localhost:8787/signup and create your account. Then open
   **/connect** and click to get a 6-digit code. It is valid for 15 minutes.
3. **Send the code as a message in the group.** The server links that group to your account. It checks the bot
   is an admin, creates the topics War Room, Analytics, Ads, Creators, Ops and Design, and adds the agents
   and the observer.
   - **Finance** and **QA Lab** are topics too (the roster has 8). With task B3 merged, the server creates all 8
     from `contracts/roster.json` when you link. Fallback (before B3, or one is missing): create it by hand
     (Topics → New topic), then send `/list_agents` once in it. An agent whose topic has no thread id yet
     replies in the thread that addressed it; it never guesses one. QA Lab is for test questions
     (evals): every agent answers there directly, in 3 to 5 lines, without handing off. /connect then shows **ready**, and /office shows only your group.
   - **"needs admin"**: step 1 is not done. Fix it, then send any message in the group to retry.
   - Nothing happens after ~15 s? Send the code again. A new group needs a few seconds before the observer
     is in it.
   - A code works once, and a group can belong to only one account. Only groups can be linked: a private
     chat with the bot, or a channel, is refused and the code stays usable.
   - **Limitation:** the server can't check that the person who sends the code is a group admin. Switch passes
     on only the sender's display name, not their Telegram user id. Two things make up for it. The code is
     private to your account. And setup only finishes once a group admin has made @kratosd2c_bot an admin with
     "Manage topics" (otherwise the group stays "needs admin"). So send the code in a group you run.

**Your existing "Kratos D2C" group:** do steps 2 and 3 in that group. It is matched by its chat id in
`observer/topics.json`, so it keeps its 6 existing topics (no duplicates) and all office history and hires from
before accounts existed. Until you link it, that history stays hidden.

The old flow, where `switch-up.sh` made the topics and wrote `observer/topics.json` for everyone, is replaced.
The server keeps the topic map per workspace. `topics.json` is now read only once, by the step above.
After updating, restart the office server and the observer so both run the new code (an old observer's events
are not stored).

**Topic threads for commands:** a command from the office lands in its topic only if the workspace knows that
topic's Switch thread. Today only the threads already recorded in `observer/topics.json` are known, and they are
adopted when you link "Kratos D2C". Otherwise the command goes to the group's General topic, tagged `#WarRoom` and
so on, and the agents still answer it.

## The team (16 agents)
War Room: `d2c-captain`. Each department has a lead and 1 or 2 specialists, in its own topic:
- Analytics: `d2c-analyst` + `d2c-forecaster`, `d2c-insights`
- Ads: `d2c-ads` + `d2c-marketplaces`, `d2c-google`
- Creators: `d2c-influencers` + `d2c-ugc`
- Ops: `d2c-ops` + `d2c-procurement`, `d2c-logistics`
- Design: `d2c-design` + `d2c-copywriter`
- Finance: `d2c-finance` + `d2c-payroll`

The Captain assigns only to leads in War Room. A lead hands work to its specialists in its topic and sends one
report back to War Room. Finance is the gate: the Captain asks `@d2c-finance` to check the plan against
`data/finance_policy.json` and `data/budget.json` before asking you to approve.

## On your Mac, once
4. Nothing to click for the agents: `switch-up.sh` creates each missing one on Switch Console's own controller
   (`POST /gateway/management/agents`, the same call as the office's Hire), with the team's provider settings
   and this repo as its directory. Switch Console must be open. If it can't (no online controller), the script
   prints the fallback: `open "switchdash://open/template/<id>"` → **Use → Create**. Rerun the script afterwards.

**Changed an agent's rules** (`switch/agents/<id>.md`)? Run `scripts/switch-sync-agents.sh`. It updates the
live agents and the stored template, and checks each agent took the change. Running sessions pick up the new
instructions on their next message. The template is generated: `node scripts/build-template.mjs` rebuilds
`switch/d2c-team.template.yaml` from the roster and the `.md` files (the sync script runs it for you;
`--check` fails if it's stale or an `.md` lost the Telegram rules).
Preview how a reply will look in Telegram with `python3 scripts/tg-render.py - < reply.md`.

## Start the demo (phone)
5. In the **War Room** topic, send:
   `@d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget`
6. To link your Telegram account (optional, because the agents accept anyone): in Console, open
   **Home → Messaging apps → Link my account… → This is me**.

## Office actions (from the office screen)
The office server (:8787) talks to the local Switch server as the Console admin, using the same
credentials file as `scripts/switch-up.sh`. You don't need to set anything up.
- **Send a command** (`POST /api/command`). The server posts your text into your linked group as
  `d2c-office`, a silent Switch agent that it registers the first time. Its key is stored in
  `.switch/agents/d2c-office.json` (gitignored, mode 600). Agents act on it like on a message from you.
  If you don't name anyone, the room's lead is addressed (War Room → `@d2c-captain`). The reply
  comes back into the office through the observer. Topics: until a topic has a Switch thread (see
  "Topic threads" above), the post goes to the group's General topic with a `#WarRoom`-style tag.
- **Hire** (`POST /api/employees`). The server creates the agent on Switch Console's own
  controller (Switch "managed agents"), so Console runs its Claude Code session on this Mac in this
  repo, the same way it runs the team. It sets addressing to anyone, joins it to your group, gives
  it a desk in its department, and the office walks it in. You don't click anything. If managed
  agents are unavailable, the server stores a one-agent template, the office shows **Finish in
  Switch Console**, and the employee goes active by itself once Console has created it (the server
  checks every 30 s).
- **Who may call them:** you, signed in, on your own workspace, or anyone sending
  `Authorization: Bearer $ADMIN_TOKEN`. They are never open. Without the token, a request also has to:
  - be sent to `localhost`, `127.0.0.1`, `[::1]` or a host listed in `OFFICE_ORIGINS`,
  - carry the office's own Origin (or `http://localhost:5173`, or one listed in `OFFICE_ORIGINS`),
  - send JSON.

  Skill file paths in the library are shown only to the office on this Mac. A request through a proxy counts as
  this Mac only if every forwarded hop is. Behind a reverse proxy on the same host, set `TRUST_LOOPBACK=0`.
  `NODE_ENV=production` sets it by default.
- **Limits:** at most 12 employees on this Mac (`HIRE_MAX`) and 3 hires per 10 minutes per workspace.
- **Fire someone** (`DELETE /api/employees/<id>`). Console stops the agent's session, the agent
  is deleted from Switch, and its desk is free again.
- **Hire settings:** each hire gets the same provider settings as the team (copied from
  `d2c-captain`), auto mode included. It always works in this repo. Its instructions end with
  `switch/TELEGRAM_STYLE.md`. Skills must be books in the library.
