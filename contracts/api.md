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

**Who may call the writes** (`POST /api/command`, `POST /api/employees`, `POST /api/library/categorize`): requests
from loopback (127.0.0.1 / ::1, i.e. the office opened on the same Mac) OR with `Authorization: Bearer $ADMIN_TOKEN`.
Everyone else gets 401. They are never open, even in dev. `TRUST_LOOPBACK=0` (default under `NODE_ENV=production`)
stops trusting loopback, for a same-host reverse proxy. The GETs are open like the other read APIs (`path` is hidden
from non-loopback library readers).
Without the token, a write must also send `content-type: application/json` (else 415), with `Host` localhost /
127.0.0.1 / [::1] and an `Origin` equal to the office's own (`http(s)://<that host>`), `http://localhost:5173`,
`http://127.0.0.1:5173`, or one in `OFFICE_ORIGINS` (else 403/401). A foreign `Origin` is refused (403) even with the token.
Proxied requests count as local only if every `X-Forwarded-For` hop is loopback (`Forwarded` never). Reads that reveal
`path` follow the same Host/hop rule.
Errors: 400 invalid body · 401 · 403 foreign Origin/Host · 404 unknown employee · 415 not JSON · 429 more than 10 valid
commands/min, more than `HIRE_MAX` (12) employees, or more than 3 hires per 10 min · 502 Switch refused the call (details
in the server log only) · 503 local Switch server not running or unreachable.

| Method | Path | Body / query | Result |
|---|---|---|---|
| POST | `/api/command` | `{ room: RoomId, text: string (1–2000 chars) }` | Posts `text` into that Telegram topic through Switch, as the founder's office console (Switch agent `d2c-office`; if no agent is @named, the room's lead is addressed). `202 { ok, via: "switch:d2c-office", thread: "topic" \| "group" }` (`group` = the topic has no Switch thread yet, so it went to General tagged `#Topic`). It comes back into the office through the observer like any Telegram message. |
| GET | `/api/people` | none | `Person[]`: contracts/roster.json people plus hired employees (with `desk` and `hiredAt`). The office uses this, not the static roster, in live mode. |
| GET | `/api/employees` | none | `Employee[]` (hired only) |
| POST | `/api/employees` | `{ name, role, room: RoomId, emoji?, color?, instructions, skills?: string[] /* library book ids */ }` | Creates the agent in Switch, joins it to "Kratos D2C", gives it a free desk. `201 Employee`, or `202 { employee, action: { kind: "open_url", url, label } }` if a human must click in Switch Console. Emits a `hired` event (speaker = new id, meta.employee_id). |
| DELETE | `/api/employees/:id` | none | Fires the employee: removes the agent from Switch, frees the desk. `200 { ok, id }`, 404 if unknown. |
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

## v3: accounts, workspaces, private office (decided with the user 2026-11-06)

**Rule:** the public site (`/`) shows ONLY the scripted demo (made-up Kesar & Co. data, replayed in
the browser from demo/feeds/sale-demo.json). Every real Telegram message, the live office, people,
hires and commands require a signed-in user and are scoped to that user's workspace.

**Accounts:** email + password. Passwords hashed with scrypt (node:crypto), min 10 chars. Session =
random 32-byte id in cookie `hq_session` (HttpOnly, SameSite=Lax, Path=/, Secure when served over
https, 30-day expiry, stored hashed in SQLite). Login is rate limited per IP+email.

**Workspace:** one Telegram group (one Switch room) belonging to one user. The 6 team agents and the
observer are joined to it, and it gets the 6 forum topics. Every stored event has a server-assigned `ws`.

| Method | Path | Auth | Body → Result |
|---|---|---|---|
| POST | `/api/auth/signup` | none | `{email, password, name}` → 201 `{user}` + cookie. 409 if the email exists |
| POST | `/api/auth/login` | none | `{email, password}` → 200 `{user}` + cookie, 401 generic error |
| POST | `/api/auth/logout` | session | → 204, cookie cleared, session deleted |
| GET | `/api/auth/me` | session | `{user, workspaces: Workspace[]}` or 401 |
| POST | `/api/workspaces/connect` | session | → `{code /* 6 digits, 15 min */, botUsername, expiresAt}` |
| GET | `/api/workspaces/connect/status` | session | `{state: "waiting"\|"linking"\|"needs_admin"\|"ready"\|"expired", workspace?: Workspace, detail?}` |
| GET | `/api/workspaces` | session | `Workspace[]` |

**Linking:** the user adds @kratosd2c_bot to their Telegram group (Topics on, bot admin with
"Manage topics") and sends the 6-digit code there. The observer forwards messages from rooms with
no workspace to the server (`meta.switch_room_id`, `meta.room_name`). If the text contains a live
code, the server links that room to the user, creates the 6 topics, joins the 6 agents + observer,
and replies nothing into the group except Switch's own greetings. Codes are single-use; a room
already linked to someone else can't be claimed.

**Scoping (changes to v1/v2 endpoints):** `/api/history`, `/ws`, `/api/rooms`, `/api/agents`,
`/api/people`, `/api/employees`, `/api/command`, `/api/library*` now require a session (or
ADMIN_TOKEN for scripts) and act on the workspace in `?ws=<id>` (default: the user's first). `/ws`
reads the cookie on upgrade. `/api/replay*` is admin-only. Public: `/api/health`, `/api/ready`,
`/gallery/*` and static assets. `POST /api/events` stays observer-token only; events from rooms
mapped to no workspace are stored only as link attempts, never broadcast.

```ts
User      { id, email, name, createdAt }
Workspace { id, name /* Telegram group title */, switchRoomId, chatId: string | null, ownerId, topics: Record<RoomId, { threadId: number | null }>, status: "linking" | "ready" | "needs_admin", createdAt }
OfficeEvent.ws?: string   // server-assigned workspace id
```

### v3 details (A1, as implemented)
- **Write guard on auth too:** `POST /api/auth/signup|login|logout` and `POST /api/workspaces/connect` follow the
  v2 write rules: `content-type: application/json` (logout/connect: send `{}`) else 415, a foreign `Origin` → 403,
  `Host` must be local or the host of an `OFFICE_ORIGINS` entry (a public deployment sets
  `OFFICE_ORIGINS=https://hq.example.com`) → else 403. Fetch with `credentials: "include"`.
- **Office writes (v2 table) now need the session that owns the workspace, or `ADMIN_TOKEN`.** Loopback alone no
  longer counts (it still decides whether `/api/library` shows `path`). `POST /api/command` and `POST /api/employees`
  answer 409 while the workspace is not `ready`. Rate limits (commands, hires) are per workspace; `HIRE_MAX` is per host.
- **Scoped requests:** no session → 401; `?ws=` not yours (or unknown) → 403; no `?ws=` → your first `ready`
  workspace, else your first; none → 404 `{error}` (send the user to /connect). WS upgrade: same rules
  (401/403/404 handshake), plus a foreign `Origin` → 403. Each socket gets only its workspace's events.
- **Limits:** login 5 a minute per IP + email, signup 5 a minute per IP (then 429 + `retry-after`); codes 5 an hour
  per user (429). A new code voids the user's older unused ones. Signup: 400 bad email / password under 10 chars.
- **`GET /api/workspaces/connect/status`** with no code yet → `{state: "expired", detail: "no code yet"}`.
  `detail` also explains refusals ("already linked to another account", state stays `waiting`) and `needs_admin`.
  `needs_admin` and unfinished setups retry when the next message arrives in that group.
- **`POST /api/events`** (observer): `meta` may also carry `chat_id` (Telegram chat id) and `switch_thread_id`
  (Switch thread of the message; the server maps it to the workspace's topic → `room` + `meta.thread_id`). Any `ws`
  in the body is ignored. Linked room → 201 + the stored event (with `ws`); otherwise → 202
  `{ok: true, stored: false, linked: boolean}` (only a link attempt: room id, name, chat id, time, never the text).
- **New groups:** while any code is live, the server joins `d2c-observer` to every Telegram room in Switch that has
  no workspace (checked when a code is issued and every 10 s), so the code sent there is seen. If the code was sent
  before that, sending it again works.
- **`GET /api/people` with the observer's `OBSERVER_TOKEN`** (no session) → roster + every workspace's hires (the
  observer maps hired agents' names). **`POST /api/replay`** needs `ADMIN_TOKEN` even in dev; body adds
  `ws` (default: the first ready workspace); replayed events are tagged with it.
- **Code safety:** a code is claimed atomically (one group per code). Only messages of at most 64 chars are checked.
  Wrong codes: 10 per Switch room per 10 min, 30 per minute on the host (then no codes are checked until the minute
  is over), and any live code is voided after 20 wrong codes anywhere (status `expired`, detail says to get a new
  one). Only groups link: a positive (private) chat id, or a Bot API `getChat` type other than group/supergroup, is
  refused (`detail: "Only Telegram groups can be linked."`, the code stays usable). The sender can't be checked
  to be a group admin: Switch doesn't pass their Telegram user id.
- **Sessions:** logout closes that session's open sockets (close code 4401); sockets of expired sessions close on the
  next ping (30 s). Login: also 10 tries per email per 15 min from any IP; IPv6 clients are counted per /64.
- **`GET /api/roster`** needs a session (any signed-in user) or `ADMIN_TOKEN`; it is not public.
- **Host-wide:** `POST /api/library/categorize` needs `ADMIN_TOKEN`, or the host owner (`OWNER_EMAIL`, else the
  first registered user) in a browser on this Mac (loopback, own Origin); else 403.
- **Legacy data:** events and hires stored before v3 have no `ws` and stay hidden until the group whose Telegram
  chat id is the one in `observer/topics.json` (or `LEGACY_CHAT_ID`) is linked; then they, and its topics, join that
  workspace (once).

## v4: multi-agent team, QA Lab, KPIs, robustness (B3)

**Roster-driven setup.** A linked workspace gets one forum topic per `roster.json` room (8 today: the 6 departments,
Finance, QA Lab) and every roster Switch agent (16: all `kind: "agent"` except `librarian`) + `d2c-observer` joined
(+ `d2c-office` on its first post). Workspaces set up under an older roster are upgraded on server start and on
their next message (at most once a minute while it fails): only missing topics are created (stored topics that still
exist are kept; a topic is created again only when Telegram says it is gone, any other edit failure retries later;
legacy `topics.json` adoption unchanged), status stays `ready`. Topics and agent joins are tracked apart: an agent
not yet in Switch is retried with joins only.

**Topic threads are learned.** Commands (and QA asks) land in a topic only once its Switch thread is known; until
then they go to General tagged `#Topic` (as in v2). The server learns a topic's Switch thread from observed events
and persists it per workspace:
- explicit: a person sends just the topic's tag inside that topic, e.g. `#Analytics`, `#Finance`, `#QALab`; it
  replaces only a voted guess (never a tagged or legacy thread, never the War Room's);
- votes: department agents (and hires) posting 3+ times in one thread, more than twice as often as the captain →
  that department; the captain plus 2+ departments in one thread → War Room (only if it has no thread yet);
- a thread already learned never moves; a thread under a General message (a reply chain) is never learned.
The observer now forwards `meta.switch_message_id` (Switch `payload.message_id`).

**Idempotent ingest.** `POST /api/events` with `meta.switch_message_id` (+ `switch_room_id`) gets the stable id
`sw-<24 hex>`; the same message again → `200` + the stored event (`202 {ok, stored: false, duplicate: true}` while
the first copy is still being ingested), never stored or broadcast twice.

**Members** (`GET /api/rooms`): unchanged rules, which now include specialists (same zone as their lead) and
Finance; `qa_lab` has the humans, the captain and whoever spoke there.

**Hires** (`POST /api/employees`): `room` may be `finance` (not `qa_lab`); optional `reports_to` = a roster
`lead` of that department (else 400); stored on `Employee.reports_to` (`string | null`) and on the `Person` from
`/api/people`; the hire's instructions say "Report to @<reports_to>" (default `d2c-captain`). `HIRE_MAX` default 24.

| Method | Path | Auth | Body / query → Result |
|---|---|---|---|
| POST | `/api/qa/ask` | `ADMIN_TOKEN` only (401 otherwise, also in dev); JSON | `{ agent: string /* roster agent or hire */, text: string /* 1–1000 */, workspace?: string }` → `202 { id, sentAt /* ms */, workspace, thread: "topic" \| "group" }`. Posts `@agent text` into the workspace's QA Lab topic as `d2c-office` (same path as `/api/command`; `group` = no QA Lab thread yet, so General tagged `#QALab`). Without `workspace`: the only ready one (400 if several are ready). 400 bad body/agent/text · 403 unknown workspace · 409 not ready · 429 over `QA_PER_MIN` (30) asks a minute per workspace · 502/503 Switch |
| GET | `/api/qa/replies?after=<ms>&agent=<id>&workspace=<id>` | `ADMIN_TOKEN` only | (`workspace` as for ask) `OfficeEvent[]` in the QA Lab topic with `t > after` (and `speaker = agent` if given), oldest first, newest last, max 500. While the QA Lab topic has no thread, every event of the workspace counts (filter by `agent`). |
| GET | `/api/kpis` | public (made-up demo data, never chats) | `Kpis` below, from `data/*.csv` (`KPI_DATA_DIR`), recomputed when a file's mtime changes |
| GET | `/api/ready` | public | adds `switch: "ok" \| "down" \| "unconfigured"` (local Switch `/health`, cached 10 s, never blocks after the first probe) and `workspaces: { ready, linking, needs_admin }` counts; with `ADMIN_TOKEN` also `workspace_status: [{ id, status, detail }]`. Switch down does not make it 503. |

```ts
Kpis {
  updated: number | null /* newest source file mtime, ms */, window: { from: string | null, to: string | null } /* orders.date */,
  net_revenue: number | null /* delivered lines' net_revenue */, orders: number | null /* distinct order_id, not cancelled */,
  aov: number | null /* net_revenue / delivered orders */, rto_pct: number | null, return_pct: number | null /* % of orders */,
  meta_roas: number | null /* meta_ads_daily revenue/spend; v1: meta_campaigns.csv */,
  blended_roas: number | null /* net_revenue / (meta + google + marketplace ad spend) */, ebitda_last_month: number | null /* pnl_monthly */,
  by_channel: { channel, orders, net_revenue, rto_pct }[] /* by net_revenue desc */, top_skus: { sku, name, units, net_revenue }[] /* top 5 */
}
```
Without v2 files only `meta_roas` (and `updated`) are filled; the rest are `null` / `[]`.

**Robustness.** Switch GETs are retried twice (backoff + jitter) on unreachable/429/5xx, writes never; every Switch
and Bot API call has a timeout (`SWITCH_TIMEOUT_MS`, 15 s; the office's threaded post can't hang on its stream);
Bot API 429 is retried after `retry_after` (max 10 s), reads also on 5xx. SIGTERM/SIGINT close sockets, stop timers
and checkpoint the SQLite WAL (`busy_timeout` 5 s, WAL); unhandled rejections are logged, an uncaught exception
flushes and exits 1. Numbers in a linked group's chat never count as wrong link codes. The observer reconnects
with exponential backoff + jitter (1 → 30 s, reset after a minute up), resumes with `Last-Event-ID`, reopens a
stream silent for 45 s, and times out every HTTP call (10 s).
