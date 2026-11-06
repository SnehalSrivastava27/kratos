// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/world/library.ts: the tall wooden bookcase (back, sides, shelves between), books of
// made-up heights and widths packed along every shelf, the odd gap, and a sign on top. Here there are
// two rows of cases, one section per department, and the books are the real installed skills from
// /api/library: one instanced spine each (one draw call for all of them), a "+N more" plaque when a
// shelf holds more than fits.
import * as THREE from 'three';
import type { Library, LibraryBook, ShelfId } from '../../shared/types';
import { FONT, paint } from '../tex';
import { disposeTree, mergeByMaterial, mesh, noOutline, toon } from '../toon';
import type { Rect } from './nav';

const SPINES = ['#ef476f', '#118ab2', '#06d6a0', '#ffd166', '#9d4edd', '#ff8a5b', '#2b2d42', '#e9d8a6', '#457b9d', '#f4a261'];
const T = 0.05; // board thickness
const D = 0.45; // case depth
export const SHELF_LABEL: Record<ShelfId, string> = {
  war_room: '🎯 War Room', analytics: '📊 Analytics', ads: '📣 Ads', creators: '⭐ Creators',
  ops: '📦 Ops', design: '🎨 Design', engineering: '🛠️ Engineering', general: '📚 General',
};
/** Two rows facing the room (+z): against the back wall, and a freestanding row with an aisle behind it. */
const ROWS: { x: number; z: number; w: number; h: number; levels: number; shelves: ShelfId[] }[] = [
  { x: -15.1, z: -7.75, w: 1.35, h: 2.4, levels: 5, shelves: ['war_room', 'analytics', 'ads', 'creators'] },
  { x: -15.0, z: -4.7, w: 1.05, h: 1.9, levels: 4, shelves: ['ops', 'design', 'engineering', 'general'] },
];
interface Section { id: ShelfId; x: number; z: number; w: number; h: number; levels: number }
export const SECTIONS: Section[] = ROWS.flatMap((r) =>
  r.shelves.map((id, i) => ({ id, x: r.x + (i - (r.shelves.length - 1) / 2) * r.w, z: r.z, w: r.w, h: r.h, levels: r.levels })),
);
/** The cases' footprints, for walking round them. */
export const BOOKCASE_SOLIDS: Rect[] = ROWS.map((r) => {
  const half = (r.w * r.shelves.length) / 2;
  return { minX: r.x - half, maxX: r.x + half, minZ: r.z - D / 2, maxZ: r.z + D / 2 };
});
/** Where to stand to browse a section (in front of it). */
export const browseSpot = (s: Section): [number, number] => [s.x, s.z + D / 2 + 0.75];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};

/** An ink-outlined paper sign (textPlane in agent-office's toon.ts). */
function sign(text: string, size: number, scale: number, maxW = Infinity) {
  const c = document.createElement('canvas').getContext('2d')!;
  c.font = `900 ${size}px ${FONT}`;
  const w = Math.ceil(c.measureText(text).width) + size * 1.1, h = Math.ceil(size * 1.6);
  const tex = paint(w, h, (g) => {
    g.font = `900 ${size}px ${FONT}`;
    g.fillStyle = '#fffaf3'; g.strokeStyle = '#2b2d42'; g.lineWidth = 6;
    g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 16); g.fill(); g.stroke();
    g.fillStyle = '#2b2d42'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
  scale = Math.min(scale, maxW / w); // never wider than its section
  return new THREE.Mesh(new THREE.PlaneGeometry(w * scale, h * scale), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
}

export class Bookcases {
  readonly group = new THREE.Group();
  private spines: THREE.InstancedMesh;
  private books: LibraryBook[] = []; // by instance id
  private extras = new THREE.Group(); // "+N more" plaques, rebuilt with the books
  private key = '';
  get shown() {
    return this.spines.count;
  }

  constructor() {
    const wood = toon('#8b5e3c');
    const frame = new THREE.Group();
    for (const s of SECTIONS) {
      const g = new THREE.Group();
      g.position.set(s.x, 0, s.z);
      g.add(mesh(new THREE.BoxGeometry(s.w, s.h, T), wood, 0, s.h / 2, -D / 2 + T / 2));
      for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(T, s.h, D), wood, sx * (s.w / 2 - T / 2), s.h / 2, 0));
      const gap = (s.h - T) / s.levels;
      for (let i = 0; i <= s.levels; i++) g.add(mesh(new THREE.BoxGeometry(s.w, T, D), wood, 0, i * gap + T / 2, 0, false));
      frame.add(g);
      const label = sign(SHELF_LABEL[s.id], 44, 0.0058, s.w - 0.06);
      label.position.set(s.x, s.h + 0.2, s.z + 0.05);
      this.group.add(label);
    }
    this.group.add(mergeByMaterial(frame));
    // Every spine slot there is room for; unused ones are hidden by count.
    let max = 0;
    for (const s of SECTIONS) max += this.capacity(s);
    this.spines = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon('#ffffff'), max);
    this.spines.count = 0;
    this.spines.castShadow = true;
    this.group.add(this.spines, this.extras);
    noOutline(this.group);
  }

  private capacity(s: Section) {
    return Math.floor((s.w - 2 * T - 0.04) / 0.072) * s.levels;
  }

  /** Re-shelves the books when the library changes (counts, or which book is where). */
  sync(lib: Library | null) {
    const key = lib?.shelves.map((s) => s.id + ':' + s.books.map((b) => b.id).join(',')).join('|') ?? '';
    if (key === this.key) return;
    this.key = key;
    disposeTree(this.extras);
    this.extras.clear();
    this.books = [];
    const m = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0;
    for (const s of SECTIONS) {
      const all = lib?.shelves.find((sh) => sh.id === s.id)?.books ?? [];
      const cap = this.capacity(s);
      const shown = all.length > cap ? all.slice(0, cap - 3) : all; // room for the plaque
      const gap = (s.h - T) / s.levels;
      let level = 0, at = -s.w / 2 + T + 0.02;
      for (const b of shown) {
        const r = hash(b.id);
        const bw = 0.05 + r * 0.03;
        if (at + bw > s.w / 2 - T - 0.02) {
          level++;
          at = -s.w / 2 + T + 0.02;
        }
        if (level >= s.levels) break;
        const bh = gap * (0.62 + hash(b.id + 'h') * 0.3);
        const bd = D * (0.7 + r * 0.2);
        m.makeScale(bw, bh, bd).setPosition(s.x + at + bw / 2, level * gap + T + bh / 2, s.z + D / 2 - bd / 2 - 0.02);
        this.spines.setMatrixAt(n, m);
        this.spines.setColorAt(n, col.set(SPINES[Math.floor(hash(b.id + 'c') * SPINES.length)]));
        this.books[n++] = b;
        at += bw + 0.004;
      }
      const more = all.length - shown.length;
      if (more > 0) {
        const p = sign(`+${more} more`, 40, 0.0042);
        p.position.set(s.x + s.w / 2 - T - 0.22, T + gap * 0.3, s.z + D / 2 + 0.01);
        this.extras.add(p);
      } else if (!all.length) {
        const p = sign('empty', 34, 0.004);
        p.position.set(s.x, T + gap * 0.4, s.z + D / 2 + 0.01);
        this.extras.add(p);
      }
    }
    this.spines.count = n;
    this.spines.instanceMatrix.needsUpdate = true;
    if (this.spines.instanceColor) this.spines.instanceColor.needsUpdate = true;
    this.spines.computeBoundingSphere();
  }

  /** The book under the ray, if any (for the hover title). */
  bookAt(ray: THREE.Raycaster): LibraryBook | null {
    if (!this.spines.count) return null;
    const hit = ray.intersectObject(this.spines, false)[0];
    return hit?.instanceId !== undefined ? this.books[hit.instanceId] ?? null : null;
  }

  dispose() {
    disposeTree(this.group);
    this.spines.geometry.dispose();
    this.spines.dispose();
  }
}
