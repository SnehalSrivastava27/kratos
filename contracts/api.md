# API contract (server ↔ office ↔ observer)

Ports: server **8787**, web dev server **5173** (Vite proxies `/api`, `/ws`, `/gallery` to 8787).

| Method | Path | Who calls | Purpose |
|---|---|---|---|
| WS | `/ws` | office, landing hero | Server pushes `OfficeEvent` JSON (see events.schema.json), one per message |
| GET | `/api/roster` | office | Returns contracts/roster.json |
| GET | `/api/history?limit=200` | office | Last N events, for late joiners |
| POST | `/api/events` | observer | Body = OfficeEvent (without `id` ok; server assigns). Server broadcasts it |
| POST | `/api/replay` | dev / landing | Body `{ "feed": "sale-demo", "loop": true, "speed": 1 }`; replays data feed file over WS |
| POST | `/api/replay/stop` | dev | Stops replay |
| GET | `/gallery/*` | office | Static banners written by the Design agent |

Feed files live in `demo/feeds/<name>.json` and follow the same schema with `t` = ms offset.

Landing hero uses `?mode=autoplay` on the office component: it replays `sale-demo` locally in a loop **without** needing the server (import the JSON directly).
