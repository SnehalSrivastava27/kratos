# Go live with Switch and Telegram

This guide connects Kratos to a real Telegram group through Switch. Most of the setup is automated by
`scripts/switch-up.sh`; this page covers the steps only you can do (on your phone, in BotFather and in the
browser) and how the office talks to Switch.

## Before you start

- Node 24+, Python 3 and Claude Code, logged in.
- [Switch Console](https://github.com/sandbox-quantum/switch) open, with **Run a server on this computer** set up
  and Claude Code listed as an agent provider.
- A Telegram bot from [@BotFather](https://t.me/BotFather) with privacy mode off (`/setprivacy` → **Disable**).
  Put its token in `.env` as `TELEGRAM_BOT_TOKEN`.

## 1. Bring up the team

```bash
npm install
scripts/switch-up.sh            # DRY_RUN=1 scripts/switch-up.sh prints the plan without calling anything
```

The script connects the bot, stores the team template, creates any of the 16 agents that don't exist yet on
Switch Console's own controller (`POST /gateway/management/agents`, the same call as the office's Hire), registers
the observer, and starts the office server and the observer. The team and its topics come from
`contracts/roster.json`. It is safe to rerun and ends by printing anything still left for you.

If Switch Console has no online controller, the script prints a fallback:
`open "switchdash://open/template/<id>"` → **Use → Create**. Rerun the script afterwards.

## 2. Link your Telegram group (once per group)

1. **In the group, on your phone:** Edit → **Topics ON**. Then Edit → Administrators → Add Admin → your bot,
   with **Manage topics** on. (For a new group, add the bot to it first.)
2. **In a browser:** open <http://localhost:8787/signup> and create your account. Then open **/connect** and
   get a 6-digit code. It is valid for 15 minutes.
3. **Send the code as a message in the group.** The server links that group to your account, checks that the
   bot is an admin, creates the eight topics from the roster (War Room, Analytics, Ads, Creators, Ops, Design,
   Finance and QA Lab), and adds the agents and the observer. /connect then shows **ready**, and the office
   shows only your group.

Troubleshooting:

- **"needs admin"**: step 1 is not done. Fix it, then send any message in the group to retry.
- **Nothing happens after ~15 s**: send the code again. A new group needs a few seconds before the observer is in it.
- A code works once, and a group can belong to only one account. Only groups can be linked: a private chat with
  the bot, or a channel, is refused and the code stays usable.
- A topic created by hand needs `/list_agents` sent once in it, so Switch maps it to a thread. Until then, an
  agent replies in the thread that addressed it, and office commands go to the group's General topic tagged
  `#WarRoom`, `#Ads` and so on.
- **Limitation:** the server can't check that the person who sends the code is a group admin, because Switch
  passes on only the sender's display name. The code is private to your account, and setup only finishes once a
  group admin has made the bot an admin with "Manage topics", so send the code in a group you run.

**QA Lab** is the topic for test questions (see [evals](../evals/README.md)): every agent answers there directly,
in 3 to 5 lines, without handing off.

## 3. Start a session

In the **War Room** topic, send:

```
@d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget
```

The Captain briefs the leads, the leads pull in their specialists, Finance checks the plan, and the Captain
pins the plan in Switch and asks you to approve. A full walkthrough with timings:
[Running a live session](live-demo-run.md).

To link your own Telegram account in Switch (optional; the agents accept anyone in the group): in Console,
open **Home → Messaging apps → Link my account… → This is me**.

## The team

War Room: `d2c-captain`. Each department has a lead and one or two specialists, in its own topic:

- Analytics: `d2c-analyst` + `d2c-forecaster`, `d2c-insights`
- Ads: `d2c-ads` + `d2c-marketplaces`, `d2c-google`
- Creators: `d2c-influencers` + `d2c-ugc`
- Ops: `d2c-ops` + `d2c-procurement`, `d2c-logistics`
- Design: `d2c-design` + `d2c-copywriter`
- Finance: `d2c-finance` + `d2c-payroll`

The Captain assigns only to leads in War Room. A lead hands work to its specialists in its topic and sends one
report back to War Room. Finance is the gate: the Captain asks `@d2c-finance` to check the plan against
`data/finance_policy.json` and `data/budget.json` before asking you to approve.

## Changing an agent's rules

Edit `switch/agents/<id>.md`, then run `scripts/switch-sync-agents.sh`. It updates the live agents and the stored
template, and checks that each agent took the change. Running sessions pick up the new instructions on their
next message. The template is generated: `node scripts/build-template.mjs` rebuilds
`switch/d2c-team.template.yaml` from the roster and the `.md` files (the sync script runs it for you; `--check`
fails if it is stale or an `.md` lost the Telegram rules). Preview how a reply will look in Telegram with
`python3 scripts/tg-render.py - < reply.md`.

## Office actions

The office server (:8787) talks to the local Switch server as the Console admin, using the same credentials file
as `scripts/switch-up.sh`. Nothing to configure.

- **Send a command** (`POST /api/command`). The server posts your text into your linked group as `d2c-office`, a
  silent Switch agent it registers the first time. Its key is stored in `.switch/agents/d2c-office.json`
  (gitignored, mode 600). Agents act on it like a message from you. If you don't name anyone, the topic's lead is
  addressed (War Room → `@d2c-captain`). The reply comes back into the office through the observer.
- **Hire** (`POST /api/employees`). The server creates the agent on Switch Console's own controller (Switch
  managed agents), so Console runs its Claude Code session on this machine in this repo, like the team. It sets
  addressing to anyone, joins it to your group, gives it a desk in its department, and the office walks it in.
  If managed agents are unavailable, the server stores a one-agent template, the office shows **Finish in Switch
  Console**, and the employee goes active once Console has created it (checked every 30 s).
- **Hire settings:** each hire runs on `TEAM_MODEL` (default `claude-haiku-5-5`) with the team's provider
  settings and lockdown. It always works in this repo, its instructions end with `switch/TELEGRAM_STYLE.md`, and
  its skills must be books in the library.
- **Fire** (`DELETE /api/employees/<id>`). Console stops the agent's session, the agent is deleted from Switch,
  and its desk is free again.
- **Limits:** at most `HIRE_MAX` employees (default 24) and 3 hires per 10 minutes per workspace.

### Who may call these routes

You, signed in, on your own workspace, or anyone sending `Authorization: Bearer $ADMIN_TOKEN`. They are never
open. Without the token, a request must also:

- be sent to `localhost`, `127.0.0.1`, `[::1]` or a host listed in `OFFICE_ORIGINS`,
- carry the office's own Origin (or `http://localhost:5173`, or one listed in `OFFICE_ORIGINS`),
- send JSON.

Skill file paths in the library are shown only to the office on this machine. A request through a proxy counts
as local only if every forwarded hop is. Behind a reverse proxy on the same host, set `TRUST_LOOPBACK=0`
(`NODE_ENV=production` sets it by default).

## Running in production

See [DEPLOY.md](DEPLOY.md) for the single-process build, Docker, environment variables and backups.
