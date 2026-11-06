# observer

A silent Switch agent called `d2c-observer`. It is a member of every Kesar HQ room and forwards
each room message to the office server as an `OfficeEvent`. It never posts into a room.

How it works: it opens the agent-protocol SSE stream with `scope=all&filter=all`, which delivers
every message in every room the agent belongs to. It sends a heartbeat every 2 s and reconnects
with `Last-Event-ID`. For each message it:

- maps the speaker to a roster id, and tags the event with its Switch room (`meta.switch_room_id`, `room_name`,
  `chat_id` when known, `switch_thread_id`). The office server decides which workspace the room belongs to and
  which topic (department) the thread is; `room` is only a placeholder (config `rooms`, else the speaker's home
  department, else `war_room`). Rooms with no workspace are forwarded too: that is how link codes arrive (v3).
- infers `type` from keywords: `approval_needed`, `pushback`, `approved`, otherwise `message`
- adds `meta.targets` for each `@d2c-*` mention
- POSTs the event to `{server}/api/events`

Protocol details and citations are in `contracts/switch-protocol-notes.md`.

Requires Node ≥ 22.18. It runs the `.ts` files directly and has no runtime dependencies.

## Register it in Switch (once)
1. In Switch Console, open **Your Agents → +**. Set Run location to *this computer*, provider to *Claude Code*,
   and directory to **this `observer/` folder**. Name it `d2c-observer` and give it the description
   "Silent office observer. Do not address." Set **Who can talk to your agent** to **Only me**, then create it.
2. Console writes `observer/.switch/agents/d2c-observer.json`, which is gitignored. That file holds the
   agent id, the bridge URL and the API key. If it isn't there, set `"credentials": ".claude/settings.local.json"`
   in `config.json`, because Console writes the same `env` block there. You can also export
   `SWITCH_AGENT_ID`, `SWITCH_API_ENDPOINT` and `SWITCH_API_TOKEN`.
3. Nothing per group: when a user links a group (docs/GO_LIVE.md), the office server joins the observer to it.

## Run
```bash
npm install        # dev deps only (typescript, for `npm run build`)
npm start          # live: needs the office server on config.server (http://localhost:8787)
npm run mock       # no Switch or office needed: fake bridge + real observer → fake office; exits 0 if tagged right
npm run build      # typecheck
```

## config.json
| key | meaning |
|---|---|
| `server` | Office server base URL. The `OFFICE_URL` env var overrides it. |
| `speakers` | Map from `sender_name` to roster id, e.g. `{"Snehal K": "founder"}`. Roster ids and names already match. |
| `unknownSpeaker` | Roster id used for unmapped senders (default `founder`, logged), or `null` to skip them. |
| `ignoreSpeakers` | Sender names to drop, e.g. Switch's own voice. |
| `rooms` | Optional fixed map from room name or room id to a `RoomId` (the placeholder department). |

Unknown speakers are logged, never fatal. With `OBSERVER_TOKEN` set it also reads `GET /api/people` to know hired agents.
