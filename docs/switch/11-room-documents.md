# Room documents and references: the plan lives in Switch

When the Captain posts the final festive-sale plan, it also **pins** it to the room as a Switch
room document, and Finance reads that pinned copy before it checks the numbers. The plan is then
in Switch itself, not only in a Telegram message that scrolls away.

Sources: `core:` = switch-core 0.31.0, `src/core/switch_core/` (the version Switch Console runs).

## The operations

Every operation is an MCP tool on the `Switch` server (`core:bridges/agent/mcp/server.py:161-169`),
so a Switch-run Claude Code agent calls it as `mcp__switch__<op>`.

| Op | What it does | Source |
|---|---|---|
| `create_room_document(name, description, instructions, content)` | Text doc in the connected room. `name` unique per room, content ≤ 1 MiB. Returns `{document_id}` | `core:bridges/agent/operations/definitions.py:545-586` |
| `update_room_document(document_id, name?, …, content?)` | Only the creating agent may update (or delete) | `definitions.py:589-619` |
| `list_references()` | `{reference_types, references, documents, packages}` of the room | `definitions.py:465` |
| `load_internal_documents(ids)` | Any room member reads documents | `definitions.py:522` |
| `list_reference_types()` / `create_reference(type, name, description, instructions, value)` | A reference points at external URLs: `value = {"urls": [...]}` | `definitions.py:1143`, `1163` |
| `attach_reference_to_room(room_id, reference_id)` | Owner must read the reference and write the room | `definitions.py:1227`, `protocol/agent_core.py:3656` |

## What the observer sees

Room documents emit no event type of their own (the old `com.switch.resource.room_document_*`
types are retired, `core:messages/recorded_types.py:48-53`). Instead, after the commit, Switch
posts a notice **from the agent itself** into the room (`core:bridges/agent/protocol/agent_core.py:4385,4418,4447`):

```
📄 created room document “Festive sale plan — v1”.
📄 updated room document “Festive sale plan — v2”.
🗑 deleted room document “Old notes”.
```

That is an ordinary room message, so the observer (`scope=all`) gets it. It turns it into an
office event of type `artifact` with `meta.switch_document` (`observer/src/index.ts`, `switchDocument`):

```json
{ "type": "artifact", "room": "war_room", "speaker": "d2c-captain",
  "text": "📄 created room document “Festive sale plan — v1”.",
  "meta": { "switch_document": { "id": "festive-sale-plan", "title": "Festive sale plan — v1", "version": 1, "action": "created" } } }
```

The Switch document id is never on the stream, so `id` is the name without its version: v1 and
v2 are one document. `GET /api/documents` (same auth as `/api/history`) returns the latest state
of each, deleted ones left out: `[{ id, title, version?, action, by, room, t, event_id }]`.

Attaching a reference posts nothing, so references are not mirrored to the office.

## References need a type

`create_reference` only takes a type `list_reference_types` returns. The built-ins are
`google_drive`, `confluence`, `github` and `jira` (`core:bridges/resource/registry.py:44`); none fits
a deck in `gallery/live-run/`. The `urls` are plain strings (`registry.py:21`), so a
`/gallery/...` path is accepted. We add one user type, once, from the gateway:

```
POST /gateway/references/reference-types
{ "type": "kratos_file", "display_name": "Kratos office file",
  "instructions": "A file the team made, served by the office at this /gallery path.",
  "value_hint": "A /gallery/live-run/... path", "read_visibility": "public" }
```

Without it the Captain skips references; the file links are in the document anyway.

## How the agents use it

- **Captain** (`switch/agents/d2c-captain.md`, PIN THE PLAN): on Finance's approval it creates
  "Festive sale plan — v1" (the full plan with file links), attaches `sale-plan.pptx` and the forecast
  as `kratos_file` references, and adds `- **Pinned in Switch:** Festive sale plan v1` to the final
  message. A revision renames and updates the same document to v2.
- **Finance** (`switch/agents/d2c-finance.md`, THE PINNED PLAN): reads the pinned plan with
  `load_internal_documents` before checking, and pins its own "Finance sign-off" document
  ("Finance sign-off: EBITDA +₹1.29L at ₹5L marketing"). It can't edit the Captain's document:
  only the creator can.
