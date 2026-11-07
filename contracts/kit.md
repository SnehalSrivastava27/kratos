# Agent toolkit contract (`kit/`)

A local Node CLI that every Switch agent (a Claude Code session in this repo) can run.
Agents call it from the repo root:

```
node kit/bin/kit.mjs <command> [args]        # or: npm run kit -- <command> ...
```

Every command prints **one JSON object** to stdout (`{"ok":true,...}` or `{"ok":false,"error":"..."}`, exit 1)
so an agent can read the result. Files are written only under `gallery/live-run/` (created if missing),
and every written file is returned as `{"path":"gallery/live-run/x.pptx","url":"/gallery/live-run/x.pptx"}`.
Specs are JSON files or inline JSON; inputs are validated; nothing touches the network.

| Command | Does |
|---|---|
| `kit sql "<SQL>"` | SQL over every `data/*.csv` as a table named after the file (`orders`, `meta_ads_daily`, ...). Returns rows (max 200 unless `--limit`). |
| `kit tables` | Lists tables with columns and row counts. |
| `kit stats <table> <column> [--by col]` | count, sum, mean, median, p10/p90, min, max. |
| `kit forecast --table orders --date date --value qty [--by sku] [--days 5] [--uplift 4]` | Simple seasonal/linear forecast. |
| `kit chart <spec.json>` | Vega-Lite spec → SVG and PNG. |
| `kit deck <spec.json>` | Slides (title, bullets, table, chart image, KPI tiles) → `.pptx` (pptxgenjs). |
| `kit xlsx <spec.json>` | Sheets from rows or a SQL query, with formulas and number formats → `.xlsx` (exceljs). |
| `kit docx <spec.json>` | Headings, paragraphs, bullets, tables → `.docx` (docx). |
| `kit pdf <spec.json>` | Simple report → `.pdf` (pdfkit). |
| `kit banner <spec.json>` | 1080×1080 SVG banner from a template, plus PNG (sharp). |
| `kit help [command]` | Usage and an example spec. |
| `kit metric <name> [--channel X] [--sku Y] [--month YYYY-MM \| --from D --to D \| --last N] [--by dim[,dim]]` | One named D2C metric (`kit metric list`): {metric, definition, unit, value\|values, display, filters, source_tables, sql}. Definitions: `switch/METRICS.md`. |
| `kit brief <analytics\|ads\|creators\|ops\|design\|finance\|captain> [--month YYYY-MM]` | A department lead's 6–10 numbers, month vs previous, each with its `kit metric` command. |

Data is cached read-only in `data/.cache/kratos.db` (gitignored, rebuilt when a CSV changes); marts such as `m_lines`, `m_orders`, `channel_daily`, `ads_daily_all` are queryable with `kit sql`.

Full library list and examples: `switch/TOOLKIT.md` (read by every agent).
