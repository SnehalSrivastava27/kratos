// Banner spec -> 1080x1080 SVG from a template, plus PNG (sharp). Templates: sale | launch | quote.
import sharp from 'sharp';
import { fail, str } from './util.mjs';

const T = { saffron: '#F4A300', ink: '#1F1A17', cream: '#FBF6EC', sand: '#EFE5D2', muted: '#6B6259' };
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const HEX = /^#[0-9a-fA-F]{6}$/;

// Greedy word wrap by an average glyph width (0.55em), max `lines` lines.
function wrap(text, size, width, lines) {
  const max = Math.max(4, Math.floor(width / (size * 0.55)));
  const out = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/.?$/, '…'); }
  return out;
}
const textBlock = (lines, x, y, size, fill, weight = 700, lh = 1.08, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${lines.map((l, i) => `<tspan x="${x}" dy="${i ? size * lh : 0}">${esc(l)}</tspan>`).join('')}</text>`;

export function bannerSvg(spec) {
  const tpl = spec.template || 'sale';
  const headline = str(spec.headline, 120);
  if (!headline) fail('banner needs "headline"');
  const sub = str(spec.sub, 200), badge = str(spec.badge, 16), cta = str(spec.cta, 30), brand = str(spec.brand || 'Kesar & Co.', 40), foot = str(spec.footnote, 90);
  const accent = HEX.test(spec.accent || '') ? spec.accent : T.saffron;
  const S = 1080, P = 88;
  const parts = [];
  const brandRow = (fill) => `<rect x="${P}" y="${P}" width="44" height="6" fill="${accent}"/>` + textBlock([brand.toUpperCase()], P, P + 52, 26, fill, 700);
  const ctaPill = (y, bg, fg) => { if (!cta) return ''; const w = Math.max(220, cta.length * 19 + 96); return `<rect x="${P}" y="${y}" width="${w}" height="84" rx="42" fill="${bg}"/>` + textBlock([cta], P + w / 2, y + 53, 32, fg, 700, 1, 'middle'); };
  if (tpl === 'sale') {
    parts.push(`<rect width="${S}" height="${S}" fill="${T.ink}"/>`, `<circle cx="${S - 150}" cy="210" r="340" fill="${accent}" opacity="0.10"/>`, brandRow(T.cream));
    if (badge) parts.push(`<circle cx="${S - P - 130}" cy="${P + 150}" r="130" fill="${accent}"/>`, textBlock(wrap(badge, 64, 200, 2), S - P - 130, P + 150 + (badge.length > 8 ? -8 : 22), 64, T.ink, 800, 1, 'middle'));
    const hl = wrap(headline, 104, S - 2 * P, 3);
    parts.push(textBlock(hl, P, 520, 104, T.cream, 800, 1.02));
    const y = 520 + hl.length * 106;
    if (sub) parts.push(textBlock(wrap(sub, 36, S - 2 * P, 2), P, y + 10, 36, T.sand, 400, 1.3));
    parts.push(ctaPill(S - P - 84 - (foot ? 40 : 0), accent, T.ink));
    if (foot) parts.push(textBlock([foot], P, S - P + 4, 22, T.muted, 400));
  } else if (tpl === 'launch') {
    parts.push(`<rect width="${S}" height="${S}" fill="${T.cream}"/>`, `<rect x="${S - 330}" y="0" width="330" height="${S}" fill="${accent}"/>`, `<circle cx="${S - 330}" cy="${S / 2}" r="190" fill="${T.ink}"/>`, brandRow(T.ink));
    if (badge) parts.push(textBlock([badge.toUpperCase()], S - 330, S / 2 + 14, 40, T.cream, 800, 1, 'middle'));
    const hl = wrap(headline, 84, 520, 4);
    parts.push(textBlock(hl, P, 330, 84, T.ink, 800, 1.04));
    if (sub) parts.push(textBlock(wrap(sub, 32, 520, 3), P, 330 + hl.length * 88 + 30, 32, T.muted, 400, 1.35));
    parts.push(ctaPill(S - P - 84 - (foot ? 40 : 0), T.ink, T.cream));
    if (foot) parts.push(textBlock([foot], P, S - P + 4, 22, T.muted, 400));
  } else if (tpl === 'quote') {
    parts.push(`<rect width="${S}" height="${S}" fill="${T.sand}"/>`, brandRow(T.ink), textBlock(['“'], P - 8, 380, 280, accent, 800));
    const hl = wrap(headline, 64, S - 2 * P, 5);
    parts.push(textBlock(hl, P, 420, 64, T.ink, 700, 1.18));
    if (sub) parts.push(`<rect x="${P}" y="${420 + hl.length * 76 + 20}" width="60" height="5" fill="${accent}"/>`, textBlock(['— ' + sub], P, 420 + hl.length * 76 + 80, 30, T.muted, 500));
    parts.push(ctaPill(S - P - 84, T.ink, T.cream));
  } else fail('banner template must be sale | launch | quote');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${parts.join('')}</svg>`;
}

export async function buildBanner(spec) {
  const svg = bannerSvg(spec);
  return { svg, png: await sharp(Buffer.from(svg)).png().toBuffer() };
}
