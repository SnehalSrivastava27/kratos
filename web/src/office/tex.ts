// Canvas-painted textures: one draw call buys a whole chart wall / floor plan / map. No image assets to load.
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { PersonState } from './officeState';
import { C, roster } from './data';

type G = CanvasRenderingContext2D;
export const FONT = `Nunito, ui-rounded, 'SF Pro Rounded', system-ui, sans-serif`;

export function paint(w: number, h: number, draw: (g: G, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** Re-paint an existing canvas texture in place. */
export function repaint(t: CanvasTexture, draw: (g: G, w: number, h: number) => void) {
  const c = t.image as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  draw(g, c.width, c.height);
  t.needsUpdate = true;
}

const rr = (g: G, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
};
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
// tiny deterministic rng so textures look the same every load
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);




/** Three dashboard panels for the data wall. */
export function chartsTex() {
  return paint(1536, 384, (g, W, H) => {
    g.fillStyle = '#0E0A18';
    g.fillRect(0, 0, W, H);
    const panel = (i: number, title: string, col: string, body: (x: number, y: number, w: number, h: number) => void) => {
      const x = i * 512 + 14, y = 14, w = 484, h = H - 28;
      g.fillStyle = '#17112A'; rr(g, x, y, w, h, 18); g.fill();
      g.strokeStyle = rgba(col, 0.5); g.lineWidth = 2; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = `700 26px ${FONT}`; g.fillText(title, x + 22, y + 42);
      g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 16;
      body(x + 22, y + 70, w - 44, h - 92);
      g.shadowBlur = 0;
    };
    panel(0, 'Units / SKU · forecast', '#60A5FA', (x, y, w, h) => {
      [0.55, 0.95, 0.42, 0.7, 0.3].forEach((v, k) => { rr(g, x + k * (w / 5) + 10, y + h * (1 - v), w / 5 - 24, h * v, 8); g.fill(); });
    });
    panel(1, 'Daily run-rate', C.mint, (x, y, w, h) => {
      g.strokeStyle = C.mint; g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath();
      [0.3, 0.38, 0.33, 0.5, 0.46, 0.62, 0.58, 0.8, 0.92].forEach((v, k, a) => g.lineTo(x + (k / (a.length - 1)) * w, y + h * (1 - v)));
      g.stroke();
    });
    panel(2, 'Channel split', C.saffron, (x, y, w, h) => {
      const cx = x + h / 2 + 10, cy = y + h / 2, R = h / 2;
      [[0.46, C.saffron], [0.3, '#DB2777'], [0.24, '#60A5FA']].reduce((a0, [f, c]) => {
        g.strokeStyle = c as string; g.shadowColor = c as string; g.lineWidth = 30; g.beginPath();
        g.arc(cx, cy, R - 16, a0, a0 + (f as number) * Math.PI * 2 - 0.06); g.stroke();
        return a0 + (f as number) * Math.PI * 2;
      }, -Math.PI / 2);
      g.shadowBlur = 0; g.font = `600 24px ${FONT}`;
      ['D2C site 46%', 'Marketplaces 30%', 'Quick-comm 24%'].forEach((s, k) => {
        g.fillStyle = [C.saffron, '#DB2777', '#60A5FA'][k]; g.fillRect(x + h + 40, y + 30 + k * 50, 16, 16);
        g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(s, x + h + 66, y + 46 + k * 50);
      });
    });
  });
}

/** Generic monitor UI, white-ish so per-instance colour tints it. */
export function screenTex() {
  return paint(256, 160, (g, W, H) => {
    g.fillStyle = '#5a5a6a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) { g.globalAlpha = 0.5 + (i % 3) * 0.15; g.fillRect(16, 18 + i * 14, 40 + ((i * 53) % 90), 6); }
    g.globalAlpha = 0.9;
    [0.4, 0.7, 0.5, 0.9, 0.65].forEach((v, k) => g.fillRect(150 + k * 18, H - 20 - v * 80, 12, v * 80));
    g.globalAlpha = 1;
  });
}


export function neonTex(text: string, col: string) {
  return paint(640, 128, (g, W, H) => {
    g.font = `800 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 26; g.fillStyle = col;
    g.fillText(text, W / 2, H / 2 + 4); g.fillText(text, W / 2, H / 2 + 4);
    g.shadowBlur = 0; g.fillStyle = '#F2FEFF'; g.fillText(text, W / 2, H / 2 + 4);
  });
}

// Very rough India outline (lon, lat).
const INDIA: [number, number][] = [
  [74.5, 37], [77.8, 35.5], [79, 34.3], [78.8, 32.5], [81, 30.2], [84, 28.6], [88.2, 27.9], [88.8, 27.3], [92, 27.8], [95, 29.2],
  [97.4, 28.2], [96, 27.3], [95.2, 26], [94.6, 24.6], [93.3, 23.9], [92.5, 22.2], [91.6, 23.5], [89.6, 25.9], [88.6, 24.3],
  [88.9, 21.7], [87, 21.4], [85.5, 20], [84, 18.3], [82.3, 16.6], [80.3, 15.6], [80.2, 13.4], [79.8, 11], [79.3, 10.3], [78.2, 8.9],
  [77.5, 8.1], [76.5, 8.9], [75.9, 11.3], [74.8, 12.9], [74.1, 14.8], [73.4, 16.4], [72.8, 19], [72.6, 21.2], [70.4, 20.9], [69, 22.3],
  [68.2, 23.6], [69.6, 24.3], [71, 24.4], [70, 25.7], [70.6, 27.9], [72, 28.6], [73.4, 29.9], [74.4, 30.9], [74.6, 32.5], [73.8, 34.3],
];
export const MAP = { lon: [66, 99], lat: [6, 38] } as const;
export const CITIES = { Delhi: [77.2, 28.6], Mumbai: [72.9, 19.1], Bengaluru: [77.6, 13] } as const;
/** lon/lat → 0..1 board coords (u right, v up) */
export const uv = ([lon, lat]: readonly [number, number]) =>
  [(lon - MAP.lon[0]) / (MAP.lon[1] - MAP.lon[0]), (lat - MAP.lat[0]) / (MAP.lat[1] - MAP.lat[0])] as const;

export function indiaTex() {
  return paint(512, 512, (g, W, H) => {
    g.fillStyle = '#0F1424'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(96,165,250,0.08)'; g.lineWidth = 1;
    for (let i = 0; i < W; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
    g.beginPath();
    INDIA.forEach((p) => { const [u, v] = uv(p); g.lineTo(u * W, (1 - v) * H); });
    g.closePath();
    g.fillStyle = 'rgba(5,150,105,0.28)'; g.fill();
    g.shadowColor = C.mint; g.shadowBlur = 14; g.strokeStyle = 'rgba(60,203,139,0.9)'; g.lineWidth = 4; g.stroke();
    g.shadowBlur = 0; g.font = `700 22px ${FONT}`; g.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [name, ll] of Object.entries(CITIES)) { const [u, v] = uv(ll); g.fillText(name, u * W + 16, (1 - v) * H + 7); }
    g.font = `800 24px ${FONT}`; g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillText('WAREHOUSES', 20, 36);
  });
}

const BANNER_BG = [['#F4A300', '#DB2777'], ['#7C3AED', '#22D3EE'], ['#059669', '#F4A300'], ['#DB2777', '#7C3AED']];
export function bannerTex(title: string, i: number) {
  return paint(360, 450, (g, W, H) => {
    const [a, b] = BANNER_BG[i % BANNER_BG.length];
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(W * 0.78, H * 0.3, 110, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = `900 64px ${FONT}`; g.fillText('30%', 28, 120); g.fillText('OFF', 28, 186);
    g.font = `700 30px ${FONT}`;
    const words = title.split(' '); let line = '', y = H - 120;
    for (const wd of words) { if (g.measureText(line + wd).width > W - 56) { g.fillText(line, 28, y); y += 36; line = ''; } line += wd + ' '; }
    g.fillText(line, 28, y);
    g.font = `800 20px ${FONT}`; g.globalAlpha = 0.8; g.fillText('KESAR & CO.', 28, 40); g.globalAlpha = 1;
  });
}

export function polaroidTex() {
  return paint(512, 320, (g, W, H) => {
    g.fillStyle = '#3A2A22'; g.fillRect(0, 0, W, H);
    const r = rng(3);
    const cols = ['#F4A300', '#DB2777', '#60A5FA', C.mint, '#9333EA', '#F59E0B'];
    for (let i = 0; i < 6; i++) {
      g.save(); g.translate(60 + (i % 3) * 150 + r() * 20, 70 + Math.floor(i / 3) * 150); g.rotate((r() - 0.5) * 0.3);
      g.fillStyle = '#F7F1E8'; g.fillRect(-50, -55, 100, 118);
      g.fillStyle = cols[i]; g.fillRect(-42, -47, 84, 80);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(0, -12, 18, 0, 7); g.fill();
      g.restore();
    }
  });
}

const ST: Record<string, [string, string]> = {
  idle: ['Not started', 'rgba(255,255,255,.45)'], working: ['Working…', C.saffron], walking: ['On the move', '#A78BFA'],
  waiting: ['Blocked', C.red], done: ['Done ✓', C.mint],
};
/** War-room big screen: the live sale plan, checklist driven by agent states. */
export function drawWarScreen(g: G, W: number, H: number, people: Record<string, PersonState>, ebitda: number | null, shipped: boolean) {
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1B1030'); bg.addColorStop(1, '#0D0A18');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = C.saffron; g.font = `800 44px ${FONT}`; g.fillText('Festive Sale', 40, 70);
  g.fillStyle = 'rgba(255,255,255,.6)'; g.font = `600 24px ${FONT}`; g.fillText('30% off · 5 days · ₹5L marketing', 40, 108);
  const agents = roster.filter((p) => p.kind === 'agent' && p.id !== 'd2c-captain');
  agents.forEach((p, i) => {
    const y = 160 + i * 52, s = people[p.id];
    const [label, col] = ST[s?.state ?? 'idle'];
    g.fillStyle = 'rgba(255,255,255,.06)'; rr(g, 34, y - 34, 560, 44, 12); g.fill();
    g.fillStyle = '#fff'; g.font = `600 26px ${FONT}`; g.fillText(`${p.emoji}  ${p.name}`, 50, y - 3);
    g.fillStyle = col; g.beginPath(); g.arc(430, y - 12, 8, 0, 7); g.fill();
    g.font = `700 22px ${FONT}`; g.fillText(label, 448, y - 4);
  });
  const ex = 650;
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `700 22px ${FONT}`; g.fillText('EBITDA', ex, 160);
  g.fillStyle = ebitda == null ? 'rgba(255,255,255,.35)' : ebitda < 0 ? C.red : C.mint;
  g.font = `800 64px ${FONT}`;
  g.fillText(ebitda == null ? '—' : `${ebitda < 0 ? '−' : '+'}₹${(Math.abs(ebitda) / 1e5).toFixed(2)}L`, ex, 230);
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `700 22px ${FONT}`; g.fillText('Founder sign-off', ex, 320);
  g.fillStyle = shipped ? C.mint : 'rgba(255,255,255,.35)'; g.font = `800 40px ${FONT}`;
  g.fillText(shipped ? 'Approved 🚀' : 'Pending', ex, 370);
}
