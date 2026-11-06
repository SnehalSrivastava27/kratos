# T3 · 3D office
**Wave:** 1 · **Owns:** `web/src/office/` · **Reads:** `docs/PLAN.md` §9.2, §9.6, `contracts/*`, `web/src/shared/types.ts`

## Goal
The live 3D D2C office in React Three Fiber, driven only by `OfficeEvent`s.

## Build order (do not skip ahead)
1. Grey-box floor from `contracts/zones.json` + labels. Capsule characters from `roster.json` at their zones.
2. `useEventFeed()` hook: source = `contracts/sample-feed.json` replay (later: WebSocket `/ws`).
   Export `<Office mode="live" | "autoplay" />`; autoplay loops a feed with no server.
3. State machine per person (PLAN §9.6): idle → working → walking → waiting → done.
4. Speech bubbles (drei `<Html>`), red beacon, jump + ✅ on done.
5. Scene events table in PLAN §9.6: EBITDA meter, India map pins, gallery frames, confetti.
6. Make it pretty: colours from PLAN §9.3, soft light, rounded props.
7. Side panel: teammate list → click opens that person's thread (all their events).

## Deliverables
- `web/src/office/Office.tsx` (default export) + components/hooks in the same folder.
- Route `/office` already exists in the shell; just export the component.

## Acceptance
- [ ] `npm run build` in `web/` passes
- [ ] With the sample feed, all 9 events visibly change the scene
- [ ] `<Office mode="autoplay" />` loops forever without a server
- [ ] 60 fps-ish on a laptop; < 150 meshes; one directional light

## Don't
Edit `web/src/landing/`, `web/src/shared/`, or the shell files.
