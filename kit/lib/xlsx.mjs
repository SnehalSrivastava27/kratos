// Workbook spec -> .xlsx (exceljs): styled header, ₹ formats, frozen header, autofilter, formula columns, totals.
import ExcelJS from 'exceljs';
import { fail, str } from './util.mjs';
import { tableOf } from './table.mjs';

export const FORMATS = {
  inr: '[>=10000000]"₹"#\\,##\\,##\\,##0;[>=100000]"₹"#\\,##\\,##0;"₹"#,##0', // Indian grouping: ₹12,34,567
  lakh: '"₹"0.00"L"', // cell holds lakhs (value / 1,00,000)
  int: '#,##0',
  num: '#,##0.00',
  pct: '0.0"%"', // value already in percent (25 = 25%)
  ratio: '0.0%', // value is a fraction (0.25 = 25%)
  text: '@',
};
const MONEY = /(revenue|spend|fee|cost|mrp|amount|refund|gross|net_pay|salary|ctc|price|total|budget|cogs|ebitda|marketing|opex)/i;

const letter = (n) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export async function buildXlsx(spec, dir) {
  const sheets = spec.sheets;
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > 20) fail('xlsx needs "sheets": [...] (1-20)');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kratos kit';
  const out = [];
  for (const [i, sh] of sheets.entries()) {
    const t = tableOf(sh, dir);
    const name = str(sh.name || `Sheet${i + 1}`, 31).replace(/[\\/?*[\]:]/g, ' ');
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const opts = Object.fromEntries((sh.columns || []).filter((c) => c && typeof c === 'object').map((c) => [c.key ?? c.header, c]));
    const cols = t.columns.map((c, j) => {
      const o = opts[c] || {};
      const sample = t.rows.find((r) => r[j] != null)?.[j];
      const fmt = o.format || (typeof sample !== 'number' ? null : /_pct$/.test(c) ? 'pct' : MONEY.test(c) ? 'inr' : Number.isInteger(sample) ? 'int' : 'num');
      return { key: c, header: str(o.header || c, 80), fmt, width: o.width };
    });
    const formulas = (sh.formulas || []).slice(0, 20);
    const allCols = [...cols, ...formulas.map((f) => ({ key: null, header: str(f.header || 'calc', 80), fmt: f.format || 'num', width: f.width }))];
    if (allCols.some((c) => c.fmt && !FORMATS[c.fmt])) fail(`unknown format; use one of ${Object.keys(FORMATS).join(', ')}`);
    const fit = (j) => Math.max(c0(allCols[j].header), ...t.rows.slice(0, 200).map((r) => c0(r[j] ?? '')));
    const c0 = (v) => String(typeof v === 'number' ? Math.round(v).toLocaleString('en-IN') : v).length + 4;
    ws.columns = allCols.map((c, j) => ({ header: c.header, width: c.width || Math.min(50, Math.max(10, j < cols.length ? fit(j) : c.header.length + 6)) }));
    const pos = Object.fromEntries(cols.map((c, j) => [c.key, letter(j)]));
    t.rows.forEach((r, k) => {
      const rn = k + 2;
      const vals = cols.map((c, j) => (c.fmt === 'lakh' && typeof r[j] === 'number' ? r[j] / 1e5 : r[j] ?? null));
      for (const f of formulas) {
        // "{qty}*{mrp}" -> "C2*D2"; "{r}" -> row number.
        const expr = String(f.formula || '').replace(/^=/, '').replace(/\{([^}]+)\}/g, (m, k2) => (k2 === 'r' ? rn : pos[k2] ? pos[k2] + rn : fail(`formula refers to unknown column {${k2}}`)));
        vals.push({ formula: expr });
      }
      ws.addRow(vals);
    });
    allCols.forEach((c, j) => { if (c.fmt) ws.getColumn(j + 1).numFmt = FORMATS[c.fmt]; });
    const last = t.rows.length + 1;
    if (sh.totals && t.rows.length) {
      const tr = ws.addRow(allCols.map((c, j) => (j === 0 ? 'Total' : c.fmt && c.fmt !== 'pct' && c.fmt !== 'ratio' && c.fmt !== 'text' ? { formula: `SUBTOTAL(109,${letter(j)}2:${letter(j)}${last})` } : null)));
      tr.font = { bold: true };
      tr.eachCell((cl) => { cl.border = { top: { style: 'thin', color: { argb: 'FF1F1A17' } } }; });
    }
    const head = ws.getRow(1);
    head.height = 22;
    head.eachCell((cl) => {
      cl.font = { bold: true, color: { argb: 'FFFBF6EC' } };
      cl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F1A17' } };
      cl.alignment = { vertical: 'middle' };
      cl.border = { bottom: { style: 'medium', color: { argb: 'FFF4A300' } } };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: allCols.length } };
    out.push({ name, rows: t.rows.length, columns: allCols.length });
  }
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), sheets: out };
}
