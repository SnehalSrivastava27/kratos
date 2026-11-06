# T8 · Integration
**Wave:** 2 · **Owns:** `web/src/shared/live.ts`, `web/src/landing/HeroOffice.tsx` · **Reads:** everything

## Goal
Wire the pieces: office ↔ server WebSocket, landing hero ↔ office autoplay, server replay ↔ `sale-demo` feed.

## Deliverables
- Office `mode="live"` uses `/ws` + `/api/history`; falls back to autoplay if the server is down.
- `HeroOffice.tsx` renders `<Office mode="autoplay" />` with `demo/feeds/sale-demo.json`.
- One command `npm run demo` at repo root starts server + web.

## Acceptance
- [ ] `npm run demo` → `/` shows the looping hero, `/office` shows live events from `/api/replay`
- [ ] Killing the server doesn't blank the office
