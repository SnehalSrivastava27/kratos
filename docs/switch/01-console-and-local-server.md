# 01 · Switch Console and the local server

**One idea:** a whole Switch server runs on a laptop, from one desktop app, with no Docker and no
config file.

## Install

Switch Console is a desktop app. On an Apple Silicon Mac:

```bash
curl -fL -o ~/Downloads/switch-console-arm64.dmg \
  https://github.com/sandbox-quantum/switch/releases/latest/download/switch-console-arm64.dmg
open ~/Downloads/switch-console-arm64.dmg
```

Source: `docs/SWITCH_SETUP.md:21-27`, `switch:README.md` (install table).

## "Run a server on this computer"

On first run, pick **Add a server → Run a server on this computer**. Console then:

- uses the PostgreSQL already on the machine (16 to 18), or a bundled copy if there is none,
- installs the Switch server it ships with (nothing is downloaded),
- picks free ports bound to this computer only,
- creates an admin account and signs itself in.

"There is no URL to copy and no secret to enter. A first setup takes about a minute."
(`switch:docs/official/getting-started/add-a-server.md:21-37`)

Everything runs as ordinary background processes. Docker is only needed for the optional
bundled Mattermost, which we turned off (`add-a-server.md:39`).

> Suggested blog line: "I expected a docker-compose file. I got a Mac app and a minute of waiting."

## The catch: it is a laptop server

"Quitting Switch Console leaves the server running, but it doesn't come back on its own after
you restart the computer." (`add-a-server.md:45`) After a reboot, open Console and start it.
Our scripts check for that first and say so:

```bash
curl -sf "$API/health" >/dev/null || { echo "Switch server at $API is not answering. Start it in Switch Console."; exit 1; }
```
(`scripts/switch-up.sh:44`)

## Where Console keeps things (and how our scripts use it)

Console writes the local server's settings to a run file. Our scripts read the port and the
admin login from it, so nobody copies credentials by hand:

```bash
CORE_ENV="$SWITCHDASH/local-switch-server/native/run/switch-core.env"
API="http://127.0.0.1:$(envval "$CORE_ENV" SERVER_PORT)"
# … then sign in to the gateway as Console's own admin (never printed)
curl -sf -c "$TMP/jar" -H 'Content-Type: application/json' --data-binary @"$TMP/login" "$API/gateway/auth/login"
```
(`scripts/switch-up.sh:23-24,40,46-55`; the server does the same in `server/src/switch.ts:13,24-33,49-71`)

This is what lets `scripts/switch-up.sh` connect Telegram, store the team template, register our
observer and join agents to the room in one idempotent run.

## Providers: Claude Code

Agents in Switch are run by a **provider**, the coding agent behind them. Kratos uses
**Claude Code** for every teammate. In Console: **Settings → Agent providers**, and Claude Code
must read *Installed* (`switch:docs/official/getting-started/set-up-agent-providers.md`).

`switch-up.sh` checks this from Console's own precheck file instead of asking you:

```python
p=[x for x in json.load(open(sys.argv[1]))["providers"] if x["status"]["provider"]=="claude"][0]
s=p["status"]; print(f"• Claude Code installed={s['installed']} version={s.get('version')} auth={s.get('auth')}")
```
(`scripts/switch-up.sh:68-74`)

Console runs each agent's Claude Code session **on this Mac, in this repo**. That is why the
agents can read `data/*.csv` and write banners to `gallery/`: the template sets `directory` to the
repo checkout (`switch/d2c-team.template.yaml:19-22`).

## Console-managed vs. our own agents

| Agent | Who runs it | Why |
|---|---|---|
| `d2c-captain`, `d2c-analyst`, `d2c-ads`, `d2c-influencers`, `d2c-ops`, `d2c-design` | Switch Console (Claude Code sessions) | They think and reply |
| Office hires | Switch Console, created through the management API | Same as the team, no click |
| `d2c-observer` | Our Node process | Reads every message, never replies |
| `d2c-office` | Our office server | Posts the founder's commands |

The last two are **passive** agents (`channels_enabled: false`), so Console never starts a
session for them. See [04](04-agent-protocol.md).

## Console deep links

Console registers a `switchdash://` URL scheme. When a human click is unavoidable, our scripts
print a link straight to the right screen:

```bash
open "switchdash://open/template/<id>"   # → Use → Create
```
(`docs/GO_LIVE.md:16-19`, `scripts/switch-up.sh:92`; the hire fallback returns the same kind of
link, `server/src/office.ts:214`)
