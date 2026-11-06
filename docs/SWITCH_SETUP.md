# Switch + Telegram setup (macOS, Apple Silicon)

> **Superseded (2026-11-06):** the team is now 6 agents (Finance removed) in ONE Telegram forum group,
> "Kratos D2C", with one topic per department. Use `scripts/switch-up.sh` + `docs/GO_LIVE.md`.
> The steps below describe the older 7-group layout and are kept for reference.

👤 marks a step only you can do: a phone, BotFather or a click in the app. Every other step is a
copy-paste command run from the repo root (`/Users/snehal/Desktop/repos/switch-wmd`).
For the reasons and sources behind each step, see `contracts/switch-protocol-notes.md`.

**What to expect:** Docker is **not** needed. **One** Telegram bot speaks for all 7 agents, and
each of its posts starts with the agent's name. Telegram can't create groups for Switch, so
you make the 7 groups yourself and the template joins the agents to them.

## A. Install

1. Check the prerequisites:
   ```bash
   claude --version && node --version   # Claude Code installed and logged in; Node ≥ 22.18
   ```
2. Download Switch Console:
   ```bash
   curl -fL -o ~/Downloads/switch-console-arm64.dmg \
     https://github.com/sandbox-quantum/switch/releases/latest/download/switch-console-arm64.dmg
   open ~/Downloads/switch-console-arm64.dmg
   ```
3. 👤 Drag **Switch Console** into Applications and open it.
4. 👤 Choose **Add a server → Run a server on this computer**. This takes about 1 min. *Also run Mattermost* is optional, so turn it off if it nags about Docker.
   The sidebar should then show **Running locally**.
5. 👤 Open **Settings → Agent providers** and check that **Claude Code** reads *Installed*.

## B. Telegram bot and groups

6. 👤 In Telegram, open **@BotFather** and send `/newbot`. Use the name `Kesar HQ` and a username ending in `bot`
   (e.g. `kesar_hq_snehal_bot`). **Save the token in your password manager now.** BotFather won't show it again.
7. 👤 **Before adding the bot anywhere**, send `/mybots` to BotFather, then pick your bot → **Bot Settings → Group Privacy → Turn off**.
8. 👤 Make sure your Telegram account has an **@username** (Settings → Username). Switch identifies you by it.
9. 👤 In Switch Console, open the server's **Home → Messaging apps → Connect → Telegram**. Set Name to `Telegram` and fill in
   **Bot Token** and **Bot Username**, then click **Connect**. A bad token shows an error here.
10. 👤 Create 7 Telegram groups with **exactly** these names. Add the bot as a member of each one. You can add it as the first member when you create the group.
    ```
    Kesar HQ · War Room
    Kesar HQ · Analytics
    Kesar HQ · Ads
    Kesar HQ · Creators
    Kesar HQ · Ops
    Kesar HQ · Design
    Kesar HQ · Finance
    ```
    Each group should appear under **Your Rooms** in Console. If the bot posts a "can only see mentions" notice,
    you skipped step 7: remove the bot and add it back.
11. 👤 Send `hi` in **Kesar HQ · War Room**. Then in Console go to **Home → Messaging apps → Link my account…**, search for yourself and click **This is me**.

## C. Load the agent team

12. Check the demo numbers and copy the template:
    ```bash
    python3 switch/check_numbers.py    # must end with EBITDA +128,914 / −76,086
    pbcopy < switch/d2c-team.template.yaml
    ```
13. 👤 In Console, open **Templates**, paste the template and open the form. Check that **directory** is this repo's path.
    The 7 room params fold under *Provider, machine and rooms* and should resolve to the groups from step 10.
    Click **Create**. You should get 7 agents (`d2c-captain` … `d2c-finance`) under **Your Agents**, each already
    in War Room plus its department room. The captain is in all 7 rooms.
14. Make sure the credentials Console wrote into the repo don't get committed:
    ```bash
    ls .switch/agents/ && git status --short   # .switch/ and .claude/ must not be committed
    ```

## D. Add the observer (office feed)

15. 👤 In Console, open **Your Agents → +**. Set *this computer*, *Claude Code*, and directory
    `/Users/snehal/Desktop/repos/switch-wmd/observer`. Name it `d2c-observer` with the description `Silent office observer. Do not address.`
    Set **Who can talk to your agent** to **Only me**, then click Create.
16. Check that the credentials landed:
    ```bash
    test -f observer/.switch/agents/d2c-observer.json && echo ok || echo "see observer/README.md step 2"
    ```
17. 👤 In **each of the 7 groups**, send:
    ```
    /invite_agent @d2c-observer
    ```
    Run `!list-agents` in a group to check.
18. Start the office server and test the observer without Switch (run each in its own terminal):
    ```bash
    cd server && npm install && npm run dev                 # terminal 1, :8787
    cd observer && npm install && npm run mock              # terminal 2 → "mock OK: 5 events…"
    cd observer && npm start                                # terminal 2, live → "connected … scope=all filter=all"
    ```
19. 👤 Smoke test: send `hello office` in War Room. Within 2 s the observer logs `201 war_room founder message`
    and the office shows the message. An `unknown speaker "<you>" → founder` line is expected. Add
    `"<you>": "founder"` to `observer/config.json` → `speakers` to silence it.

## E. Run the demo

20. 👤 In **Kesar HQ · War Room**, send this (agents only wake when addressed by name):
    ```
    @d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget
    ```
    Watch for: the forecast, then Finance pushing back (EBITDA −₹0.76L), a revised creator list, Finance approving (+₹1.29L), and the captain's final plan.
    Reply `Approved` 🎉.
21. 👤 Save screenshots of each step to `docs/screenshots/`.

## If something is off
| Symptom | Fix |
|---|---|
| Agents ignore you | Step 11: link your account. Also run `!agents-status` in the group. |
| The bot sees only `/commands` and mentions | Group Privacy was still on when the bot joined. Remove the bot and add it back, or make it an admin. |
| People's messages arrive only sometimes | Two servers are using one bot token. Run only one. |
| Observer: `stream open 401/403` | Wrong credentials file, or the observer is not a member of the room. Redo step 16 or 17. |
| Observer: `stream open 410` | The server dropped SSE for WebSocket. The observer needs a WS transport (see notes §3). |
| After a reboot nothing answers | The local server doesn't restart on its own. Open Console and start it. |
