// CSVs -> in-memory node:sqlite DB, guarded read-only SQL, stats, forecast.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, constants as C } from 'node:sqlite';
import { parse } from 'csv-parse/sync';
import * as ss from 'simple-statistics';
import { REPO, LIMITS, fail, readablePath } from './util.mjs';

const NUM = /^-?(0|[1-9]\d*)(\.\d+)?$/; // no leading zeros, so pincodes/ids stay text
const qi = (id) => '"' + String(id).replace(/"/g, '""') + '"';

export function dataDir(opt) {
  return opt ? readablePath(opt) : path.join(REPO, 'data');
}

let cache;
export function openDb(dir) {
  if (cache) return cache;
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  const tables = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.csv')).sort()) {
    const name = f.slice(0, -4).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const recs = parse(fs.readFileSync(path.join(dir, f)), { columns: false, skip_empty_lines: true, bom: true, relax_column_count: true });
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
  db.exec('PRAGMA query_only = ON');
  db.enableDefensive(true);
  // Only reads, selects and plain functions are authorized from here on.
  const DENY_FN = new Set(['load_extension', 'readfile', 'writefile', 'edit', 'fts3_tokenizer']);
  db.setAuthorizer((code, a1, a2) => {
    if (code === C.SQLITE_SELECT || code === C.SQLITE_READ || code === C.SQLITE_RECURSIVE) return C.SQLITE_OK;
    if (code === C.SQLITE_FUNCTION) return DENY_FN.has(String(a2).toLowerCase()) ? C.SQLITE_DENY : C.SQLITE_OK;
    return C.SQLITE_DENY;
  });
  cache = { db, tables };
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
  const bad = bare.match(/\b(attach|detach|pragma|insert|update|delete|create|drop|alter|vacuum|reindex|analyze|into|load_extension|readfile|writefile)\b|\b(csv|xlsx|json|txt)\s*\(/i);
  if (bad) fail(`forbidden in SQL: ${bad[0]}`);
  return sql;
}

export function query(dir, sql, limit = LIMITS.defaultRows) {
  checkSql(sql);
  const cap = Math.min(Math.max(1, Number(limit) || LIMITS.defaultRows), LIMITS.rows);
  const { db } = openDb(dir);
  let stmt;
  try { stmt = db.prepare(sql); } catch (e) { fail(`SQL error: ${e.message}`); }
  const rows = [];
  let truncated = false;
  try {
    for (const r of stmt.iterate()) {
      if (rows.length >= cap) { truncated = true; break; }
      rows.push({ ...r });
    }
  } catch (e) { fail(`SQL error: ${e.message}`); }
  return { columns: stmt.columns().map((c) => c.name), rows, count: rows.length, truncated };
}

function colOf(dir, table, column) {
  const t = openDb(dir).tables.find((x) => x.table === table);
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
