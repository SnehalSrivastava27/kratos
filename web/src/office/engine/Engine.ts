// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/main.ts (renderer setup, lights, the one frame loop with its clamped delta, OutlineEffect),
// world/sky.ts (the cartoon sun: never so low its shadows fill the room, colour by elevation) and
// player.ts (third-person orbit: drag to turn, wheel to zoom, eased camera; you walk the founder and the
// camera follows), and main.ts's interaction targeting (the nearest thing you face, and its hint). The
// server, net, voice and first-person parts are gone: this office is single-player and driven by our feed.
//
// The engine owns the renderer, scene, camera and ONE requestAnimationFrame loop. React mounts it into a
// div and pushes state in with apply()/focus(); nothing in React re-renders or rebuilds the scene.
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import type { Library, OfficeEvent, ShelfId } from '../../shared/types';
import type { PersonState, SceneState } from '../officeState';
import { initialState } from '../officeState';
import { ctx, deskById, freeDesks, roster, seatOf, zoneById, zones } from '../data';
import { Bookcases, SECTIONS, SHELF_LABEL, browseSpot } from './library';
import { Player } from './player';
import { Dog } from './dog';
import { Lofi } from './music';
import { mesh, roundedBox, toon, toonUnique } from '../toon';
import { disposeTree } from '../toon';
import { Agent } from './agent';
import { Confetti } from './confetti';
import { loadModels } from './models';
import { NavGrid } from './nav';
import { LiveProps, type GalleryItem } from './props';
import { DOOR, FLOOR, buildWorld, loadFont } from './world';
import { SwitchHub } from './switchHub';
import { CORE, HACK_SCREEN, WALL, stations, type StationId } from './layout';

/** What pressing E would use: the nearest thing you face. */
export type Target =
  | { kind: 'desk'; desk: string }
  | { kind: 'library'; shelf: ShelfId }
  | { kind: 'agent'; id: string }
  | { kind: 'frame'; url: string }
  | { kind: 'dog' }
  | { kind: 'jukebox' }
  | { kind: 'switch' }
  | { kind: 'station'; id: Exclude<StationId, 'switch'> }
  | { kind: 'seat' };

export interface EngineOpts {
  /** Live /office: drag to orbit, wheel/pinch to zoom, click a zone or a gallery frame. Off for the hero. */
  interactive: boolean;
  onPick?: (zoneId: string | null) => void;
  /** Player mode: the thing you'd use changed (null: nothing in reach). */
  onTarget?: (t: Target | null) => void;
  /** A click on the world in player mode (panels that aren't pinned close). */
  onWorldClick?: () => void;
  /** The landing hero (autoplay): clean badges, one short bubble, no floor stickers; 'hero' frames the middle of the floor. */
  hero?: 'wide' | 'hero' | null;
  /** The world is built and its first frame drawn. */
  onReady?: () => void;
  /** The Switch hub's name tag was clicked (live office only). */
  onSwitch?: () => void;
}
export const targetKey = (t: Target | null) => (t ? `${t.kind}:${'desk' in t ? t.desk : 'shelf' in t ? t.shelf : 'id' in t ? t.id : 'url' in t ? t.url : ''}` : '');
const HELLOS = ['Chai break? Save me a cup ☕', 'Morning, boss! 👋', 'Adrak wali, please 🙏', 'Two sugars for me 😄', 'Perfect timing ☕', 'Hi! Numbers look good today 📈'];
export const shelfLabel = (s: ShelfId) => SHELF_LABEL[s];

const DEG = Math.PI / 180;
const JUKEBOX: [number, number] = [zoneById.telegram_hub.x + 4.2, zoneById.telegram_hub.z + 1.2];
const STATIONS = stations(zoneById);
// The founder's camera (agent-office player.ts, third person): behind and a little above you at eye level, a wide
// lens, orbit by drag / two-finger scroll, zoom by wheel / pinch (out far enough for an aerial look round).
const FOLLOW = { pitch: 0.36, dist: 7.0, y: 1.3, fov: 55, maxZoom: 4 };
const WIDE_FOV = 32; // the overview's long lens
/**
 * Walls the follow camera must stay on your side of, doorways filled in (a camera backed through a doorway would
 * look at the lintel), grown a little so the near plane never pokes through.
 */
const CAM_WALLS = [
  { minX: FLOOR.minX - 1, maxX: WALL.backEnd, minZ: WALL.backZ - WALL.t / 2, maxZ: WALL.backZ + WALL.t / 2 },
  { minX: WALL.leftX - WALL.t / 2, maxX: WALL.leftX + WALL.t / 2, minZ: CORE.minZ, maxZ: FLOOR.maxZ + 1 },
  { minX: WALL.outerX - 1, maxX: WALL.outerX + WALL.t / 2, minZ: FLOOR.minZ - 1, maxZ: FLOOR.maxZ + 1 },
  { minX: FLOOR.minX - 1, maxX: FLOOR.maxX + 1, minZ: WALL.outerBackZ - 1, maxZ: WALL.outerBackZ + WALL.t / 2 }].map((r) => ({ minX: r.minX - 0.25, maxX: r.maxX + 0.25, minZ: r.minZ - 0.25, maxZ: r.maxZ + 0.25 }));
const inWall = (x: number, z: number) => CAM_WALLS.some((r) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ);
// Tilted 3/4 view from the front-right, so both walls read and the floor fills the frame.
const AZ = 0.12;
const elevation = (aspect: number) => THREE.MathUtils.clamp(1.25 - 0.3 * aspect, 0.86, 1.02); // portrait panes look down more
// The overview frames where the people are (every department zone, the moved ones too), not the whole 88 m floor:
// the empty far corners of the wings would only make everyone smaller. Wheel out to see the rest.
const [X0, X1, Z0, Z1] = [
  Math.min(...zones.map((z) => z.x - z.w / 2)) - 0.4, Math.max(...zones.map((z) => z.x + z.w / 2)) + 0.6,
  Math.min(...zones.map((z) => z.z - z.d / 2)) - 0.6, FLOOR.maxZ + 0.3,
];
const fitPts = (x0: number, x1: number, z0: number, z1: number) =>
  [[x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 2.6, z0], [x1, 2.6, z0], [x0, 2.6, z1]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
const FIT_PTS = fitPts(X0, X1, Z0, Z1);
// A portrait phone frames just the original block: the whole department area would put the camera ~150 m back and
// pile every name tag into one column at the edge. The wings are a pinch / walk away.
const FIT_PTS_NARROW = fitPts(CORE.minX - 0.4, CORE.maxX + 0.6, CORE.minZ - 0.6, CORE.maxZ + 0.3);
const ZOOM_OFF = new THREE.Vector3(Math.sin(AZ) * 8.5, 10.5, Math.cos(AZ) * 8.5 + 1);

const v3 = new THREE.Vector3();
/** Camera pose as orbit coordinates round a target. */
interface Pose { tx: number; ty: number; tz: number; yaw: number; pitch: number; dist: number }
const KEYS = ['tx', 'ty', 'tz', 'yaw', 'pitch', 'dist'] as const;

/** Distance + aim so the whole floor fits the canvas. */
function fitHome(fov: number, aspect: number, narrow: boolean): Pose {
  const c = new THREE.PerspectiveCamera(fov, aspect, 0.5, 200);
  // A tall, narrow pane (phones) looks along the floor from the open east side, so the long side runs up the screen.
  const yaw = aspect < 0.8 ? Math.PI / 2 - 0.1 : AZ;
  const EL = aspect < 0.8 ? 1.0 : elevation(aspect);
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(EL), Math.sin(EL), Math.cos(yaw) * Math.cos(EL));
  const tgt = new THREE.Vector3((FLOOR.minX + FLOOR.maxX) / 2, 0, 0.5);
  const p = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  let d = 40;
  for (let it = 0; it < 10; it++) {
    c.position.copy(tgt).addScaledVector(dir, d);
    c.lookAt(tgt);
    c.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of aspect < 1 ? FIT_PTS_NARROW : FIT_PTS) {
      p.copy(q).project(c);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const half = Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * d;
    right.setFromMatrixColumn(c.matrixWorld, 0);
    up.setFromMatrixColumn(c.matrixWorld, 1);
    tgt.addScaledVector(right, ((x0 + x1) / 2) * half * aspect).addScaledVector(up, ((y0 + y1) / 2) * half);
    // The whole floor fits the visible part of the canvas (a hair of margin), phones included.
    d *= Math.max((y1 - y0) / 2, (x1 - x0) / 2) / (narrow ? 0.98 : 0.94);
  }
  return { tx: tgt.x, ty: tgt.y, tz: tgt.z, yaw, pitch: EL, dist: d };
}

/**
 * The landing hero's shot: the War Room in the middle, looking down at the floor so the frame is all office
 * (no sky band, no wall cut off at its top). The farthest camera whose four frame corners, at either end of
 * the slow orbit, still land on the floor (or on the back wall below its top).
 */
const HERO = { tx: zoneById.war_room.x, tz: zoneById.war_room.z + 0.6, pitch: 0.98, sway: 0.09 };
function heroPose(fov: number, aspect: number): Pose {
  const c = new THREE.PerspectiveCamera(fov, aspect, 0.5, 200);
  const ray = new THREE.Raycaster(), v = new THREE.Vector2();
  const fits = (d: number) => [AZ - HERO.sway, AZ + HERO.sway].every((yaw) => {
    c.position.set(HERO.tx + Math.sin(yaw) * Math.cos(HERO.pitch) * d, Math.sin(HERO.pitch) * d, HERO.tz + Math.cos(yaw) * Math.cos(HERO.pitch) * d);
    c.lookAt(HERO.tx, 0, HERO.tz);
    c.updateMatrixWorld();
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([x, y]) => {
      ray.setFromCamera(v.set(x, y), c);
      const { origin: o, direction: dir } = ray.ray;
      if (dir.y >= 0) return false;
      const t = -o.y / dir.y, gx = o.x + dir.x * t, gz = o.z + dir.z * t;
      if (gx < FLOOR.minX + 0.2 || gx > FLOOR.maxX - 0.2 || gz > FLOOR.maxZ - 0.1) return false;
      if (gz >= FLOOR.minZ + 0.05) return true;
      const tw = (FLOOR.minZ - o.z) / dir.z; // past the back wall: fine if it hits the wall below its top
      return o.y + dir.y * tw < WALL_TOP;
    });
  });
  let lo = 4, hi = 60;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return { tx: HERO.tx, ty: 0, tz: HERO.tz, yaw: AZ, pitch: HERO.pitch, dist: lo * 0.97 };
}
const WALL_TOP = 2.5;

/** Name tags that would sit on top of each other: the one further back steps up above the other. */
function declutter(agents: Agent[]) {
  const order = agents.filter((a) => a.wide && !a.hidden).sort((a, b) => b.sy - a.sy); // nearest (lowest on screen) first
  for (let i = 1; i < order.length; i++) {
    const a = order[i];
    for (let j = 0; j < i; j++) {
      const b = order[j];
      const ay = a.sy - a.lift, by = b.sy - b.lift;
      if (Math.abs(a.sx - b.sx) < (a.wide + b.wide) / 2 && by - ay < b.tall && ay - by < a.tall) a.lift += b.tall - (by - ay);
    }
  }
}

/** Critically damped spring toward `to` (Game Programming Gems 4, 8.1): eases in and out, never overshoots. */
function smoothDamp(cur: number, to: number, vel: { v: number }, time: number, dt: number) {
  const omega = 2 / time;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - to;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * exp;
  return to + (change + temp) * exp;
}

export class OfficeEngine {
  private renderer: THREE.WebGLRenderer;
  private effect: OutlineEffect;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);
  private sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  private overlay = document.createElement('div');
  private agents: Agent[] = [];
  private player: Player | null = null;
  private founder: Agent | null = null;
  private view: 'player' | 'spectator' = 'spectator';
  /** The first walk starts in the Town Hall, facing the hackathon screen (then wherever the founder is). */
  private openAtScreen = true;
  private targetK = '';
  private shelves = new Bookcases();
  private tip = document.createElement('div');
  private dog: Dog | null = null;
  private woof = document.createElement('div');
  private woofT = -9;
  private music = new Lofi();
  private juke = new THREE.Group();
  private jukeGlow = toonUnique('#ffd166', { emissive: '#ffb703' });
  private beat = 0;
  private nav = new NavGrid(FLOOR, [], 0.3);
  private props: LiveProps | null = null;
  private hub: SwitchHub | null = null;
  private world: ReturnType<typeof buildWorld> | null = null;
  private confetti = new Confetti();
  private confettiId?: string;
  private burstAt = Infinity;
  private speaker: Agent | null = null;
  private latest: { scene: SceneState; events: OfficeEvent[]; gallery: GalleryItem[]; total: number } | null = null;
  private home: Pose = fitHome(32, 1.6, false);
  private heroShot: Pose = heroPose(32, 1.6);
  private ready = false;
  private cur: Pose | null = null;
  private vel = Object.fromEntries(KEYS.map((k) => [k, { v: 0 }])) as Record<(typeof KEYS)[number], { v: number }>;
  private focusZone: string | null = null;
  /** Drag/zoom offsets: wanted (set by input) and shown (eased toward wanted). */
  private user = { yaw: 0, pitch: 0, zoom: 1 };
  private userShown = { yaw: 0, pitch: 0, zoom: 1 };
  private size = { w: 1, h: 1 };
  private t = 0;
  private frames = 0;
  private last = 0;
  private raf = 0;
  private onScreen = true;
  private disposed = false;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private audio: AudioContext | null = null;
  private raycaster = new THREE.Raycaster();
  private calm = matchMedia('(prefers-reduced-motion: reduce)');
  private cleanup: (() => void)[] = [];

  constructor(private host: HTMLElement, private opts: EngineOpts) {
    // ---- Renderer & scene (main.ts) ----
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0); // the sky is the page's gradient behind the canvas
    this.effect = new OutlineEffect(renderer, { defaultThickness: 0.0035, defaultColor: [0.17, 0.18, 0.26] });
    const canvas = renderer.domElement;
    canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none';
    if (opts.interactive) canvas.style.touchAction = 'none';
    this.overlay.className = opts.hero ? 'hq-overlay hq-hero' : 'hq-overlay';
    host.append(canvas, this.overlay);

    const hemi = new THREE.HemisphereLight('#fff5e6', '#c9a27a', 1.5);
    const ambient = new THREE.AmbientLight('#ffffff', 0.5);
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(3072, 3072);
    Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 22, bottom: -22, near: 1, far: 110 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.scene.add(hemi, ambient, sun, sun.target, this.confetti.mesh);

    // ---- People ----
    this.addPeople();
    this.scene.add(this.shelves.group);
    this.tip.className = 'hq-tip';
    this.tip.hidden = true;
    this.overlay.append(this.tip);
    if (opts.interactive) {
      this.player = new Player(() => this.world?.solids ?? [], FLOOR);
      // The office dog wanders the main floor; the jukebox stands in the Telegram Hub lounge (both live office only).
      this.dog = new Dog(-2.5, 3.6, { minX: CORE.minX + 8.5, maxX: CORE.maxX + 6, minZ: CORE.minZ + 1.2, maxZ: CORE.maxZ - 0.6 }); // the main floor and the boulevard
      this.dog.onBark = () => (this.woofT = this.t);
      this.woof.className = 'hq-anchor';
      this.woof.innerHTML = '<div class="hq-over"><span class="hq-tag-name hq-woof">Woof!</span></div>'; // static markup, no data
      this.overlay.append(this.woof);
      this.scene.add(this.dog.root);
      const j = this.juke;
      j.add(mesh(roundedBox(0.72, 1.15, 0.46, 0.08), toon('#d64545'), 0, 0.575, 0));
      j.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.46, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), toon('#d64545'), 0, 1.15, 0));
      j.add(mesh(roundedBox(0.5, 0.42, 0.05, 0.04), this.jukeGlow, 0, 0.82, 0.235));
      j.add(mesh(roundedBox(0.5, 0.26, 0.05, 0.03), toon('#2b2d42'), 0, 0.36, 0.235));
      j.add(mesh(new THREE.BoxGeometry(0.84, 0.08, 0.56), toon('#2b2d42'), 0, 0.04, 0));
      j.position.set(JUKEBOX[0], 0, JUKEBOX[1]);
      j.rotation.y = -0.5;
      this.scene.add(j);
      this.music.onBeat = () => (this.beat = 1);
    }

    // ---- The office, once the models and the sign font are in ----
    Promise.all([loadModels(), loadFont()])
      .then(([models]) => {
        if (this.disposed) return;
        this.world = buildWorld(models, !opts.hero);
        if (this.player) this.world.solids.push({ minX: JUKEBOX[0] - 0.45, maxX: JUKEBOX[0] + 0.45, minZ: JUKEBOX[1] - 0.4, maxZ: JUKEBOX[1] + 0.4 });
        this.hub = new SwitchHub(this.overlay, opts.interactive ? opts.onSwitch : undefined);
        this.world.solids.push(this.hub.solid);
        this.nav = new NavGrid(FLOOR, this.world.solids, 0.3);
        if (this.founder && this.view === 'player' && !this.nav.free(this.player!.x, this.player!.z)) this.placeNear(this.founder.pos.x, this.founder.pos.z + 0.6);
        this.props = new LiveProps();
        this.scene.add(this.world.group, this.props.group, this.hub.group);
        if (this.latest) this.apply(this.latest.scene, this.latest.events, this.latest.gallery, this.latest.total);
      })
      .catch((e) => console.warn('office: models failed to load', e));

    // ---- Resize, and pause while hidden or scrolled away ----
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.io = new IntersectionObserver(([e]) => {
      this.onScreen = e.isIntersecting;
      this.run();
    });
    this.io.observe(host);
    const vis = () => this.run();
    document.addEventListener('visibilitychange', vis);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', vis));
    if (opts.interactive) this.bindInput(canvas);
    this.resize();
    this.run();

    if (import.meta.env.DEV) {
      // dev probes for the screenshot / leak loop
      const w = window as unknown as Record<string, unknown>;
      w.__hqInfo = () => {
        let meshes = 0;
        this.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) meshes++; });
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const i = this.renderer.info;
        return { frames: this.frames, meshes, calls: i.render.calls, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length, heapMB: mem ? Math.round(mem.usedJSHeapSize / 1e6) : null };
      };
      w.__hqBooks = () => this.shelves.shown;
      w.__hqGo = (x: number, z: number, facing = Math.PI) => { this.player?.place(x, z, facing); this.lastMove = this.t; }; // QA: stand somewhere
      w.__hqPlayer = () => (this.player ? { x: +this.player.x.toFixed(2), z: +this.player.z.toFixed(2), view: this.view, target: this.targetK } : null);
      w.__hqAgents = () => Object.fromEntries(this.agents.map((a) => [a.info.id, [+a.pos.x.toFixed(3), +a.pos.z.toFixed(3)]]));
      w.__hqSolids = () => this.world?.solids ?? [];
      // QA: every desk seat and station reachable from the front door on the real nav grid (all furniture), else the misses.
      w.__hqReach = () => {
        const miss: string[] = [];
        const reach = (id: string, x: number, z: number, r: number) => {
          const legs = this.nav.path(DOOR[0], DOOR[1], x, z);
          let [px, pz] = DOOR;
          for (const [k, [nx, nz]] of legs.entries()) {
            if (k < legs.length - 1 && !this.nav.clear(px, pz, nx, nz)) return miss.push(`${id}: leg ${k}`);
            [px, pz] = [nx, nz];
          }
          const prev = legs.length > 1 ? legs[legs.length - 2] : DOOR;
          if (!this.nav.clear(prev[0], prev[1], x, z) && Math.hypot(prev[0] - x, prev[1] - z) > r) miss.push(id);
        };
        for (const d of Object.values(deskById)) reach(d.id, d.x, d.z + 0.85, 1.2);
        for (const [id, st] of Object.entries(STATIONS)) reach(id, ...st.stand, 0.3);
        for (const sec of SECTIONS) reach(`shelf:${sec.id}`, ...browseSpot(sec), 0.3);
        return miss;
      };
      this.cleanup.push(() => { delete w.__hqInfo; delete w.__hqBooks; delete w.__hqGo; delete w.__hqPlayer; delete w.__hqAgents; delete w.__hqSolids; delete w.__hqReach; });
    }
  }

  /** Agents for everyone in the roster without one yet; those in `arriving` walk in from the front door. */
  addPeople(arriving: Set<string> = new Set()) {
    const have = new Set(this.agents.map((a) => a.info.id));
    const start = initialState(ctx);
    for (const p of roster) {
      if (have.has(p.id)) continue;
      const ps: PersonState = this.latest?.scene.people[p.id] ?? start.people[p.id] ?? { state: 'idle', zone: p.zone, route: [] };
      const a = new Agent(p, ps);
      a.onDing = () => this.ding();
      a.hero = !!this.opts.hero;
      if (p.id === 'librarian') a.wander = [...SECTIONS.map(browseSpot), seatOf(deskById['library#0'])];
      if (arriving.has(p.id)) a.walkIn(DOOR, this.nav);
      this.scene.add(a.person.root);
      this.overlay.append(a.el);
      a.person.root.scale.setScalar(this.farK);
      this.agents.push(a);
      if (p.id === 'founder') this.founder = a;
    }
  }

  /** You walk the founder (player) or watch the whole office (spectator: the old orbit camera). */
  setView(view: 'player' | 'spectator') {
    if (!this.player || !this.founder || view === this.view) return;
    this.view = view;
    this.user = { yaw: 0, pitch: 0, zoom: 1 };
    if (view === 'player') {
      this.focusZone = null;
      const f = this.founder;
      if (this.openAtScreen && !this.opts.hero) {
        // Facing -z (atan2(0, -1) = PI): the screen is at the back of the Town Hall and faces +z.
        const x = HACK_SCREEN.x, z = HACK_SCREEN.z + 6.5;
        f.pos.set(x, f.pos.y, z);
        this.player.place(x, z, Math.PI);
        this.user = { yaw: 0, pitch: -0.2, zoom: 1.15 }; // a flatter, slightly wider look so the whole screen is in frame
      } else this.player.place(f.pos.x, f.pos.z, f.person.root.rotation.y);
      this.openAtScreen = false;
      if (!this.nav.free(this.player.x, this.player.z)) this.placeNear(this.player.x, this.player.z + 0.6);
      f.drive = { moving: false, speed: 0, facing: this.player.facing };
    } else {
      this.player.stop();
      const own = deskById['founder_desk#0'];
      if (this.sitNext && own) this.founder.goTo(own.x, own.z + 0.85, this.nav); // sat down at their desk (E there)
      else this.founder.release(this.nav);
      this.sitNext = false;
      this.setTarget(null);
    }
  }
  private sitNext = false;
  private lastMove = -99;
  private farK = 1;
  private camLift = 0;
  /** The next switch to spectator seats the founder at their own desk (rather than where the feed puts them). */
  sitDown() {
    this.sitNext = true;
  }

  /** Keys walk only while no window is open. */
  setEnabled(on: boolean) {
    if (!this.player) return;
    this.player.enabled = on;
    if (!on) this.player.stop();
  }

  /** N: next to someone (the one waiting on you), facing them. Spectator: fly to their zone. */
  jumpTo(id: string) {
    const a = this.agents.find((g) => g.info.id === id);
    if (!a) return;
    if (this.view !== 'player' || !this.player) return this.focus(a.ps.zone);
    this.placeNear(a.pos.x, a.pos.z, true);
  }

  private placeNear(x: number, z: number, face = false) {
    const p = this.player!;
    for (const r of [1.1, 1.6, 2.2]) for (let k = 0; k < 8; k++) {
      const ang = Math.PI / 2 + (k * Math.PI) / 4; // in front of them first (toward the camera)
      const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
      if (!this.nav.free(px, pz)) continue;
      p.place(px, pz, face ? Math.atan2(x - px, z - pz) : p.facing);
      return;
    }
    p.place(x, z + 1);
  }

  /** The zone you're standing in (player mode), for the command bar's default topic. */
  playerZone(): string | null {
    const p = this.player;
    if (!p || this.view !== 'player') return null;
    return zones.find((zn) => Math.abs(p.x - zn.x) <= zn.w / 2 && Math.abs(p.z - zn.z) <= zn.d / 2)?.id ?? null;
  }

  private inset = { left: 0, right: 0 };
  /** Pixels covered by panels on each side (the follow camera centres you in the rest). */
  setInsets(left: number, right: number) {
    this.inset = { left, right };
    this.home = this.homeFor();
  }
  /** The whole-office shot, fitted to the part of the canvas the side panels leave visible. */
  private homeFor(): Pose {
    const { w, h } = this.size, { left: L, right: R } = this.inset;
    if (w < 760 || L + R === 0) return fitHome(WIDE_FOV, w / h, w < 520);
    const p = fitHome(WIDE_FOV, (w - L - R) / h, false);
    const s = ((R - L) / w) * Math.tan(THREE.MathUtils.degToRad(WIDE_FOV / 2)) * p.dist * (w / h);
    p.tx += Math.cos(p.yaw) * s;
    p.tz -= Math.sin(p.yaw) * s;
    return p;
  }

  /** E at the dog: a pat, a wag. */
  pet() {
    this.dog?.pet(this.t);
  }
  /** The jukebox (E there, or the HUD's music button). Off until asked: nothing plays by itself. */
  toggleMusic(): boolean {
    if (this.music.playing) this.music.stop();
    else this.music.start();
    return this.music.playing;
  }

  /** The library's shelves follow /api/library. */
  setLibrary(lib: Library | null) {
    this.shelves.sync(lib);
  }

  /** The reducer's scene (and what the walls show) → motion. Cheap: only differences do anything. */
  apply(scene: SceneState, events: OfficeEvent[], gallery: GalleryItem[], total = events.length) {
    this.latest = { scene, events, gallery, total };
    for (const a of this.agents) {
      const ps = scene.people[a.info.id];
      if (!ps) continue;
      a.sync(ps, this.nav, this.t);
      if (ps.bubble) this.speaker = a;
    }
    if (!events.length) this.speaker = null;
    if (scene.confettiId !== this.confettiId) {
      this.confettiId = scene.confettiId;
      if (scene.confettiId) this.celebrate();
      else {
        this.confetti.clear();
        this.burstAt = Infinity;
      }
    }
    this.props?.sync(scene, events, gallery);
    this.hub?.sync(events, total);
  }

  /** The chai corner: the founder has a cup, and whoever is nearby says hello (local bubbles, never in the chat). */
  chai() {
    const f = this.founder;
    if (!f) return;
    f.chaiUntil = this.t + 7;
    if (this.player && this.view === 'player') this.player.facing = 0; // turn to the room, cup in hand
    const near = this.agents
      .filter((a) => a !== f && a.pos.distanceTo(f.pos) < 9 && !a.talking)
      .sort((a, b) => a.pos.distanceTo(f.pos) - b.pos.distanceTo(f.pos))
      .slice(0, 2);
    // One at a time, so the two bubbles don't pile up on each other.
    near.forEach((a, i) => setTimeout(() => !this.disposed && a.say(HELLOS[(Math.floor(this.t) + i) % HELLOS.length], this.t), 400 + i * 2600));
  }

  /** Fly to a zone (eased), or back to the whole office. Either way, drag/zoom offsets are let go. */
  focus(zoneId: string | null) {
    this.focusZone = zoneId && zoneById[zoneId] ? zoneId : null;
    this.user = { yaw: 0, pitch: 0, zoom: 1 };
  }

  private celebrate() {
    const war = zoneById.war_room;
    // Party poppers round the war room, then one more over the middle a beat later (confetti.ts burst).
    for (const [dx, dz] of [[-2.5, 1.5], [2.5, 1.5], [0, -1.5]]) this.confetti.burst(war.x + dx, 1, war.z + dz, 160, 1.1);
    this.burstAt = this.t + 0.7;
    for (const a of this.agents) a.dance(this.t);
  }

  // ---- Loop (main.ts frame) ----
  private run() {
    const on = !this.disposed && this.onScreen && !document.hidden;
    if (on && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    } else if (!on && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private frame = (now: number) => {
    // Clamped, so a long stall (a hidden tab, a slow frame) never makes anyone skip across the room.
    const dt = Math.min(Math.max(0, now - this.last) / 1000, 0.1);
    this.last = now;
    this.t += dt;
    this.frames++;
    const t = this.t;
    this.updateSky(t);
    const pl = this.player, f = this.founder;
    if (pl && f && this.view === 'player') {
      pl.update(dt, (this.cur?.yaw ?? AZ) + this.userShown.yaw);
      if (pl.moving || pl.walking) this.lastMove = t;
      f.pos.set(pl.x, f.pos.y, pl.z);
      f.drive = { moving: pl.moving, speed: pl.speed, facing: pl.facing };
      if (this.frames % 4 === 0) this.findTarget();
    }
    for (const a of this.agents) a.roam(this.nav, t);
    for (const a of this.agents) {
      a.lookAt = this.speaker && this.speaker !== a ? { x: this.speaker.pos.x, z: this.speaker.pos.z, zone: this.speaker.ps.zone } : null;
      a.update(dt, t);
    }
    this.props?.update(dt, t);
    if (this.dog && this.world) {
      const w = this.agents.find((a) => a.ps.beacon);
      this.dog.alarm = w ? { x: w.pos.x, z: w.pos.z } : null;
      this.dog.update(dt, t, this.nav);
      this.woof.style.display = t - this.woofT < 1.1 ? '' : 'none';
      if (this.woof.style.display === '') {
        v3.copy(this.dog.pos).setY(0.9).project(this.camera);
        this.woof.style.transform = `translate3d(${Math.round((v3.x * 0.5 + 0.5) * this.size.w)}px, ${Math.round((-v3.y * 0.5 + 0.5) * this.size.h)}px, 0)`;
      }
    }
    this.beat = Math.max(0, this.beat - dt * 3);
    this.jukeGlow.emissiveIntensity = this.music.playing ? 0.6 + this.beat * 1.4 : 0.15;
    if (t >= this.burstAt) {
      this.burstAt = Infinity;
      const war = zoneById.war_room;
      this.confetti.burst(war.x, 1.2, war.z + 3, 220, 1.4);
    }
    this.confetti.update(dt);
    this.updateCamera(dt, t);
    // Seen from far off (the overview), people and their tags grow so they still read; the walking view and the
    // landing hero keep them life-size. Quantised, so it only touches them when the zoom really changes.
    const far = this.view === 'player' || this.opts.hero || !this.cur ? 1 : Math.round(THREE.MathUtils.clamp(this.cur.dist * this.userShown.zoom / 30, 1, 2.2) * 10) / 10;
    if (far !== this.farK) {
      this.farK = far;
      for (const a of this.agents) a.person.root.scale.setScalar(far);
      this.overlay.classList.toggle('hq-far', far > 1.3);
    }
    this.scene.updateMatrixWorld();
    this.hub?.update(dt, t, this.camera, this.size.w, this.size.h);
    for (const a of this.agents) a.project(this.camera, this.size.w, this.size.h);
    declutter(this.agents);
    if (this.opts.hero) this.unclutterBubble();
    for (const a of this.agents) a.place(dt);
    if (this.world) {
      this.effect.render(this.scene, this.camera);
      if (!this.ready) {
        this.ready = true;
        this.host.dataset.ready = '1'; // for poster capture scripts
        this.opts.onReady?.();
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** A cartoon afternoon sun drifting slowly across the sky, so shadows creep like real ones (sky.ts). */
  private updateSky(t: number) {
    // Ambient day light: the sun follows the viewer's own clock (low and warm early and late, high at noon),
    // never below a cartoon-afternoon floor so the room stays readable at night.
    const d = new Date(), hour = d.getHours() + d.getMinutes() / 60;
    const day = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)); // 0 at 6:00/18:00, 1 at noon
    if (this.frames % 120 === 0) this.sun.color.set(day > 0.45 ? '#fff1d6' : day > 0.15 ? '#ffd9a8' : '#ffc39a');
    const elD = 22 + day * 26 + Math.sin(t * 0.021) * 4;
    const az = -0.65 + Math.sin(t * 0.013) * 0.25;
    const lightEl = (25 + Math.max(0, elD) * 0.6) * DEG;
    // The shadow box: round you while you walk (crisp), the whole 88 m floor in the overview.
    const near = this.view === 'player' && !!this.cur;
    const [cx, cz] = near ? [this.cur!.tx, this.cur!.tz] : [(FLOOR.minX + FLOOR.maxX) / 2, (FLOOR.minZ + FLOOR.maxZ) / 2];
    const sc = this.sun.shadow.camera, hw = near ? 22 : 50, hd = near ? 22 : 30;
    if (sc.right !== hw || sc.top !== hd) {
      Object.assign(sc, { left: -hw, right: hw, top: hd, bottom: -hd, far: 160 });
      sc.updateProjectionMatrix();
    }
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(Math.cos(lightEl) * Math.sin(az), Math.sin(lightEl), Math.cos(lightEl) * Math.cos(az)).multiplyScalar(60).add(this.sun.target.position);
  }

  private updateCamera(dt: number, t: number) {
    const z = this.focusZone && zoneById[this.focusZone];
    let goal: Pose;
    let lag = 0.85;
    if (this.view === 'player' && this.player) {
      // Third person at eye level (agent-office player.ts updateCamera), the overview's heading so the office reads
      // the same way. Stood still while the story plays, it glides to whoever is talking (and back when you move).
      const aspect = this.size.w / this.size.h;
      const dist = FOLLOW.dist * (aspect < 1 ? 1.25 : 1);
      const s = this.speaker;
      const watch = s && s !== this.founder && s.talking && t - this.lastMove > 3.5 ? s.pos : null;
      // Panels over the canvas (topics left, chat right): keep you in the middle of what's still visible.
      const halfW = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist * aspect;
      const shift = ((this.inset.right - this.inset.left) / 2 / this.size.w) * 2 * halfW;
      goal = watch
        ? { tx: watch.x, ty: FOLLOW.y, tz: watch.z + 0.5, yaw: AZ, pitch: FOLLOW.pitch + 0.15, dist: dist * 1.35 }
        : { tx: this.player.x + shift * 0.3, ty: FOLLOW.y, tz: this.player.z, yaw: AZ, pitch: FOLLOW.pitch, dist };
      lag = watch ? 1.1 : this.cur && Math.hypot(this.cur.tx - goal.tx, this.cur.tz - goal.tz) > 6 ? 0.6 : 0.12; // long jumps glide, walking stays tight
    } else if (this.opts.hero === 'hero' && !z) {
      // The hero: a slow cinematic orbit and a gentle push in, never wider than the shot that fits.
      const h = this.heroShot, drift = this.calm.matches ? 0 : 1;
      goal = { ...h, yaw: h.yaw + Math.sin(t * 0.045) * HERO.sway * drift, dist: h.dist * (1 - (0.5 + 0.5 * Math.sin(t * 0.03 - 1.5)) * 0.06 * drift) };
      lag = 1.2;
    } else if (z) {
      goal = { tx: z.x, ty: 0.8, tz: z.z, yaw: AZ, pitch: Math.atan2(ZOOM_OFF.y, Math.hypot(ZOOM_OFF.x, ZOOM_OFF.z)), dist: ZOOM_OFF.length() };
    } else {
      // Overview: a slow breathing orbit; the hero leans a little toward whoever is talking.
      const h = this.home;
      const drift = this.calm.matches ? 0 : 1;
      goal = { ...h, yaw: h.yaw + Math.sin(t * 0.07) * 0.06 * drift, dist: h.dist * (1 + Math.sin(t * 0.05) * 0.015 * drift) };
      const s = this.speaker;
      if (s && !this.opts.interactive) {
        goal.tx += (s.pos.x - h.tx) * 0.12;
        goal.tz += (s.pos.z - h.tz) * 0.08;
      }
    }
    if (!this.cur) this.cur = this.opts.hero ? { ...goal } : { ...this.home }; // start on the whole office; player mode then swoops down to you
    for (const k of KEYS) this.cur[k] = smoothDamp(this.cur[k], goal[k], this.vel[k], lag, dt);
    const e = 1 - Math.exp(-dt * 10);
    const u = this.userShown;
    u.yaw += (this.user.yaw - u.yaw) * e;
    u.pitch += (this.user.pitch - u.pitch) * e;
    u.zoom += (this.user.zoom - u.zoom) * e;
    const c = this.cur;
    const yaw = c.yaw + u.yaw;
    const near = this.view === 'player' && !!this.player;
    let pitch = THREE.MathUtils.clamp(c.pitch + u.pitch, near ? 0.06 : 0.22, 1.4);
    let dist = c.dist * u.zoom;
    const fov = near ? THREE.MathUtils.lerp(FOLLOW.fov, WIDE_FOV, THREE.MathUtils.clamp((u.zoom - 1.5) / 2.5, 0, 1)) : WIDE_FOV;
    if (Math.abs(this.camera.fov - fov) > 0.01 || this.camera.near !== (near ? 0.1 : 0.5)) {
      this.camera.near = near ? 0.1 : 0.5; // close behind you by a wall, the near plane must not cut into your head
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
    if (near) {
      // Stay on your side of the walls (agent-office clamps the camera inside the room): walk the line out from you and
      // treat the first wall it meets below the wall's top as in the way.
      const hit = (p: number, d: number) => {
        const dx = Math.sin(yaw) * Math.cos(p), dz = Math.cos(yaw) * Math.cos(p), dy = Math.sin(p);
        for (let k = 1; k <= 40; k++) {
          const f = (d * k) / 40;
          if (c.ty + dy * f < WALL.h + 0.4 && inWall(c.tx + dx * f, c.tz + dz * f)) return (k - 1) / 40;
        }
        return -1;
      };
      // Blocked: rise (eased) until the view clears the wall's top, the open-plan way (there is no ceiling); only if
      // even a steep look can't clear it, pull in, never closer than an arm's length behind you.
      let lift = 0;
      if (hit(pitch, dist) >= 0) {
        lift = 1.15 - pitch;
        for (let p = pitch + 0.05; p < 1.15; p += 0.05) if (hit(p, dist) < 0) { lift = Math.min(1.2, p + 0.1) - pitch; break; } // a margin: the ease approaches it from below
      }
      this.camLift += (lift - this.camLift) * Math.min(1, dt * 4);
      pitch += this.camLift;
      const f = hit(pitch, dist);
      if (f >= 0) dist = Math.max(2.2, dist * f);
    }
    this.camera.position.set(c.tx + Math.sin(yaw) * Math.cos(pitch) * dist, c.ty + Math.sin(pitch) * dist, c.tz + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(c.tx, c.ty, c.tz);
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    if (w === this.size.w && h === this.size.h) return;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.home = this.homeFor();
    this.heroShot = heroPose(WIDE_FOV, w / h);
    if (this.opts.hero === 'hero') this.cur = null; // a resize re-frames at once, no swoop
  }

  // ---- Input (player.ts third-person orbit) ----
  private bindInput(canvas: HTMLCanvasElement) {
    let drag: { x: number; y: number; moved: number; id: number } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let hoverEv: PointerEvent | null = null, hoverRaf = 0;
    this.cleanup.push(() => cancelAnimationFrame(hoverRaf));
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      if (!this.audio) this.audio = new AudioContext(); // a gesture: from now on a done can ding
    };
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.zoomBy(pinch / d);
        pinch = d;
        if (drag) drag.moved += 99;
        return;
      }
      if (!drag || e.pointerId !== drag.id) {
        // Hover picking (frames, book spines) at most once a frame, however fast the mouse reports.
        hoverEv = e;
        hoverRaf ||= requestAnimationFrame(() => {
          hoverRaf = 0;
          if (!hoverEv || this.disposed) return;
          canvas.style.cursor = this.frameAt(hoverEv) ? 'pointer' : '';
          this.hover(hoverEv);
        });
        return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      this.user.yaw -= dx * 0.006;
      this.user.pitch = THREE.MathUtils.clamp(this.user.pitch + dy * 0.004, -0.6, this.view === 'player' ? 0.6 : 0.45);
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      drag = null;
      if (d.moved > 5) return;
      const url = this.frameAt(e);
      if (url) window.open(url, '_blank', 'noopener');
      else if (this.view === 'player') this.clickWalk(e);
      else this.opts.onPick?.(this.zoneAt(e));
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      // agent-office player.ts: a trackpad's two-finger scroll orbits (walking view); a pinch (ctrl+wheel) or a
      // mouse wheel's notches zoom. ponytail: a notch is guessed from wheelDelta being a multiple of 120.
      const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
      const notch = e.deltaMode !== 0 || (!e.deltaX && !!legacy && legacy % 120 === 0);
      if (this.view === 'player' && !e.ctrlKey && !notch) {
        this.user.yaw -= e.deltaX * 0.006;
        this.user.pitch = THREE.MathUtils.clamp(this.user.pitch + e.deltaY * 0.004, -0.6, 0.6);
        return;
      }
      this.zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
    });
  }

  private zoomBy(f: number) {
    this.user.zoom = THREE.MathUtils.clamp(this.user.zoom * f, 0.4, this.view === 'player' ? FOLLOW.maxZoom : 1.5);
  }

  private ray(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    return this.raycaster;
  }
  private frameAt(e: PointerEvent): string | null {
    if (!this.props?.clickables.length) return null;
    return (this.ray(e).intersectObjects(this.props.clickables, false)[0]?.object.userData.url as string) ?? null;
  }
  /** Click-to-walk: to the floor point, or up to the person you clicked near. */
  private clickWalk(e: PointerEvent) {
    this.opts.onWorldClick?.();
    if (!this.world || !this.player) return;
    const hit = this.ray(e).intersectObject(this.world.floor, false)[0];
    if (!hit) return;
    let { x, z } = hit.point;
    const near = this.agents.find((a) => a !== this.founder && Math.hypot(a.pos.x - x, a.pos.z - z) < 0.8);
    if (near) [x, z] = [near.pos.x, near.pos.z + 0.9];
    this.player.walkTo(this.nav, x, z);
  }

  /** A book's title under the pointer, as a little tooltip. */
  private hover(e: PointerEvent) {
    const book = this.shelves.bookAt(this.ray(e));
    this.tip.hidden = !book;
    if (!book) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.tip.textContent = `📕 ${book.name}`;
    this.tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 12}px)`;
    this.renderer.domElement.style.cursor = 'help';
  }

  /** What you'd use with E: the nearest thing in reach that you're more or less facing (main.ts targeting). */
  private findTarget() {
    const p = this.player!;
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    let best: Target | null = null, bestScore = Infinity;
    const consider = (t: Target, x: number, z: number, reach: number) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d > reach) return;
      const facing = d < 0.05 ? 1 : (dx * fx + dz * fz) / d;
      if (d > 0.7 && facing < 0.2) return;
      const score = d - facing * 0.6;
      if (score < bestScore) [best, bestScore] = [t, score];
    };
    for (const d of freeDesks()) consider({ kind: 'desk', desk: d.id }, d.x, d.z + 0.6, 1.5);
    for (const s of SECTIONS) consider({ kind: 'library', shelf: s.id }, s.x, s.z + 0.3, 1.6);
    for (const a of this.agents) if (a !== this.founder) consider({ kind: 'agent', id: a.info.id }, a.pos.x, a.pos.z, 1.7);
    if (this.dog) consider({ kind: 'dog' }, this.dog.pos.x, this.dog.pos.z, 1.4);
    consider({ kind: 'jukebox' }, JUKEBOX[0], JUKEBOX[1] + 0.5, 1.5);
    if (this.hub) consider({ kind: 'switch' }, ...this.hub.front, 1.8);
    for (const [id, st] of Object.entries(STATIONS) as [StationId, (typeof STATIONS)[StationId]][])
      if (id !== 'switch' && (id !== 'ledger' || zoneById.finance_cabin) && (id !== 'hire' || zoneById.reception)) consider({ kind: 'station', id }, ...st.at, st.reach);
    const own = deskById['founder_desk#0'];
    if (own) consider({ kind: 'seat' }, own.x, own.z + 0.85, 1.3);
    for (const fr of this.props?.clickables ?? []) {
      const w = fr.getWorldPosition(new THREE.Vector3());
      consider({ kind: 'frame', url: fr.userData.url as string }, w.x, w.z + 0.4, (fr.userData.reach as number) ?? 2.0);
    }
    this.setTarget(best);
  }

  private setTarget(t: Target | null) {
    const k = targetKey(t);
    if (k === this.targetK) return;
    this.targetK = k;
    this.opts.onTarget?.(t);
  }

  private zoneAt(e: PointerEvent): string | null {
    if (!this.world) return null;
    const hit = this.ray(e).intersectObject(this.world.floor, false)[0];
    if (!hit) return null;
    const { x, z } = hit.point;
    return zones.find((zn) => Math.abs(x - zn.x) <= zn.w / 2 && Math.abs(z - zn.z) <= zn.d / 2)?.id ?? null;
  }

  /** The hero shows one bubble: badges it would cover fade out until it's gone. */
  private unclutterBubble() {
    const s = this.agents.find((a) => a.talking);
    for (const a of this.agents) {
      let cover = false;
      if (s && a !== s) {
        const b = s.bubbleBox();
        cover = a.sx > s.sx - b.w / 2 - 20 && a.sx < s.sx + b.w / 2 + 20 && a.sy > s.sy - b.h - 30 && a.sy < s.sy + 10;
      }
      a.el.classList.toggle('hq-dim', cover);
    }
  }

  /** A soft two-note ding when someone delivers (live office only, once the page has had a click). */
  private ding() {
    const a = this.audio;
    if (!a || a.state !== 'running' || document.hidden) return;
    const o = a.createOscillator(), g = a.createGain(), at = a.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(1318.5, at);
    o.frequency.setValueAtTime(1760, at + 0.09);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.08, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    o.connect(g).connect(a.destination);
    o.start(at);
    o.stop(at + 0.62);
  }

  dispose() {
    this.disposed = true;
    this.run();
    this.ro.disconnect();
    this.io.disconnect();
    for (const c of this.cleanup) c();
    for (const a of this.agents) a.dispose();
    this.player?.dispose();
    this.dog?.dispose();
    this.music.dispose();
    this.jukeGlow.dispose();
    this.juke.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
    this.shelves.dispose();
    this.props?.dispose();
    this.hub?.dispose();
    if (this.world) disposeTree(this.world.group);
    this.confetti.dispose();
    void this.audio?.close();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }
}
