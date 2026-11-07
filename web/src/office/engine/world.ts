// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/world/office.ts (buildOffice, buildDesk, chair, wallBoard, glassPane, paintPlanks): the office shell and furniture, laid out on our zones (contracts/zones.json), built
// once and merged by colour into a handful of draw calls. Every solid piece leaves a footprint
// (office.ts Collider) that the people's paths go round.
import * as THREE from 'three';
import { C, DESKS, zoneById, zoneColor, zones } from '../data';
import { BOOKCASE_SOLIDS } from './library';
import { mergeByColor, mergeByMaterial, mesh, noOutline, roundedBox, toon, toonUnique } from '../toon';
import { piece, plant, type Models } from './models';
import { FONT, chartsTex, ledgerTex, neonTex, paint, polaroidTex } from '../tex';

/** The huddle room's board: sticky notes in rows. */
function stickyTex() {
  return paint(400, 200, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 400, 200);
    const c = ['#ffd166', '#8ecae6', '#f7aef8', '#95f2c3'];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) {
      if ((r * 7 + k * 3) % 5 === 0) continue;
      g.fillStyle = c[(r + k) % 4];
      g.fillRect(18 + k * 63, 16 + r * 60, 48, 46);
    }
  });
}
import type { Rect } from './nav';
import { ANNEX, BACK_DOORS, CORE, DOOR, DOORS, FLOOR, HACK_SCREEN, WALL, stations, type Annex } from './layout';

export { DOOR, FLOOR, WALL };

export const PAL = {
  wall: '#fff6ea', trim: '#e8a87c', floor: '#f2d7b0', floorAlt: '#e9c89a', seam: '#d9b88c',
  desk: '#f7f3ea', deskLeg: '#8d99ae', ink: '#2b2d42', wood: '#c98b5a', cork: '#d8a86a',
  chairs: ['#ff8a5b', '#5bc0eb', '#9bc53d', '#b388eb', '#ffb400', '#f7aef8'],
};
export const DESK_SIZE = { w: 1.8, d: 0.9, h: 0.78 };
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
export const MONITORS: Record<string, number[]> = { 'growth_pod#0': [-0.42, 0.42], 'finance_cabin#0': [-0.42, 0.42] };
export const monitorXs = (deskId: string) => MONITORS[deskId] ?? [0];
export const MONITOR = { y: DESK_SIZE.h + 0.42, z: -0.2, w: 0.78, h: 0.46 };

/** seats.ts buildDesk(): top, legs, a modesty panel in the team colour, a knick-knack, monitor frame(s) and a chair. */
function desk(m: Models, color: string, i: number, monitors: number[]) {
  const g = new THREE.Group();
  const { w, d, h } = DESK_SIZE;
  g.add(mesh(roundedBox(w - 0.06, 0.08, d - 0.04, 0.08), toon(PAL.desk), 0, h - 0.04, 0));
  const leg = toon(PAL.deskLeg);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, h - 0.08, 8), leg, sx * (w / 2 - 0.14), (h - 0.08) / 2, sz * (d / 2 - 0.12)));
  g.add(mesh(box(w - 0.3, 0.32, 0.03), toon(color), 0, h - 0.26, -d / 2 + 0.06));
  for (const x of monitors) {
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
  const east = FLOOR.maxX + 0.15;
  const BW = east - (WALL.outerX - WALL.t / 2), BX = (east + WALL.outerX - WALL.t / 2) / 2; // back wall spans the whole width
  const FD = FLOOR.maxZ - FLOOR.minZ, FZ = (FLOOR.maxZ + FLOOR.minZ) / 2;
  add(mesh(roundedBox(BW + 0.2, 0.4, FD + 0.5, 0.25), toon(PAL.trim)), BX, -0.21, FZ);
  /** A north-facing wall run from x0 to x1 at z (solid). */
  const runWall = (x0: number, x1: number, z: number) => {
    const len = x1 - x0, mid = (x0 + x1) / 2;
    add(mesh(box(len, WALL.h, WALL.t), toon(PAL.wall)), mid, WALL.h / 2, z, 0, true);
    add(mesh(box(len, 0.18, WALL.t + 0.04), toon(PAL.trim)), mid, 0.09, z);
    add(mesh(box(len, 0.1, WALL.t + 0.06), toon(PAL.trim)), mid, WALL.h, z);
  };
  runWall(BX - BW / 2, BX + BW / 2, WALL.outerBackZ);
  // The original office's back wall: now an inner wall into the north wing, a doorway on each aisle, open past its east end.
  let x0 = WALL.outerX - WALL.t / 2;
  for (const [a, b] of BACK_DOORS) {
    runWall(x0, a, WALL.backZ);
    add(mesh(box(b - a, 0.5, WALL.t + 0.06), toon(PAL.wall)), (a + b) / 2, WALL.h - 0.25, WALL.backZ);
    add(mesh(box(b - a + 0.1, 0.1, WALL.t + 0.1), toon(PAL.trim)), (a + b) / 2, WALL.h - 0.5, WALL.backZ);
    x0 = b;
  }
  runWall(x0, WALL.backEnd, WALL.backZ);
  /** A west-east wall from z0 to z1 at x (solid, so people go round it). */
  const sideWall = (x: number, z0: number, z1: number) => {
    const len = z1 - z0, mid = (z0 + z1) / 2;
    add(mesh(box(WALL.t, WALL.h, len), toon(PAL.wall)), x, WALL.h / 2, mid, 0, true);
    add(mesh(box(WALL.t + 0.04, 0.18, len), toon(PAL.trim)), x, 0.09, mid);
    add(mesh(box(WALL.t + 0.06, 0.1, len), toon(PAL.trim)), x, WALL.h, mid);
  };
  sideWall(WALL.outerX, FLOOR.minZ - 0.3, FLOOR.maxZ + 0.3);
  // The inner wall: solid between its doorways, each doorway with a lintel over it.
  let z0 = CORE.minZ;
  for (const [a, b] of DOORS) {
    sideWall(WALL.leftX, z0, a);
    add(mesh(box(WALL.t + 0.06, 0.5, b - a), toon(PAL.wall)), WALL.leftX, WALL.h - 0.25, (a + b) / 2);
    add(mesh(box(WALL.t + 0.1, 0.1, b - a + 0.1), toon(PAL.trim)), WALL.leftX, WALL.h - 0.5, (a + b) / 2);
    z0 = b;
  }
  sideWall(WALL.leftX, z0, FLOOR.maxZ + 0.3);
  const sky = new THREE.MeshBasicMaterial({ color: '#cfeaff', toneMapped: false });
  const win = (w: number) => {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(w + 0.2, 0.08, 1.3, 0.08).rotateX(Math.PI / 2), toon('#ffffff'), 0, 0, 0));
    g.add(mesh(new THREE.PlaneGeometry(w, 1.1), sky, 0, 0, 0.045, false));
    g.add(mesh(box(0.06, 1.1, 0.04), toon('#ffffff'), 0, 0, 0.06));
    return g;
  };
  // Windows: between the back row's wall screens, down the west wing, and one on the inner wall by the design studio.
  add(win(1.4), 19.0, 1.55, WALL.backZ + WALL.t / 2 + 0.01);
  for (const x of [-20, -9.5, -4.6, 8.25, 21.5, 26, 39, 43, 47, 62]) add(win(2.4), x, 1.55, WALL.outerBackZ + WALL.t / 2 + 0.01);
  for (const z of [-8.3]) add(win(2.2), WALL.leftX + WALL.t / 2 + 0.01, 1.55, z, Math.PI / 2);
  for (const z of [-22, -4.6, 1.6, 4.6, 8.6]) add(win(2.0), WALL.outerX + WALL.t / 2 + 0.01, 1.55, z, Math.PI / 2);

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
    add(desk(m, zoneColor(d.zone), i, monitorXs(d.id)), d.x, 0, d.z, 0, true);
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
  tbl.add(mesh(roundedBox(3.8, 0.1, 1.6, 0.4), toon(PAL.wood), 0, 0.76, 0));
  tbl.add(mesh(roundedBox(1.8, 0.7, 0.5, 0.2), toon(PAL.ink), 0, 0.36, 0));
  add(tbl, war.x, 0, war.z - 0.1, 0, true);
  for (const sx of [-1, 1]) for (const dz of [-0.45, 0.45]) add(chair(PAL.chairs[(sx + 1 + (dz > 0 ? 1 : 0)) % 6]), war.x + sx * 2.35, 0, war.z - 0.1 + dz, sx * -Math.PI / 2 + Math.PI, true);
  for (const dx of [-0.9, 0.9]) add(chair(PAL.chairs[dx > 0 ? 3 : 5]), war.x + dx, 0, war.z - 1.2, 0, true); // the far side of the table
  add(mesh(box(0.12, 1.0, 0.12), toon(PAL.ink)), war.x - 1.3, 0.5, war.z - 2.6, 0, true);
  add(mesh(box(0.12, 1.0, 0.12), toon(PAL.ink)), war.x + 1.3, 0.5, war.z - 2.6, 0, true);
  add(glassWall(5.4, 2.0), war.x - 4.2, 0, war.z - 0.1, Math.PI / 2, true);
  add(glassWall(5.4, 2.0), war.x + 4.2, 0, war.z - 0.1, Math.PI / 2, true);
  add(glassWall(2.7, 2.0), war.x - 2.85, 0, war.z + 2.65, 0, true);
  add(glassWall(2.7, 2.0), war.x + 2.85, 0, war.z + 2.65, 0, true);

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
  add(ring, cr.x + 2.3, 0, cr.z - 0.5, -0.5, true, 0.15); // right of the second desk
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
  add(sofa(0.66), fd.x + 3.2, 0, fd.z + 0.2, -Math.PI / 2, true);
  const ct = piece(m.lounge, 'coffee_table');
  ct.scale.setScalar(0.7);
  add(ct, fd.x + 1.7, 0, fd.z + 0.2, Math.PI / 2, true);
  add(pouf('#ffd166'), fd.x + 0.6, 0, fd.z + 1.4, 0, true);
  // Finance cabin: a filing cabinet and a safe against the west wall, the P&L ledger screen above, a calculator on the lead's desk.
  const fin = zoneById.finance_cabin;
  if (fin) {
    const wallX = WALL.outerX + WALL.t / 2;
    const cab = new THREE.Group();
    cab.add(mesh(roundedBox(0.55, 0.95, 0.62, 0.05), toon('#8d99ae'), 0, 0.475, 0));
    for (const y of [0.3, 0.72]) {
      cab.add(mesh(box(0.02, 0.34, 0.5), toon('#adb5bd'), 0.28, y, 0));
      cab.add(mesh(box(0.04, 0.04, 0.2), toon(PAL.ink), 0.3, y + 0.08, 0));
    }
    add(cab, wallX + 0.32, 0, fin.z - 1.0, 0, true);
    const safe = new THREE.Group();
    safe.add(mesh(roundedBox(0.62, 0.8, 0.7, 0.08), toon('#2f4858'), 0, 0.4, 0));
    safe.add(mesh(box(0.02, 0.62, 0.52), toon('#3d5a6c'), 0.32, 0.42, 0));
    const dial = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20), toon('#ffd166'), 0.35, 0.5, -0.08);
    dial.rotation.z = Math.PI / 2;
    safe.add(dial);
    safe.add(mesh(box(0.05, 0.05, 0.18), toon('#ffd166'), 0.35, 0.3, 0.12));
    add(safe, wallX + 0.36, 0, fin.z + 0.4, 0, true); // clear of the floor sign
    add(wallBoard(1.5, 0.94, PAL.ink, ledgerTex()), wallX + 0.06, 1.72, fin.z - 0.75, Math.PI / 2);
    const fd0 = DESKS.find((d) => d.id === 'finance_cabin#0');
    if (fd0) {
      const calc = new THREE.Group();
      calc.add(mesh(roundedBox(0.2, 0.035, 0.26, 0.03), toon('#2b2d42'), 0, 0.018, 0));
      calc.add(mesh(box(0.15, 0.01, 0.06), toon('#95f2c3'), 0, 0.04, -0.08));
      calc.add(mesh(box(0.15, 0.01, 0.13), toon('#e9ecef'), 0, 0.04, 0.04));
      add(calc, fd0.x - 0.6, DESK_SIZE.h, fd0.z + 0.12, 0.2);
    }
  }
  // Telegram Hub: a sofa facing the big Telegram wall (the wall itself is live, in engine/props.ts).
  const hub = zoneById.telegram_hub;
  add(sofa(0.6), hub.x, 0, hub.z + 1.45, Math.PI, true);
  add(plant(m, 'monstera', 1.1), hub.x - 4.3, 0, hub.z - 1.9, 0, true, 0.2);
  add(plant(m, 'ficus', 1.0), hub.x + 4.3, 0, hub.z - 1.9, 0, true, 0.2);

  // Chai corner: a low table to gather round and a neon sign over the counter.
  const lowTable = piece(m.lounge, 'coffee_table');
  lowTable.scale.setScalar(0.6);
  add(lowTable, chai.x - 1.3, 0, chai.z - 0.2, 0, true);
  add(wallBoard(1.5, 0.42, PAL.ink, neonTex('☕ CHAI', C.saffron)), chai.x + 0.4, 1.55, chai.z - 1.5);

  // Huddle room: a glass box (open to the front, a door in its right side), a round table, four chairs, a sticky-note board.
  const mr = zoneById.meeting_room;
  if (mr) {
    add(glassWall(4.2, 2.0), mr.x, 0, mr.z - 2.2, 0, true);
    add(glassWall(4.2, 2.0), mr.x - 2.05, 0, mr.z - 0.1, Math.PI / 2, true);
    add(glassWall(2.4, 2.0), mr.x + 2.05, 0, mr.z - 1.0, Math.PI / 2, true);
    const rt = new THREE.Group();
    rt.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 28), toon('#ffffff'), 0, 0.74, 0));
    rt.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 10), toon(PAL.ink), 0, 0.36, 0));
    rt.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.04, 20), toon(PAL.ink), 0, 0.02, 0));
    add(rt, mr.x, 0, mr.z - 0.4, 0, true);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      add(chair(PAL.chairs[(k + 2) % 6]), mr.x + Math.sin(a) * 1.15, 0, mr.z - 0.4 + Math.cos(a) * 1.15, a + Math.PI, true);
    }
    add(wallBoard(2.0, 1.0, PAL.ink, stickyTex()), mr.x, 1.45, mr.z - 2.1);
  }

  // Reception at the front door: a counter with the brand on it, and the product sample wall opposite.
  const rc = zoneById.reception;
  if (rc) {
    const [hx, hz] = stations(zoneById).hire.at;
    const counter = new THREE.Group();
    counter.add(mesh(roundedBox(2.2, 1.0, 0.7, 0.12), toon(PAL.wood), 0, 0.5, 0));
    counter.add(mesh(roundedBox(2.36, 0.07, 0.86, 0.05), toon('#fffaf3'), 0, 1.03, 0));
    counter.add(mesh(roundedBox(0.5, 0.32, 0.06, 0.03), toon(PAL.ink), 0.55, 1.24, -0.15)); // a screen for the visitor book
    counter.add(mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#ffd166'), -0.7, 1.07, 0.2)); // the bell
    add(counter, hx, 0, hz, 0, true);
    add(wallBoard(1.7, 0.4, PAL.ink, neonTex('KESAR & CO.', C.saffron)), hx, 0.55, hz + 0.43);
    add(plant(m, 'ficus', 0.9), hx + 0.75, 0, hz - 1.0, 0, true, 0.2);
    const shelf = new THREE.Group();
    for (const x of [-1.2, 1.2]) shelf.add(mesh(box(0.06, 1.9, 0.42), toon(PAL.wood), x, 0.95, 0));
    shelf.add(mesh(box(2.46, 1.9, 0.04), toon('#fff1dc'), 0, 0.95, -0.2));
    const tones = ['#F4A300', '#ef476f', '#3CCB8B', '#fffaf3', '#9d4edd', '#ffd166'];
    for (let lv = 0; lv < 4; lv++) {
      shelf.add(mesh(box(2.4, 0.05, 0.42), toon(PAL.wood), 0, 0.12 + lv * 0.5, 0));
      for (let k = 0; k < 6; k++) {
        const c = tones[(k + lv) % tones.length], x = -0.95 + k * 0.38;
        if ((k + lv) % 2) shelf.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.26, 12), toon(c), x, 0.28 + lv * 0.5, 0.02));
        else shelf.add(mesh(roundedBox(0.2, 0.17, 0.16, 0.04), toon(c), x, 0.23 + lv * 0.5, 0.02));
      }
    }
    add(shelf, rc.x - 1.65, 0, rc.z - 0.2, Math.PI / 2 - 0.55, true); // angled to the door and the room
  }

  // The new wings (layout.ts ANNEX): department bays, glass rooms, the café, the lounge and the Town Hall.
  for (const a of ANNEX) buildAnnex(m, a, add, root, signs, pouf, sofa);

  // Plants in the corners and along the walls.
  const plants: [number, number, 'monstera' | 'snake_plant' | 'ficus'][] = [
    [-15.4, -10.4, 'monstera'], [-7.0, -10.5, 'snake_plant'], [10.9, -10.5, 'ficus'], [19.4, -10.4, 'monstera'],
    [-23.4, -32.4, 'monstera'], [-6.9, -32.4, 'ficus'], [-3.0, -32.4, 'snake_plant'], [6.4, -32.4, 'monstera'], [20.6, -32.4, 'ficus'],
    [23.6, -32.4, 'snake_plant'], [40.6, -32.4, 'monstera'], [44.6, -32.4, 'ficus'], [63.3, -32.4, 'monstera'],
    [-23.4, -11.9, 'ficus'], [20.6, -11.9, 'snake_plant'], [20.6, 10.4, 'monstera'], [23.4, -1.0, 'ficus'], [63.3, -0.6, 'snake_plant'],
    [-15.4, 2.9, 'snake_plant'], [19.4, 3.0, 'ficus'], [-15.4, 10.4, 'ficus'], [19.4, 10.4, 'monstera'], [-3.6, 4.6, 'snake_plant'],
    [-23.5, 10.5, 'monstera'], [-16.8, 10.5, 'snake_plant'], [-23.5, -3.2, 'ficus'], [6.9, 10.5, 'snake_plant'], [10.6, 10.5, 'snake_plant'],
  ];
  plants.forEach(([x, z, s]) => add(plant(m, s, 1.1), x, 0, z, 0, true, 0.2));

  noOutline(root);
  return root;
}

type Add = (o: THREE.Object3D, x: number, y: number, z: number, ry?: number, solid?: boolean, inset?: number) => THREE.Object3D;

/** One room of the new wings: its rug and floor sign, then the furniture its kind calls for (all merged with the rest). */
function buildAnnex(m: Models, a: Annex, add: Add, root: THREE.Group, signs: boolean, pouf: (c: string) => THREE.Object3D, sofa: (s: number) => THREE.Object3D) {
  const { x, z, w, d } = a;
  const back = z - d / 2, front = z + d / 2;
  const col = '#' + new THREE.Color(a.color).lerp(new THREE.Color('#ffffff'), 0.62).getHexString();
  add(mesh(roundedBox(w - 0.4, 0.04, d - 0.4, 0.35), toon(col)), x, 0.02, z);
  if (signs) {
    const sign = floorSign(a.label.toUpperCase());
    sign.position.set(x - w / 2 + 0.35 + sign.userData.w / 2, 0.05, front - 0.5);
    root.add(sign);
  }
  const roundTable = (r: number) => {
    const t = new THREE.Group();
    t.add(mesh(new THREE.CylinderGeometry(r, r, 0.08, 24), toon('#ffffff'), 0, 0.74, 0));
    t.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 10), toon(PAL.ink), 0, 0.36, 0));
    t.add(mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.04, 20), toon(PAL.ink), 0, 0.02, 0));
    return t;
  };
  if (a.kind === 'meeting') {
    // A glass room: back and sides, open to the corridor in front; a long table, chairs down both sides, a board.
    add(glassWall(w - 0.8, 2.0), x, 0, back + 0.4, 0, true);
    for (const sx of [-1, 1]) add(glassWall(d * 0.62, 2.0), x + sx * (w / 2 - 0.4), 0, back + 0.4 + (d * 0.62) / 2, Math.PI / 2, true);
    const tw = Math.min(w - 4.4, 8), tz = z - 0.3;
    const tbl = new THREE.Group();
    tbl.add(mesh(roundedBox(tw, 0.1, 1.5, 0.4), toon(PAL.wood), 0, 0.76, 0));
    tbl.add(mesh(roundedBox(Math.max(0.6, tw - 1.6), 0.7, 0.5, 0.2), toon(PAL.ink), 0, 0.36, 0));
    add(tbl, x, 0, tz, 0, true);
    const n = Math.max(2, Math.floor(tw / 1.15));
    for (let k = 0; k < n; k++) {
      const cx = x + (k - (n - 1) / 2) * (tw / n);
      add(chair(PAL.chairs[k % 6]), cx, 0, tz - 1.15, Math.PI, true);
      add(chair(PAL.chairs[(k + 3) % 6]), cx, 0, tz + 1.15, 0, true);
    }
    add(wallBoard(Math.min(3.2, w - 3), 1.1, PAL.ink, stickyTex()), x, 1.45, back + 0.52);
  } else if (a.kind === 'lounge') {
    // Three sofa nooks round coffee tables, poufs on the open side.
    for (const k of [-1, 0, 1]) {
      const nx = x + k * (w / 3.2);
      add(sofa(0.66), nx, 0, z - 1.6, 0, true);
      const ct = piece(m.lounge, 'coffee_table');
      ct.scale.setScalar(0.7);
      add(ct, nx, 0, z - 0.1, Math.PI / 2, true);
      add(pouf(['#ef476f', '#06d6a0', '#ffd166'][k + 1]), nx - 0.7, 0, z + 1.2, 0, true);
      add(pouf(['#9d4edd', '#5bc0eb', '#ff8a5b'][k + 1]), nx + 0.7, 0, z + 1.2, 0, true);
    }
    for (const sx of [-1, 1]) add(plant(m, 'monstera', 1.2), x + sx * (w / 2 - 0.8), 0, back + 0.8, 0, true, 0.2);
  } else if (a.kind === 'pantry') {
    // Two kitchen runs along the back under a café sign, round tables with chairs in front.
    for (const sx of [-1, 1]) {
      const k = piece(m.kitchen);
      k.scale.setScalar(0.7);
      add(k, x + sx * (w / 4), 0, back + 1.0, 0, true);
    }
    add(wallBoard(2.6, 0.5, PAL.ink, neonTex('☕ CAFÉ', C.saffron)), x, 2.15, back + 0.5);
    for (const dx of [-w / 3.4, 0, w / 3.4])
      for (const dz of [0.9, 3.3]) {
        add(roundTable(0.55), x + dx, 0, z + dz - 1.2, 0, true);
        add(chair(PAL.chairs[Math.abs(Math.round(dx + dz)) % 6]), x + dx - 0.95, 0, z + dz - 1.2, -Math.PI / 2, true);
        add(chair(PAL.chairs[Math.abs(Math.round(dx - dz)) % 6]), x + dx + 0.95, 0, z + dz - 1.2, Math.PI / 2, true);
      }
  } else if (a.kind === 'atrium') {
    // A raised round planter with trees, ringed by benches facing out; open floor all round.
    const r = Math.min(w, d) * 0.22;
    add(mesh(new THREE.CylinderGeometry(r, r + 0.1, 0.5, 32), toon('#d9c3a5'), 0, 0.25, 0), x, 0, z, 0, true, r * 0.3);
    add(mesh(new THREE.CylinderGeometry(r - 0.15, r - 0.15, 0.06, 32), toon('#6b4226'), 0, 0.5, 0), x, 0, z);
    add(plant(m, 'monstera', 1.6), x - r * 0.4, 0.5, z - r * 0.3);
    add(plant(m, 'ficus', 1.9), x + r * 0.35, 0.5, z + r * 0.1);
    add(plant(m, 'snake_plant', 1.4), x - r * 0.1, 0.5, z + r * 0.5);
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2 + Math.PI / 6, br = r + 1.5;
      const bench = new THREE.Group();
      bench.add(mesh(roundedBox(1.8, 0.12, 0.55, 0.06), toon(PAL.wood), 0, 0.46, 0));
      for (const lx of [-0.75, 0.75]) bench.add(mesh(box(0.1, 0.42, 0.45), toon(PAL.ink), lx, 0.21, 0));
      add(bench, x + Math.sin(ang) * br, 0, z + Math.cos(ang) * br, ang, true);
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(plant(m, 'ficus', 1.1), x + sx * (w / 2 - 0.8), 0, z + sz * (d / 2 - 0.8), 0, true, 0.2);
  } else if (a.kind === 'townhall') {
    // The hackathon screen's frame and stand (its face is live in props.ts), benches in two blocks either side of an aisle.
    const S = HACK_SCREEN;
    add(mesh(roundedBox(S.w + 0.4, S.h + 0.4, 0.2, 0.1), toon(PAL.ink)), S.x, S.y, S.z - 0.08);
    for (const sx of [-1, 1]) add(mesh(box(0.2, S.y - S.h / 2, 0.2), toon(PAL.ink)), S.x + sx * (S.w / 2 - 0.6), (S.y - S.h / 2) / 2, S.z - 0.08);
    add(mesh(roundedBox(S.w + 0.4, 0.12, 0.5, 0.05), toon(PAL.ink)), S.x, 0.06, S.z - 0.08, 0, true);
    for (let r = 0; r < 3; r++)
      for (const sx of [-1, 1]) {
        const bench = new THREE.Group();
        bench.add(mesh(roundedBox(4.6, 0.12, 0.6, 0.06), toon(PAL.wood), 0, 0.46, 0));
        for (const lx of [-2, 2]) bench.add(mesh(box(0.1, 0.42, 0.5), toon(PAL.ink), lx, 0.21, 0));
        add(bench, x + sx * 3.4, 0, S.z + 4.2 + r * 1.9, 0, true);
      }
  }
}


/**
 * The world outside the office (agent-office's world/outside.ts, much reduced): a lawn running to the horizon
 * and a ring of cartoon trees, so a camera near the open front or sides sees grass, not a void.
 */
function outside() {
  const g = new THREE.Group();
  const CX = (FLOOR.minX + FLOOR.maxX) / 2, CZ = (FLOOR.minZ + FLOOR.maxZ) / 2;
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(170, 48), toon('#a7d98b'));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(CX, -0.42, CZ);
  lawn.receiveShadow = true;
  g.add(lawn);
  const path = mesh(new THREE.BoxGeometry(2.4, 0.02, 14), toon('#e9d8b4'), DOOR[0], -0.4, FLOOR.maxZ + 7.2, false); // the walk up to the front door
  path.receiveShadow = true;
  g.add(path);
  const trees = new THREE.Group();
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const leaf = [toon('#5fb760'), toon('#3f8f45'), toon('#78c26b')], bark = toon('#8a5a3b');
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, r = 1 + rand() * 0.6;
    const x = CX + Math.cos(a) * r * 54, z = CZ + Math.sin(a) * r * 30;
    if (z < FLOOR.minZ && Math.abs(x - CX) < 50) continue; // keep the view behind the back wall open
    if (x > FLOOR.minX - 3 && x < FLOOR.maxX + 3 && z > FLOOR.minZ - 3 && z < FLOOR.maxZ + 3) continue; // never on the floor
    const s = 0.8 + rand() * 0.9;
    trees.add(mesh(new THREE.CylinderGeometry(0.18 * s, 0.24 * s, 1.4 * s, 7), bark, x, -0.42 + 0.7 * s, z));
    trees.add(mesh(new THREE.IcosahedronGeometry(1.15 * s, 0), leaf[i % 3], x, -0.42 + 2.1 * s, z));
  }
  g.add(mergeByMaterial(trees));
  trees.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
  return g;
}

/** The whole static office: merged furniture, the textured plank floor, and every solid footprint. */
export function buildWorld(models: Models, signs = true) {
  const solids: Rect[] = [];
  const raw = buildOffice(models, solids, signs);
  const merged = mergeByColor(raw);
  raw.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose()); // merged copied them; textures stay (merged uses them)
  const FW = FLOOR.maxX - FLOOR.minX + 0.2, FD = FLOOR.maxZ - FLOOR.minZ + 0.2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD), toonUnique('#ffffff', { map: planks(FW, FD) }));
  floor.position.x = (FLOOR.maxX + FLOOR.minX) / 2;
  floor.position.z = (FLOOR.maxZ + FLOOR.minZ) / 2;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  floor.receiveShadow = true;
  noOutline(floor);
  const group = new THREE.Group();
  group.add(merged, floor, outside());
  return { group, floor, solids };
}
