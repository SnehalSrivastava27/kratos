// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/world/dog.ts: the chunky cartoon office pup (toon body, floppy ears, wagging tail), forward
// is +z; it wanders, sits, lies down for a nap, runs to whoever needs the founder and barks, and wags when
// petted. The server-driven legs and poses are gone: it decides for itself, on our nav grid.
import * as THREE from 'three';
import { mesh, roundedBox, toon } from '../toon';
import type { NavGrid } from './nav';

const COAT = '#e9b872', DARK = '#8a5a3b', INK = '#2b2d42';
const angleTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Dog {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private tail = new THREE.Group();
  private legs: THREE.Object3D[] = [];
  private path: [number, number][] = [];
  private facing = 0;
  private phase = 0;
  private next = 2; // seconds until it picks somewhere new
  private mood: 'walk' | 'sit' | 'nap' | 'bark' = 'sit';
  private wagT = -9;
  private barkT = -9;
  private sink = 0;
  /** Where to go and bark (someone waiting on the founder), set by the engine. */
  alarm: { x: number; z: number } | null = null;
  onBark: (() => void) | null = null;

  constructor(x: number, z: number, private area: { minX: number; maxX: number; minZ: number; maxZ: number }) {
    const coat = toon(COAT), dark = toon(DARK), ink = toon(INK);
    this.body.add(mesh(roundedBox(0.34, 0.26, 0.56, 0.1), coat, 0, 0.3, 0));
    for (const [lx, lz] of [[-0.11, 0.18], [0.11, 0.18], [-0.11, -0.18], [0.11, -0.18]]) {
      const leg = new THREE.Group();
      leg.position.set(lx, 0.22, lz);
      leg.add(mesh(roundedBox(0.09, 0.22, 0.09, 0.03), coat, 0, -0.11, 0));
      leg.add(mesh(roundedBox(0.1, 0.05, 0.12, 0.02), dark, 0, -0.2, 0.01));
      this.legs.push(leg);
      this.body.add(leg);
    }
    this.head.position.set(0, 0.5, 0.3);
    this.head.add(mesh(roundedBox(0.3, 0.26, 0.28, 0.1), coat));
    this.head.add(mesh(roundedBox(0.16, 0.12, 0.14, 0.05), toon('#f6dcb0'), 0, -0.05, 0.17));
    this.head.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), ink, 0, -0.01, 0.25));
    for (const s of [-1, 1]) {
      this.head.add(mesh(new THREE.SphereGeometry(0.028, 8, 6), ink, s * 0.07, 0.05, 0.14));
      const ear = mesh(roundedBox(0.08, 0.18, 0.05, 0.03), dark, s * 0.16, 0.03, -0.02);
      ear.rotation.z = s * 0.35;
      this.head.add(ear);
    }
    this.tail.position.set(0, 0.4, -0.27);
    this.tail.add(mesh(roundedBox(0.06, 0.2, 0.06, 0.03), coat, 0, 0.09, 0));
    this.body.add(this.head, this.tail);
    this.root.add(this.body);
    this.root.position.set(x, 0, z);
  }

  get pos() {
    return this.root.position;
  }

  pet(t: number) {
    this.wagT = t;
    this.path = [];
    this.mood = 'sit';
    this.next = 4;
  }

  update(dt: number, t: number, nav: NavGrid) {
    const g = this.pos;
    // Someone needs the founder: run over and bark at them, now and then.
    if (this.alarm) {
      const d = Math.hypot(this.alarm.x - g.x, this.alarm.z - g.z);
      if (d > 1.2 && !this.path.length) this.path = nav.path(g.x, g.z, this.alarm.x, this.alarm.z + 0.9);
      if (d <= 1.4 && !this.path.length) {
        this.mood = 'bark';
        if (t - this.barkT > 2.2) {
          this.barkT = t;
          this.onBark?.();
        }
      }
    } else if (this.mood === 'bark') this.mood = 'sit';
    this.next -= dt;
    if (!this.alarm && !this.path.length && this.next <= 0) {
      const r = Math.random();
      if (r < 0.55) {
        const a = this.area;
        for (let k = 0; k < 8; k++) {
          const x = a.minX + Math.random() * (a.maxX - a.minX), z = a.minZ + Math.random() * (a.maxZ - a.minZ);
          if (nav.free(x, z)) {
            this.path = nav.path(g.x, g.z, x, z);
            break;
          }
        }
      } else this.mood = r < 0.85 ? 'sit' : 'nap';
      this.next = 4 + Math.random() * 6;
    }
    let moving = false;
    if (this.path.length) {
      const [wx, wz] = this.path[0];
      const dx = wx - g.x, dz = wz - g.z, d = Math.hypot(dx, dz);
      const step = (this.alarm ? 2.6 : 1.3) * dt;
      if (d <= step) {
        g.x = wx;
        g.z = wz;
        this.path.shift();
      } else {
        g.x += (dx / d) * step;
        g.z += (dz / d) * step;
        this.facing += angleTo(this.facing, Math.atan2(dx, dz)) * (1 - Math.exp(-dt * 8));
      }
      moving = true;
      this.mood = 'walk';
    } else if (this.mood === 'walk') this.mood = 'sit';
    this.root.rotation.y = this.facing;

    // Pose: legs swing while walking, the back end sinks to sit, the whole dog sinks to nap.
    this.phase += dt * (moving ? (this.alarm ? 16 : 10) : 0);
    this.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(this.phase + (i % 3 ? Math.PI : 0)) * 0.6 : 0));
    const sinkTo = this.mood === 'nap' ? 0.14 : this.mood === 'sit' || this.mood === 'bark' ? 0.06 : 0;
    this.sink += (sinkTo - this.sink) * (1 - Math.exp(-dt * 5));
    this.body.position.y = -this.sink;
    this.body.rotation.x = this.mood === 'sit' || this.mood === 'bark' ? -this.sink * 2.5 : 0;
    const barking = t - this.barkT < 0.5;
    this.body.position.y += barking ? Math.sin(((t - this.barkT) / 0.5) * Math.PI) * 0.08 : 0;
    this.head.rotation.x = this.mood === 'nap' ? 0.5 : barking ? -0.35 : Math.sin(t * 0.7) * 0.06;
    const wagging = t - this.wagT < 3 || this.alarm || moving;
    this.tail.rotation.z = wagging ? Math.sin(t * (t - this.wagT < 3 ? 22 : 12)) * 0.6 : 0.15;
    this.tail.rotation.x = -0.6;
  }

  dispose() {
    this.root.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
  }
}
