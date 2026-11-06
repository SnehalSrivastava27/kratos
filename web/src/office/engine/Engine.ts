// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/main.ts (renderer setup, lights, the one frame loop with its clamped delta, OutlineEffect),
// world/sky.ts (the cartoon sun: never so low its shadows fill the room, colour by elevation) and
// player.ts (third-person orbit: drag to turn, wheel to zoom, eased camera). The server, net, voice and
// first-person parts are gone: this office is single-player and driven by our event feed.
//
// The engine owns the renderer, scene, camera and ONE requestAnimationFrame loop. React mounts it into a
// div and pushes state in with apply()/focus(); nothing in React re-renders or rebuilds the scene.
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import type { OfficeEvent } from '../../shared/types';
import type { SceneState } from '../officeState';
import { initialState } from '../officeState';
import { ctx, roster, zoneById, zones } from '../data';
import { disposeTree } from '../toon';
import { Agent } from './agent';
import { Confetti } from './confetti';
import { loadModels } from './models';
import { NavGrid } from './nav';
import { LiveProps, type GalleryItem } from './props';
import { FLOOR, buildWorld, loadFont } from './world';

export interface EngineOpts {
  /** Live /office: drag to orbit, wheel/pinch to zoom, click a zone or a gallery frame. Off for the hero. */
  interactive: boolean;
  onPick?: (zoneId: string | null) => void;
}

const DEG = Math.PI / 180;
// Tilted 3/4 view from the front-right, so both walls read and the floor fills the frame.
const AZ = 0.12;
const elevation = (aspect: number) => THREE.MathUtils.clamp(1.25 - 0.3 * aspect, 0.86, 1.02); // portrait panes look down more
const FIT_PTS = [
  [-12.4, 0, 8.4], [12.4, 0, 8.4], [12.4, 0, -8.2], [-12.4, 2.6, -8.2], [12.4, 2.6, -8.2], [-12.4, 2.6, 8.4],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));
const ZOOM_OFF = new THREE.Vector3(Math.sin(AZ) * 8.5, 10.5, Math.cos(AZ) * 8.5 + 1);

/** Camera pose as orbit coordinates round a target. */
interface Pose { tx: number; ty: number; tz: number; yaw: number; pitch: number; dist: number }
const KEYS = ['tx', 'ty', 'tz', 'yaw', 'pitch', 'dist'] as const;

/** Distance + aim so the whole floor fits the canvas (a little cropped on narrow screens). */
function fitHome(fov: number, aspect: number, narrow: boolean): Pose {
  const c = new THREE.PerspectiveCamera(fov, aspect, 0.5, 200);
  const EL = elevation(aspect);
  const dir = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
  const tgt = new THREE.Vector3(0, 0, 0.5);
  const p = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  let d = 40;
  for (let it = 0; it < 10; it++) {
    c.position.copy(tgt).addScaledVector(dir, d);
    c.lookAt(tgt);
    c.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of FIT_PTS) {
      p.copy(q).project(c);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const half = Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * d;
    right.setFromMatrixColumn(c.matrixWorld, 0);
    up.setFromMatrixColumn(c.matrixWorld, 1);
    tgt.addScaledVector(right, ((x0 + x1) / 2) * half * aspect).addScaledVector(up, ((y0 + y1) / 2) * half);
    const crop = narrow ? 0.66 : THREE.MathUtils.clamp(0.25 + 0.45 * aspect, 0.6, 0.9); // portrait / phones: let the sides run off rather than shrink everything
    d *= Math.max((y1 - y0) / 2, ((x1 - x0) / 2) * crop) / 0.96;
  }
  return { tx: tgt.x, ty: tgt.y, tz: tgt.z, yaw: AZ, pitch: EL, dist: d };
}

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
  private agents: Agent[];
  private nav = new NavGrid(FLOOR, [], 0.3);
  private props: LiveProps | null = null;
  private world: ReturnType<typeof buildWorld> | null = null;
  private confetti = new Confetti();
  private confettiId?: string;
  private burstAt = Infinity;
  private speaker: Agent | null = null;
  private latest: { scene: SceneState; events: OfficeEvent[]; gallery: GalleryItem[] } | null = null;
  private home: Pose = fitHome(32, 1.6, false);
  private cur: Pose | null = null;
  private vel = Object.fromEntries(KEYS.map((k) => [k, { v: 0 }])) as Record<(typeof KEYS)[number], { v: number }>;
  private focusZone: string | null = null;
  /** Drag/zoom offsets: wanted (set by input) and shown (eased toward wanted). */
  private user = { yaw: 0, pitch: 0, zoom: 1 };
  private userShown = { yaw: 0, pitch: 0, zoom: 1 };
  private size = { w: 1, h: 1 };
  private t = 0;
  private last = 0;
  private raf = 0;
  private onScreen = true;
  private disposed = false;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private audio: AudioContext | null = null;
  private raycaster = new THREE.Raycaster();
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
    this.overlay.className = 'hq-overlay';
    host.append(canvas, this.overlay);

    const hemi = new THREE.HemisphereLight('#fff5e6', '#c9a27a', 1.5);
    const ambient = new THREE.AmbientLight('#ffffff', 0.5);
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 15, bottom: -15, near: 1, far: 100 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.scene.add(hemi, ambient, sun, sun.target, this.confetti.mesh);

    // ---- People ----
    const start = initialState(ctx);
    this.agents = roster.map((p) => {
      const a = new Agent(p, start.people[p.id]);
      a.onDing = () => this.ding();
      this.scene.add(a.person.root);
      this.overlay.append(a.el);
      return a;
    });

    // ---- The office, once the models and the sign font are in ----
    Promise.all([loadModels(), loadFont()])
      .then(([models]) => {
        if (this.disposed) return;
        this.world = buildWorld(models);
        this.nav = new NavGrid(FLOOR, this.world.solids, 0.3);
        this.props = new LiveProps();
        this.scene.add(this.world.group, this.props.group);
        if (this.latest) this.apply(this.latest.scene, this.latest.events, this.latest.gallery);
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
        return { meshes, calls: i.render.calls, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length, heapMB: mem ? Math.round(mem.usedJSHeapSize / 1e6) : null };
      };
      w.__hqAgents = () => Object.fromEntries(this.agents.map((a) => [a.info.id, [+a.pos.x.toFixed(3), +a.pos.z.toFixed(3)]]));
      this.cleanup.push(() => { delete w.__hqInfo; delete w.__hqAgents; });
    }
  }

  /** The reducer's scene (and what the walls show) → motion. Cheap: only differences do anything. */
  apply(scene: SceneState, events: OfficeEvent[], gallery: GalleryItem[]) {
    this.latest = { scene, events, gallery };
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
    const t = this.t;
    this.updateSky(t);
    for (const a of this.agents) {
      a.lookAt = this.speaker && this.speaker !== a ? { x: this.speaker.pos.x, z: this.speaker.pos.z, zone: this.speaker.ps.zone } : null;
      a.update(dt, t);
    }
    this.props?.update(dt, t);
    if (t >= this.burstAt) {
      this.burstAt = Infinity;
      const war = zoneById.war_room;
      this.confetti.burst(war.x, 1.2, war.z + 3, 220, 1.4);
    }
    this.confetti.update(dt);
    this.updateCamera(dt, t);
    this.scene.updateMatrixWorld();
    for (const a of this.agents) a.project(this.camera, this.size.w, this.size.h);
    declutter(this.agents);
    for (const a of this.agents) a.place(dt);
    if (this.world) this.effect.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** A cartoon afternoon sun drifting slowly across the sky, so shadows creep like real ones (sky.ts). */
  private updateSky(t: number) {
    const elD = 38 + Math.sin(t * 0.021) * 6;
    const az = -0.65 + Math.sin(t * 0.013) * 0.25;
    const lightEl = (25 + Math.max(0, elD) * 0.6) * DEG;
    this.sun.position.set(Math.cos(lightEl) * Math.sin(az), Math.sin(lightEl), Math.cos(lightEl) * Math.cos(az)).multiplyScalar(45);
  }

  private updateCamera(dt: number, t: number) {
    const z = this.focusZone && zoneById[this.focusZone];
    let goal: Pose;
    if (z) {
      goal = { tx: z.x, ty: 0.8, tz: z.z, yaw: AZ, pitch: Math.atan2(ZOOM_OFF.y, Math.hypot(ZOOM_OFF.x, ZOOM_OFF.z)), dist: ZOOM_OFF.length() };
    } else {
      // Overview: a slow breathing orbit; the hero leans a little toward whoever is talking.
      const h = this.home;
      goal = { ...h, yaw: h.yaw + Math.sin(t * 0.07) * 0.06, dist: h.dist * (1 + Math.sin(t * 0.05) * 0.015) };
      const s = this.speaker;
      if (s && !this.opts.interactive) {
        goal.tx += (s.pos.x - h.tx) * 0.12;
        goal.tz += (s.pos.z - h.tz) * 0.08;
      }
    }
    if (!this.cur) this.cur = { ...goal };
    for (const k of KEYS) this.cur[k] = smoothDamp(this.cur[k], goal[k], this.vel[k], 0.85, dt);
    const e = 1 - Math.exp(-dt * 10);
    const u = this.userShown;
    u.yaw += (this.user.yaw - u.yaw) * e;
    u.pitch += (this.user.pitch - u.pitch) * e;
    u.zoom += (this.user.zoom - u.zoom) * e;
    const c = this.cur;
    const yaw = c.yaw + u.yaw;
    const pitch = THREE.MathUtils.clamp(c.pitch + u.pitch, 0.22, 1.4);
    const dist = c.dist * u.zoom;
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
    this.home = fitHome(this.camera.fov, w / h, w < 520);
  }

  // ---- Input (player.ts third-person orbit) ----
  private bindInput(canvas: HTMLCanvasElement) {
    let drag: { x: number; y: number; moved: number; id: number } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
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
        canvas.style.cursor = this.frameAt(e) ? 'pointer' : '';
        return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      this.user.yaw -= dx * 0.006;
      this.user.pitch = THREE.MathUtils.clamp(this.user.pitch + dy * 0.004, -0.6, 0.45);
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
      else this.opts.onPick?.(this.zoneAt(e));
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
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
    this.user.zoom = THREE.MathUtils.clamp(this.user.zoom * f, 0.4, 1.5);
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
  private zoneAt(e: PointerEvent): string | null {
    if (!this.world) return null;
    const hit = this.ray(e).intersectObject(this.world.floor, false)[0];
    if (!hit) return null;
    const { x, z } = hit.point;
    return zones.find((zn) => Math.abs(x - zn.x) <= zn.w / 2 && Math.abs(z - zn.z) <= zn.d / 2)?.id ?? null;
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
    this.props?.dispose();
    if (this.world) disposeTree(this.world.group);
    this.confetti.dispose();
    void this.audio?.close();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }
}
