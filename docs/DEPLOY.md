# Run in production (self-hosted)

One Node process serves the built site, `/api`, `/ws` and `/gallery`. Events are stored in SQLite
under `DATA_DIR`, so history survives restarts. It runs on the same Mac as Switch Console, or on
any Docker host the observer can reach.

## Env vars

| Var | Value |
|---|---|
| `OBSERVER_TOKEN` | Random string. The observer sends it as `Authorization: Bearer …` on `POST /api/events`. |
| `ADMIN_TOKEN` | Random string. Required for `POST /api/replay` and `/api/replay/stop`. |
| `DATA_DIR` | Directory for `events.db`. Default `./.data` (Docker: `/data`). |
| `PORT` | Default `8787`. |
| `RATE_LIMIT_PER_MIN`, `MAX_WS_CLIENTS` | Optional. Default 120 POSTs/IP/min and 400 sockets. |

With `NODE_ENV=production` (set in the Docker image) the server refuses to start unless both
tokens are set. `ALLOW_OPEN=1` overrides that, for a throwaway demo only. In dev, an unset token
leaves its routes open and the server logs a warning.

## On the Mac (next to Switch Console)

```bash
npm install && npm run build
set -a; . ./.env; set +a          # OBSERVER_TOKEN, ADMIN_TOKEN
PORT=8787 npm start
scripts/switch-up.sh              # starts the observer pointed at http://localhost:8787
```

## Docker

```bash
docker build -t d2c-agent-hq .
docker run -d -p 8787:8787 -v hq_data:/data \
  -e OBSERVER_TOKEN=… -e ADMIN_TOKEN=… d2c-agent-hq
```

The container starts as root only long enough to `chown` the volume. It then runs as `node`.
Point the observer at it with `SERVER_URL=http://<host>:8787` and the same `OBSERVER_TOKEN`.

## Backups

```bash
sqlite3 "$DATA_DIR/events.db" "VACUUM INTO '/tmp/events-backup.db'"
```

## Limits to know

- **One instance only.** SQLite on one disk, plus a per-process rate limiter.
- Disk keeps the newest 10,000 events. `/api/history` returns at most 500.
