// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/world/office.ts (buildOffice, buildDesk, chair, wallBoard, glassPane, paintPlanks): the office shell and furniture, laid out on our zones (contracts/zones.json), built
// once and merged by colour into a handful of draw calls. Every solid piece leaves a footprint
// (office.ts Collider) that the people's paths go round.
import * as THREE from 'three';
import { C, DESKS, zoneById, zoneColor, zones } from '../data';
import { BOOKCASE_SOLIDS } from './library';
import { mergeByColor, mesh, noOutline, roundedBox, toon, toonUnique } from '../toon';
import { piece, plant, type Models } from './models';
import { FONT, chartsTex, neonTex, paint, polaroidTex } from '../tex';
import type { Rect } from './nav';

export const PAL = {
  wall: '#fff6ea', trim: '#e8a87c', floor: '#f2d7b0', floorAlt: '#e9c89a', seam: '#d9b88c',
  desk: '#f7f3ea', deskLeg: '#8d99ae', ink: '#2b2d42', wood: '#c98b5a', cork: '#d8a86a',
  chairs: ['#ff8a5b', '#5bc0eb', '#9bc53d', '#b388eb', '#ffb400', '#f7aef8'],
};
export const DESK_SIZE = { w: 1.8, d: 0.9, h: 0.78 };
/** leftX: the old west wall, now the inner wall with two doorways into the west wing (library, open desks); outerX: the new west wall. */
export const WALL = { h: 2.6, t: 0.3, backZ: -8.15, leftX: -12.15, outerX: -18.15 };
const DOORS: [number, number][] = [[-6.6, -5.0], [2.0, 3.6]]; // z spans of the inner wall's doorways
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Chunky planks (materials.ts paintPlanks). */
function planks(w: number, d: number) {
  const t = paint(512, 512, (g) => {
    g.fillStyle = PAL.floor;
    g.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++) {
      const offset = (row % 2) * 128;
      for (let col = -1; col < 3; col++) {
        g.fillStyle = (row + col) % 3 === 0 ? PAL.floorAlt : PAL.floor;
        g.fillRect(col * 256 + offset + 2, row * 64 + 2, 252, 60);
      }
      g.fillStyle = PAL.seam;
      g.fillRect(0, row * 64, 512, 3);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 6, d / 6);
  return t;
}

/** seats.ts chair(): rounded seat and back on a five-star base. */
function chair(color: string) {
  const g = new THREE.Group();
  const mat = toon(color);
  g.add(mesh(roundedBox(0.62, 0.1, 0.58, 0.12), mat, 0, 0.5, 0));
  const back = mesh(roundedBox(0.62, 0.1, 0.6, 0.12), mat, 0, 0.86, 0.27);
  back.rotation.x = Math.PI / 2 - 0.12;
  g.add(back);
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8), toon(PAL.ink), 0, 0.26, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = mesh(box(0.05, 0.04, 0.32), toon(PAL.ink), Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15);
    leg.rotation.y = a;
    g.add(leg);
  }
  return g;
}

/** Monitor slots per desk (x offsets): the growth pod runs two screens. */
export const MONITORS: Record<string, number[]> = { 'growth_pod#0': [-0.42, 0.42] };
export const monitorXs = (deskId: string) => MONITORS[deskId] ?? [0];
export const MONITOR = { y: DESK_SIZE.h + 0.42, z: -0.2, w: 0.78, h: 0.46 };

/** seats.ts buildDesk(): top, legs, a modesty panel in the team colour, a knick-knack, monitor frame(s) and a chair. */
function desk(m: Models, zoneId: string, i: number, deskId: string) {
  const g = new THREE.Group();
  const { w, d, h } = DESK_SIZE;
  g.add(mesh(roundedBox(w - 0.06, 0.08, d - 0.04, 0.08), toon(PAL.desk), 0, h - 0.04, 0));
  const leg = toon(PAL.deskLeg);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, h - 0.08, 8), leg, sx * (w / 2 - 0.14), (h - 0.08) / 2, sz * (d / 2 - 0.12)));
  g.add(mesh(box(w - 0.3, 0.32, 0.03), toon(zoneColor(zoneId)), 0, h - 0.26, -d / 2 + 0.06));
  for (const x of monitorXs(deskId)) {
    g.add(mesh(roundedBox(MONITOR.w + 0.08, MONITOR.h + 0.08, 0.06, 0.04).rotateX(Math.PI / 2), toon(PAL.ink), x, MONITOR.y, MONITOR.z - 0.04));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), toon(PAL.ink), x, h + 0.1, MONITOR.z - 0.06));
    g.add(mesh(roundedBox(0.3, 0.03, 0.18, 0.06), toon(PAL.ink), x, h + 0.015, MONITOR.z - 0.06));
  }
  g.add(mesh(roundedBox(0.5, 0.025, 0.16, 0.04), toon('#e9ecef'), 0, h + 0.012, 0.15)); // keyboard
  const deco = i % 3 === 0 ? piece(m.desk_props, 'mug', { Mug: PAL.chairs[i % 6] }) : i % 3 === 1 ? plant(m, 'succulent') : piece(m.desk_props, ['books_upright', 'books_leaning', 'books_stack'][i % 3]);
  deco.position.set(i % 3 === 1 ? -w / 2 + 0.25 : w / 2 - 0.26, h, -0.25);
  g.add(deco);
  return g;
}

/** A framed board facing +z; the face gets a canvas texture. (props.ts wallBoard) */
export function wallBoard(width: number, height: number, frameColor: string, face?: THREE.Texture) {
  const group = new THREE.Group();
  const frame = mesh(roundedBox(width + 0.3, 0.12, height + 0.3, 0.1), toon(frameColor), 0, 0, 0);
  frame.rotation.x = Math.PI / 2;
  group.add(frame);
  if (face) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: face, toneMapped: false }));
    f.position.z = 0.07;
    group.add(f);
  }
  return group;
}

/** A sheet of window glass with two cartoon glints (materials.ts glassPane, simplified). */
const GLASS = new THREE.MeshBasicMaterial({ color: '#d6f1ff', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
function glassWall(w: number, h: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.PlaneGeometry(w, h), GLASS, 0, h / 2 + 0.05, 0, false));
  const trim = toon(PAL.ink);
  g.add(mesh(roundedBox(w + 0.08, 0.08, 0.08, 0.03), trim, 0, h + 0.05, 0));
  g.add(mesh(roundedBox(w + 0.08, 0.08, 0.08, 0.03), trim, 0, 0.05, 0));
  for (const x of [-w / 2, w / 2]) g.add(mesh(box(0.08, h, 0.08), trim, x, h / 2 + 0.05, 0));
  return g;
}

/** A zone's name painted on the front of its rug: an ink-outlined paper pill lying flat (toon.ts textPlane, on the floor). */
function floorSign(text: string) {
  const size = 44;
  const c = document.createElement('canvas').getContext('2d')!;
  c.font = `900 ${size}px ${FONT}`;
  const w = Math.ceil(c.measureText(text).width) + size * 1.2, h = Math.ceil(size * 1.7);
  const tex = paint(w, h, (g) => {
    g.font = `900 ${size}px ${FONT}`;
    g.fillStyle = '#fffaf3'; g.strokeStyle = PAL.ink; g.lineWidth = 6;
    g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill(); g.stroke();
    g.fillStyle = PAL.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
  const S = 0.0062;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w * S, h * S), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.userData.w = w * S;
  return m;
}

let fontReady: Promise<void> | null = null;
/** Resolves once Nunito is in (or 2s pass), so canvas-painted signs use it. */
export function loadFont() {
  fontReady ??= Promise.race([document.fonts.load(`900 44px Nunito`).then(() => {}), new Promise<void>((r) => setTimeout(r, 2000))]);
  return fontReady;
}

function cardboard(s = 1) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.5 * s, 0.4 * s, 0.5 * s, 0.03), toon('#d4a373'), 0, 0.2 * s, 0));
  g.add(mesh(box(0.12 * s, 0.01, 0.51 * s), toon('#f1dca7'), 0, 0.4 * s + 0.005, 0));
  return g;
}

function buildOffice(m: Models, solids: Rect[], signs: boolean) {
  const root = new THREE.Group();
  const box3 = new THREE.Box3();
  /** Places `o`; a solid one leaves its footprint (shrunk by `inset`) for the paths to go round. */
  const add = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0, solid = false, inset = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = ry;
    root.add(o);
    if (solid) {
      o.updateMatrixWorld(true);
      box3.setFromObject(o);
      solids.push({ minX: box3.min.x + inset, maxX: box3.max.x - inset, minZ: box3.min.z + inset, maxZ: box3.max.z - inset });
    }
    return o;
  };

  // Shell: a slab, two walls with windows and a trim line, the floor's planks on top (textured, kept apart).
  const BW = 12.45 - (WALL.outerX - WALL.t / 2), BX = (12.45 + WALL.outerX - WALL.t / 2) / 2; // back wall spans the whole width
  add(mesh(roundedBox(BW + 0.2, 0.4, 16.8, 0.25), toon(PAL.trim)), BX, -0.21, 0);
  add(mesh(box(BW, WALL.h, WALL.t), toon(PAL.wall)), BX, WALL.h / 2, WALL.backZ);
  add(mesh(box(BW, 0.18, WALL.t + 0.04), toon(PAL.trim)), BX, 0.09, WALL.backZ);
  add(mesh(box(BW, 0.1, WALL.t + 0.06), toon(PAL.trim)), BX, WALL.h, WALL.backZ);
  /** A west-east wall from z0 to z1 at x (solid, so people go round it). */
  const sideWall = (x: number, z0: number, z1: number) => {
    const len = z1 - z0, mid = (z0 + z1) / 2;
    add(mesh(box(WALL.t, WALL.h, len), toon(PAL.wall)), x, WALL.h / 2, mid, 0, true);
    add(mesh(box(WALL.t + 0.04, 0.18, len), toon(PAL.trim)), x, 0.09, mid);
    add(mesh(box(WALL.t + 0.06, 0.1, len), toon(PAL.trim)), x, WALL.h, mid);
  };
  sideWall(WALL.outerX, -8.3, 8.3);
  // The inner wall: solid between its doorways, each doorway with a lintel over it.
  let z0 = -8.0;
  for (const [a, b] of DOORS) {
    sideWall(WALL.leftX, z0, a);
    add(mesh(box(WALL.t + 0.06, 0.5, b - a), toon(PAL.wall)), WALL.leftX, WALL.h - 0.25, (a + b) / 2);
    add(mesh(box(WALL.t + 0.1, 0.1, b - a + 0.1), toon(PAL.trim)), WALL.leftX, WALL.h - 0.5, (a + b) / 2);
    z0 = b;
  }
  sideWall(WALL.leftX, z0, 8.3);
  const sky = new THREE.MeshBasicMaterial({ color: '#cfeaff', toneMapped: false });
  const win = (w: number) => {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(w + 0.2, 0.08, 1.3, 0.08).rotateX(Math.PI / 2), toon('#ffffff'), 0, 0, 0));
    g.add(mesh(new THREE.PlaneGeometry(w, 1.1), sky, 0, 0, 0.045, false));
    g.add(mesh(box(0.06, 1.1, 0.04), toon('#ffffff'), 0, 0, 0.06));
    return g;
  };
  for (const x of [-4.5, 4]) add(win(2.6), x, 1.55, WALL.backZ + WALL.t / 2 + 0.01);
  for (const z of [-2.8]) add(win(2.0), WALL.leftX + WALL.t / 2 + 0.01, 1.55, z, Math.PI / 2);
  for (const z of [1.6, 5.6]) add(win(2.0), WALL.outerX + WALL.t / 2 + 0.01, 1.55, z, Math.PI / 2);

  // Zone rugs: soft rounded mats in a pastel of the team colour.
  for (const z of zones) {
    const col = '#' + new THREE.Color(zoneColor(z.id)).lerp(new THREE.Color('#ffffff'), 0.62).getHexString();
    add(mesh(roundedBox(z.w - 0.4, 0.04, z.d - 0.4, 0.35), toon(col)), z.x, 0.02, z.z);
    if (!signs) continue; // the landing hero: no stickers on the floor
    const sign = floorSign(z.label.toUpperCase());
    sign.position.set(z.x - z.w / 2 + 0.35 + sign.userData.w / 2, 0.05, z.z + z.d / 2 - 0.5);
    root.add(sign);
  }

  // Every desk slot (zones.json): owners' desks and the free ones hires can take (the captain runs the war-room table).
  DESKS.forEach((d, i) => {
    add(desk(m, d.zone, i, d.id), d.x, 0, d.z, 0, true);
    add(chair(PAL.chairs[i % PAL.chairs.length]), d.x, 0, d.z + 0.85); // the seat itself is walked into
  });
  // The library's bookcases are built live (engine/library.ts); their footprints are solid here.
  solids.push(...BOOKCASE_SOLIDS);
  const lib = zoneById.library;
  add(piece(m.lounge, 'pouf', { Cloth: '#9d4edd' }), lib.x - 1.9, 0, lib.z + 3.0, 0, true); // a reading pouf by the librarian
  // The front door: a mat at the open front edge, where new hires walk in.
  const mat = floorSign('WELCOME');
  mat.position.set(DOOR[0], 0.05, DOOR[1] - 0.15);
  if (signs) root.add(mat);

  // War room: glass cabin, wooden table, chairs either side, a stand for the big plan screen.
  const war = zoneById.war_room;
  const tbl = new THREE.Group();
  tbl.add(mesh(roundedBox(3.4, 0.1, 1.5, 0.35), toon(PAL.wood), 0, 0.76, 0));
  tbl.add(mesh(roundedBox(1.6, 0.7, 0.5, 0.2), toon(PAL.ink), 0, 0.36, 0));
  add(tbl, war.x, 0, war.z - 0.1, 0, true);
  for (const sx of [-1, 1]) for (const dz of [-0.4, 0.4]) add(chair(PAL.chairs[(sx + 1 + (dz > 0 ? 1 : 0)) % 6]), war.x + sx * 2.15, 0, war.z - 0.1 + dz, sx * -Math.PI / 2 + Math.PI, true);
  add(mesh(box(0.12, 1.0, 0.12), toon(PAL.ink)), war.x - 1.3, 0.5, war.z - 2.15, 0, true);
  add(mesh(box(0.12, 1.0, 0.12), toon(PAL.ink)), war.x + 1.3, 0.5, war.z - 2.15, 0, true);
  add(glassWall(4.6, 2.0), war.x - 3.4, 0, war.z, Math.PI / 2, true);
  add(glassWall(4.6, 2.0), war.x + 3.4, 0, war.z, Math.PI / 2, true);
  add(glassWall(2.4, 2.0), war.x - 2.2, 0, war.z + 2.35, 0, true);
  add(glassWall(2.4, 2.0), war.x + 2.2, 0, war.z + 2.35, 0, true);

  // Data wall: three dashboards on the back wall.
  add(wallBoard(5.2, 1.3, PAL.ink, chartsTex()), zoneById.data_wall.x, 1.55, WALL.backZ + WALL.t / 2 + 0.06);
  // Creator studio: ring light on a tripod, and a cork board of creator polaroids on the left wall.
  const cr = zoneById.creator_studio;
  const ring = new THREE.Group();
  ring.add(mesh(new THREE.TorusGeometry(0.36, 0.06, 10, 28), toon('#ffffff', { emissive: '#fff3d6' }), 0, 1.55, 0));
  ring.add(mesh(roundedBox(0.16, 0.3, 0.03, 0.03).rotateX(Math.PI / 2), toon(PAL.ink), 0, 1.55, 0.02));
  ring.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), toon(PAL.ink), 0, 0.75, 0));
  for (let k = 0; k < 3; k++) {
    const legM = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), toon(PAL.ink), Math.sin((k * 2 * Math.PI) / 3) * 0.14, 0.26, Math.cos((k * 2 * Math.PI) / 3) * 0.14);
    legM.rotation.set(Math.cos((k * 2 * Math.PI) / 3) * 0.45, 0, -Math.sin((k * 2 * Math.PI) / 3) * 0.45);
    ring.add(legM);
  }
  add(ring, cr.x + 1.4, 0, cr.z - 0.5, -0.5, true, 0.15);
  add(wallBoard(2.6, 1.5, PAL.wood, polaroidTex()), WALL.leftX + WALL.t / 2 + 0.06, 1.5, cr.z, Math.PI / 2);
  // Dispatch dock: stacked boxes and a roller conveyor.
  const dock = zoneById.dispatch_dock;
  add(cardboard(1.1), dock.x - 2.3, 0, dock.z - 1.35, 0, true);
  add(cardboard(1.1), dock.x - 1.7, 0, dock.z - 1.3, 0.3, true);
  add(cardboard(1), dock.x - 2.05, 0.44, dock.z - 1.3, -0.2);
  const belt = new THREE.Group();
  belt.add(mesh(roundedBox(3.4, 0.12, 0.7, 0.06), toon('#495057'), 0, 0.55, 0));
  belt.add(mesh(box(3.3, 0.02, 0.56), toon('#2b2d42'), 0, 0.62, 0));
  for (const x of [-1.5, 1.5]) for (const z of [-0.28, 0.28]) belt.add(mesh(box(0.08, 0.5, 0.08), toon(PAL.deskLeg), x, 0.25, z));
  add(belt, dock.x - 0.9, 0, dock.z + 0.9, 0, true);
  // Dark store: a shelf rack of quick-commerce stock under a "10-min delivery" sign.
  const ds = zoneById.dark_store;
  const rack = new THREE.Group();
  for (const x of [-1.05, 1.05]) rack.add(mesh(box(0.08, 1.7, 0.5), toon(PAL.ink), x, 0.85, 0));
  for (const y of [0.15, 0.65, 1.15, 1.62]) rack.add(mesh(box(2.2, 0.05, 0.5), toon('#adb5bd'), 0, y, 0));
  const stock = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f4a261', '#9d4edd'];
  for (let s = 0; s < 3; s++) for (let k = 0; k < 6; k++) rack.add(mesh(roundedBox(0.26, 0.3, 0.3, 0.05), toon(stock[(k + s * 2) % 6]), -0.82 + k * 0.33, 0.33 + s * 0.5, 0));
  add(rack, ds.x, 0, ds.z - 0.95, 0, true);
  add(wallBoard(2.3, 0.46, PAL.ink, neonTex('⚡ 10-MIN DELIVERY', C.saffron)), ds.x, 2.1, ds.z - 0.95);
  // Chai pantry: the kitchen counter + espresso machine + fridge, poufs to perch on.
  const chai = zoneById.chai_pantry;
  const kitchen = piece(m.kitchen);
  kitchen.scale.setScalar(0.62);
  add(kitchen, chai.x + 0.4, 0, chai.z - 1.05, 0, true);
  const pouf = (cloth: string) => {
    const p = piece(m.lounge, 'pouf', { Cloth: cloth });
    p.scale.setScalar(0.7);
    return p;
  };
  add(pouf('#ef476f'), chai.x + 1.6, 0, chai.z - 0.35, 0, true); // both on the right, clear of the idle slots along the front
  add(pouf('#06d6a0'), chai.x + 1.6, 0, chai.z + 0.6, 0, true);
  // Founder's corner: a sofa and coffee table beside the desk.
  const fd = zoneById.founder_desk;
  const sofa = (s: number) => {
    const p = piece(m.lounge, 'sofa');
    p.scale.setScalar(s);
    return p;
  };
  add(sofa(0.62), fd.x + 1.85, 0, fd.z + 0.2, -Math.PI / 2, true);
  // Telegram Hub: a sofa facing the big Telegram wall (the wall itself is live, in engine/props.ts).
  const hub = zoneById.telegram_hub;
  add(sofa(0.6), hub.x, 0, hub.z + 0.75, Math.PI, true);
  add(plant(m, 'monstera', 1.1), hub.x - 2.3, 0, hub.z + 0.9, 0, true, 0.2);

  // Plants in the corners.
  const plants: [number, number, 'monstera' | 'snake_plant' | 'ficus'][] = [
    [-11.4, -7.4, 'monstera'], [-4.6, -7.5, 'snake_plant'], [4.4, -7.5, 'ficus'], [11.4, -7.4, 'monstera'],
    [-11.4, 1.3, 'snake_plant'], [11.3, 2.4, 'ficus'], [-11.4, 7.5, 'ficus'], [-0.3, 7.4, 'monstera'], [11.4, 7.4, 'monstera'],
    [-17.4, 7.6, 'monstera'], [-12.8, 7.6, 'snake_plant'], [-17.5, -0.6, 'ficus'],
  ];
  plants.forEach(([x, z, s]) => add(plant(m, s, 1.1), x, 0, z, 0, true, 0.2));

  noOutline(root);
  return root;
}

/** The walkable floor, inside the walls. */
export const FLOOR: Rect = { minX: -18.0, maxX: 12.3, minZ: -8.0, maxZ: 8.3 };
/** Where new hires walk in from: the open front edge between the pantry and the founder's corner. */
export const DOOR: [number, number] = [5.0, 8.0];

/** The whole static office: merged furniture, the textured plank floor, and every solid footprint. */
export function buildWorld(models: Models, signs = true) {
  const solids: Rect[] = [];
  const raw = buildOffice(models, solids, signs);
  const merged = mergeByColor(raw);
  raw.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose()); // merged copied them; textures stay (merged uses them)
  const FW = FLOOR.maxX - FLOOR.minX + 0.2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, 16.5), toonUnique('#ffffff', { map: planks(FW, 16.5) }));
  floor.position.x = (FLOOR.maxX + FLOOR.minX) / 2;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  floor.receiveShadow = true;
  noOutline(floor);
  const group = new THREE.Group();
  group.add(merged, floor);
  return { group, floor, solids };
}
