# T5 · Event server
**Wave:** 1 · **Owns:** `server/` · **Reads:** `contracts/api.md`, `contracts/events.schema.json`

## Goal
A small Node + TypeScript server: WebSocket broadcast, event intake from the observer, replay of
feed files, and static `/gallery`.

## Deliverables
- `server/package.json`, `server/src/index.ts` implementing every row in `contracts/api.md`.
- In-memory history (last 500 events). Validate POSTed events against the schema; reject bad ones with 400.
- `npm run dev` starts it on port 8787.
- `server/README.md` with curl examples for every endpoint.

## Acceptance
- [ ] `curl -X POST localhost:8787/api/replay -d '{"feed":"sale-demo","loop":false}' -H 'content-type: application/json'`
      streams events to a connected `wscat -c ws://localhost:8787/ws`
- [ ] Bad event POST returns 400 with the validation error
- [ ] Works with `contracts/sample-feed.json` if `demo/feeds/sale-demo.json` doesn't exist yet
