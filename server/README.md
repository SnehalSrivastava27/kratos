# hq-server

Node + TypeScript event server for D2C Agent HQ. Implements `contracts/api.md`.

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
Events are stored in SQLite at `$DATA_DIR/events.db` (default `./.data`, newest 10,000 kept) with
the newest 500 in memory. Without `node:sqlite` (Node < 22.13) it falls back to memory and warns.
Env: `OBSERVER_TOKEN` guards `POST /api/events`, `ADMIN_TOKEN` guards replay (unset = open, dev),
`RATE_LIMIT_PER_MIN` (120), `MAX_WS_CLIENTS` (500). Full contract: `contracts/api.md`.

## Endpoints

```sh
# WebSocket: one OfficeEvent JSON per message
npx wscat -c ws://localhost:8787/ws

# Roster (contracts/roster.json)
curl localhost:8787/api/roster

# Last N events (default 200, max 500)
curl 'localhost:8787/api/history?limit=50'

# Read models for the chat UI
curl localhost:8787/api/rooms; curl 'localhost:8787/api/rooms/war_room/events?limit=50'
curl localhost:8787/api/agents; curl localhost:8787/api/gallery

# Post an event (any client id is ignored; server assigns srv-...). Broadcast + 201, or 400 with ajv errors
curl -X POST localhost:8787/api/events -H "authorization: Bearer $OBSERVER_TOKEN" -H 'content-type: application/json' \
  -d '{"t":1730880000000,"room":"ops","speaker":"d2c-ops","type":"message","text":"Stock moved"}'

# Replay a feed from demo/feeds/<feed>.json over WS (t = ms offset, divided by speed).
# "sale-demo" falls back to contracts/sample-feed.json if the demo file is missing.
curl -X POST localhost:8787/api/replay -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  -d '{"feed":"sale-demo","loop":false,"speed":1}'

# Stop replay
curl -X POST localhost:8787/api/replay/stop -H "authorization: Bearer $ADMIN_TOKEN"

# Static gallery files (path traversal → 403)
curl localhost:8787/gallery/hero.html
```

Replayed events are broadcast as `<feed id>@<run>` (run = epoch ms of that loop iteration, so ids
stay unique across loops and restarts) and also go into history. The office resets its scene when
a newer run starts. Starting a new replay cancels the current one. With `loop: true` the feed restarts 3s (scaled by speed) after its last event.
