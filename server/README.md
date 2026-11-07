# hq-server

Node + TypeScript event server for Kratos. Implements `contracts/api.md`.

```sh
cd server && npm install
npm run dev     # http://localhost:8787  (override with PORT or SERVER_PORT)
npm run build   # tsc → dist/
npm start       # node dist/index.js; also serves ../web/dist (SPA fallback) if it was built
```

`GET /api/health` → `{ ok, version, uptime, clients, history, db }`, `GET /api/ready` → 200/503.
SIGTERM/SIGINT close sockets and the DB, then exit. Logs are one JSON object per line.
`npm test` runs the node:test suite (test/), `npm run check` the WS/id regression check.

Paths resolve from the repo root (`server/..`): `contracts/`, `demo/feeds/`, `gallery/`.
Events, accounts, sessions and workspaces are stored in SQLite at `$DATA_DIR/events.db` (default `./.data`,
newest 10,000 events per workspace kept). If that file can't open, an in-memory DB is used (`db: "memory"`).
**v3:** every real-data read, `/ws` and every office write needs a signed-in session (cookie `hq_session`) that owns
the workspace (`?ws=`), or `ADMIN_TOKEN`. Public: health, ready, roster, gallery, the built site. See
`contracts/api.md` "v3" and docs/GO_LIVE.md for linking a Telegram group.
Env: `OBSERVER_TOKEN` guards `POST /api/events` (unset = open, dev), `ADMIN_TOKEN` (replay, scripts),
`RATE_LIMIT_PER_MIN` (120), `MAX_WS_CLIENTS` (400), `TELEGRAM_BOT_TOKEN` (else read from `ENV_FILE`, default
`<repo>/.env`), `BOT_USERNAME`, `OFFICE_ORIGINS`, `TRUST_PROXY=1` (trust X-Forwarded-Proto from a non-local proxy
for the cookie's Secure flag), `TOPICS_FILE` / `LEGACY_CHAT_ID` (pre-v3 Kratos D2C migration).

## Endpoints

```sh
# WebSocket: one OfficeEvent JSON per message, of your workspace only (needs the session cookie)
npx wscat -c ws://localhost:8787/ws -H "cookie: hq_session=..."

# Roster (contracts/roster.json)
curl localhost:8787/api/roster

# Sign up (cookie jar), then read your workspace (default: your first ready one; ?ws=<id> to pick)
curl -c jar -H 'content-type: application/json' -H 'origin: http://localhost:8787' localhost:8787/api/auth/signup \
  -d '{"email":"me@example.com","password":"at-least-10-chars"}'
curl -b jar 'localhost:8787/api/history?limit=50'
curl -b jar localhost:8787/api/rooms; curl -b jar 'localhost:8787/api/rooms/war_room/events?limit=50'
curl -b jar localhost:8787/api/agents; curl localhost:8787/api/gallery

# Post an event as the observer (any client id is ignored; server assigns srv-...). From a linked Switch room:
# stored + broadcast to that workspace, 201; from any other room: 202 (a link attempt only); 400 with ajv errors
curl -X POST localhost:8787/api/events -H "authorization: Bearer $OBSERVER_TOKEN" -H 'content-type: application/json' \
  -d '{"t":1730880000000,"room":"ops","speaker":"d2c-ops","type":"message","text":"Stock moved","meta":{"switch_room_id":"<room>"}}'

# Replay a feed from demo/feeds/<feed>.json over WS (t = ms offset, divided by speed).
# "sale-demo" falls back to contracts/sample-feed.json if the demo file is missing.
curl -X POST localhost:8787/api/replay -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"feed":"sale-demo","loop":false,"speed":1,"ws":"<workspace id>"}'

# Stop replay
curl -X POST localhost:8787/api/replay/stop -H "authorization: Bearer $ADMIN_TOKEN"

# Static gallery files (path traversal → 403)
curl localhost:8787/gallery/hero.html
```

Replayed events are broadcast as `<feed id>@<run>` (run = epoch ms of that loop iteration, so ids
stay unique across loops and restarts) and also go into history. The office resets its scene when
a newer run starts. Starting a new replay cancels the current one. With `loop: true` the feed restarts 3s (scaled by speed) after its last event.
