// One-page brief spec -> .docx (docx) or .pdf (pdfkit). Same spec for both.
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  AlignmentType, ImageRun, HeadingLevel,
} from 'docx';
import { fail, str } from './util.mjs';
import { renderChart } from './chart.mjs';
import { chartOf } from './deck.mjs';
import { tableOf, cell } from './table.mjs';

const C = { saffron: 'F4A300', ink: '1F1A17', cream: 'FBF6EC', sand: 'EFE5D2', muted: '6B6259', line: 'E2D7C2', up: '2F7D4F', down: 'B42318' };
const MAX_BLOCKS = 60;

function blocksOf(spec) {
  if (!spec.title) fail('brief needs "title"');
  const blocks = spec.blocks || [];
  if (!Array.isArray(blocks) || blocks.length > MAX_BLOCKS) fail(`"blocks" must be an array of at most ${MAX_BLOCKS}`);
  return blocks;
}
const deltaColor = (d) => (/^[-−]/.test(d) ? C.down : /^\+/.test(d) ? C.up : C.muted);
const chartPng = async (b, dir) => renderChart({ width: 640, height: 260, ...chartOf(b.chart), config: { background: '#FFFFFF', ...(chartOf(b.chart).config || {}) } }, dir);

// ---------- DOCX ----------
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
const PAGE_W = 9906; // A4 width minus 2 x 1000 twip margins
const run = (text, o = {}) => new TextRun({ text: str(text, 4000), font: 'Helvetica Neue', ...o });

export async function buildDocx(spec, dir) {
  const blocks = blocksOf(spec);
  const kids = [
    new Paragraph({ children: [run(str(spec.brand || 'Kesar & Co.', 60).toUpperCase(), { bold: true, color: C.saffron, size: 18, characterSpacing: 40 })], spacing: { after: 80 } }),
    new Paragraph({ children: [run(spec.title, { bold: true, color: C.ink, size: 44 })], spacing: { after: 60 } }),
  ];
  if (spec.subtitle || spec.date) kids.push(new Paragraph({ children: [run([spec.subtitle, spec.date].filter(Boolean).join('  ·  '), { color: C.muted, size: 22 })], spacing: { after: 120 } }));
  kids.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: C.saffron, space: 1 } }, spacing: { after: 200 } }));
  const kpis = (spec.kpis || []).slice(0, 4);
  if (kpis.length) {
    kids.push(new Table({
      width: { size: PAGE_W, type: WidthType.DXA }, columnWidths: kpis.map(() => Math.floor(PAGE_W / kpis.length)), borders: noBorders,
      rows: [new TableRow({ children: kpis.map((k) => new TableCell({
        width: { size: Math.floor(PAGE_W / kpis.length), type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: C.cream, color: 'auto' },
        margins: { top: 140, bottom: 140, left: 160, right: 160 },
        borders: { top: { style: BorderStyle.SINGLE, size: 18, color: C.saffron }, bottom: none, left: { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' }, right: { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' } },
        children: [
          new Paragraph({ children: [run(str(k.label, 60).toUpperCase(), { bold: true, size: 16, color: C.muted })] }),
          new Paragraph({ children: [run(str(k.value, 24), { bold: true, size: 36, color: C.ink })] }),
          ...(k.delta ? [new Paragraph({ children: [run(str(k.delta, 40), { bold: true, size: 18, color: deltaColor(str(k.delta)) })] })] : []),
        ],
      })) })],
    }));
    kids.push(new Paragraph({ spacing: { after: 120 } }));
  }
  for (const b of blocks) {
    if (b.h) kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(b.h, { bold: true, size: 26, color: C.ink })], spacing: { before: 200, after: 80 } }));
    else if (b.p) kids.push(new Paragraph({ children: [run(b.p, { size: 21, color: C.ink })], spacing: { after: 120, line: 300 } }));
    else if (b.bullets) for (const t of b.bullets.slice(0, 20)) kids.push(new Paragraph({ bullet: { level: 0 }, children: [run(t, { size: 21, color: C.ink })], spacing: { after: 60 } }));
    else if (b.callout) {
      kids.push(new Table({
        width: { size: PAGE_W, type: WidthType.DXA }, columnWidths: [PAGE_W], borders: noBorders,
        rows: [new TableRow({ children: [new TableCell({
          width: { size: PAGE_W, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: C.sand, color: 'auto' },
          margins: { top: 140, bottom: 140, left: 200, right: 200 },
          borders: { left: { style: BorderStyle.SINGLE, size: 36, color: C.saffron }, top: none, bottom: none, right: none },
          children: [new Paragraph({ children: [run(b.callout, { bold: true, size: 22, color: C.ink })] })],
        })] })],
      }));
      kids.push(new Paragraph({ spacing: { after: 120 } }));
    }
    else if (b.table) {
      const t = tableOf(b.table, dir, 200);
      const colW = Math.floor(PAGE_W / t.columns.length);
      const tc = (v, head, zebra) => new TableCell({
        width: { size: colW, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: head ? C.ink : zebra ? C.cream : 'FFFFFF', color: 'auto' },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ alignment: !head && typeof v === 'number' ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(head ? v : cell(v), { size: 18, bold: head, color: head ? C.cream : C.ink })] })],
      });
      kids.push(new Table({
        width: { size: PAGE_W, type: WidthType.DXA }, columnWidths: t.columns.map(() => colW),
        borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.line }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: C.line } },
        rows: [new TableRow({ tableHeader: true, children: t.columns.map((c) => tc(c, true)) }), ...t.rows.map((r, j) => new TableRow({ children: r.map((v) => tc(v, false, j % 2)) }))],
      }));
      kids.push(new Paragraph({ spacing: { after: 120 } }));
    } else if (b.chart) {
      const r = await chartPng(b, dir);
      const w = 600, h = Math.round((r.height / r.width) * w);
      kids.push(new Paragraph({ children: [new ImageRun({ type: 'png', data: r.png, transformation: { width: w, height: h } })], spacing: { before: 120, after: 120 } }));
    } else fail('unknown block; use {h}|{p}|{bullets}|{callout}|{table}|{chart}');
  }
  if (spec.footer) kids.push(new Paragraph({ children: [run(spec.footer, { italics: true, size: 18, color: C.muted })], spacing: { before: 240 } }));
  const doc = new Document({
    creator: 'Kratos kit', title: str(spec.title, 200),
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: kids }],
  });
  return { buffer: await Packer.toBuffer(doc) };
}

// ---------- PDF ----------
const NEUE = '/System/Library/Fonts/HelveticaNeue.ttc'; // has ₹; fallback Helvetica + "Rs "

export async function buildPdf(spec, dir) {
  const blocks = blocksOf(spec);
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: str(spec.title, 200), Creator: 'Kratos kit' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((res) => doc.on('end', res));
  let R = 'Helvetica', B = 'Helvetica-Bold', I = 'Helvetica-Oblique', fix = (s) => str(s, 4000).replace(/₹/g, 'Rs ');
  if (fs.existsSync(NEUE)) {
    doc.registerFont('R', NEUE, 'HelveticaNeue'); doc.registerFont('B', NEUE, 'HelveticaNeue-Bold'); doc.registerFont('I', NEUE, 'HelveticaNeue-Italic');
    [R, B, I] = ['R', 'B', 'I']; fix = (s) => str(s, 4000);
  }
  const hex = (c) => '#' + c;
  const W = doc.page.width, M = 48, CW = W - 2 * M;
  const room = (h) => { if (doc.y + h > doc.page.height - M) doc.addPage(); };

  // Header band
  doc.rect(0, 0, W, 118).fill(hex(C.ink));
  doc.rect(0, 118, W, 5).fill(hex(C.saffron));
  doc.font(B).fontSize(9).fillColor(hex(C.saffron)).text(fix(spec.brand || 'Kesar & Co.').toUpperCase(), M, 30, { characterSpacing: 2 });
  doc.font(B).fontSize(24).fillColor(hex(C.cream)).text(fix(spec.title), M, 46, { width: CW, height: 34, ellipsis: true });
  const sub = [spec.subtitle, spec.date].filter(Boolean).join('  ·  ');
  if (sub) doc.font(R).fontSize(11).fillColor(hex(C.sand)).text(fix(sub), M, 84, { width: CW, height: 16, ellipsis: true });
  doc.y = 144;

  const kpis = (spec.kpis || []).slice(0, 4);
  if (kpis.length) {
    const gap = 10, tw = (CW - gap * (kpis.length - 1)) / kpis.length, th = 68, y = doc.y;
    kpis.forEach((k, j) => {
      const x = M + j * (tw + gap);
      doc.rect(x, y, tw, th).fill(hex(C.cream));
      doc.rect(x, y, tw, 3).fill(hex(C.saffron));
      doc.font(B).fontSize(7.5).fillColor(hex(C.muted)).text(fix(k.label).toUpperCase(), x + 10, y + 12, { width: tw - 20, lineBreak: false, ellipsis: true });
      doc.font(B).fontSize(20).fillColor(hex(C.ink)).text(fix(k.value), x + 10, y + 26, { width: tw - 20, lineBreak: false, ellipsis: true });
      if (k.delta) doc.font(B).fontSize(8.5).fillColor(hex(deltaColor(str(k.delta)))).text(fix(k.delta), x + 10, y + 51, { width: tw - 20, lineBreak: false, ellipsis: true });
    });
    doc.y = y + th + 16;
  }
  const para = (t, font, size, color, o = {}) => { doc.font(font).fontSize(size).fillColor(hex(color)).text(fix(t), M, doc.y, { width: CW, ...o }); };
  for (const b of blocks) {
    if (b.h) { room(40); doc.moveDown(0.4); para(b.h, B, 13, C.ink); doc.moveDown(0.2); }
    else if (b.p) { room(30); para(b.p, R, 10.5, C.ink, { lineGap: 2.5 }); doc.moveDown(0.5); }
    else if (b.bullets) {
      for (const t of b.bullets.slice(0, 20)) {
        room(20);
        const y = doc.y;
        doc.rect(M + 2, y + 4, 4, 4).fill(hex(C.saffron));
        doc.font(R).fontSize(10.5).fillColor(hex(C.ink)).text(fix(t), M + 14, y, { width: CW - 14, lineGap: 2 });
        doc.moveDown(0.25);
      }
      doc.moveDown(0.3);
    } else if (b.callout) {
      room(50);
      const y = doc.y, h = doc.font(B).fontSize(11).heightOfString(fix(b.callout), { width: CW - 28 }) + 20;
      doc.rect(M, y, CW, h).fill(hex(C.sand));
      doc.rect(M, y, 4, h).fill(hex(C.saffron));
      doc.font(B).fontSize(11).fillColor(hex(C.ink)).text(fix(b.callout), M + 16, y + 10, { width: CW - 28 });
      doc.y = y + h + 12;
    } else if (b.table) {
      const t = tableOf(b.table, dir, 200);
      const n = t.columns.length, cw = CW / n, rh = 18;
      const row = (vals, head, zebra) => {
        room(rh);
        const y = doc.y;
        doc.rect(M, y, CW, rh).fill(hex(head ? C.ink : zebra ? C.cream : 'FFFFFF'));
        vals.forEach((v, j) => doc.font(head ? B : R).fontSize(8.5).fillColor(hex(head ? C.cream : C.ink))
          .text(head ? fix(v) : fix(cell(v)), M + j * cw + 6, y + 5, { width: cw - 12, align: !head && typeof v === 'number' ? 'right' : 'left', lineBreak: false, ellipsis: true }));
        doc.y = y + rh;
      };
      row(t.columns, true);
      t.rows.forEach((r, j) => row(r, false, j % 2));
      doc.moveTo(M, doc.y).lineTo(M + CW, doc.y).lineWidth(0.5).strokeColor(hex(C.line)).stroke();
      doc.y += 12;
    } else if (b.chart) {
      const r = await chartPng(b, dir);
      const h = (r.height / r.width) * CW;
      room(h + 10);
      doc.image(r.png, M, doc.y, { width: CW });
      doc.y += h + 12;
    } else fail('unknown block; use {h}|{p}|{bullets}|{callout}|{table}|{chart}');
  }
  if (spec.footer) { room(20); para(spec.footer, I, 8.5, C.muted); }
  doc.end();
  await done;
  return { buffer: Buffer.concat(chunks) };
}
