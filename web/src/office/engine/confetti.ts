// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/world/confetti.ts: little paper squares shot up out of a point, fluttering down and settling
// on the floor. All of it is one instanced mesh, so a room full of it is still a single draw.
import * as THREE from 'three';

const COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#b388eb', '#5bc0eb', '#F4A300'];
const MAX = 1200;
const GRAVITY = 9.8;
/** Air slows the bits down after the pop... */
const DRAG = 2.5;
/** ...and paper can't fall faster than this (m/s): it flutters. */
const FALL = 1.2;

interface Bit {
  life: number;
  age: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  axis: THREE.Vector3;
  angle: number;
  spin: number;
  sway: number;
  swayAt: number;
  landed: boolean;
}

export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private bits: (Bit | null)[] = new Array(MAX).fill(null);
  private next = 0;
  private live = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private e = new THREE.Euler();

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    mat.userData.outlineParameters = { visible: false };
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.13), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, hidden);
      this.mesh.setColorAt(i, this.c.set(COLORS[i % COLORS.length]));
    }
  }

  /** Shoots `n` bits up out of (x, y, z); `power` 1 is a party popper, 2 a cannon. */
  burst(x: number, y: number, z: number, n = 180, power = 1) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      if (!this.bits[i]) this.live++;
      const a = Math.random() * Math.PI * 2;
      const out = (0.6 + Math.random() * 2.2) * power;
      this.bits[i] = {
        life: 4 + Math.random() * 3,
        age: 0,
        pos: new THREE.Vector3(x + (Math.random() - 0.5) * 0.3, y + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.3),
        vel: new THREE.Vector3(Math.cos(a) * out, (4 + Math.random() * 4) * power, Math.sin(a) * out),
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 10),
        sway: 0.4 + Math.random() * 0.6,
        swayAt: Math.random() * Math.PI * 2,
        landed: false,
      };
      this.mesh.setColorAt(i, this.c.set(COLORS[Math.floor(Math.random() * COLORS.length)]));
    }
    this.mesh.instanceColor!.needsUpdate = true;
    this.mesh.visible = true;
  }

  /** Everything gone at once (a feed reset). */
  clear() {
    for (let i = 0; i < MAX; i++) if (this.bits[i]) this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.bits.fill(null);
    this.live = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = false;
  }

  update(dt: number) {
    if (!this.live) return;
    for (let i = 0; i < MAX; i++) {
      const b = this.bits[i];
      if (!b) continue;
      b.age += dt;
      if (b.age >= b.life) {
        this.bits[i] = null;
        this.live--;
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        continue;
      }
      if (!b.landed) {
        const drag = Math.exp(-DRAG * dt);
        b.vel.x *= drag;
        b.vel.z *= drag;
        if (b.vel.y > 0) b.vel.y = (b.vel.y - GRAVITY * dt) * drag;
        else b.vel.y += (-FALL - b.vel.y) * (1 - Math.exp(-4 * dt));
        b.pos.addScaledVector(b.vel, dt);
        // Falling paper drifts side to side.
        if (b.vel.y < 0) {
          b.pos.x += Math.sin(b.age * 5 * b.sway + b.swayAt) * b.sway * dt;
          b.pos.z += Math.cos(b.age * 4 * b.sway + b.swayAt) * b.sway * dt;
        }
        b.angle += b.spin * dt;
        if (b.pos.y <= 0.01) {
          b.pos.y = 0.01;
          b.landed = true;
        }
      }
      // Once down it lies flat, turned whichever way it happened to land.
      if (b.landed) this.q.setFromEuler(this.e.set(-Math.PI / 2, 0, b.swayAt));
      else this.q.setFromAxisAngle(b.axis, b.angle);
      const left = b.life - b.age;
      this.s.setScalar(left < 0.5 ? left / 0.5 : 1);
      this.mesh.setMatrixAt(i, this.m.compose(b.pos, this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!this.live) this.mesh.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
