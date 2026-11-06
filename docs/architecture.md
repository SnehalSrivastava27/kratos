# Architecture

```
                         ┌───────────────────────────────┐
  Founder's phone ──────►│ Telegram groups (7)           │
                         │ War Room · Analytics · Ads ·  │
                         │ Creators · Ops · Design ·     │
                         │ Finance                       │
                         └───────────────┬───────────────┘
                                         │ Telegram bridge
                         ┌───────────────▼───────────────┐
                         │ Switch (Console + Core)       │
                         │ 7 agents · rooms ·            │
                         │ shared context                │
                         └───────┬───────────────┬───────┘
          agents read/write      │               │ agent protocol
          (working dir = repo)   │               │ (SSE in, HTTP out)
                         ┌───────▼──────┐ ┌──────▼────────────────┐
                         │ data/        │ │ office-observer       │
                         │ gallery/     │ │ silent, in every room │
                         └───────┬──────┘ └──────┬────────────────┘
                                 │ static        │ POST /api/events
                         ┌───────▼───────────────▼───────┐
                         │ Office server (Node, :8787)   │
                         │ history · replay · /gallery   │
                         └───────────────┬───────────────┘
                                         │ WebSocket /ws
                         ┌───────────────▼───────────────┐
                         │ Web app (Vite, :5173)         │
                         │ /  landing  ·  /office  3D    │
                         └───────────────────────────────┘
```

## Pieces

| Piece | Path | Role |
|---|---|---|
| Switch | external | Hosts the 7 agents, bridges rooms to Telegram groups, routes `@agent` mentions, shares context |
| Team template | `switch/d2c-team.template.yaml` | Defines agents, instructions and the War Room |
| Demo data | `data/` | CSV/JSON the agents read |
| Gallery | `gallery/` | HTML banners the Design agent writes |
| Observer | `observer/` | Read-only Switch agent; maps each room message to an `OfficeEvent` |
| Server | `server/` | Validates events, keeps last 500, broadcasts over `/ws`, replays feeds, serves `/gallery` |
| Web | `web/` | Landing page (`/`) and 3D office (`/office`) |

## Data flow for one message

1. A person or agent posts in a Telegram group (or Switch room).
2. Switch delivers it to every agent in the room, including the observer.
3. Observer maps speaker → roster id, room → room id, guesses `type`
   (`pushback`, `approved`, `approval_needed`, else `message`) and POSTs to `/api/events`.
4. Server validates against `contracts/events.schema.json`, stores it, broadcasts on `/ws`.
5. Office moves the agent, shows a speech bubble, and updates beacons, the EBITDA meter or the
   gallery wall.

Contracts: [`contracts/api.md`](../contracts/api.md),
[`contracts/events.schema.json`](../contracts/events.schema.json),
[`contracts/roster.json`](../contracts/roster.json), [`contracts/zones.json`](../contracts/zones.json).

## Offline / demo mode

- `POST /api/replay {"feed":"sale-demo"}` replays `demo/feeds/sale-demo.json` over `/ws`
  (falls back to `contracts/sample-feed.json`).
- The landing hero imports the feed directly and loops it in the browser: no server needed.
- If the server dies, the office falls back to autoplay instead of going blank.

## Open questions

<!-- TODO(HUMAN): fill from contracts/switch-protocol-notes.md -->
- Does a listen-only agent receive every room message, or only ones addressed to it?
  If not, the observer falls back to a Telethon user account (`observer/telethon/`).
- Agent protocol endpoints and auth.
- One Telegram bot per agent, or one bot with name prefixes?
