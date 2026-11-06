# 09 · The skills library and the Librarian

**One idea:** every agent skill installed on the Mac (a `SKILL.md`) is a **book**. A Librarian,
one headless Claude Code run, puts each book on a department shelf. When you hire an agent you
pick its skills from those shelves.

> Not a Switch feature itself, but it feeds Switch agents: Console runs agents as Claude Code
> sessions on this Mac, so the skills installed here are the skills they can use.

## Real run

**316 skills shelved by Claude Code in 45.5 seconds** (`status/P3.json`).

## 1. Scan (read-only)

The scanner finds every `SKILL.md` under five roots (`server/src/library/scan.ts:107-117`):

| Root | Shelf source label |
|---|---|
| `~/.claude/skills/*` | `~/.claude/skills`, or `gstack` for gstack's skills |
| `~/.claude/skills/synced/*/*` | `anthropic-skills` |
| `~/.agents/skills/*` | `~/.agents/skills` |
| `~/.claude/plugins/**/skills/*` | the plugin's name |
| `<repo>/.claude/skills/*` | `repo` |

- `name` and `description` come from the YAML frontmatter (a small parser handles plain, quoted,
  `|` and `>` values), else the first paragraph (`scan.ts:20-58`).
- Symlinks are followed by realpath, each file once, so no loops. Duplicates keep the newest.
- Book id = `${source}:${name}`. It never writes to a skill folder.

## 2. Shelve with Claude Code

Books go to Claude Code in batches of **40** (name + description), **4 batches at a time**
(`server/src/library/shelve.ts:95`), as one headless call with **no tools**:

```ts
spawn(claudeBin(), ["-p", "--output-format", "json", "--tools", "", "--no-session-persistence"], { stdio: ["pipe", "pipe", "pipe"] });
```
(`shelve.ts:64-66`). The prompt is plain (`librarian/prompt.md`):

```text
Every installed agent skill is a book. Put each book below on exactly one department shelf: the
department of a D2C brand whose agents would reach for it most.
Shelves: war_room · analytics · ads · creators · ops · design · engineering · general
Reply with ONLY a JSON array, no prose, no code fence:
  [{"id": "...", "department": "...", "why": "..."}]
```

The answer is **validated, not trusted**: only ids we asked about are kept, an unknown shelf
becomes `general`, missing ids are asked once more, then go to `general`
(`shelve.ts:47-61,95-115`). If Claude Code is not available, a keyword heuristic shelves the batch,
so the library is never empty (`shelve.ts:24-45`). The index is written atomically to
`data/library.json` (gitignored).

## 3. In the office

- `GET /api/library` → shelves by department; `GET /api/library/book?id=` → the `SKILL.md`
  (max 200 KB), rendered as safe Markdown in the library window (`server/src/library/index.ts:60-75`).
- `POST /api/library/categorize` starts a re-shelve (202, 409 if one is running). The Librarian
  appears in the office as a person in the War Room, emitting `working` and `done` events
  (`contracts/api.md:78`).
- Absolute `SKILL.md` paths are only sent to the office on this Mac (`contracts/api.md:83`).

## 4. Skills on a hire

The hire dialog lets the founder pick up to **20** books. The server only accepts ids that are
really in the library, then names them in the new agent's instructions:

```ts
const unknown = skills.find((sk) => !books.has(sk));
if (unknown !== undefined) bad(`skills: "${unknown.slice(0, 60)}" is not in the library`);
// …
`Skills from the office library to use when relevant: ${e.skills.join(", ")}.`
```
(`server/src/office.ts:174-179,97`)

> Suggested blog line: "My laptop had 316 agent skills I'd forgotten about. One Claude Code call
> per 40 of them turned that into a library the hire dialog can use."
