// The Switch hub: the router core in the Telegram Hub. Floor cables run from it to every department and up
// to the Telegram wall; each message in the feed sends a light pulse along its route (Telegram → Switch →
// the agent's desk, and back for replies), so you can watch Switch carry the conversation.
// Built once; sync() spawns pulses for new events, update() moves them. One InstancedMesh for every pulse,
// one merged geometry for every cable, so the hub costs a handful of draw calls whatever the traffic.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { OfficeEvent } from '../../shared/types';
import { DESKS, deskById, deskOf, personById, roomZone, roster, swMeta, zoneById, zones } from '../data';
import { FONT, paint } from '../tex';
import { disposeTree, mesh, noOutline, roundedBox, toon, toonUnique } from '../toon';
import { WALL } from './world';
import { LANES, corePos } from './layout';

const TG = '#3390EC';
const PRIVATE = '#9d4edd'; // private notes between agents
const hub = zoneById.telegram_hub;
/** The core stands between the Telegram wall and the lounge sofa. */
export const CORE: [number, number] = corePos(hub);
const Y = 0.035; // cables lie on the floor
const SPEED = 7.5;
const ORB_Y = 1.55; // metres a second
const TRAIL = [1, 0.78, 0.6, 0.45, 0.32];
const GAP = 0.2; // metres between trail beads
const MAX_PULSES = 14;
// Private notes are the story's quiet moment, so they read from the overview: slower, bigger beads lifted
// off the floor, a longer glowing trail, and a lock riding the head.
const P_SPEED = 4.8;
const P_TRAIL = [1, 0.86, 0.74, 0.63, 0.53, 0.44, 0.36, 0.29, 0.23, 0.18];
const P_GAP = 0.17;
const P_SCALE = 1.9;
const P_LIFT = 0.22;
const MAX_LOCKS = 4;
const v = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const s3 = new THREE.Vector3();
const col = new THREE.Color();

/** A polyline with rounded corners, as one curve. */
function trace(pts: THREE.Vector3[], r = 0.45): THREE.CurvePath<THREE.Vector3> {
  const p = pts.filter((a, i) => i === 0 || a.distanceTo(pts[i - 1]) > 0.01);
  const path = new THREE.CurvePath<THREE.Vector3>();
  let from = p[0];
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1];
    const k = Math.min(r, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
    const inP = b.clone().addScaledVector(a.clone().sub(b).normalize(), k);
    const outP = b.clone().addScaledVector(c.clone().sub(b).normalize(), k);
    if (from.distanceTo(inP) > 0.001) path.add(new THREE.LineCurve3(from, inP));
    path.add(new THREE.QuadraticBezierCurve3(inP, b, outP));
    from = outP;
  }
  path.add(new THREE.LineCurve3(from, p[p.length - 1]));
  return path;
}

/** Where a zone's cable ends: on the floor behind its first desk's chair, or at the front of a deskless room. */
function endpoint(zoneId: string): THREE.Vector3 {
  const d = deskById[`${zoneId}#0`];
  const z = zoneById[zoneId];
  return d ? new THREE.Vector3(d.x, Y, d.z + 1.35) : new THREE.Vector3(z.x, Y, z.z + 1.6);
}

interface Leg { c: THREE.Curve<THREE.Vector3>; len: number; rev: boolean }
interface Pulse { legs: Leg[]; total: number; born: number; color: THREE.Color; port: number; hitCore: boolean; priv: boolean }

export class SwitchHub {
  readonly group = new THREE.Group();
  /** Keep walkers off the core. */
  readonly solid = { minX: CORE[0] - 0.85, maxX: CORE[0] + 0.85, minZ: CORE[1] - 0.85, maxZ: CORE[1] + 0.85 };
  /** Messages routed since the feed (re)started. */
  routed = 0;
  private routes = new Map<string, { curve: THREE.Curve<THREE.Vector3>; len: number; port: number }>();
  private wallIn: { curve: THREE.Curve<THREE.Vector3>; len: number };
  private wallOut: { curve: THREE.Curve<THREE.Vector3>; len: number };
  private beads: THREE.InstancedMesh;
  private glow: THREE.InstancedMesh;
  private locks: THREE.InstancedMesh;
  private ports: THREE.InstancedMesh;
  private portPos: THREE.Vector3[] = [];
  private portHit: number[] = [];
  private pulses: Pulse[] = [];
  private orb = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private band = toonUnique('#bfe3ff', { emissive: TG });
  private orbMat = toonUnique('#8fd8ff', { emissive: '#1d8fe8' });
  private flash = 0;
  private beamMat!: THREE.MeshBasicMaterial;
  private lastId?: string;
  private t = 0;
  private tag: HTMLButtonElement | null = null;
  private tagCount: HTMLElement | null = null;

  constructor(overlay: HTMLElement, onOpen?: () => void) {
    const g = this.group;
    const [cx, cz] = CORE;
    const core = new THREE.Vector3(cx, Y, cz);

    // ---- Cables: Telegram wall → core, core → a bus along the corridor → each room ----
    const wallFoot = WALL.backZ + WALL.t / 2 + 0.05;
    const feed = (dx: number) => {
      const curve = trace([new THREE.Vector3(cx + dx, 0.45, wallFoot), new THREE.Vector3(cx + dx, Y, wallFoot), new THREE.Vector3(cx + dx, Y, cz), core], 0.3);
      return { curve, len: curve.getLength() };
    };
    this.wallIn = feed(-1.5); // Telegram → Switch
    this.wallOut = feed(1.5); // Switch → Telegram
    const ends = new Set<string>([...DESKS.map((d) => d.zone), ...roster.map((p) => p.zone), 'war_room']);
    ends.delete(hub.id);
    const portPos = this.portPos;
    for (const id of ends) {
      if (!zoneById[id]) continue; // a roster zone the floor plan doesn't have yet
      const e = endpoint(id);
      // Along the back corridor; rooms in the front row go down the nearer aisle and along the front corridor.
      const B = LANES.back, F = LANES.front;
      const aisle = LANES.aisles.reduce((a, b) => (Math.abs(b - e.x) < Math.abs(a - e.x) ? b : a));
      const pts = e.z > F
        ? [core, new THREE.Vector3(cx, Y, B), new THREE.Vector3(aisle, Y, B), new THREE.Vector3(aisle, Y, F), new THREE.Vector3(e.x, Y, F), e]
        : [core, new THREE.Vector3(cx, Y, B), new THREE.Vector3(e.x, Y, B), e];
      const curve = trace(pts);
      this.routes.set(id, { curve, len: curve.getLength(), port: portPos.length });
      portPos.push(e);
    }
    const tubes = [this.wallIn.curve, this.wallOut.curve, ...[...this.routes.values()].map((r) => r.curve)].map(
      (c) => new THREE.TubeGeometry(c, Math.max(8, Math.ceil(c.getLength() * 5)), 0.04, 5, false),
    );
    const cables = new THREE.Mesh(mergeGeometries(tubes), new THREE.MeshBasicMaterial({ color: '#7cb8ef', toneMapped: false }));
    tubes.forEach((t) => t.dispose());
    g.add(cables);

    // Ports: a ring on the floor where each cable lands; it flares when a pulse arrives.
    this.ports = new THREE.InstancedMesh(new THREE.RingGeometry(0.11, 0.2, 24).rotateX(-Math.PI / 2).translate(0, 0.012, 0), new THREE.MeshBasicMaterial({ color: '#9fd0ff', toneMapped: false }), portPos.length);
    portPos.forEach((p, i) => {
      this.ports.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z));
      this.portHit.push(-9);
    });
    g.add(this.ports);

    // ---- The core: a hex router on a plinth, a glowing band, a floating orb in two orbiting rings ----
    const c = new THREE.Group();
    c.position.set(cx, 0, cz);
    c.add(mesh(roundedBox(1.6, 0.14, 1.6, 0.22), toon('#2b2d42'), 0, 0.07, 0));
    c.add(mesh(new THREE.CylinderGeometry(0.66, 0.72, 0.8, 6).rotateY(Math.PI / 6), toon('#3a3d5c'), 0, 0.54, 0));
    c.add(mesh(new THREE.CylinderGeometry(0.56, 0.66, 0.1, 6).rotateY(Math.PI / 6), toon('#F4A300'), 0, 0.99, 0));
    c.add(mesh(new THREE.CylinderGeometry(0.68, 0.69, 0.08, 6).rotateY(Math.PI / 6), this.band, 0, 0.76, 0, false)); // the glowing band
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.235), new THREE.MeshBasicMaterial({ map: labelTex(), toneMapped: false, transparent: true }));
    label.position.set(0, 0.5, 0.635); // just proud of the front face (apothem ~0.6 at this height)
    c.add(label);
    this.orb.position.y = ORB_Y;
    this.orb.add(mesh(new THREE.IcosahedronGeometry(0.27, 0), this.orbMat, 0, 0, 0, false));
    // A soft column of light over the orb, so the hub reads from across the floor.
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.42, 2.2, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#6fc3ff', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    beam.position.y = ORB_Y + 1.1;
    this.beamMat = beam.material as THREE.MeshBasicMaterial;
    c.add(beam);
    for (const [r, color, tilt] of [[0.5, '#F4A300', 0.5], [0.42, TG, -0.9]] as const) {
      const ring = mesh(new THREE.TorusGeometry(r, 0.022, 6, 40), toon(color, { emissive: color }), 0, 0, 0, false);
      ring.rotation.set(Math.PI / 2 + tilt, 0, tilt);
      this.rings.push(ring);
      this.orb.add(ring);
    }
    c.add(this.orb);
    // A soft pool of light under it.
    const halo = new THREE.Mesh(new THREE.CircleGeometry(1.8, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: haloTex(), transparent: true, depthWrite: false, toneMapped: false }));
    halo.position.y = 0.013;
    c.add(halo);
    g.add(c);

    // Pulses: a bright bead with a fading trail, one instance each.
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX_PULSES * P_TRAIL.length);
    // Private notes: a soft additive halo round each bead, and a lock tag riding the head bead (both instanced).
    this.glow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: '#b37cf0', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), MAX_LOCKS * P_TRAIL.length);
    this.locks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({ map: lockTex(), transparent: true, depthWrite: false, toneMapped: false }), MAX_LOCKS);
    for (const o of [this.beads, this.glow, this.locks]) {
      o.frustumCulled = false;
      o.count = 0;
      o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      g.add(o);
    }
    this.locks.renderOrder = 2;
    noOutline(g);
    for (const o of [cables, this.ports, this.beads, this.glow, this.locks]) o.castShadow = o.receiveShadow = false;

    // ---- The name over it (live office only): a button that opens the Switch panel ----
    if (onOpen) {
      const tag = (this.tag = document.createElement('button'));
      tag.type = 'button';
      tag.className = 'hq-anchor hq-switch-tag';
      tag.setAttribute('aria-label', 'Switch: open the router panel');
      tag.innerHTML = '<span class="hq-switch-dot"></span><b>Switch</b><span class="hq-switch-n">0 routed</span>'; // static markup; the count is set as text
      this.tagCount = tag.querySelector('.hq-switch-n');
      tag.addEventListener('click', onOpen);
      overlay.append(tag);
    }
  }

  /** New events since last time → pulses. A reset (replay, other workspace) clears the board. */
  sync(events: OfficeEvent[], total = events.length) {
    const at = this.lastId ? events.findIndex((e) => e.id === this.lastId) : -1;
    let fresh: OfficeEvent[];
    if (at >= 0) fresh = events.slice(at + 1);
    else {
      this.pulses.length = 0;
      fresh = events.slice(-1); // first look (or a history load): animate only the latest
    }
    this.lastId = events[events.length - 1]?.id;
    fresh.slice(-4).forEach((e, i) => this.route(e, this.t + i * 0.25));
    this.routed = total; // the whole feed, like the Switch chip (events may be a recent window)
    if (this.tagCount) this.tagCount.textContent = `${this.routed} routed`;
  }

  private zoneOf(id: string, room?: string) {
    const z = deskOf[id] ? deskById[deskOf[id]]?.zone : personById[id]?.zone;
    return z && this.routes.has(z) ? z : room && this.routes.has(roomZone[room]) ? roomZone[room] : null;
  }

  private route(e: OfficeEvent, born: number) {
    const p = personById[e.speaker];
    if (!p || e.type === 'command') return;
    const color = new THREE.Color(p.kind === 'human' ? TG : p.color);
    const wall: Leg = { c: this.wallIn.curve, len: this.wallIn.len, rev: false };
    const back: Leg = { c: this.wallOut.curve, len: this.wallOut.len, rev: true };
    const leg = (zone: string | null, rev: boolean): Leg[] => {
      const r = zone ? this.routes.get(zone) : undefined;
      return r ? [{ c: r.curve, len: r.len, rev }] : [];
    };
    const targets = (e.meta?.targets ?? []).filter((t) => personById[t]?.kind === 'agent').slice(0, 6);
    const sm = swMeta(e);
    if (sm.private) {
      // A private note through Switch (agent → agent): desk → core → their desk, in violet, never up to Telegram.
      const from = this.zoneOf(e.speaker, e.room), to = this.zoneOf(sm.to ?? targets[0] ?? '', e.room);
      if (to && to !== from) this.spawn([...leg(from, true), ...leg(to, false)], born, new THREE.Color(PRIVATE), to, true);
      return;
    }
    if (p.kind === 'human') {
      // Founder in Telegram → Switch → each agent they addressed (or the topic's room).
      const to = targets.length ? targets.map((t) => this.zoneOf(t, e.room)) : [this.zoneOf('', e.room)];
      for (const z of new Set(to)) this.spawn([wall, ...leg(z, false)], born, color, z);
      return;
    }
    // An agent's reply: their desk → Switch → Telegram, and on to any teammate they brief.
    const from = this.zoneOf(e.speaker, e.room);
    this.spawn([...leg(from, true), back], born, color, null);
    for (const z of new Set(targets.map((t) => this.zoneOf(t, e.room)))) if (z && z !== from) this.spawn([...leg(from, true), ...leg(z, false)], born + 0.1, color, z);
  }

  private spawn(legs: Leg[], born: number, color: THREE.Color, zone: string | null, priv = false) {
    if (!legs.length) return;
    if (this.pulses.length >= MAX_PULSES) this.pulses.shift();
    if (priv && this.pulses.filter((p) => p.priv).length >= MAX_LOCKS) this.pulses.splice(this.pulses.findIndex((p) => p.priv), 1);
    this.pulses.push({ legs, total: legs.reduce((a, l) => a + l.len, 0), born, color, port: zone ? this.routes.get(zone)?.port ?? -1 : -1, hitCore: false, priv });
  }

  private pointAt(p: Pulse, s: number, out: THREE.Vector3) {
    for (const l of p.legs) {
      if (s <= l.len) return l.c.getPointAt(THREE.MathUtils.clamp(l.rev ? 1 - s / l.len : s / l.len, 0, 1), out);
      s -= l.len;
    }
    const l = p.legs[p.legs.length - 1];
    return l.c.getPointAt(l.rev ? 0 : 1, out);
  }

  update(dt: number, t: number, camera: THREE.Camera, w: number, h: number) {
    this.t = t;
    // Core: the orb spins, the rings orbit, everything flares as a pulse passes through.
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.orb.rotation.y += dt * (0.6 + this.flash * 4);
    this.orb.position.y = ORB_Y + Math.sin(t * 1.6) * 0.04;
    this.beamMat.opacity = 0.14 + this.flash * 0.22;
    this.rings[0].rotation.z += dt * 0.9;
    this.rings[1].rotation.z -= dt * 1.3;
    this.band.emissiveIntensity = 0.55 + this.flash * 1.6 + Math.sin(t * 2) * 0.1;
    this.orbMat.emissiveIntensity = 0.5 + this.flash * 1.5;

    let n = 0, ng = 0, nl = 0;
    this.pulses = this.pulses.filter((p) => {
      const trail = p.priv ? P_TRAIL : TRAIL, gap = p.priv ? P_GAP : GAP, size = p.priv ? P_SCALE : 1;
      const s = (t - p.born) * (p.priv ? P_SPEED : SPEED);
      if (s < 0) return true;
      const first = p.legs[0].len;
      if (!p.hitCore && s >= first && p.legs.length > 1) {
        p.hitCore = true;
        this.flash = 1;
      }
      if (s > p.total + gap * trail.length) {
        if (p.port >= 0) this.portHit[p.port] = t;
        return false;
      }
      trail.forEach((k, i) => {
        const si = s - i * gap;
        if (si < 0 || si > p.total) return;
        this.pointAt(p, si, v);
        v.y += p.priv ? P_LIFT : 0.07;
        m4.compose(v, q, s3.setScalar(k * size));
        this.beads.setMatrixAt(n, m4);
        this.beads.setColorAt(n, col.copy(p.color).lerp(WHITE, i === 0 ? 0.55 : 0.1));
        n++;
        if (!p.priv) return;
        this.glow.setMatrixAt(ng++, m4.compose(v, q, s3.setScalar(k * size * 2.6)));
        if (i === 0) {
          v.y += 0.5;
          this.locks.setMatrixAt(nl++, m4.compose(v, camera.quaternion, s3.setScalar(1 + Math.sin(t * 6) * 0.06)));
        }
      });
      return true;
    });
    this.beads.count = n;
    this.glow.count = ng;
    this.locks.count = nl;
    if (n) {
      this.beads.instanceMatrix.needsUpdate = true;
      if (this.beads.instanceColor) this.beads.instanceColor.needsUpdate = true;
    }
    if (ng) this.glow.instanceMatrix.needsUpdate = true;
    if (nl) this.locks.instanceMatrix.needsUpdate = true;
    // Ports flare for a moment when a pulse lands.
    let busy = false;
    this.portPos.forEach((p, i) => {
      const a = t - this.portHit[i];
      busy ||= a < 1.5;
      this.ports.setMatrixAt(i, m4.compose(p, q, s3.setScalar(a < 1.2 ? 1 + Math.sin((a / 1.2) * Math.PI) * 1.6 : 1)));
    });
    if (busy) this.ports.instanceMatrix.needsUpdate = true;

    if (this.tag) {
      v.set(CORE[0], 2.25, CORE[1]).project(camera);
      this.tag.style.display = v.z > 1 ? 'none' : '';
      this.tag.style.transform = `translate3d(${Math.round((v.x * 0.5 + 0.5) * w)}px, ${Math.round((-v.y * 0.5 + 0.5) * h)}px, 0)`;
    }
  }

  /** Where the founder stands to use it (E). */
  get front(): [number, number] {
    return [CORE[0], CORE[1] + 1.1];
  }

  dispose() {
    disposeTree(this.group);
    for (const o of [this.band, this.orbMat]) o.dispose();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).type === 'MeshBasicMaterial') (m.material as THREE.Material).dispose();
    });
    this.beads.dispose();
    this.glow.dispose();
    this.locks.dispose();
    this.ports.dispose();
    this.tag?.remove();
  }
}

const WHITE = new THREE.Color('#ffffff');

function labelTex() {
  return paint(560, 200, (g, W, H) => {
    g.fillStyle = '#1E1328';
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, 40);
    g.fill();
    g.strokeStyle = '#F4A300';
    g.lineWidth = 8;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = `900 104px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SWITCH', W / 2, H / 2 + 6);
  });
}

/** The lock that rides a private note: a white padlock on a violet disc. */
function lockTex() {
  return paint(128, 128, (g) => {
    g.fillStyle = PRIVATE;
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.stroke();
    g.lineWidth = 11;
    g.beginPath();
    g.arc(64, 54, 18, Math.PI, 0);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(36, 54, 56, 40, 8);
    g.fill();
    g.fillStyle = PRIVATE;
    g.beginPath();
    g.arc(64, 70, 6, 0, Math.PI * 2);
    g.fill();
    g.fillRect(61, 70, 6, 13);
  });
}

function haloTex() {
  return paint(256, 256, (g, W, H) => {
    const r = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    r.addColorStop(0, 'rgba(51,144,236,0.55)');
    r.addColorStop(0.45, 'rgba(51,144,236,0.22)');
    r.addColorStop(1, 'rgba(51,144,236,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, W, H);
  });
}
