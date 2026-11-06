// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/world/character/person.ts (+ rig.ts, person-hair.ts, worker-stance.ts 'type'): the chibi
// cartoon person, stripped down to stand / walk / sit / type / jump. No golf, throws, emotes or voice.
import * as THREE from 'three';
import { mergeByMaterial, mesh, toon, toonUnique } from './toon';

export type Pose = 'stand' | 'walk' | 'sit' | 'type';

export const SKIN_TONES = ['#ffe3cc', '#ffd7b5', '#f1c27d', '#e0ac69', '#c68642', '#a0663a', '#8d5524', '#5c3a21'];
export const HAIR_COLORS = ['#2b2d42', '#4a3222', '#6f4e37', '#e9c46a', '#c1440e', '#d9d9d9', '#d62828', '#ff8fab', '#9d4edd', '#264653'];
export const HAIR_STYLES = ['Short', 'Long', 'Bun', 'Spiky', 'Curly', 'Ponytail', 'Bald'] as const;
export interface Look { skin: number; hair: number; style: number }

/** The Person's hips above their feet, standing. */
export const HIPS = 0.42;

/** A chibi cartoon person. Forward is +z. */
export class Person {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private head: THREE.Group;
  private walkPhase = 0;
  /** Hips this high above the feet while sitting (on the seat), or null on their feet. */
  private hips: number | null = null;
  private seatHips = HIPS;
  /** 0 standing … 1 sitting, eased between so sitting down and getting up take a moment. */
  private sitK = 0;
  typing = false;
  /** Arms crossed, tapping a foot: waiting on someone. */
  waiting = false;

  constructor(color: string, look: Look) {
    const shirt = toonUnique(color);
    const skin = toonUnique(SKIN_TONES[look.skin]);
    const hairMat = toonUnique(HAIR_COLORS[look.hair]);
    hairMat.side = THREE.DoubleSide;
    const pants = toon('#3d405b');
    const ink = toon('#1d1d1d');

    this.root.add(this.body);
    this.body.add(mesh(new THREE.CapsuleGeometry(0.26, 0.28, 6, 12), shirt, 0, 0.72, 0));
    const head = (this.head = new THREE.Group());
    head.position.y = 1.32;
    head.add(mesh(new THREE.SphereGeometry(0.34, 20, 16), skin));
    const hair = new THREE.Group();
    styleHair(hair, hairMat, look.style);
    head.add(mergeByMaterial(hair)); // one draw call for any hair style
    for (const sx of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.055, 10, 8), ink, sx * 0.12, 0.02, 0.3, false));
      head.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), toon('#ff9f9f'), sx * 0.2, -0.08, 0.27, false));
    }
    const smile = mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI), ink, 0, -0.08, 0.32, false);
    smile.rotation.z = Math.PI;
    head.add(smile);
    this.body.add(head);

    const limb = (len: number, r: number, mat: THREE.Material, x: number, y: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      pivot.add(mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat, 0, -len / 2 - r / 2, 0));
      this.body.add(pivot);
      return pivot;
    };
    this.legL = limb(0.22, 0.1, pants, -0.12, HIPS);
    this.legR = limb(0.22, 0.1, pants, 0.12, HIPS);
    this.armL = limb(0.24, 0.08, shirt, -0.33, 0.9);
    this.armR = limb(0.24, 0.08, shirt, 0.33, 0.9);
    for (const arm of [this.armL, this.armR]) arm.add(mesh(new THREE.SphereGeometry(0.085, 12, 10), skin, 0, -0.38, 0));
  }

  /** Sits down with the hips `hips` above the feet, or gets up (null). */
  sit(hips: number | null) {
    this.hips = hips;
    if (hips !== null) this.seatHips = hips;
  }

  get pose(): Pose {
    return this.hips === null ? 'stand' : this.typing ? 'type' : 'sit';
  }

  /** `pace` speeds up the walk cycle for someone walking faster than usual. */
  update(dt: number, t: number, moving: boolean, airborne: boolean, pace = 1) {
    const target = moving ? 1 : 0;
    this.walkPhase += dt * 11 * target * pace;
    const swing = Math.sin(this.walkPhase) * 0.7 * target;
    if (airborne) {
      this.legL.rotation.x = -0.5;
      this.legR.rotation.x = 0.3;
      this.armL.rotation.z = -2.4;
      this.armR.rotation.z = 2.4;
      this.armL.rotation.x = this.armR.rotation.x = 0;
    } else {
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing;
      this.armR.rotation.x = swing;
      this.armL.rotation.z = THREE.MathUtils.lerp(this.armL.rotation.z, -0.1, 0.3);
      this.armR.rotation.z = THREE.MathUtils.lerp(this.armR.rotation.z, 0.1, 0.3);
    }
    this.sitK += ((this.hips === null ? 0 : 1) - this.sitK) * Math.min(1, dt * 10);
    const sit = this.sitK > 0.001 ? this.sitK : 0;
    if (sit) {
      // Legs out over the edge of the seat, hands in the lap.
      for (const leg of [this.legL, this.legR]) leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, -1.35, sit);
      for (const arm of [this.armL, this.armR]) arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, -0.55, sit);
    }
    let lift = 0;
    if (this.typing && !moving && !airborne) {
      // worker-stance.ts 'type': forearms out to the keys, fingers going.
      this.armL.rotation.x = -1.2 + Math.sin(t * 22) * 0.25;
      this.armR.rotation.x = -1.2 + Math.sin(t * 22 + 1.7) * 0.25;
      this.armL.rotation.z = 0.15;
      this.armR.rotation.z = -0.15;
      lift = Math.abs(Math.sin(t * 11)) * 0.02;
    } else if (this.waiting && !moving && !airborne && !sit) {
      // Arms folded across the front, a foot tapping.
      this.armL.rotation.set(-1.3, 0, 0.75);
      this.armR.rotation.set(-1.1, 0, -0.75);
      this.legR.rotation.x = -Math.max(0, Math.sin(t * 9)) * 0.25;
    }
    this.body.position.y = moving && !airborne ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : lift + (sit ? 0 : Math.sin(t * 2) * 0.012);
    if (sit) this.body.position.y = THREE.MathUtils.lerp(this.body.position.y, this.seatHips - HIPS, sit);
    this.head.rotation.x = this.typing && sit ? 0.18 : 0;
  }
}

/** Hair is a set of shapes on the head (whose center is 0,0,0; the face looks down +z). (person-hair.ts) */
function styleHair(hair: THREE.Group, m: THREE.MeshToonMaterial, style: number) {
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const part = mesh(geo, m, x, y, z);
    part.rotation.set(rx, 0, rz);
    hair.add(part);
    return part;
  };
  const cap = () => add(new THREE.SphereGeometry(0.355, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), 0, 0.02, -0.02, -0.25);
  switch (HAIR_STYLES[style]) {
    case 'Short':
      cap();
      break;
    case 'Long': {
      cap();
      const back = add(new THREE.SphereGeometry(0.37, 20, 14, Math.PI * 0.93, Math.PI * 1.14, Math.PI * 0.3, Math.PI * 0.5), 0, -0.06, -0.03);
      back.scale.set(1.02, 1.35, 1);
      break;
    }
    case 'Bun':
      cap();
      add(new THREE.SphereGeometry(0.14, 14, 12), 0, 0.3, -0.2);
      break;
    case 'Spiky':
      cap();
      for (const [row, n, z, tilt] of [
        [0, 5, 0.08, 0.35],
        [1, 4, -0.12, -0.3],
      ] as const) {
        for (let i = 0; i < n; i++) {
          const a = -0.85 + (i / (n - 1)) * 1.7;
          const spike = add(new THREE.ConeGeometry(0.1, 0.3, 8), Math.sin(a) * 0.24, 0.33 - Math.abs(a) * 0.08 - row * 0.02, z);
          spike.rotation.set(tilt, 0, -a * 0.9);
        }
      }
      break;
    case 'Curly': {
      const n = 70;
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = i * 2.39996;
        const px = Math.cos(th) * r;
        const pz = Math.sin(th) * r;
        if (y < -0.15 || (pz > 0.35 && y < 0.55)) continue;
        add(new THREE.SphereGeometry(0.1, 8, 6), px * 0.36, y * 0.36 + 0.04, pz * 0.36 - 0.02);
      }
      break;
    }
    case 'Ponytail': {
      cap();
      add(new THREE.SphereGeometry(0.075, 10, 8), 0, 0.12, -0.34);
      const tail = add(new THREE.CapsuleGeometry(0.085, 0.3, 6, 10), 0, -0.1, -0.42, 0.35);
      tail.scale.set(1, 1, 0.8);
      break;
    }
    case 'Bald':
      break;
  }
}
