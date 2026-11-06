// Deck spec -> .pptx (pptxgenjs), Kesar & Co. theme.
import pptxgen from 'pptxgenjs';
import { LIMITS, fail, loadSpec, str } from './util.mjs';
import { renderChart } from './chart.mjs';
import { tableOf, cell } from './table.mjs';

const C = { saffron: 'F4A300', ink: '1F1A17', cream: 'FBF6EC', sand: 'EFE5D2', muted: '6B6259', line: 'E2D7C2', white: 'FFFFFF', up: '2F7D4F', down: 'B42318' };
const FONT = 'Helvetica Neue';
const W = 13.333, H = 7.5, M = 0.6;

export const chartOf = (c) => (typeof c === 'string' ? loadSpec(c) : c);

function header(s, title, kicker) {
  s.addShape('rect', { x: M, y: 0.55, w: 0.08, h: 0.62, fill: { color: C.saffron }, line: { color: C.saffron } });
  if (kicker) s.addText(str(kicker, 80).toUpperCase(), { x: M + 0.25, y: 0.42, w: W - 2 * M, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: C.saffron, charSpacing: 2, margin: 0 });
  s.addText(str(title, 120), { x: M + 0.25, y: kicker ? 0.7 : 0.55, w: W - 2 * M - 0.25, h: 0.6, fontFace: FONT, fontSize: 28, bold: true, color: C.ink, margin: 0, valign: 'top', fit: 'shrink' });
}

export async function buildDeck(spec, dir) {
  const slides = spec.slides;
  if (!Array.isArray(slides) || !slides.length) fail('deck needs "slides": [...]');
  if (slides.length > LIMITS.slides) fail(`too many slides (${slides.length} > ${LIMITS.slides})`);
  const p = new pptxgen();
  p.layout = 'LAYOUT_WIDE';
  p.title = str(spec.title || slides[0].title || 'Kesar & Co.', 200);
  p.company = 'Kesar & Co.';
  const brand = str(spec.brand || 'Kesar & Co.', 60);
  p.defineSlideMaster({
    title: 'KESAR',
    background: { color: C.cream },
    objects: [
      { rect: { x: 0, y: H - 0.08, w: W, h: 0.08, fill: { color: C.saffron } } },
      { text: { text: brand, options: { x: M, y: H - 0.5, w: 4, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted, margin: 0 } } },
    ],
    slideNumber: { x: W - M - 0.6, y: H - 0.5, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted, align: 'right' },
  });

  for (const [i, sl] of slides.entries()) {
    const type = sl.type || 'bullets';
    if (type === 'title') {
      const s = p.addSlide();
      s.background = { color: C.ink };
      s.addShape('rect', { x: 0, y: 0, w: 0.35, h: H, fill: { color: C.saffron }, line: { color: C.saffron } });
      s.addText(brand.toUpperCase(), { x: 1.1, y: 1.0, w: 8, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.saffron, charSpacing: 4, margin: 0 });
      s.addText(str(sl.title, 120), { x: 1.1, y: 2.3, w: 10.5, h: 1.9, fontFace: FONT, fontSize: 48, bold: true, color: C.cream, valign: 'top', margin: 0, fit: 'shrink' });
      if (sl.subtitle) s.addText(str(sl.subtitle, 240), { x: 1.1, y: 4.3, w: 10, h: 0.9, fontFace: FONT, fontSize: 20, color: C.sand, valign: 'top', margin: 0 });
      s.addShape('rect', { x: 1.1, y: 5.7, w: 1.2, h: 0.06, fill: { color: C.saffron }, line: { color: C.saffron } });
      s.addText(str(sl.date || spec.date || new Date().toDateString().slice(4), 60), { x: 1.1, y: 5.9, w: 6, h: 0.4, fontFace: FONT, fontSize: 13, color: C.sand, margin: 0 });
      continue;
    }
    const s = p.addSlide({ masterName: 'KESAR' });
    header(s, sl.title || '', sl.kicker);
    const top = 1.6, bodyH = H - top - 0.8;
    if (type === 'kpis') {
      const kpis = (sl.kpis || []).slice(0, 8);
      if (!kpis.length) fail(`slide ${i + 1}: kpis needs "kpis": [{label, value, delta?}]`);
      const perRow = Math.min(4, kpis.length), rowsN = Math.ceil(kpis.length / perRow), gap = 0.3;
      const tw = (W - 2 * M - gap * (perRow - 1)) / perRow, th = Math.min(2.2, (bodyH - gap * (rowsN - 1) - (sl.note ? 0.8 : 0)) / rowsN);
      kpis.forEach((k, j) => {
        const x = M + (j % perRow) * (tw + gap), y = top + 0.2 + Math.floor(j / perRow) * (th + gap);
        s.addShape('rect', { x, y, w: tw, h: th, fill: { color: C.white }, line: { color: C.line, width: 0.75 } });
        s.addShape('rect', { x, y, w: tw, h: 0.07, fill: { color: C.saffron }, line: { color: C.saffron } });
        s.addText(str(k.label, 60).toUpperCase(), { x: x + 0.25, y: y + 0.3, w: tw - 0.5, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: C.muted, charSpacing: 1, margin: 0 });
        s.addText(str(k.value, 24), { x: x + 0.25, y: y + 0.7, w: tw - 0.5, h: 0.8, fontFace: FONT, fontSize: 36, bold: true, color: C.ink, margin: 0, fit: 'shrink' });
        if (k.delta) {
          const d = str(k.delta, 40);
          s.addText(d, { x: x + 0.25, y: y + th - 0.55, w: tw - 0.5, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: d.startsWith('-') || d.startsWith('−') ? C.down : d.startsWith('+') ? C.up : C.muted, margin: 0 });
        }
      });
      if (sl.note) s.addText(str(sl.note, 300), { x: M, y: H - 1.45, w: W - 2 * M, h: 0.6, fontFace: FONT, fontSize: 14, italic: true, color: C.ink, margin: 0 });
    } else if (type === 'bullets') {
      const bullets = (sl.bullets || []).slice(0, 10).map((b) => str(b, 300));
      if (!bullets.length) fail(`slide ${i + 1}: bullets needs "bullets": ["..."]`);
      const w = sl.callout ? 7.6 : W - 2 * M;
      s.addText(bullets.map((b) => ({ text: b, options: { bullet: { code: '25A0', indent: 22 }, paraSpaceAfter: 10 } })),
        { x: M + 0.25, y: top + 0.1, w: w - 0.25, h: bodyH, fontFace: FONT, fontSize: bullets.length > 6 ? 16 : 20, color: C.ink, valign: 'top', margin: 0, fit: 'shrink' });
      if (sl.callout) {
        const cx = M + w + 0.4, cw = W - M - cx;
        s.addShape('rect', { x: cx, y: top + 0.1, w: cw, h: 3.2, fill: { color: C.ink }, line: { color: C.ink } });
        s.addText(str(sl.callout, 300), { x: cx + 0.3, y: top + 0.4, w: cw - 0.6, h: 2.6, fontFace: FONT, fontSize: 18, bold: true, color: C.cream, valign: 'top', margin: 0, fit: 'shrink' });
      }
    } else if (type === 'table') {
      const t = tableOf(sl.table || sl, dir, 200);
      const rows = t.rows.slice(0, 14);
      const head = t.columns.map((c) => ({ text: c, options: { bold: true, color: C.cream, fill: { color: C.ink } } }));
      const body = rows.map((r, j) => r.map((v) => ({ text: cell(v), options: { align: typeof v === 'number' ? 'right' : 'left', fill: { color: j % 2 ? C.cream : C.white } } })));
      s.addTable([head, ...body], { x: M, y: top + 0.1, w: W - 2 * M, fontFace: FONT, fontSize: rows.length > 9 ? 11 : 13, color: C.ink, border: { type: 'solid', pt: 0.5, color: C.line }, margin: 0.06, rowH: 0.36, autoPage: false });
      if (t.rows.length > rows.length) s.addText(`Showing ${rows.length} of ${t.rows.length} rows`, { x: M, y: H - 0.9, w: 6, h: 0.3, fontFace: FONT, fontSize: 10, italic: true, color: C.muted, margin: 0 });
    } else if (type === 'chart') {
      if (!sl.chart) fail(`slide ${i + 1}: chart needs "chart": {vega-lite spec} or "path/to/chart.json"`);
      const spec = chartOf(sl.chart);
      const r = await renderChart({ width: 900, height: 380, ...spec, config: { background: '#FFFFFF', ...(spec.config || {}) } }, dir);
      const maxW = W - 2 * M, maxH = bodyH - (sl.caption ? 0.5 : 0);
      const scale = Math.min(maxW / r.width, maxH / r.height);
      const w = r.width * scale, h = r.height * scale;
      s.addShape('rect', { x: (W - w) / 2, y: top, w, h, fill: { color: C.white }, line: { color: C.line, width: 0.75 } });
      s.addImage({ data: 'image/png;base64,' + r.png.toString('base64'), x: (W - w) / 2, y: top, w, h });
      if (sl.caption) s.addText(str(sl.caption, 200), { x: M, y: top + h + 0.1, w: W - 2 * M, h: 0.4, fontFace: FONT, fontSize: 12, italic: true, color: C.muted, align: 'center', margin: 0 });
    } else fail(`slide ${i + 1}: unknown type "${type}" (title|kpis|bullets|table|chart)`);
    if (sl.notes) s.addNotes(str(sl.notes, 2000));
  }
  return { buffer: await p.write({ outputType: 'nodebuffer' }), slides: slides.length };
}

