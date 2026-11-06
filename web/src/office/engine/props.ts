// Feed-driven props (PLAN §9.6 scene events table), in the toon style of the office around them. Built once;
// sync() only repaints a canvas or flips a flag when what it shows changed, update() animates per frame.
// Board/frame builders adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs:
// src/client/world/office.ts (wallBoard) and gallery.ts (frames popping onto the wall).
import * as THREE from 'three';
import type { SceneState } from '../officeState';
import type { OfficeEvent } from '../../shared/types';
import { C, DESK, clean, personById, roster, world, zoneById } from '../data';
import { DESK_SIZE, MONITOR, PAL, WALL, monitorXs, wallBoard } from './world';
import { CITIES, FONT, bannerTex, drawTelegramWall, drawWarScreen, indiaTex, paint, repaint, screenTex, uv } from '../tex';
import { disposeTree, mesh, noOutline, roundedBox, toon, toonUnique } from '../toon';

const GW = 5.2, GH = 2.0;
const WALL_FACE = WALL.backZ + WALL.t / 2 + 0.06;
const popIn = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2);
const SCREEN: Record<string, string> = { idle: '#4a4e69', working: '#8ecae6', waiting: '#ff8fa3', done: '#95f2c3' };

export interface GalleryItem { url: string; title: string }

export class LiveProps {
  readonly group = new THREE.Group();
  /** Gallery frames, for click picking: each mesh carries its url in userData. */
  readonly clickables: THREE.Object3D[] = [];
  private screens: { id: string; mat: THREE.MeshBasicMaterial; want: THREE.Color }[] = [];
  private warTex = paint(1024, 512, () => {});
  private warKey = '';
  private tgTex = paint(1300, 500, () => {});
  private tgKey = -1;
  private tgLast?: string;
  private phoneTex = paint(300, 540, () => {});
  private phoneKey = '';
  private pins = new THREE.Group();
  private arc: THREE.Mesh;
  private box: THREE.Group;
  private pulseId?: string;
  private pulseT = Infinity;
  private boxId?: string;
  private boxT = Infinity;
  private gallery = new THREE.Group();
  private frames = new Map<string, { obj: THREE.Group; born: number; x: number }>();
  private t = 0;

  constructor() {
    const g = this.group;
    // Monitor faces: dim when idle, lit while working, mint when done, pink while blocked. Colours ease.
    const stex = screenTex();
    const sgeo = new THREE.PlaneGeometry(MONITOR.w, MONITOR.h);
    for (const p of roster.filter((r) => DESK[r.zone]))
      for (const dx of monitorXs(p.zone)) {
        const [x, z] = world(p.zone, DESK[p.zone]);
        const mat = new THREE.MeshBasicMaterial({ map: stex, color: SCREEN.idle, toneMapped: false });
        const m = new THREE.Mesh(sgeo, mat);
        m.position.set(x + dx, MONITOR.y, z + MONITOR.z);
        g.add(m);
        this.screens.push({ id: p.id, mat, want: new THREE.Color(SCREEN.idle) });
      }

    // War-room plan screen: checklist of every agent, team progress and the founder's sign-off.
    const war = zoneById.war_room;
    const wb = wallBoard(3.2, 1.6, PAL.ink, this.warTex);
    wb.position.set(war.x, 1.55, war.z - 2.15);
    g.add(wb);

    // Telegram Hub showpiece: the supergroup live on the back wall.
    const hub = zoneById.telegram_hub;
    const tg = wallBoard(GW, GH, PAL.ink, this.tgTex);
    tg.position.set(hub.x, 1.45, WALL_FACE);
    g.add(tg);

    // The founder's phone on their desk, showing the War Room chat.
    const fd = personById.founder;
    const [fx, fz] = world(fd.zone, DESK[fd.zone]);
    const phone = new THREE.Group();
    phone.position.set(fx + 0.55, DESK_SIZE.h, fz + 0.05);
    phone.rotation.x = -0.25;
    phone.add(mesh(roundedBox(0.27, 0.46, 0.03, 0.04).rotateX(Math.PI / 2), toon(PAL.ink), 0, 0.22, 0));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.43), new THREE.MeshBasicMaterial({ map: this.phoneTex, toneMapped: false }));
    face.position.set(0, 0.22, 0.017);
    phone.add(face);
    g.add(phone);

    // Dispatch dock: India map on the left wall (pins pulse on a transfer, an arc Mumbai → Delhi) and a box on the belt.
    const dock = zoneById.dispatch_dock;
    const S = 1.7;
    const map = new THREE.Group();
    map.position.set(WALL.leftX + WALL.t / 2 + 0.06, 1.55, dock.z - 0.2);
    map.rotation.y = Math.PI / 2;
    map.add(wallBoard(S, S, PAL.wood, indiaTex()));
    const at = (c: readonly [number, number]) => {
      const [u, v] = uv(c);
      return new THREE.Vector3((u - 0.5) * S, (v - 0.5) * S, 0.12);
    };
    const pinGeo = new THREE.SphereGeometry(0.065, 12, 10);
    for (const c of Object.values(CITIES)) {
      const p = at(c);
      this.pins.add(mesh(pinGeo, toon(C.red, { emissive: '#7a1418' }), p.x, p.y, p.z, false));
    }
    map.add(this.pins);
    const a = at(CITIES.Mumbai), b = at(CITIES.Delhi);
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(-0.25, 0, 0.35));
    this.arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 24, 0.025, 6), toonUnique(C.saffron, { emissive: '#b36b00' }));
    this.arc.visible = false;
    map.add(this.arc);
    g.add(map);
    this.box = new THREE.Group();
    this.box.position.set(dock.x - 0.9, 0.63, dock.z + 0.9);
    this.box.add(mesh(roundedBox(0.36, 0.32, 0.36, 0.03), toon('#d4a373'), 0, 0.17, 0));
    this.box.visible = false;
    g.add(this.box);

    // Gallery wall: each saved banner pops onto the design studio's back wall.
    const ds = zoneById.design_studio;
    this.gallery.position.set(ds.x, 1.55, WALL_FACE);
    g.add(this.gallery);
    noOutline(g);
  }

  sync(scene: SceneState, events: OfficeEvent[], gallery: GalleryItem[]) {
    for (const s of this.screens) s.want.set(SCREEN[scene.people[s.id]?.state ?? 'idle']);
    const shipped = !!scene.confettiId;
    const warKey = Object.values(scene.people).map((p) => p.state).join() + shipped;
    if (warKey !== this.warKey) {
      this.warKey = warKey;
      repaint(this.warTex, (g, W, H) => drawWarScreen(g, W, H, scene.people, shipped));
    }
    const lastId = events[events.length - 1]?.id;
    if (events.length !== this.tgKey || lastId !== this.tgLast) {
      this.tgKey = events.length;
      this.tgLast = lastId;
      repaint(this.tgTex, (g, W, H) => drawTelegramWall(g, W, H, events));
    }
    const war = events.filter((e) => e.room === 'war_room').slice(-4);
    const phoneKey = war.map((e) => e.id).join();
    if (phoneKey !== this.phoneKey) {
      this.phoneKey = phoneKey;
      repaint(this.phoneTex, (g, W, H) => drawPhone(g, W, H, war));
    }
    if (scene.pinPulseId !== this.pulseId) {
      this.pulseId = scene.pinPulseId;
      this.pulseT = scene.pinPulseId ? this.t : Infinity;
      this.arc.visible = !!scene.pinPulseId;
    }
    if (scene.boxId !== this.boxId) {
      this.boxId = scene.boxId;
      this.boxT = scene.boxId ? this.t : Infinity;
    }
    // Frames: the last four banners; a reset (new loop) clears them, freeing their textures.
    const keep = gallery.slice(-4);
    const want = new Set(keep.map((it) => it.url));
    for (const [url, f] of this.frames)
      if (!want.has(url)) {
        this.gallery.remove(f.obj);
        disposeTree(f.obj);
        this.frames.delete(url);
      }
    keep.forEach((it, i) => {
      let f = this.frames.get(it.url);
      if (!f) {
        const obj = new THREE.Group();
        obj.add(mesh(roundedBox(1.08, 0.08, 1.32, 0.06).rotateX(Math.PI / 2), toon(PAL.wood)));
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.15), new THREE.MeshBasicMaterial({ map: bannerTex(it.title, this.frames.size), toneMapped: false }));
        face.position.z = 0.05;
        face.userData.url = it.url;
        obj.add(face);
        noOutline(obj);
        obj.scale.setScalar(0.001);
        this.gallery.add(obj);
        f = { obj, born: this.t, x: 0 };
        this.frames.set(it.url, f);
      }
      f.x = (i - (keep.length - 1) / 2) * 1.35;
    });
    this.clickables.length = 0;
    for (const f of this.frames.values()) this.clickables.push(f.obj.children[1]);
  }

  update(dt: number, t: number) {
    this.t = t;
    const k = 1 - Math.exp(-dt * 4);
    for (const s of this.screens) s.mat.color.lerp(s.want, k);
    const pa = t - this.pulseT;
    this.pins.children.forEach((c, i) => c.scale.setScalar(pa < 6 ? 1 + Math.abs(Math.sin(t * 5 + i)) * 0.7 : 1));
    const ba = t - this.boxT;
    this.box.visible = ba < 14;
    if (this.box.visible) this.box.position.x = zoneById.dispatch_dock.x - 0.9 - 1.4 + ((ba / 3.5) % 1) * 2.8;
    for (const f of this.frames.values()) {
      f.obj.scale.setScalar(Math.max(0.001, popIn((t - f.born) / 0.5)));
      f.obj.position.x += (f.x - f.obj.position.x) * (1 - Math.exp(-dt * 6)); // slide along as new ones arrive
    }
  }

  dispose() {
    disposeTree(this.group); // every geometry, and every textured material with its canvas
    (this.arc.material as THREE.Material).dispose();
  }
}

function drawPhone(g: CanvasRenderingContext2D, W: number, H: number, war: OfficeEvent[]) {
  const wall = g.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#D5E6B5');
  wall.addColorStop(1, '#8DBFA3');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#3390EC';
  g.fillRect(0, 0, W, 64);
  g.fillStyle = '#fff';
  g.font = `700 22px ${FONT}`;
  g.fillText('Kesar HQ · War Room', 16, 40);
  let y = H - 14;
  for (const e of [...war].reverse()) {
    const mine = personById[e.speaker]?.kind === 'human';
    const lines = clean(e.text).split('\n').slice(0, 3).map((l) => (l.length > 22 ? l.slice(0, 21) + '…' : l));
    const h = 34 + lines.length * 24;
    y -= h;
    if (y < 72) break;
    const x = mine ? 70 : 14, w = W - 84;
    g.fillStyle = mine ? '#EEFFDE' : '#fff';
    g.beginPath();
    g.roundRect(x, y, w, h - 8, 14);
    g.fill();
    g.fillStyle = mine ? '#4FAE4E' : personById[e.speaker]?.color ?? '#3390EC';
    g.font = `800 18px ${FONT}`;
    g.fillText(mine ? 'You' : personById[e.speaker]?.name ?? '', x + 12, y + 24);
    g.fillStyle = '#000';
    g.font = `600 18px ${FONT}`;
    lines.forEach((l, i) => g.fillText(l, x + 12, y + 48 + i * 24));
  }
}
