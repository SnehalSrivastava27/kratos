# 10 · Gotchas and lessons

Every real problem we hit while wiring Kratos to Switch and Telegram, and the fix. Commit ids
are from `git log` on `main`; "(risk)" marks things we guarded against without seeing them fail.

## Telegram and Switch

### 1. The bot only sees mentions
- **Symptom:** agents ignore normal messages; the bot posts a "can only see mentions" notice.
- **Cause:** BotFather's Group Privacy is on by default, and Telegram reads it **when the bot
  joins** a group (`switch:…/telegram/adapter.py:819-827`).
- **Fix:** turn privacy off **before** adding the bot, or remove and re-add it, or make it an
  admin. Kratos makes the bot admin anyway (for Manage topics), which settles it per group
  (`docs/SWITCH_SETUP.md:36,108`).

### 2. A template can't create Telegram groups
- **Problem:** the first template used `room:` + `kickoff:`, which asks Switch to create a channel.
- **Cause:** bots can't create chats; Switch refuses channel creation on Telegram
  (`switch:core/switch_core/room_service.py:621`, `telegram.md:13`).
- **Fix:** make the group by hand, add the bot (Switch adopts it), and have every agent `join` a
  `room`-typed param (commit `4f0be1f`, [03](03-agents-and-templates.md)).

### 3. The chat id changed under us
- **Symptom:** Bot API calls on the stored chat id fail after turning Topics on.
- **Cause:** converting to a forum makes a **supergroup with a new chat id**.
- **Fix:** Switch re-points its room by itself. Our own code follows `migrate_to_chat_id` from
  `getChat` (`scripts/switch-up.sh:126-128`, `task/A1:server/src/workspaces.ts:233-238`).

### 4. The room is called "Telegram: Kratos D2C"
- **Symptom:** the observer skipped every message: "unknown room".
- **Cause:** Switch names bridged rooms `"<bridge display name>: <channel>"`
  (`switch:core/switch_core/gateway/rooms.py:1373`).
- **Fix:** match the forum name as a suffix after `": "`, and prefer matching by chat id
  (commit `5ec8d2f`, `observer/src/index.ts:126-127`, `server/src/switch.ts:73-80`).

### 5. A new forum topic is not a thread yet
- **Problem:** without a thread id, the office and the agents can't *start* a post inside a topic.
- **Cause:** a Switch thread is rooted at a Switch message; a fresh topic has none.
- **Fix:** send `/list_agents` once in each topic. Switch maps that command post to the topic id;
  `switch-up.sh` reads the mapping into `observer/topics.json`. Until then, posts go to General
  tagged `#WarRoom` (commit `50dfa1c`, [05](05-rooms-topics-and-threads.md)).

### 6. Agents only act when addressed
- **Problem:** a command from the office that names nobody would get no answer.
- **Cause:** agents act on messages that **address** them (by name); addressing ≠ receiving.
- **Fix:** when the founder names nobody, `d2c-office` adds the topic's lead, e.g. `@d2c-captain`
  (`server/src/office.ts:55-63`). The observer, which must see everything, uses `filter=all`.

### 7. Agent names don't autocomplete
- **Cause:** agents are not Telegram users; one bot fronts them all (`telegram.md:183-189`).
- **Fix:** none possible. The agents' instructions and the office type names in full, and the
  team uses `addressing: anyone`.

### 8. Broken bold and italics in Telegram
- **Symptom:** stray `**` and `_` in agent replies, or a reply that renders as plain text.
- **Cause:** Switch converts Markdown to Telegram HTML; bold inside a bold-italic line makes tags
  cross (`<b><i>…</b></i>`), which Telegram rejects; `snake_case` inside italics breaks them.
- **Fix:** style rules that forbid those patterns, plus `scripts/tg-render.py`, a byte-for-byte
  dry run of Switch's renderer with a nesting check (commit `147bfbc`, [02](02-telegram-bridge.md)).

### 9. Two of anything that polls or listens (risk)
- **Cause:** Telegram gives each update to one poller, so two Switch servers on one token split
  people's messages at random (`telegram.md:216-226`). The same logic applies to our side: two
  observer processes would each forward every message, and the office would show it twice.
- **Fix:** one Switch server per bot; `switch-up.sh` keeps a pid file and won't start a second
  observer (`scripts/switch-up.sh:192-196`), and never calls `getUpdates` itself (`:13`).

### 10. API keys are shown once
- **Cause:** registration returns the agent key once (`agent-protocol.md:331`).
- **Fix:** write it immediately to `.switch/agents/<name>.json` with mode 600. If it's lost,
  `d2c-office` re-registers with `overwrite: true`; for the observer the script tells you to delete
  and rerun (`server/src/switch.ts:86-102`, `scripts/switch-up.sh:101-102`).

### 11. Nothing answers after a reboot
- **Cause:** the local server doesn't restart on its own (`add-a-server.md:45`).
- **Fix:** open Console and start it; every script checks `/health` first.

### 12. Editing an agent's `.md` changed nothing
- **Cause:** live agents run from their managed definition, not the file.
- **Fix:** `scripts/switch-sync-agents.sh` patches each definition and waits for the controller's
  `applied_revision` to catch up (commit `58042bf`, [03](03-agents-and-templates.md)).

### 13. A hire's first message was credited to the founder
- **Cause:** the observer maps unknown speakers to `founder`, and it hadn't heard of the hire yet.
- **Fix:** on an unknown name, ask the office for the current people first (commit `b4533a4`).

### 14. SSE may go away (risk)
- The Switch source calls SSE a compatibility transport; the live one is a WebSocket at
  `/connection/ws` (`switch:…/agent/api/handlers.py:773-781`). A 410 on stream open is the signal.

## Our server: loopback, CSRF and secrets

### 15. "Only this Mac" is not a security model by itself
- **Cause:** office writes (command, hire) were trusted from loopback. A malicious web page in the
  founder's browser can still POST to `localhost` (CSRF), a domain can resolve to 127.0.0.1 (DNS
  rebinding), and `npx vite --host` proxies phone requests that look local.
- **Fix:** writes need JSON, a local `Host`, and the office's own `Origin`; proxied requests count
  only if every forwarded hop is loopback; `TRUST_LOOPBACK=0` behind a reverse proxy
  (commits `d47a9ce`, `91484d0`). v3 adds sessions that own the workspace.

### 16. The write guard broke our own buttons
- **Symptom:** logout, connect and some office POSTs answered 415.
- **Cause:** they sent no body, and the guard requires `content-type: application/json`.
- **Fix:** send `{}` on every POST (commits `c682d6c`, `d27c5ae`). The same commit makes a 409
  say "the Telegram group is still being set up".

### 17. Secrets near the repo
- Console writes agent keys into the agents' directory, which is the repo. `.switch/` and
  `.claude/settings.local.json` are gitignored (commit `f64785b`); so are `.env` (the bot token)
  and the per-install `observer/topics.json` (commit `e5a83ad`).
- Production refuses to start without `OBSERVER_TOKEN` and `ADMIN_TOKEN` (commit `0e0da41`).
- Bot API errors never include the URL, because it contains the token
  (`task/A1:server/src/workspaces.ts:199`).

## The office

### 18. CSP blocked the 3D models
- **Cause:** three.js's meshopt decoder compiles WebAssembly, which a strict `script-src 'self'`
  blocks.
- **Fix:** `script-src 'self' 'wasm-unsafe-eval'`: wasm allowed, plain `eval` still blocked
  (commit `aedb7e3`).

### 19. GPU and heap leak
- **Cause:** the scene rebuilt models and floors on re-render without disposing the old ones.
- **Fix:** a stable model set, memoised floor, dispose the previous build (commit `d0c5158`), then
  an imperative three.js engine with one animation loop (commit `68e2ad9`).

### 20. Agent text is untrusted input
- Agents (and SKILL.md files) write Markdown that the office displays. It is rendered as DOM
  nodes, never `innerHTML`; only `/gallery/<file>` URLs become links or frames (commits `48d6190`,
  `980f93f`).

### 21. Losing events between history and live
- **Fix:** open the WebSocket first, buffer, load history, then replay both deduped
  (commit `21d4f68`); fall back to a local replay if live stays down for 5 s (commit `5f238ab`).

## Lessons

1. **Read the source, cite the line.** `contracts/switch-protocol-notes.md` answered the
   make-or-break question (does a silent agent see everything?) before any code was written.
2. **Let Switch own Telegram.** We never poll the bot; we only call `getChat`, `getChatMember`
   and the topic methods.
3. **Script the idempotent parts, list the human parts.** `switch-up.sh` ends with "Left for
   you", and is safe to rerun after each phone step.
4. **Match by id, not by name.** Names get prefixes; anyone can name a group "Kratos D2C".
