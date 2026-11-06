# API contract (server ↔ office ↔ observer)

Ports: server **8787**, web dev server **5173** (Vite proxies `/api`, `/ws`, `/gallery` to 8787).

| Method | Path | Who calls | Auth | Purpose |
|---|---|---|---|---|
| WS | `/ws` | office, landing hero | – | Server pushes `OfficeEvent` JSON (see events.schema.json), one per message. Clients don't send. |
| GET | `/api/roster` | office | – | Returns contracts/roster.json |
| GET | `/api/history?limit=200` | office | – | Last N events (max 500), oldest first, for late joiners |
| POST | `/api/events` | observer | `OBSERVER_TOKEN` | Body = OfficeEvent (without `id` ok; server assigns `srv-…`). Server stores + broadcasts it. 201 → the stored event |
| POST | `/api/replay` | dev / landing | `ADMIN_TOKEN` | Body `{ "feed": "sale-demo", "loop": true, "speed": 1 }`; replays data feed file over WS |
| POST | `/api/replay/stop` | dev | `ADMIN_TOKEN` | Stops replay |
| GET | `/gallery/*` | office | – | Static banners written by the Design agent |
| GET | `/api/rooms` | office (chat UI) | – | `RoomSummary[]`, one per roster room |
| GET | `/api/rooms/:id/events?limit=50` | office (chat UI) | – | Newest N events in that room (max 500), oldest first. Unknown room → 404 |
| GET | `/api/agents` | office (chat UI) | – | `AgentSummary[]`, one per roster person |
| GET | `/api/gallery` | office | – | `GalleryItem[]`: files in `gallery/` (not index.json), titled and ordered by `gallery/index.json`, unlisted ones after, newest first |
| GET | `/api/health` | ops | – | `{ ok, version, uptime, clients, history, db: "ok"\|"memory"\|"error" }` |
| GET | `/api/ready` | load balancer | – | 200 `{ ready: true, db }`; 503 while shutting down, if a DB write/read fails, or if production with `DATA_DIR` fell back to memory |

Feed files live in `demo/feeds/<name>.json` and follow the same schema with `t` = ms offset.

Landing hero uses `?mode=autoplay` on the office component: it replays `sale-demo` locally in a loop **without** needing the server (import the JSON directly).

## Auth
Send `Authorization: Bearer <token>`. When the env var (`OBSERVER_TOKEN` / `ADMIN_TOKEN`) is unset
on the server, that route is open (local dev; the server logs a warning). Wrong/missing token → 401.
With `NODE_ENV=production` the server won't start without both tokens unless `ALLOW_OPEN=1`.

## Limits and errors
All errors are `{ "error": string }` JSON (400 adds `details` = ajv errors).
- 400 invalid event or invalid JSON · 401 bad token · 404 unknown route/room/feed/file
- 403 path traversal on `/gallery/*` or the site · 413 body over 64 KB
- 429 more than `RATE_LIMIT_PER_MIN` (default 120) POSTs per client IP per minute
- WS: frames from clients over 4 KB close the socket (1009); over `MAX_WS_CLIENTS` (default 400)
  the new socket is closed with 1013 (retry later); ping every 30 s, no pong by the next ping → dropped.

## Read models (types in web/src/shared/types.ts)
```ts
RoomSummary  { id, label, group /* Telegram supergroup, "Kratos D2C" */, topic /* forum topic, "War Room" */, members: string[], last: OfficeEvent | null, count }
AgentSummary { id, name, kind, state: "idle"|"working"|"waiting"|"done", last: OfficeEvent | null, room: RoomId | null }
GalleryItem  { name, url /* /gallery/<name> */, size, mtime /* epoch ms */, title, sku: string | null }
```
- `members`: humans and `d2c-captain` are in every room, every agent is in `war_room` and its
  home room (same zone), as in switch/d2c-team.template.yaml; anyone who spoke there is added.
- Events may carry `meta.thread_id` (Telegram topic id); the observer passes it through.
- `count` / `last` come from stored events (newest 10,000 kept on disk).
- `state` folds the newest 500 events with the office's rules (web/src/office/officeState.ts):
  `assign` → speaker + targets working; `working` → working; `done`/`artifact`/`approved` → done;
  `pushback` → speaker working, targets waiting; `approval_needed` → waiting; `celebrate` → all done.
  A newer replay run (`id@<run>`) starts from idle. `last`/`room` = that person's newest sent event.

## Office actions (v2: full-screen office, commands, hiring, skills library)

**Who may call them:** requests from loopback (127.0.0.1 / ::1, i.e. the office opened on the same Mac)
OR with `Authorization: Bearer $ADMIN_TOKEN`. Everyone else gets 401. They are never open, even in dev.

| Method | Path | Body / query | Result |
|---|---|---|---|
| POST | `/api/command` | `{ room: RoomId, text: string (1–2000 chars) }` | Posts `text` into that Telegram topic through Switch, as the founder's office console. `202 { ok, via }`. It comes back into the office through the observer like any Telegram message. |
| GET | `/api/people` | none | `Person[]`: contracts/roster.json people plus hired employees (with `desk` and `hiredAt`). The office uses this, not the static roster, in live mode. |
| GET | `/api/employees` | none | `Employee[]` (hired only) |
| POST | `/api/employees` | `{ name, role, room: RoomId, emoji?, color?, instructions, skills?: string[] /* library book ids */ }` | Creates the agent in Switch, joins it to "Kratos D2C", gives it a free desk. `201 Employee`, or `202 { employee, action: { kind: "open_url", url, label } }` if a human must click in Switch Console. Emits a `hired` event (speaker = new id, meta.employee_id). |
| GET | `/api/library` | none | `Library` (shelves by department, books = installed skills) |
| GET | `/api/library/book?id=` | none | `{ book: LibraryBook, markdown: string }` (the SKILL.md body, max 200 KB) |
| POST | `/api/library/categorize` | none | Starts the Librarian (a Claude Code run) re-shelving every skill. `202 { ok, runId }`. Emits `working` / `done` events from speaker `librarian` in `war_room`. |

## v2 types (web/src/shared/types.ts)
```ts
Employee    { id, name, role, room, emoji, color, desk: string /* zone id + index, e.g. "growth_pod#2" */, hiredAt: number, switchAgentId: string | null, status: "active" | "pending_console" }
LibraryBook { id /* stable: source + skill name */, name, description, source /* e.g. "~/.claude/skills", "gstack", "plugin:x" */, path /* absolute SKILL.md path, server-side only, never sent to non-loopback clients */, department: ShelfId, why: string /* librarian's one-line reason */ }
Library     { updatedAt: number | null, librarian: "idle" | "working", shelves: { id: ShelfId, label: string, books: LibraryBook[] }[] }
ShelfId     = "war_room" | "analytics" | "ads" | "creators" | "ops" | "design" | "engineering" | "general"
```
Event types gain `hired` (a new employee joined) and `command` (reserved: the office console sent a command; the echo from Telegram arrives as a normal `message`).
