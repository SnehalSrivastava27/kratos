// Normalize a table block: {columns, rows} (rows as arrays or objects) or {sql}. Returns {columns, rows: any[][]}.
import { LIMITS, fail } from './util.mjs';
import { query } from './data.mjs';

export function tableOf(t, dir, max = LIMITS.rows) {
  if (!t || typeof t !== 'object') fail('table needs {columns, rows} or {sql}');
  let columns = t.columns;
  let rows = t.rows;
  if (typeof t.sql === 'string') {
    const r = query(dir, t.sql, Math.min(t.limit ?? max, max));
    columns = r.columns; // any "columns" next to sql are per-column options (xlsx), not names
    rows = r.rows;
  }
  if (!Array.isArray(rows)) fail('table rows must be an array');
  if (rows.length > max) fail(`too many rows (${rows.length} > ${max})`);
  if (!columns) columns = rows.length && !Array.isArray(rows[0]) ? Object.keys(rows[0]) : [];
  if (!Array.isArray(columns)) fail('table columns must be an array');
  columns = columns.map((c) => String(c && typeof c === 'object' ? c.key ?? c.header : c));
  rows = rows.map((r) => (Array.isArray(r) ? r : columns.map((c) => r?.[c])));
  return { columns, rows };
}

// ₹ with Indian grouping or lakhs/crores, for display text.
export function inr(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '');
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export const cell = (v) => (v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { maximumFractionDigits: 2 })) : String(v));
