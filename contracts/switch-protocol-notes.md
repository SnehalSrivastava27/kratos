# Switch protocol notes (T6 research, 2026-11-06)

Source: `github.com/sandbox-quantum/switch` @ `93c132c`, read as reference only. Paths below are
relative to that repo. `docs/official/*` is the synced copy of docs.switchagents.ai.
**[unverified]** = read from docs or code, not yet seen running on our machine.

## TL;DR (what unblocks T6)

| Question | Answer | Source |
|---|---|---|
| Does a listen-only agent get every room message? | **Yes.** Open the stream with `scope=all&filter=all` (filter `all` is the default). You get every `message` in every room the agent is a member of, including messages from other agents, but not your own. | `docs/official/internals/agent-protocol.md:44-49`; `core/switch_core/bridges/agent/protocol/stream.py:693-708`; `core/.../protocol/event_buffer.py:1348-1350` ("a message or a join by someone other than the agent") |
| So do we need the Telethon fallback? | **No.** `observer/telethon/` was not built. | above |
| How do agents look on Telegram? | **One bot for all agents.** Each post starts with a marker and the agent's name in bold, then the text. Agents are not Telegram users, so `@name` does not autocomplete or link. You address an agent by typing its name. | `docs/official/deploy/messaging-apps/telegram.md:7,183-189`; `core/.../collaboration/telegram/adapter.py:3352-3377` |
| Docker? | **Not needed.** Console runs a local server as background processes. Docker is only used for the optional bundled Mattermost. | `docs/official/getting-started/add-a-server.md:21,29-39` |
| Can a template create Telegram rooms? | **No.** Telegram bots can't create chats. You create the group in Telegram, add the bot, and Switch adopts it as a room named after the group title. Our template now `join`s existing rooms instead. | `telegram.md:13`; `core/.../collaboration/telegram/adapter.py:582`; `core/switch_core/room_service.py:472-491,621` |

## 1. Install
- Switch Console is a desktop app. On Apple Silicon use `switch-console-arm64.dmg` from the latest GitHub release (`README.md` install table).
- First run: pick **Add a server → Run a server on this computer**. It uses your PostgreSQL 16-18, or a bundled copy if you have none, needs no Docker, creates the admin account and signs Console in (`add-a-server.md:21-37`). The local server does **not** start again on its own after a reboot (`add-a-server.md:45`).
- Providers: Settings → Agent providers. Claude Code must show **Installed** (`set-up-agent-providers.md`).

## 2. Telegram
- **One bot backs every agent on the server** (`telegram.md:7`), so make **one** bot with BotFather `/newbot`. Save the token; BotFather only shows it once (`telegram.md:26-34`).
- **Turn Group Privacy OFF before adding the bot to any group**: `/mybots` → bot → Bot Settings → Group Privacy → Turn off. Telegram reads this setting when the bot joins, so a group joined before the change stays mention-only until you remove and re-add the bot, or make it admin (`telegram.md:40-46,201-214`).
- Connect in Console: server **Home → Messaging apps → Connect → Telegram**, then paste the Bot Token and Bot Username (`telegram.md:50-73`). Telegram is polled outwards, so no public URL is needed (`telegram.md:9`).
- Each group becomes a room when you add the bot as a member. The bot needs no admin rights (`telegram.md:79-83`). A DM with the bot never becomes a room (`telegram.md:95-101`).
- Link your account **after** you've posted in a group: Home → Messaging apps → **Link my account…** → This is me. Your Telegram account needs an `@username` (`telegram.md:18,103-130`). Agents with addressing `owner` ignore you until this is done. Ours use `anyone`.
- Invite an agent from inside a group with `/invite_agent @agent-name` (or `!invite-agent`) (`telegram.md:145-151`; `create-a-room.md:87-93`).
- Progress shows as a 👀 reaction plus a "⚙️ Working on it…" message that is edited in place (`telegram.md:191-199`).
- Run **one** server per bot token. Two pollers split the incoming messages between them (`telegram.md:216-226`).
- Telegram converts a group to a supergroup when members are added and gives it a new chat id. Switch re-points the room on its own (`telegram.md:173`).

## 3. Agent protocol
Spec: `docs/official/internals/agent-protocol.md`. Server: `core/switch_core/bridges/agent/api/handlers.py`.
- **Auth:** every call sends `Authorization: Bearer <agent API key>` (`agent-protocol.md:11`). A registration token is separate and works only for registration (`:13`).
- **Register** (once): `POST {bridge}/agents/register-known` with the registration key as bearer and body `{agent_type, name, description, options}`. The response is `{id, api_key}`, and the key is shown once (`agent-protocol.md:331`; `handlers.py:318`). Valid `agent_type` values are the provider ids, e.g. `claude-code`, `codex`, `opencode` (`core/switch_core/gateway/known_agents.py`; `providers/registry.py`). With `options.channels_enabled=false` the agent becomes `session_passive`, so Console never spawns a session for it (`known_agents.py:68-126`). Registration keys are personal keys minted in the Gateway (`gateway/src/App.tsx:144` route `registration-keys`; `core/.../gateway/api_keys.py:72-88`) **[unverified: URL of the Gateway UI on a Console-run local server]**.
- **Credentials Console writes:** onboarding an agent in Console writes `<dir>/.switch/agents/<name>.json` = `{"env": {"SWITCH_AGENT_ID", "SWITCH_API_ENDPOINT", "SWITCH_API_TOKEN"}}` (`console/.../core/agents/add-agent.ts:141-146`; `console/.../switch-rooms/switch-credentials.ts:128-150`). `SWITCH_API_ENDPOINT` is the bridge base URL, and the runtime uses it as `${apiEndpoint}/agents/${agentId}/events` (`console/packages/switch-agent-runtime/src/event-stream.ts:1026`). The observer reads this file.
- **Stream (down):** `GET {bridge}/agents/{id}/events?connection_id=<uuid>&scope=single|all&filter=all|addressed&start_from=head` with `Accept: text/event-stream`, plus optional `Last-Event-ID` (`agent-protocol.md:341-353`). Generate the connection id once and reuse it on every reconnect. Reopening a live id is a takeover (`:42,55`). Max 32 connections per agent (`:51`).
  - The server source says SSE is kept for a "compatibility window" and that the live transport is now a WebSocket at `/connection/ws` (`handlers.py:773-781`). If the server ever answers **410** to the SSE open, switch transports. **[risk]**
- **Heartbeat (up):** `POST {bridge}/agents/{id}/connection/beat {connection_id, cursor}` every 2 s, with a 6 s TTL. A 404 or 409 means reopen the stream, not back off (`agent-protocol.md:59-73`).
- **Frames:** `connection_state` always comes first. Domain events (`message`, `command`, `room_join`, `task_*`) carry the SSE `id` = `sequence`. Control frames are `gap`, `evicted`, `subscription_changed` and `room_released`. A keepalive is an SSE comment sent every 15 s (`agent-protocol.md:92-140`).
- **Message envelope:** `{type, room_id, bridge_id, channel_type, payload, sequence}`. The payload is `{addressed, sender, sender_name, sender_kind?, on_behalf_of?, message_id, body, timestamp(ms), thread_id, attachments[]}` (`agent-protocol.md:105-112,173`). `sender` is an opaque `@switch-<type>-<id>:<server>`, so match on it and don't parse it (`:183-196`). The event carries only `room_id`. Get room names from the `list_rooms` op, which returns `[{room_id, name, …}]` (`core/.../operations/definitions.py:220-248`).
- **Operations (up):** `POST {bridge}/agents/{id}/ops/{name}` with the bare JSON args and the optional `X-Switch-Connection-Id` header. The result is `{"result": …}` (`agent-protocol.md:286-310`). Posting is `post_message` or `POST /agents/{id}/message`. **The observer never calls either.**
- **Coexisting with Console:** Console's own watcher for an agent opens `scope=all, filter=addressed, rooms=[]` and claims no rooms (`console/packages/agent-providers/src/host/agent-host.ts:1287-1296`). An `all` connection covers every member room *except* rooms a sibling connection of the same agent has claimed (`agent_connections.py:1725-1734`). So if a Console session of the observer agent ever claims a room (someone addresses it there), the observer stops receiving that room. Keep its addressing at **Only me** and nobody will address it.

## 4. Addressing (who may talk to an agent)
`owner` (default: the deployer only), `owner-agents` (deployer plus their agents), `anyone` (every room member), and in v2 `{anyone_in: [rooms]}` (`docs/TEMPLATES.md:416-418,657-659`; `onboard-your-agents.md:55-63`). Addressing controls **who can make it act**. It has nothing to do with **what it receives**, which is controlled by the stream `filter` (`agent-protocol.md:49`).

## 5. Template schema (what changed in `switch/d2c-team.template.yaml`)
- Needs `version: 1` and a `params:` block. Every `{placeholder}` must name a declared param (`TEMPLATES.md:83-111,756-765`).
- Every created agent must state `provider`, `location` (or `machine`) and `directory`, or the run refuses (`TEMPLATES.md:322-328`). All agents share the repo checkout as `directory`, so they can read `data/` and write `gallery/`. Console writes one credentials file per agent, so a shared directory is supported (`add-agent.ts:217-220`).
- `room:` + `kickoff:` would create a channel, which Telegram refuses (`room_service.py:621`, `adapter.py:582`). These were replaced by `room`-typed params, with defaults `["Kesar HQ · <Dept>"]`, that each agent `join`s. Console adds the agents to the rooms after the run (`TEMPLATES.md:420-422,527-561`).

## Still unverified (check on first live run)
1. The exact `sender_name` for a Telegram human (display name vs `@username`). The observer logs unknown names and maps them to `founder` by default.
2. Whether adopted room names exactly equal the Telegram group title. The code passes `chat.title` (`telegram/adapter.py:2697,2710`), and the observer also matches on the department label.
3. Whether Switch posts a greeting when the observer is invited. That would be harmless, since it comes from Switch and not from the observer.
4. The Gateway URL for a local Console server. This only matters for the register-key route. The default route (Console onboarding) doesn't need it.
