// Vega-Lite -> SVG (headless vega, no network, no file reads) -> PNG (sharp).
import * as vega from 'vega';
import { compile } from 'vega-lite';
import sharp from 'sharp';
import { fail } from './util.mjs';
import { query } from './data.mjs';

export const THEME = {
  saffron: '#F4A300', ink: '#1F1A17', cream: '#FBF6EC', sand: '#EFE5D2', muted: '#6B6259',
  palette: ['#F4A300', '#1F1A17', '#C2410C', '#8A9A5B', '#B08968', '#5B7083'],
  font: 'Helvetica Neue, Helvetica, Arial, sans-serif',
};

const config = {
  background: THEME.cream,
  font: THEME.font,
  padding: 16,
  view: { stroke: null },
  title: { fontSize: 18, fontWeight: 600, color: THEME.ink, anchor: 'start', offset: 12 },
  axis: { labelColor: THEME.muted, titleColor: THEME.muted, domainColor: '#CFC4B0', tickColor: '#CFC4B0', gridColor: '#E8DFCC', labelFontSize: 12, titleFontSize: 12, titleFontWeight: 500, labelLimit: 220 },
  axisX: { labelAngle: 0 },
  legend: { labelColor: THEME.ink, titleColor: THEME.muted, labelFontSize: 12 },
  range: { category: THEME.palette },
  mark: { color: THEME.saffron },
  bar: { cornerRadiusEnd: 3 },
  line: { strokeWidth: 3 },
};

// Loader that refuses every load: data must be inline (data.values) or come from {"sql": "..."}.
const loader = vega.loader();
loader.load = loader.sanitize = loader.http = loader.file = async (uri) => fail(`chart may not load external data (${String(uri).slice(0, 80)})`);

function inlineSql(node, dir) {
  if (Array.isArray(node)) return node.forEach((n) => inlineSql(n, dir));
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'url') fail('chart may not load external data (url): use data.values or data.sql');
    if (k === 'data' && v && typeof v === 'object' && typeof v.sql === 'string') {
      node.data = { values: query(dir, v.sql, v.limit ?? 10_000).rows };
    } else inlineSql(v, dir);
  }
}

export async function renderChart(spec, dir) {
  if (!spec || typeof spec !== 'object') fail('chart spec must be a Vega-Lite object');
  const vl = structuredClone(spec);
  delete vl.out;
  inlineSql(vl, dir);
  vl.config = { ...config, ...(vl.config || {}) };
  vl.width ??= 640;
  vl.height ??= 360;
  let compiled;
  try { compiled = compile(vl).spec; } catch (e) { fail(`vega-lite: ${e.message}`); }
  const view = new vega.View(vega.parse(compiled), { renderer: 'none', loader });
  const svg = await view.toSVG();
  view.finalize();
  const png = await sharp(Buffer.from(svg), { density: 192 }).png().toBuffer();
  const meta = await sharp(png).metadata();
  return { svg, png, width: meta.width, height: meta.height };
}
