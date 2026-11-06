// The office shell and furniture, built once in the agent-office toon style and merged by colour into a
// handful of draw calls. Toon builders (chair, desk, wall boards) adapted from AgentSystemLabs/agent-office
// (MIT), Copyright (c) 2026 AgentSystemLabs: src/client/world/office/{seats,props,materials}.ts.
import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { Zone } from '../shared/types';
import { C, DESK, roster, world, zoneById, zoneColor, zones } from './data';
import { mergeByColor, mesh, noOutline, roundedBox, toon, toonUnique } from './toon';
import { piece, plant, useModels, type Models } from './models';
import { chartsTex, neonTex, paint, polaroidTex } from './tex';

export const PAL = {
  wall: '#fff6ea', trim: '#e8a87c', floor: '#f2d7b0', floorAlt: '#e9c89a', seam: '#d9b88c',
  desk: '#f7f3ea', deskLeg: '#8d99ae', ink: '#2b2d42', wood: '#c98b5a', cork: '#d8a86a',
  chairs: ['#ff8a5b', '#5bc0eb', '#9bc53d', '#b388eb', '#ffb400', '#f7aef8'],
};
export const DESK_SIZE = { w: 1.8, d: 0.9, h: 0.78 };
export const WALL = { h: 2.6, t: 0.3, backZ: -8.15, leftX: -12.15 };
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
export const MONITORS: Record<string, number[]> = { growth_pod: [-0.42, 0.42] };
export const monitorXs = (zoneId: string) => MONITORS[zoneId] ?? [0];
export const MONITOR = { y: DESK_SIZE.h + 0.42, z: -0.2, w: 0.78, h: 0.46 };

/** seats.ts buildDesk(): top, legs, a modesty panel in the team colour, a knick-knack, monitor frame(s) and a chair. */
function desk(m: Models, zoneId: string, i: number) {
  const g = new THREE.Group();
  const { w, d, h } = DESK_SIZE;
  g.add(mesh(roundedBox(w - 0.06, 0.08, d - 0.04, 0.08), toon(PAL.desk), 0, h - 0.04, 0));
  const leg = toon(PAL.deskLeg);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, h - 0.08, 8), leg, sx * (w / 2 - 0.14), (h - 0.08) / 2, sz * (d / 2 - 0.12)));
  g.add(mesh(box(w - 0.3, 0.32, 0.03), toon(zoneColor(zoneId)), 0, h - 0.26, -d / 2 + 0.06));
  for (const x of monitorXs(zoneId)) {
    g.add(mesh(roundedBox(MONITOR.w + 0.08, MONITOR.h + 0.08, 0.06, 0.04).rotateX(Math.PI / 2), toon(PAL.ink), x, MONITOR.y, MONITOR.z - 0.04));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), toon(PAL.ink), x, h + 0.1, MONITOR.z - 0.06));
    g.add(mesh(roundedBox(0.3, 0.03, 0.18, 0.06), toon(PAL.ink), x, h + 0.015, MONITOR.z - 0.06));
  }
  g.add(mesh(roundedBox(0.5, 0.025, 0.16, 0.04), toon('#e9ecef'), 0, h + 0.012, 0.15)); // keyboard
  const deco = i % 3 === 0 ? piece(m.desk_props, 'mug', { Mug: PAL.chairs[i % 6] }) : i % 3 === 1 ? plant(m, 'succulent') : piece(m.desk_props, ['books_upright', 'books_leaning', 'books_stack'][i % 3]);
  deco.position.set(i % 3 === 1 ? -w / 2 + 0.25 : w / 2 - 0.26, h, -0.25);
  g.add(deco);
  const ch = chair(PAL.chairs[i % PAL.chairs.length]);
  ch.position.set(0, 0, 0.85);
  g.add(ch);
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

function cardboard(s = 1) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.5 * s, 0.4 * s, 0.5 * s, 0.03), toon('#d4a373'), 0, 0.2 * s, 0));
  g.add(mesh(box(0.12 * s, 0.01, 0.51 * s), toon('#f1dca7'), 0, 0.4 * s + 0.005, 0));
  return g;
}

function buildOffice(m: Models) {
  const root = new THREE.Group();
  const add = (o: THREE.Object3D, x: number, y: number, z: number, ry = 0) => {
    o.position.set(x, y, z);
    o.rotation.y = ry;
    root.add(o);
    return o;
  };

  // Shell: a slab, two walls with windows and a trim line, the floor's planks on top (textured, kept apart).
  add(mesh(roundedBox(24.8, 0.4, 16.8, 0.25), toon(PAL.trim)), 0, -0.21, 0);
  add(mesh(box(24.6, WALL.h, WALL.t), toon(PAL.wall)), 0.15, WALL.h / 2, WALL.backZ);
  add(mesh(box(WALL.t, WALL.h, 16.6), toon(PAL.wall)), WALL.leftX, WALL.h / 2, -0.15);
  add(mesh(box(24.6, 0.18, WALL.t + 0.04), toon(PAL.trim)), 0.15, 0.09, WALL.backZ);
  add(mesh(box(WALL.t + 0.04, 0.18, 16.6), toon(PAL.trim)), WALL.leftX, 0.09, -0.15);
  add(mesh(box(24.6, 0.1, WALL.t + 0.06), toon(PAL.trim)), 0.15, WALL.h, WALL.backZ);
  add(mesh(box(WALL.t + 0.06, 0.1, 16.6), toon(PAL.trim)), WALL.leftX, WALL.h, -0.15);
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

  // Zone rugs: soft rounded mats in a pastel of the team colour.
  for (const z of zones) {
    const col = '#' + new THREE.Color(zoneColor(z.id)).lerp(new THREE.Color('#ffffff'), 0.62).getHexString();
    add(mesh(roundedBox(z.w - 0.4, 0.04, z.d - 0.4, 0.35), toon(col)), z.x, 0.02, z.z);
  }

  // Desks for everyone with a home zone (the captain runs the war-room table).
  roster.forEach((p, i) => {
    if (!DESK[p.zone]) return;
    const [x, z] = world(p.zone, DESK[p.zone]);
    add(desk(m, p.zone, i), x, 0, z);
  });

  // War room: glass cabin, wooden table, chairs either side, a stand for the big plan screen.
  const war = zoneById.war_room;
  const tbl = new THREE.Group();
  tbl.add(mesh(roundedBox(3.4, 0.1, 1.5, 0.35), toon(PAL.wood), 0, 0.76, 0));
  tbl.add(mesh(roundedBox(1.6, 0.7, 0.5, 0.2), toon(PAL.ink), 0, 0.36, 0));
  add(tbl, war.x, 0, war.z - 0.1);
  for (const sx of [-1, 1]) for (const dz of [-0.4, 0.4]) add(chair(PAL.chairs[(sx + 1 + (dz > 0 ? 1 : 0)) % 6]), war.x + sx * 2.15, 0, war.z - 0.1 + dz, sx * -Math.PI / 2 + Math.PI);
  add(mesh(box(0.12, 1.0, 0.12), toon(PAL.ink)), war.x - 1.3, 0.5, war.z - 2.15);
  add(mesh(box(0.12, 1.0, 0.12), toon(PAL.ink)), war.x + 1.3, 0.5, war.z - 2.15);
  add(glassWall(4.6, 2.0), war.x - 3.4, 0, war.z, Math.PI / 2);
  add(glassWall(4.6, 2.0), war.x + 3.4, 0, war.z, Math.PI / 2);
  add(glassWall(2.4, 2.0), war.x - 2.2, 0, war.z + 2.35);
  add(glassWall(2.4, 2.0), war.x + 2.2, 0, war.z + 2.35);

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
  add(ring, cr.x + 1.4, 0, cr.z - 0.5, -0.5);
  add(wallBoard(2.6, 1.5, PAL.wood, polaroidTex()), WALL.leftX + WALL.t / 2 + 0.06, 1.5, cr.z, Math.PI / 2);
  // Dispatch dock: stacked boxes and a roller conveyor.
  const dock = zoneById.dispatch_dock;
  add(cardboard(1.1), dock.x - 2.3, 0, dock.z - 1.35);
  add(cardboard(1.1), dock.x - 1.7, 0, dock.z - 1.3, 0.3);
  add(cardboard(1), dock.x - 2.05, 0.44, dock.z - 1.3, -0.2);
  const belt = new THREE.Group();
  belt.add(mesh(roundedBox(3.4, 0.12, 0.7, 0.06), toon('#495057'), 0, 0.55, 0));
  belt.add(mesh(box(3.3, 0.02, 0.56), toon('#2b2d42'), 0, 0.62, 0));
  for (const x of [-1.5, 1.5]) for (const z of [-0.28, 0.28]) belt.add(mesh(box(0.08, 0.5, 0.08), toon(PAL.deskLeg), x, 0.25, z));
  add(belt, dock.x - 0.9, 0, dock.z + 0.9);
  // Dark store: a shelf rack of quick-commerce stock under a "10-min delivery" sign.
  const ds = zoneById.dark_store;
  const rack = new THREE.Group();
  for (const x of [-1.05, 1.05]) rack.add(mesh(box(0.08, 1.7, 0.5), toon(PAL.ink), x, 0.85, 0));
  for (const y of [0.15, 0.65, 1.15, 1.62]) rack.add(mesh(box(2.2, 0.05, 0.5), toon('#adb5bd'), 0, y, 0));
  const stock = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f4a261', '#9d4edd'];
  for (let s = 0; s < 3; s++) for (let k = 0; k < 6; k++) rack.add(mesh(roundedBox(0.26, 0.3, 0.3, 0.05), toon(stock[(k + s * 2) % 6]), -0.82 + k * 0.33, 0.33 + s * 0.5, 0));
  add(rack, ds.x, 0, ds.z - 0.95);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.48), new THREE.MeshBasicMaterial({ map: neonTex('⚡ 10-MIN DELIVERY', C.saffron), transparent: true, toneMapped: false }));
  add(sign, ds.x, 2.05, ds.z - 0.95);
  // Chai pantry: the kitchen counter + espresso machine + fridge, poufs to perch on.
  const chai = zoneById.chai_pantry;
  const kitchen = piece(m.kitchen);
  kitchen.scale.setScalar(0.62);
  add(kitchen, chai.x + 0.4, 0, chai.z - 1.05);
  add(piece(m.lounge, 'pouf', { Cloth: '#ef476f' }), chai.x - 1.55, 0, chai.z + 0.6).scale.setScalar(0.7);
  add(piece(m.lounge, 'pouf', { Cloth: '#06d6a0' }), chai.x + 1.6, 0, chai.z + 0.6).scale.setScalar(0.7);
  // Founder's corner: a sofa and coffee table beside the desk.
  const fd = zoneById.founder_desk;
  add(piece(m.lounge, 'sofa'), fd.x + 1.95, 0, fd.z + 0.3, -Math.PI / 2).scale.setScalar(0.5);
  // Finance: a filing cabinet. Design: a mood board easel.
  const fin = zoneById.finance_cabin;
  add(mesh(roundedBox(0.6, 1.1, 0.5, 0.06), toon('#adb5bd')), fin.x - 0.3, 0.55, fin.z - 1.55);
  add(mesh(roundedBox(0.6, 1.1, 0.5, 0.06), toon('#adb5bd')), fin.x + 0.35, 0.55, fin.z - 1.55);

  // Plants in the corners.
  const plants: [number, number, 'monstera' | 'snake_plant' | 'ficus'][] = [
    [-11.4, -7.4, 'monstera'], [-4.6, -7.5, 'snake_plant'], [4.4, -7.5, 'ficus'], [11.4, -7.4, 'monstera'],
    [-11.4, 2.3, 'snake_plant'], [11.3, 2.4, 'ficus'], [-11.4, 7.5, 'ficus'], [-0.3, 7.4, 'monstera'], [5.0, 7.4, 'snake_plant'], [11.4, 7.4, 'monstera'],
  ];
  plants.forEach(([x, z, s]) => add(plant(m, s, 1.1), x, 0, z));

  noOutline(root);
  return root;
}

export default function Floor({ onPick }: { onPick: (z: Zone | null) => void }) {
  const models = useModels();
  const { merged, floor } = useMemo(() => {
    const merged = mergeByColor(buildOffice(models));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24.5, 16.5), toonUnique('#ffffff', { map: planks(24.5, 16.5) }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.001;
    floor.receiveShadow = true;
    noOutline(floor);
    return { merged, floor };
  }, [models]);
  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const { x, z } = e.point;
    onPick(zones.find((zn) => Math.abs(x - zn.x) <= zn.w / 2 && Math.abs(z - zn.z) <= zn.d / 2) ?? null);
  };
  return (
    <group>
      <primitive object={floor} onClick={pick} />
      <primitive object={merged} />
    </group>
  );
}
