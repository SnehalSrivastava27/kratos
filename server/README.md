# hq-server

Node + TypeScript event server for D2C Agent HQ. Implements `contracts/api.md`.

```sh
cd server && npm install
npm run dev     # http://localhost:8787  (override with PORT or SERVER_PORT)
npm run build   # tsc → dist/
npm start       # node dist/index.js; also serves ../web/dist (SPA fallback) if it was built
```

`GET /api/health` → `{ ok, uptime, clients, history }`. SIGTERM/SIGINT close sockets and exit.

Paths resolve from the repo root (`server/..`): `contracts/`, `demo/feeds/`, `gallery/`.
History keeps the last 500 events in memory (lost on restart).

## Endpoints

```sh
# WebSocket: one OfficeEvent JSON per message
npx wscat -c ws://localhost:8787/ws

# Roster (contracts/roster.json)
curl localhost:8787/api/roster

# Last N events (default 200, max 500)
curl 'localhost:8787/api/history?limit=50'

# Post an event (any client id is ignored; server assigns srv-...). Broadcast + 201, or 400 with ajv errors
curl -X POST localhost:8787/api/events -H 'content-type: application/json' \
  -d '{"t":1730880000000,"room":"ops","speaker":"d2c-ops","type":"message","text":"Stock moved"}'

# Replay a feed from demo/feeds/<feed>.json over WS (t = ms offset, divided by speed).
# "sale-demo" falls back to contracts/sample-feed.json if the demo file is missing.
curl -X POST localhost:8787/api/replay -H 'content-type: application/json' \
  -d '{"feed":"sale-demo","loop":false,"speed":1}'

# Stop replay
curl -X POST localhost:8787/api/replay/stop

# Static gallery files (path traversal → 403)
curl localhost:8787/gallery/hero.html
```

Replayed events are broadcast as `<feed id>@<run>` (run = epoch ms of that loop iteration, so ids
stay unique across loops and restarts) and also go into history. The office resets its scene when
a newer run starts. Starting a new replay cancels the current one. With `loop: true` the feed restarts 3s (scaled by speed) after its last event.
