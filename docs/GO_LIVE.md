# Go live: what only you can do

`scripts/switch-up.sh` does the rest. It connects the bot, registers the observer, joins the agents
to "Kratos D2C", and starts the office server and the observer. It is safe to rerun, and it prints
whatever is still left. The office is private now: you sign in, and you link your Telegram group to
your account once (contracts/api.md "v3").

## Link your Telegram group (once per group)
1. **On your phone, in the group:** Edit → **Topics ON**. Then Edit → Administrators → Add Admin →
   **@kratosd2c_bot** with **Manage topics** on. (A new group: add @kratosd2c_bot to it first.)
2. **In a browser on the Mac:** open http://localhost:8787/signup and create your account. Then open
   **/connect** and click to get a 6-digit code. It is valid for 15 minutes.
3. **Send the code as a message in the group.** The server links that group to your account. It checks the bot
   is an admin, creates the topics War Room, Analytics, Ads, Creators, Ops and Design, and adds the 6 agents
   and the observer. /connect then shows **ready**, and /office shows only your group.
   - **"needs admin"**: step 1 is not done. Fix it, then send any message in the group to retry.
   - Nothing happens after ~15 s? Send the code again. A new group needs a few seconds before the observer
     is in it.
   - A code works once, and a group can belong to only one account.

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

## On your Mac, once
4. Create the 6 agents in Switch Console. Run
   `open "switchdash://open/template/<id>"`, using the id the script prints, then click **Use → Create**.
   Check that the directory is this repo. Console has to do this step because it runs the agents' Claude Code sessions.
   Rerun the script afterwards, so it adds them to the group (and link the group as above).

**Changed an agent's rules** (`switch/agents/<id>.md`)? Run `scripts/switch-sync-agents.sh`. It updates the
live agents and the stored template, and checks each agent took the change. Running sessions pick up the new
instructions on their next message. Keep `switch/d2c-team.template.yaml` in step with the `.md` files.
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
