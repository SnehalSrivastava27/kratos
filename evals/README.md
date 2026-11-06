# evals — QA Lab

Asks every agent trivial questions and scores the answers against truths computed from `data/`.
No dependencies (Node ≥ 22 stdlib only).

## Run

```
npm run evals:truth                         # print every question + computed truth, no LLM (CI-safe)
npm run evals                               # offline: one `claude -p` per question (default model sonnet)
npm run evals -- --agent d2c-ops,d2c-ads    # filter by agent
npm run evals -- --limit 5 --model haiku    # first 5, cheaper model
npm run evals -- --failed                   # rerun only the failures of the newest report
npm run evals -- --live                     # through Switch via the QA Lab admin API (see below)
node --test evals/test/*.test.mjs           # parser, style check, v2 truths on a fixture, live mode vs a mock server
```

Options: `--concurrency 4`, `--timeout 180` (seconds per question).

- **Offline** runs, from the repo root, `claude -p "<question>" --append-system-prompt "<switch/agents/<id>.md> + QA Lab line"`
  with tools `Bash(node kit/bin/kit.mjs:*)`, `Read`, `Grep`, `Glob` and `--output-format json` (gives cost).
  Agents without an instructions file yet are skipped.
- **Live** sends `POST /api/qa/ask {agent,text}` then polls `GET /api/qa/replies?after=<sentAt>&agent=<id>` on
  `SERVER_URL` (default `http://localhost:8787`) with `Authorization: Bearer $ADMIN_TOKEN`, `--workspace <id>` (or
  `EVALS_WORKSPACE`) when several workspaces are ready. Keeps the agent's own events (not `working`), done after two
  quiet polls. One question at a time per agent.
- Questions tagged `v2` are skipped until `data/orders.csv` exists. `--truth` exits 1 if any truth fails
  (missing file, missing column, no matching row, non-numeric number truth).

Output: `evals/reports/<timestamp>.json` (gitignored, full replies) and `evals/reports/latest.md`
(per-agent score table, failures with question / expected / got).

## Scoring

| kind | passes when |
|---|---|
| `number` | any number in the reply is within `tolerance` (relative, default 1%) of the truth, or rounds to it at the precision shown. Parses `₹1.29L`, `1,29,000`, `20.4L`, `2.05 Cr`, `4.8x`, `12%`, `45k`. So `₹20.4L` matches 20,42,000. |
| `text` | the truth string appears in the reply (case/markdown-insensitive) |
| `oneof` | any of the truth strings appears (used for "which X is highest" — ties count) |
| `style` | `switch/TELEGRAM_STYLE.md`: line 1 has a **bold title**, has `- ` bullets, ≤ 10 non-empty lines, no tables / `#` headings / code blocks, no `**` inside the `**_key_**` line, last line `_italic_` |

The style check also runs on every reply and is shown per agent as "Style ok (all replies)" (informational).
Known leniency: a reply that lists many numbers can pass a `number` question by accident, and the sign is ignored
(a loss of ₹2.3L matches -2,29,795).

## Add a question

Append to `evals/questions.mjs`:

```js
{ agent: 'd2c-ops', kind: 'number', v2: true, tolerance: 0.02,
  text: 'How many units of SKU03 are on hand in Mumbai in the latest inventory snapshot?',
  truth: db => /* compute from data, never hard-code */ },
```

`db.t('table', ['col', ...])` returns rows of `data/<table>.csv` (numbers parsed) and throws if the file or a
listed column is missing; `db.json('budget.json')` reads JSON. Helpers in `lib.mjs`: `sum`, `inMonth`, `argmax`
(returns all ties), `one`. `text` may be a function of `db` when it needs a value from the data.
Keep questions trivial and unambiguous: name the month, the source when two could disagree, and "all statuses" for orders.
Then run `npm run evals:truth` and `npm run evals -- --agent <id>`.
Question ids are `<agent>#<n>` in file order, so append rather than insert if you rely on `--failed`.
