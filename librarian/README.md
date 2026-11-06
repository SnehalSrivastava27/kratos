# Librarian: the skills library

Every installed agent skill (`SKILL.md`) is a book. The Librarian shelves each one by department.

- **Scan** (`server/src/library/scan.ts`): `~/.claude/skills/*`, `~/.claude/skills/synced/*/*` (anthropic-skills),
  `~/.agents/skills/*`, `~/.claude/plugins/**/skills/*` and this repo's `.claude/skills/*`. Symlinks are followed by
  realpath (each file and dir once, so no loops). Copies with the same name + content, and two versions with the same
  id, keep the newest. Id = `${source}:${name}`. Read-only.
- **Shelve** (`server/src/library/shelve.ts` + `prompt.md`): batches of 40 (name + description ≤ 300 chars) go to
  `claude -p --output-format json --tools ""` on stdin, 4 at a time. Output is validated (unknown shelf → general,
  missing ids re-asked once, then general). If Claude Code isn't available a batch uses the keyword heuristic, so the
  library is never empty. Writes `data/library.json` atomically (gitignored; `data/library.example.json` is a sample).

The code lives under `server/src/library/` (not here) because the server's `tsc` only compiles `server/src`;
this folder holds the CLI, the prompt and its own `tsx`.

## CLI

```sh
cd librarian && npm install
npm run librarian              # scan + Claude Code + write data/library.json (~1 min for ~300 skills)
npm run librarian -- --dry-run # scan only: per-source counts and keyword shelves, no Claude calls, no write
```
`CLAUDE_BIN` overrides the claude path (default `~/.local/bin/claude`, else `claude` on PATH).
`LIBRARY_FILE` overrides where the index is read/written.

## Mounting in the server (P2)

One call in `handle()` in `server/src/index.ts`, before the final 404:

```ts
import { handleLibrary } from "./library/index.js";
// ...
if (url.pathname.startsWith("/api/library") &&
    (await handleLibrary(req, res, url, { isTrusted, emit: (e) => broadcast({ ...e, id: `srv-${Date.now()}-${++seq}` } as OfficeEvent) })))
  return;
```

`isTrusted` = the same loopback / `Bearer $ADMIN_TOKEN` check that guards the other office actions. It controls
whether `path` is sent and whether `POST /api/library/categorize` is allowed (401 otherwise; 409 while a run is
going). `emit` gets events without an `id` (`working` progress and a final `done`, speaker `librarian`,
room `war_room`); give them one and broadcast them like any other event.
