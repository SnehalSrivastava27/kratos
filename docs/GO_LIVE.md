# Go live: what only you can do

Everything else is done by `scripts/switch-up.sh`. It connects the bot, registers the observer,
joins the agents to the group, creates the topics, and starts the office server and observer.
Rerun it after any step below. It is safe to run again, and it prints whatever is still left.

## On your phone, in the Telegram group "Kratos D2C"
1. **Edit → Topics → ON.**
2. **Edit → Administrators → Add Admin → @kratosd2c_bot**, then switch **Manage topics** on.
   Then rerun `scripts/switch-up.sh`. It creates the topics War Room, Analytics, Ads, Creators,
   Ops and Design.
3. In **each of the 6 topics**, send `/list_agents` once. This makes Switch treat the topic as one
   conversation. Then rerun the script, which records it in `observer/topics.json`.

## On your Mac, once
4. Create the 6 agents in Switch Console. Run
   `open "switchdash://open/template/<id>"`, using the id the script prints, then click **Use → Create**.
   Check that the directory is this repo. Console has to do this step because it runs the agents' Claude Code sessions.
   Rerun the script afterwards, so it adds them to the group.

## Start the demo (phone)
5. In the **War Room** topic, send:
   `@d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget`
6. To link your Telegram account (optional, because the agents accept anyone): in Console, open
   **Home → Messaging apps → Link my account… → This is me**.

## Office actions (from the office screen)
The office server (:8787) talks to the local Switch server as the Console admin, using the same
credentials file as `scripts/switch-up.sh`. You don't need to set anything up.
- **Send a command** (`POST /api/command`). The server posts your text into "Kratos D2C" as
  `d2c-office`, a silent Switch agent that it registers the first time. Its key is stored in
  `.switch/agents/d2c-office.json` (gitignored, mode 600). Agents act on it like on a message from you.
  If you don't name anyone, the room's lead is addressed (War Room → `@d2c-captain`). The reply
  comes back into the office through the observer. Topics: until step 3 above has given a topic a
  Switch thread, the post goes to the group's General topic with a `#WarRoom`-style tag. Once it has
  one, the post lands in the topic itself.
- **Hire** (`POST /api/employees`). The server creates the agent on Switch Console's own
  controller (Switch "managed agents"), so Console runs its Claude Code session on this Mac in this
  repo, the same way it runs the team. It sets addressing to anyone, joins it to "Kratos D2C", gives
  it a desk in its department, and the office walks it in. You don't click anything. If managed
  agents are unavailable, the server stores a one-agent template, the office shows **Finish in
  Switch Console**, and the employee goes active by itself once Console has created it (the server
  checks every 30 s).
- **Who may call them:** the office opened in a browser on this Mac, or anyone sending
  `Authorization: Bearer $ADMIN_TOKEN`. They are never open. Without the token, a request has to:
  - come from this Mac,
  - be sent to `localhost`, `127.0.0.1` or `[::1]`,
  - carry the office's own Origin (or `http://localhost:5173`, or one listed in `OFFICE_ORIGINS`),
  - send JSON.

  A request that came through a proxy counts only if every forwarded hop is this Mac.
  `npx vite --host` therefore shares only the reads (the office view) with your phone or LAN: the
  buttons answer 401 there. Behind a reverse proxy on the same host, set `TRUST_LOOPBACK=0`.
  `NODE_ENV=production` sets it by default.
- **Remove a hire:** Console → Your Agents → delete it. The office keeps the employee record
  (no delete endpoint yet).
