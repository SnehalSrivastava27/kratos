# Deploy (Fly.io)

One Fly machine runs the Docker image: the built site, `/api`, `/ws` and `/gallery` from one Node
process. Events are stored in SQLite on a Fly volume mounted at `/data`, so history survives
deploys and restarts. Fly handles websockets with no extra config.

Why Fly: a volume plus websockets is 4 CLI commands from this folder. No GitHub link and no paid
disk plan is needed (Render needs both).

## Env vars

| Var | Where | Value |
|---|---|---|
| `OBSERVER_TOKEN` | Fly secret + observer on the Mac | Random string. The observer sends it as `Authorization: Bearer …` on `POST /api/events`. |
| `ADMIN_TOKEN` | Fly secret | Random string. Required for `POST /api/replay` and `/api/replay/stop`. |
| `DATA_DIR` | `fly.toml` (`/data`) | Directory for `events.db`. Default `./.data`. |
| `PORT` | `fly.toml` (`8787`) | Must match `internal_port`. |
| `RATE_LIMIT_PER_MIN`, `MAX_WS_CLIENTS` | optional | Default 120 POSTs/IP/min, 500 sockets. |

If a token is unset, its routes are open and the server logs a warning at startup. Always set
both tokens in production.

## First deploy

```bash
brew install flyctl && fly auth login

# Pick a unique app name. This creates the app from fly.toml without deploying yet.
fly launch --copy-config --no-deploy --name kratos-hq --region bom

# 1 GB volume for SQLite. Its name must match [[mounts]] source in fly.toml.
fly volumes create hq_data --size 1 --region bom --yes

# Generate tokens, save them locally (.env is gitignored), then push them to Fly.
echo "OBSERVER_TOKEN=$(openssl rand -hex 32)" >> .env
echo "ADMIN_TOKEN=$(openssl rand -hex 32)" >> .env
set -a; source .env; set +a
fly secrets set OBSERVER_TOKEN="$OBSERVER_TOKEN" ADMIN_TOKEN="$ADMIN_TOKEN" --stage

# One machine, because the volume and the in-memory rate limit belong to one machine.
fly deploy --ha=false
```

`fly launch` rewrites `app = …` in `fly.toml`. Commit that change.

## Check it

```bash
APP=https://kratos-hq.fly.dev
curl -s $APP/api/health      # {"ok":true,"version":"1.0.0",…,"db":"ok"}
curl -s $APP/api/ready       # {"ready":true,"db":"ok"}
curl -s -X POST $APP/api/replay -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' -d '{"feed":"sale-demo","speed":2}'
open $APP/office             # the office should play the sale
fly logs                     # one JSON line per request
```

## Point the observer at it

The observer runs on the founder's Mac next to Switch Console (see `observer/README.md`):

```bash
cd observer
SERVER_URL=https://kratos-hq.fly.dev OBSERVER_TOKEN=<same value as the Fly secret> npm start
```

`SERVER_URL` overrides `server` in `observer/config.json`. The older `OFFICE_URL` still works.
A `401` in the observer log means the token doesn't match the server's.

## Later deploys, rollback, data

```bash
fly deploy --ha=false                     # rolling restart; SIGTERM → server closes sockets and the DB
fly releases && fly deploy --image <previous image ref>   # roll back
fly ssh console -C "ls -la /data"         # events.db, events.db-wal
fly ssh sftp get /data/events.db ./events-backup.db       # backup
fly volumes snapshots list <volume id>    # Fly snapshots volumes daily
```

## Limits to know

- **One instance only.** SQLite on one volume, plus a per-machine rate limiter. To scale out you
  need a shared DB and a pub/sub layer for `/ws`.
- **Gallery is baked into the image.** The Design agent writes banners to `gallery/` on the Mac.
  Commit them and run `fly deploy` so the deployed office shows them.
- Disk keeps the newest 10,000 events. `/api/history` returns at most 500.

## Without Fly

Any Docker host works:

```bash
docker build -t d2c-agent-hq .
docker run -d -p 8787:8787 -v hq_data:/data \
  -e OBSERVER_TOKEN=… -e ADMIN_TOKEN=… d2c-agent-hq
```

The container starts as root only long enough to `chown` the volume. It then runs as `node`.
