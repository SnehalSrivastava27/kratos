# T6 · Switch observer agent
**Wave:** 2 · **Owns:** `observer/` · **Reads:** `contracts/switch-protocol-notes.md` (written by the HUMAN lane), `contracts/api.md`

## Goal
A silent custom agent that joins every Switch room, receives room messages over Switch's agent
protocol (server-sent events in, HTTP out), maps them to `OfficeEvent`s, and POSTs them to the server.

## Deliverables
- `observer/src/index.ts`: connect, map speaker → roster id, map room → RoomId, infer `type`
  (pushback / approved / approval_needed by keywords, else `message`), POST to `/api/events`.
- Never posts into rooms. Read-only.
- `observer/README.md`: how to register it in Switch and add it to all rooms.

## Acceptance
- [ ] A message posted in the Telegram War Room appears in the office within 2 seconds
- [ ] Unknown speakers/rooms are logged, not crashed on

## Fallback
If the protocol doesn't deliver all room messages to a listen-only agent, build `observer/telethon/`
(Python, Telethon user account) with the same mapping and POST target. Note the decision in status.
