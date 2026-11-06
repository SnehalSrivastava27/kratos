#!/usr/bin/env node
// Kratos agent toolkit. Every command prints ONE JSON object. See contracts/kit.md and switch/TOOLKIT.md.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { LIMITS, KitError, fail, loadSpec, outPath, writeOut } from '../lib/util.mjs';

const print = (o) => process.stdout.write(JSON.stringify(o) + '\n');

// Run the real work in a child so a runaway query or render is killed after LIMITS.timeoutMs.
if (!process.env.KIT_CHILD) {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    env: { ...process.env, KIT_CHILD: '1' }, stdio: ['ignore', 'pipe', 'inherit'],
    timeout: Number(process.env.KIT_TIMEOUT_MS) || LIMITS.timeoutMs, maxBuffer: 64 << 20,
  });
  if (r.error || r.signal) { print({ ok: false, error: r.error?.code === 'ETIMEDOUT' || r.signal ? 'timed out' : String(r.error) }); process.exit(1); }
  process.stdout.write(r.stdout);
  process.exit(r.status ?? 1);
}

const EX = {
  chart: { out: 'units-by-sku', title: 'Avg daily units by SKU', data: { sql: 'SELECT name, avg_daily_units FROM products' }, mark: 'bar', encoding: { x: { field: 'name', type: 'nominal', sort: '-y', title: null }, y: { field: 'avg_daily_units', type: 'quantitative', title: 'Units / day' } } },
  deck: { out: 'sale-plan', title: 'Diwali sale plan', slides: [
    { type: 'title', title: 'Diwali sale plan', subtitle: '5 days · 25% off · all SKUs' },
    { type: 'kpis', title: 'The plan in numbers', kpis: [{ label: 'Forecast units', value: '6,720', delta: '+4x vs normal' }, { label: 'Revenue', value: '₹30.6L' }, { label: 'Ad budget', value: '₹4.0L' }, { label: 'Stock gap', value: '70', delta: '-Delhi serum' }] },
    { type: 'bullets', title: 'What we do', bullets: ['Move 70 serums Mumbai → Delhi by 9 Nov', 'Shift ₹50k from prospecting to retargeting', 'Book 2 skincare creators'], callout: 'Decision needed: approve the stock transfer today.' },
    { type: 'table', title: 'Products', sql: 'SELECT sku, name, mrp, avg_daily_units FROM products' },
    { type: 'chart', title: 'Daily units', chart: { data: { sql: 'SELECT name, avg_daily_units FROM products' }, mark: 'bar', encoding: { x: { field: 'name', type: 'nominal', title: null }, y: { field: 'avg_daily_units', type: 'quantitative', title: 'Units / day' } } }, caption: 'Sunscreen sells the most per day.' },
  ] },
  xlsx: { out: 'campaigns', sheets: [{ name: 'Meta campaigns', sql: 'SELECT campaign, spend, revenue, roas, ctr_pct FROM meta_campaigns', columns: [{ key: 'spend', format: 'inr' }, { key: 'revenue', format: 'inr' }], formulas: [{ header: 'Profit', formula: '{revenue}-{spend}', format: 'inr' }], totals: true }] },
  docx: { out: 'sale-brief', title: 'Diwali sale brief', subtitle: 'For the founder', date: '7 Nov 2026', kpis: [{ label: 'Revenue', value: '₹30.6L', delta: '+4x' }, { label: 'Units', value: '6,720' }], blocks: [{ h: 'Summary' }, { p: 'We expect 4x normal sales for 5 days.' }, { bullets: ['Move stock to Delhi', 'Retarget cart abandoners'] }, { callout: 'Approve the stock transfer today.' }, { table: { sql: 'SELECT sku, name, mrp FROM products' } }], footer: 'Made by Kratos' },
  banner: { out: 'diwali-banner', template: 'sale', headline: 'Glow this Diwali', sub: 'Vitamin C Serum and Sunscreen SPF 50', badge: '25% OFF', cta: 'Shop now', footnote: 'Till 14 Nov · kesar.co' },
};
EX.pdf = { ...EX.docx, out: 'sale-brief' };

const HELP = {
  sql: { usage: 'kit sql "<SELECT ...>" [--limit N] [--data dir]', notes: 'One read-only SELECT/WITH over data/*.csv (SQLite dialect). Max 200 rows unless --limit (cap 10000).', example: 'kit sql "SELECT sku, name, mrp FROM products ORDER BY mrp DESC"' },
  tables: { usage: 'kit tables [--data dir]', notes: 'Every data/*.csv as a table: columns (number|text) and row counts.', example: 'kit tables' },
  stats: { usage: 'kit stats <table> <column> [--by col]', notes: 'count, sum, mean, median, p10, p90, min, max.', example: 'kit stats meta_campaigns roas' },
  forecast: { usage: 'kit forecast --table orders --date date --value qty [--by sku] [--days 5] [--uplift 4]', notes: 'Daily totals -> linear trend x day-of-week factor (>=14 days of history) x uplift for the next N days after the last date.', example: 'kit forecast --table orders --date date --value qty --by sku --days 5 --uplift 4' },
  chart: { usage: 'kit chart <spec.json | inline JSON> [--out name]', notes: 'Vega-Lite spec. Data inline (data.values) or {"data":{"sql":"SELECT ..."}}. No URLs. Writes .svg and .png.', example: EX.chart },
  deck: { usage: 'kit deck <spec.json | inline JSON> [--out name]', notes: `Slide types: title, kpis, bullets (+callout), table (rows/columns or sql), chart (Vega-Lite spec or path). Max ${LIMITS.slides} slides. Optional "notes" per slide.`, example: EX.deck },
  xlsx: { usage: 'kit xlsx <spec.json | inline JSON> [--out name]', notes: 'Sheets from rows/columns or sql. Formats: inr (₹12,34,567), lakh (cell = value/1e5, shown ₹1.23L), int, num, pct (25 = 25%), ratio (0.25 = 25%), text. Formulas: {col} = that column, same row; {r} = row number. totals: true adds SUBTOTAL row. Header frozen + autofilter.', example: EX.xlsx },
  docx: { usage: 'kit docx <spec.json | inline JSON> [--out name]', notes: 'One-page brief: title, subtitle, date, kpis (max 4), blocks: {h}|{p}|{bullets}|{callout}|{table}|{chart}, footer.', example: EX.docx },
  pdf: { usage: 'kit pdf <spec.json | inline JSON> [--out name]', notes: 'Same spec as docx, A4 PDF.', example: EX.pdf },
  banner: { usage: 'kit banner <spec.json | inline JSON> [--out name]', notes: '1080x1080. template: sale | launch | quote. Fields: headline, sub, badge, cta, footnote, brand, accent (#RRGGBB). Writes .svg and .png.', example: EX.banner },
  help: { usage: 'kit help [command]' },
};

async function main() {
  const { values: o, positionals: pos } = parseArgs({
    allowPositionals: true, strict: true,
    options: { data: { type: 'string' }, limit: { type: 'string' }, by: { type: 'string' }, out: { type: 'string' }, table: { type: 'string' }, date: { type: 'string' }, value: { type: 'string' }, days: { type: 'string' }, uplift: { type: 'string' } },
  });
  const [cmd, ...args] = pos;
  if (!cmd || cmd === 'help') {
    if (args[0] && !HELP[args[0]]) fail(`unknown command: ${args[0]}`);
    return args[0] ? { command: args[0], ...HELP[args[0]] } : { commands: Object.fromEntries(Object.entries(HELP).map(([k, v]) => [k, v.usage])), more: 'kit help <command> for an example spec; manual: switch/TOOLKIT.md' };
  }
  const data = await import('../lib/data.mjs');
  const dir = data.dataDir(o.data);
  const name = (spec, ext, fb) => outPath(o.out ?? spec.out ?? (String(spec.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || fb), ext, fb);
  switch (cmd) {
    case 'sql': return data.query(dir, args.join(' '), o.limit);
    case 'tables': return { tables: data.openDb(dir).tables };
    case 'stats': if (args.length < 2) fail(HELP.stats.usage); return data.stats(dir, args[0], args[1], o.by);
    case 'forecast': return data.forecast(dir, { table: o.table, date: o.date, value: o.value, by: o.by, days: o.days ?? 5, uplift: o.uplift ?? 1 });
    case 'chart': {
      const spec = loadSpec(args[0]);
      const { renderChart } = await import('../lib/chart.mjs');
      const r = await renderChart(spec, dir);
      return { files: [writeOut(name(spec, '.svg', 'chart'), r.svg), writeOut(name(spec, '.png', 'chart'), r.png)], width: r.width, height: r.height };
    }
    case 'deck': {
      const spec = loadSpec(args[0]);
      const r = await (await import('../lib/deck.mjs')).buildDeck(spec, dir);
      return { ...writeOut(name(spec, '.pptx', 'deck'), r.buffer), slides: r.slides };
    }
    case 'xlsx': {
      const spec = loadSpec(args[0]);
      const r = await (await import('../lib/xlsx.mjs')).buildXlsx(spec, dir);
      return { ...writeOut(name(spec, '.xlsx', 'workbook'), r.buffer), sheets: r.sheets };
    }
    case 'docx': case 'pdf': {
      const spec = loadSpec(args[0]);
      const b = await import('../lib/brief.mjs');
      const r = await (cmd === 'docx' ? b.buildDocx : b.buildPdf)(spec, dir);
      return writeOut(name(spec, '.' + cmd, 'brief'), r.buffer);
    }
    case 'banner': {
      const spec = loadSpec(args[0]);
      const r = await (await import('../lib/banner.mjs')).buildBanner(spec);
      const s2 = { ...spec, title: spec.headline };
      return { files: [writeOut(name(s2, '.svg', 'banner'), r.svg), writeOut(name(s2, '.png', 'banner'), r.png)] };
    }
    default: fail(`unknown command: ${cmd} (try: kit help)`);
  }
}

try {
  print({ ok: true, ...(await main()) });
} catch (e) {
  print({ ok: false, error: e instanceof KitError || e?.code?.startsWith?.('ERR_PARSE_ARGS') ? e.message : `internal error: ${e?.message || e}` });
  process.exit(1);
}
