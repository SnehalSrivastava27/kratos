// CSVs -> node:sqlite DB (cached read-only in data/.cache/, rebuilt when a CSV changes), guarded read-only SQL, stats, forecast.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, constants as C } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { MART_VERSION, MARTS } from './marts.mjs';
import * as ss from 'simple-statistics';
import { REPO, LIMITS, fail, readablePath } from './util.mjs';

const MAX_VALUE = 100_000; // bytes per string/blob value inside SQLite
const MAX_CELL = 2_000; // chars per cell returned to the agent
const NUM = /^-?(0|[1-9]\d*)(\.\d+)?$/; // no leading zeros, so pincodes/ids stay text
const qi = (id) => '"' + String(id).replace(/"/g, '""') + '"';

export function dataDir(opt) {
  return opt ? readablePath(opt) : path.join(REPO, 'data');
}

let cache;
const DB_OPTS = { enableForeignKeyConstraints: false, limits: { length: MAX_VALUE, sqlLength: 40_000, attach: 0 } };
const DENY_FN = new Set(['load_extension', 'readfile', 'writefile', 'edit', 'fts3_tokenizer', 'randomblob', 'zeroblob', 'printf', 'format', 'char', 'replicate', 'unhex']);

// CSVs in the data dir: regular files only, and only if they really live there (no symlinks out).
function csvFiles(realDir) {
  const out = [];
  for (const f of fs.readdirSync(realDir).filter((f) => f.endsWith('.csv')).sort()) {
    const p = path.join(realDir, f);
    const st = fs.lstatSync(p);
    if (!st.isFile() || path.dirname(fs.realpathSync(p)) !== realDir) continue;
    out.push({ f, p, size: st.size, mtime: st.mtimeMs });
  }
  return out;
}

// Cache file in data/.cache/: kratos.db for the repo data, kratos-<hash>.db for any other --data dir.
// null (= build in memory) when caching is off or data/.cache is not a real directory inside data/.
function cacheFile(realDir) {
  if (process.env.KIT_CACHE === '0') return null;
  try {
    const dataReal = fs.realpathSync(path.join(REPO, 'data'));
    const base = path.join(dataReal, '.cache');
    fs.mkdirSync(base, { recursive: true });
    if (!fs.lstatSync(base).isDirectory() || fs.realpathSync(base) !== base) return null;
    const name = realDir === dataReal ? 'kratos.db' : `kratos-${createHash('sha1').update(realDir).digest('hex').slice(0, 12)}.db`;
    return path.join(base, name);
  } catch { return null; }
}

// Open the cache read-only if it is a regular file (not a symlink) built from exactly these CSVs.
function openCached(file, sig) {
  let db;
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    db = new DatabaseSync(file, { ...DB_OPTS, readOnly: true });
    if (db.prepare("SELECT v FROM _kit_meta WHERE k = 'sig'").get()?.v === sig) return db;
  } catch { /* missing or corrupt: rebuild */ }
  try { db?.close(); } catch { /* ignore */ }
  return null;
}

function load(db, files, sig) {
  const require = createRequire(import.meta.url);
  const { parse } = require('csv-parse/sync'); // only needed on a rebuild
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF');
  const tables = [];
  for (const { f, p } of files) {
    const name = f.slice(0, -4).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const recs = parse(fs.readFileSync(p), { columns: false, skip_empty_lines: true, bom: true, relax_column_count: true });
    if (!recs.length) continue;
    const cols = recs[0].map((c, i) => String(c).trim() || `col${i + 1}`);
    const body = recs.slice(1);
    const numeric = cols.map((_, i) => body.every((r) => r[i] == null || r[i] === '' || NUM.test(r[i].trim())));
    db.exec(`CREATE TABLE ${qi(name)} (${cols.map((c, i) => `${qi(c)} ${numeric[i] ? 'NUMERIC' : 'TEXT'}`).join(', ')})`);
    const ins = db.prepare(`INSERT INTO ${qi(name)} VALUES (${cols.map(() => '?').join(',')})`);
    db.exec('BEGIN');
    for (const r of body) ins.run(...cols.map((_, i) => (r[i] == null || r[i] === '' ? null : numeric[i] ? Number(r[i]) : r[i])));
    db.exec('COMMIT');
    tables.push({ table: name, file: f, rows: body.length, columns: cols.map((c, i) => ({ name: c, type: numeric[i] ? 'number' : 'text' })) });
  }
  const names = new Set(tables.map((t) => t.table));
  const marts = [];
  for (const [name, sql] of MARTS) {
    if (names.has(name)) continue; // a CSV with that name wins
    try { db.exec(`CREATE TABLE ${qi(name)} AS ${sql}`); } catch { continue; } // sources missing: skip this mart
    const columns = db.prepare(`SELECT * FROM ${qi(name)} LIMIT 0`).columns().map((c) => ({ name: c.name }));
    marts.push({ table: name, rows: db.prepare(`SELECT COUNT(*) n FROM ${qi(name)}`).get().n, columns });
  }
  db.exec('CREATE TABLE _kit_meta (k TEXT PRIMARY KEY, v TEXT)');
  const meta = db.prepare('INSERT INTO _kit_meta VALUES (?, ?)');
  meta.run('tables', JSON.stringify(tables));
  meta.run('marts', JSON.stringify(marts));
  meta.run('sig', sig); // written last: a half-built file never matches
}

// Build into a temp file and rename it over the cache (atomic; concurrent builders are fine).
// If the cache cannot be written, build the same DB in memory.
function build(files, file, sig) {
  if (file) {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      const db = new DatabaseSync(tmp, DB_OPTS);
      try { load(db, files, sig); } finally { db.close(); }
      fs.renameSync(tmp, file);
      const ro = openCached(file, sig);
      if (ro) return ro;
    } catch { /* fall through to memory */ }
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
  const db = new DatabaseSync(':memory:', DB_OPTS);
  load(db, files, sig);
  return db;
}

export function openDb(dir) {
  if (cache) return cache;
  const realDir = fs.realpathSync(dir);
  const files = csvFiles(realDir);
  const sig = JSON.stringify([MART_VERSION, realDir, files.map((x) => [x.f, x.size, x.mtime])]);
  const file = cacheFile(realDir);
  const db = (file && openCached(file, sig)) || build(files, file, sig);
  const meta = Object.fromEntries(db.prepare("SELECT k, v FROM _kit_meta WHERE k IN ('tables', 'marts')").all().map((r) => [r.k, JSON.parse(r.v)]));
  // Value size capped (strings/blobs), so a query cannot build huge values in memory.
  db.exec('PRAGMA query_only = ON');
  db.enableDefensive(true);
  // Only reads, selects and plain functions are authorized from here on.
  db.setAuthorizer((code, a1, a2) => {
    if (code === C.SQLITE_SELECT || code === C.SQLITE_READ || code === C.SQLITE_RECURSIVE) return C.SQLITE_OK;
    if (code === C.SQLITE_FUNCTION) return DENY_FN.has(String(a2).toLowerCase()) ? C.SQLITE_DENY : C.SQLITE_OK;
    return C.SQLITE_DENY;
  });
  cache = { db, tables: meta.tables, marts: meta.marts, dir: realDir };
  return cache;
}

// Text-level guard (defence in depth on top of the authorizer + query_only + in-memory DB).
export function checkSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) fail('empty SQL');
  if (sql.length > 20_000) fail('SQL too long');
  const bare = sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
    .replace(/;\s*$/, '');
  if (bare.includes(';')) fail('only one statement allowed');
  if (!/^(select|with)\b/i.test(bare)) fail('only SELECT / WITH queries allowed');
  const bad = bare.match(/\b(attach|detach|pragma|insert|update|delete|create|drop|alter|vacuum|reindex|analyze|into|load_extension|readfile|writefile)\b|\b(csv|xlsx|xls|txt|tab)\s*\(/i);
  if (bad) fail(`forbidden in SQL: ${bad[0]}`);
  return sql;
}

const cellOut = (v) => (v instanceof Uint8Array ? `<blob ${v.length} bytes>` : typeof v === 'string' && v.length > MAX_CELL ? v.slice(0, MAX_CELL) + '…' : v);

export function query(dir, sql, limit = LIMITS.defaultRows) {
  checkSql(sql);
  const cap = Math.min(Math.max(1, Number(limit) || LIMITS.defaultRows), LIMITS.rows);
  const { db } = openDb(dir);
  let stmt;
  // Wrapping as a subquery makes SQLite reject anything after the first statement.
  try { stmt = db.prepare(`SELECT * FROM (\n${sql.trim().replace(/;\s*$/, '')}\n)`); } catch (e) { fail(`SQL error: ${e.message}`); }
  const rows = [];
  let truncated = false;
  try {
    for (const r of stmt.iterate()) {
      if (rows.length >= cap) { truncated = true; break; }
      rows.push(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cellOut(v)])));
    }
  } catch (e) { fail(`SQL error: ${e.message}`); }
  return { columns: stmt.columns().map((c) => c.name), rows, count: rows.length, truncated };
}

function colOf(dir, table, column) {
  const { tables, marts } = openDb(dir);
  const t = [...tables, ...marts].find((x) => x.table === table);
  if (!t) fail(`unknown table: ${table}`);
  if (column && !t.columns.some((c) => c.name === column)) fail(`unknown column ${table}.${column}`);
  return t;
}

const summary = (xs) => (xs.length ? {
  count: xs.length, sum: ss.sum(xs), mean: ss.mean(xs), median: ss.median(xs),
  p10: ss.quantile(xs, 0.1), p90: ss.quantile(xs, 0.9), min: ss.min(xs), max: ss.max(xs),
} : { count: 0 });

export function stats(dir, table, column, by) {
  colOf(dir, table, column);
  if (by) colOf(dir, table, by);
  const { db } = openDb(dir);
  const rows = db.prepare(`SELECT ${by ? qi(by) : 'NULL'} AS g, ${qi(column)} AS v FROM ${qi(table)} WHERE typeof(${qi(column)}) IN ('integer','real')`).all();
  const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  if (!by) return { table, column, ...round(summary(rows.map((r) => r.v))) };
  const groups = new Map();
  for (const r of rows) groups.set(r.g, [...(groups.get(r.g) || []), r.v]);
  return { table, column, by, groups: [...groups].map(([g, xs]) => ({ [by]: g, ...round(summary(xs)) })) };
}

const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// Daily totals -> linear trend + day-of-week factors (if >= 14 days) -> next N days, times uplift.
export function forecast(dir, { table, date, value, by, days = 5, uplift = 1 }) {
  if (!table || !date || !value) fail('need --table, --date and --value');
  for (const c of [date, value, by].filter(Boolean)) colOf(dir, table, c);
  days = Math.min(Math.max(1, Math.floor(Number(days)) || 5), 366);
  uplift = Number(uplift);
  if (!Number.isFinite(uplift) || uplift <= 0) fail('--uplift must be a positive number');
  const { db } = openDb(dir);
  const rows = db.prepare(`SELECT ${by ? qi(by) : "'all'"} AS g, substr(${qi(date)},1,10) AS d, SUM(${qi(value)}) AS v FROM ${qi(table)} GROUP BY 1,2 ORDER BY 1,2`).all();
  const groups = new Map();
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.d)) fail(`column ${date} is not a YYYY-MM-DD date`);
    groups.set(r.g, [...(groups.get(r.g) || []), r]);
  }
  const lastDate = rows.reduce((m, r) => (r.d > m ? r.d : m), '');
  const out = [...groups].map(([g, rs]) => {
    // Fill missing days with 0 so the trend is per calendar day.
    const vals = new Map(rs.map((r) => [r.d, r.v]));
    const series = [];
    for (let d = rs[0].d; d <= lastDate; d = addDays(d, 1)) series.push({ d, v: vals.get(d) || 0 });
    const ys = series.map((s) => s.v);
    const mean = ss.mean(ys);
    const line = series.length > 1 ? ss.linearRegression(series.map((s, i) => [i, s.v])) : { m: 0, b: ys[0] };
    const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
    const factor = new Array(7).fill(1);
    if (series.length >= 14 && mean > 0) {
      for (let k = 0; k < 7; k++) {
        const xs = series.filter((s) => dow(s.d) === k).map((s) => s.v);
        if (xs.length) factor[k] = ss.mean(xs) / mean;
      }
    }
    const fc = [];
    for (let i = 1; i <= days; i++) {
      const d = addDays(lastDate, i);
      const base = Math.max(0, line.m * (series.length - 1 + i) + line.b) * factor[dow(d)];
      fc.push({ date: d, value: Math.round(base * uplift * 100) / 100 });
    }
    return {
      [by || 'group']: g, history_days: series.length, avg_daily: Math.round(mean * 100) / 100,
      trend_per_day: Math.round(line.m * 100) / 100, forecast: fc,
      total: Math.round(fc.reduce((s, x) => s + x.value, 0) * 100) / 100,
    };
  });
  return { table, value, method: 'linear trend x day-of-week factor x uplift', uplift, days, from: addDays(lastDate, 1), groups: out };
}
