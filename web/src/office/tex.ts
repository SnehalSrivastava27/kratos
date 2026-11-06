// Canvas-painted textures: one draw call buys a whole chart wall / floor plan / map. No image assets to load.
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { PersonState } from './officeState';
import type { OfficeEvent } from '../shared/types';
import { C, ROOMS, TG_GROUP, personById, plain, roster } from './data';

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




/** The finance cabin's ledger screen: a month's P&L with an EBITDA line (made-up numbers, ₹ lakh). */
export function ledgerTex() {
  return paint(640, 400, (g, W, H) => {
    g.fillStyle = '#0B1F1D'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#5EEAD4'; g.font = `800 34px ${FONT}`; g.fillText('P&L · last month', 30, 54);
    const rows: [string, string, string][] = [['Net revenue', '₹48.2L', '#fff'], ['COGS', '−₹17.9L', 'rgba(255,255,255,.7)'], ['Marketing', '−₹14.6L', 'rgba(255,255,255,.7)'], ['Fulfilment', '−₹6.1L', 'rgba(255,255,255,.7)'], ['EBITDA', '₹4.3L', C.mint]];
    rows.forEach(([k, v, col], i) => {
      const y = 112 + i * 54;
      if (i === rows.length - 1) { g.fillStyle = 'rgba(94,234,212,.35)'; g.fillRect(30, y - 38, W - 60, 2); }
      g.fillStyle = col; g.font = `${i === rows.length - 1 ? 900 : 700} 30px ${FONT}`; g.fillText(k, 30, y);
      g.textAlign = 'right'; g.fillText(v, W - 30, y); g.textAlign = 'left';
    });
    g.fillStyle = 'rgba(255,255,255,.45)'; g.font = `600 20px ${FONT}`; g.fillText('EBITDA 8.9% · cash runway 14 mo', 30, H - 22);
  });
}

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
    g.fillStyle = '#2b2d42'; g.fillRect(0, 0, W, H);
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
export function drawWarScreen(g: G, W: number, H: number, people: Record<string, PersonState>, shipped: boolean) {
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1B1030'); bg.addColorStop(1, '#0D0A18');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = C.saffron; g.font = `800 44px ${FONT}`; g.fillText('Festive Sale', 40, 70);
  g.fillStyle = 'rgba(255,255,255,.6)'; g.font = `600 24px ${FONT}`; g.fillText('30% off · 5 days · ₹5L marketing', 40, 108);
  const agents = roster.filter((p) => p.kind === 'agent' && p.lead && p.id !== 'd2c-captain').slice(0, 6); // the department leads (their teams sit behind them)
  agents.forEach((p, i) => {
    const y = 170 + i * 58, s = people[p.id];
    const [label, col] = ST[s?.state ?? 'idle'];
    g.fillStyle = 'rgba(255,255,255,.06)'; rr(g, 34, y - 36, 600, 48, 12); g.fill();
    g.fillStyle = '#fff'; g.font = `600 27px ${FONT}`; g.fillText(`${p.emoji}  ${p.name}`, 50, y - 3);
    g.fillStyle = col; g.beginPath(); g.arc(440, y - 12, 9, 0, 7); g.fill();
    g.font = `700 24px ${FONT}`; g.fillText(label, 460, y - 3);
  });
  const done = agents.filter((p) => people[p.id]?.state === 'done').length;
  const ex = 690;
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `700 22px ${FONT}`; g.fillText('Team progress', ex, 160);
  g.fillStyle = 'rgba(255,255,255,.12)'; rr(g, ex, 180, 290, 22, 11); g.fill();
  g.fillStyle = C.mint; rr(g, ex, 180, Math.max(22, (290 * done) / agents.length), 22, 11); g.fill();
  g.fillStyle = '#fff'; g.font = `800 40px ${FONT}`; g.fillText(`${done}/${agents.length}`, ex, 250);
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `700 22px ${FONT}`; g.fillText('Founder sign-off', ex, 330);
  g.fillStyle = shipped ? C.mint : 'rgba(255,255,255,.35)'; g.font = `800 40px ${FONT}`;
  g.fillText(shipped ? 'Approved 🚀' : 'Pending', ex, 380);
}

const TOPIC_ICON: Record<string, string> = { war_room: '🎯', analytics: '📊', ads: '📣', creators: '⭐', ops: '📦', design: '🎨', finance: '💰' };
const wrapText = (g: G, text: string, maxW: number, maxLines: number) => {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const next = line ? `${line} ${w}` : w;
      if (g.measureText(next).width > maxW && line) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] += '…'; }
  return out;
};
/** The Telegram Hub wall: Telegram Desktop, light theme — the supergroup's topics and the latest thread. */
export function drawTelegramWall(g: G, W: number, H: number, events: OfficeEvent[]) {
  const LW = 440;
  g.fillStyle = '#fff'; g.fillRect(0, 0, LW, H);
  g.fillStyle = '#F1F1F4'; g.fillRect(LW, 0, 2, H);
  // group header
  g.fillStyle = C.tg; g.beginPath(); g.arc(44, 42, 24, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = `800 24px ${FONT}`; g.textAlign = 'center'; g.fillText('K', 44, 51); g.textAlign = 'left';
  g.fillStyle = '#000'; g.font = `800 26px ${FONT}`; g.fillText(TG_GROUP, 82, 40);
  g.fillStyle = '#8E9AA6'; g.font = `600 18px ${FONT}`; g.fillText(`${ROOMS.length} topics · ${roster.length} members`, 82, 64);
  const last: Record<string, OfficeEvent> = {}, count: Record<string, number> = {};
  for (const e of events) { last[e.room] = e; count[e.room] = (count[e.room] ?? 0) + 1; }
  const active = events[events.length - 1]?.room ?? 'war_room';
  const RH = Math.min(68, Math.floor((H - 92) / ROOMS.length)); // 7 topics still fit the wall
  ROOMS.forEach((r, i) => {
    const y = 88 + i * RH, m = RH / 2;
    if (r.id === active) { g.fillStyle = C.tg; rr(g, 8, y, LW - 16, RH - 4, 12); g.fill(); }
    const on = r.id === active;
    g.font = `400 30px ${FONT}`; g.fillText(TOPIC_ICON[r.id] ?? '#', 22, y + m + 9);
    g.fillStyle = on ? '#fff' : '#000'; g.font = `800 22px ${FONT}`; g.fillText(r.topic, 72, y + m - 6);
    const e = last[r.id];
    g.fillStyle = on ? 'rgba(255,255,255,.85)' : '#707579'; g.font = `600 17px ${FONT}`;
    const prev = e ? `${personById[e.speaker]?.name ?? ''}: ${plain(e.text).replace(/\n+/g, ' ')}` : 'No messages yet';
    g.fillText(prev.length > 34 ? prev.slice(0, 33) + '…' : prev, 72, y + m + 18);
    if (count[r.id] && !on) {
      g.fillStyle = C.tg; rr(g, LW - 62, y + m - 15, 40, 26, 13); g.fill();
      g.fillStyle = '#fff'; g.font = `800 16px ${FONT}`; g.textAlign = 'center'; g.fillText(String(count[r.id]), LW - 42, y + m + 4); g.textAlign = 'left';
    }
  });
  // thread
  const wall = g.createLinearGradient(LW, 0, W, H); wall.addColorStop(0, '#D5E6B5'); wall.addColorStop(1, '#8DBFA3');
  g.fillStyle = wall; g.fillRect(LW + 2, 0, W - LW, H);
  g.fillStyle = '#fff'; g.fillRect(LW + 2, 0, W - LW, 70);
  g.fillStyle = '#000'; g.font = `800 26px ${FONT}`;
  const room = ROOMS.find((r) => r.id === active);
  g.fillText(`${TOPIC_ICON[active] ?? ''} ${room?.topic ?? ''}`, LW + 26, 34);
  g.fillStyle = C.tg; g.font = `600 18px ${FONT}`; g.fillText(TG_GROUP, LW + 26, 58);
  let y = H - 16;
  const thread = events.filter((e) => e.room === active);
  for (const e of [...thread].reverse()) {
    const mine = personById[e.speaker]?.kind === 'human';
    g.font = `600 20px ${FONT}`;
    const lines = wrapText(g, plain(e.text), 520, 4);
    const h = 44 + lines.length * 26;
    y -= h + 10;
    if (y < 80) break;
    const bw = 580, x = mine ? W - bw - 24 : LW + 24;
    g.fillStyle = mine ? '#EEFFDE' : '#fff'; rr(g, x, y, bw, h, 18); g.fill();
    const p = personById[e.speaker];
    g.fillStyle = mine ? '#4FAE4E' : p?.color ?? C.tg; g.font = `800 20px ${FONT}`;
    g.fillText(mine ? 'Founder' : `${p?.emoji ?? ''} ${p?.name ?? ''}`, x + 16, y + 28);
    g.fillStyle = '#000'; g.font = `600 20px ${FONT}`;
    lines.forEach((l, i) => g.fillText(l, x + 16, y + 56 + i * 26));
  }
}
