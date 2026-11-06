// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/world/character.ts (Person): the chibi cartoon person with its walk cycle, eased sitting,
// reach, mug and lip flap. Voice, mic badge and smoke breaks are gone (no voice chat here); typing,
// arms-folded waiting, idle sway and look-around, blinking and a celebration dance are added.
import * as THREE from 'three';
import { mergeByMaterial, mesh, toon, toonUnique } from '../toon';

export const SKIN_TONES = ['#ffe3cc', '#ffd7b5', '#f1c27d', '#e0ac69', '#c68642', '#a0663a', '#8d5524', '#5c3a21'];
export const HAIR_COLORS = ['#2b2d42', '#4a3222', '#6f4e37', '#e9c46a', '#c1440e', '#d9d9d9', '#d62828', '#ff8fab', '#9d4edd', '#264653'];
export const HAIR_STYLES = ['Short', 'Long', 'Bun', 'Spiky', 'Curly', 'Ponytail', 'Bald'] as const;
export interface Look { skin: number; hair: number; style: number }

/** The Person's hips above their feet, standing (player.ts). */
export const HIPS = 0.42;
/** How long reaching out to use something takes, in seconds. */
export const REACH_TIME = 0.42;
const lerp = THREE.MathUtils.lerp;

/** 0 → 1 → 0 over a reach (p = 0..1): a quick jab out, a beat at full stretch, an easy return. */
export function reachCurve(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  if (p < 0.28) return 1 - (1 - p / 0.28) ** 3;
  if (p < 0.5) return 1;
  const u = (p - 0.5) / 0.5;
  return 1 - u * u * (3 - 2 * u);
}

/** A full mug (of chai) standing on y = 0, with its handle on the -x side. */
export function coffeeMug(scale = 1): THREE.Group {
  const mug = new THREE.Group();
  const r = 0.05 * scale;
  const height = 0.1 * scale;
  const china = toon('#fffaf3');
  mug.add(mesh(new THREE.CylinderGeometry(r, r * 0.88, height, 16), china, 0, height / 2, 0, false));
  mug.add(mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, height * 0.04, 16), toon('#c68642'), 0, height, 0, false));
  mug.add(mesh(new THREE.TorusGeometry(height * 0.28, r * 0.2, 6, 12), china, -r, height / 2, 0, false));
  return mug;
}

/** What the body is doing this frame, beyond walking. */
export interface Act {
  moving: boolean;
  airborne: boolean;
  /** Walk-cycle speed multiplier (1 = a normal stroll). */
  pace: number;
  typing: boolean;
  waiting: boolean;
  /** Dancing (celebrate): arms up and waving. */
  dancing: boolean;
  /** 0..1: how hard they talk right now; drives the lip flap and hand gestures. */
  voice: number;
}

/** A chibi cartoon person. Forward is +z. */
export class Person {
  readonly root = new THREE.Group();
  /** World-space anchor over the head, for the name tag / bubble overlay. */
  readonly tagAnchor = new THREE.Object3D();
  private body = new THREE.Group();
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private head: THREE.Group;
  private smile: THREE.Mesh;
  private mouth: THREE.Mesh;
  private eyes: THREE.Mesh[] = [];
  private owned: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private mouthOpen = 0;
  private walkPhase = 0;
  private reachT = -1;
  private mug = new THREE.Group();
  private hips: number | null = null;
  private seatHips = HIPS;
  /** 0 standing … 1 sitting, eased between so sitting down and getting up take a moment. */
  private sitK = 0;
  /** 0..1 eased weight of the typing / waiting / dance poses, so nothing snaps. */
  private typeK = 0;
  private waitK = 0;
  private danceK = 0;
  private blinkAt = 1 + Math.random() * 3;
  /** Each person sways and looks around on a clock of their own. */
  private seed = Math.random() * 100;
  private lookYaw = 0;
  private lookAt = 0;

  constructor(color: string, look: Look) {
    const shirt = toonUnique(color);
    const skin = toonUnique(SKIN_TONES[look.skin]);
    const hairMat = toonUnique(HAIR_COLORS[look.hair]);
    hairMat.side = THREE.DoubleSide;
    this.mats.push(shirt, skin, hairMat);
    const pants = toon('#3d405b');
    const ink = toon('#1d1d1d');
    const own = <T extends THREE.BufferGeometry>(g: T) => (this.owned.push(g), g);

    this.root.add(this.body);
    this.body.add(mesh(own(new THREE.CapsuleGeometry(0.26, 0.28, 6, 12)), shirt, 0, 0.72, 0));
    const head = (this.head = new THREE.Group());
    head.position.y = 1.32;
    head.add(mesh(own(new THREE.SphereGeometry(0.34, 20, 16)), skin));
    const hair = new THREE.Group();
    styleHair(hair, hairMat, look.style);
    const merged = mergeByMaterial(hair); // one draw call for any hair style
    merged.traverse((o) => (o as THREE.Mesh).isMesh && this.owned.push((o as THREE.Mesh).geometry));
    hair.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
    head.add(merged);
    const eyeGeo = own(new THREE.SphereGeometry(0.055, 10, 8));
    const cheekGeo = own(new THREE.SphereGeometry(0.05, 10, 8));
    for (const sx of [-1, 1]) {
      const eye = mesh(eyeGeo, ink, sx * 0.12, 0.02, 0.3, false);
      this.eyes.push(eye);
      head.add(eye);
      head.add(mesh(cheekGeo, toon('#ff9f9f'), sx * 0.2, -0.08, 0.27, false));
    }
    const smile = (this.smile = mesh(own(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI)), ink, 0, -0.08, 0.32, false));
    smile.rotation.z = Math.PI;
    head.add(smile);
    // Talking mouth: a flattened ball pressed into the face, scaled open and shut.
    this.mouth = mesh(own(new THREE.SphereGeometry(1, 16, 12)), toon('#7a2635'), 0, -0.1, 0.295, false);
    const tongue = mesh(own(new THREE.SphereGeometry(1, 12, 10)), toon('#ff8fa3'), 0, -0.5, 0, false);
    tongue.scale.set(0.6, 0.45, 1.15);
    this.mouth.add(tongue);
    this.mouth.visible = false;
    head.add(this.mouth);
    this.body.add(head);

    const limb = (len: number, r: number, mat: THREE.Material, x: number, y: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      pivot.add(mesh(own(new THREE.CapsuleGeometry(r, len, 4, 8)), mat, 0, -len / 2 - r / 2, 0));
      this.body.add(pivot);
      return pivot;
    };
    this.legL = limb(0.22, 0.1, pants, -0.12, HIPS);
    this.legR = limb(0.22, 0.1, pants, 0.12, HIPS);
    this.armL = limb(0.24, 0.08, shirt, -0.33, 0.9);
    this.armR = limb(0.24, 0.08, shirt, 0.33, 0.9);
    const hand = own(new THREE.SphereGeometry(0.085, 12, 10));
    for (const arm of [this.armL, this.armR]) arm.add(mesh(hand, skin, 0, -0.38, 0));
    // Forward is +z, so the character's left arm is the one on +x. The handle faces the hand.
    const cup = coffeeMug(1.4);
    cup.traverse((o) => (o as THREE.Mesh).isMesh && this.owned.push((o as THREE.Mesh).geometry));
    cup.position.set(0.02, -0.08, 0.1);
    cup.rotation.y = -Math.PI / 2;
    this.mug.add(cup);
    this.mug.position.set(0, -0.38, 0);
    this.mug.visible = false;
    this.armR.add(this.mug);

    this.tagAnchor.position.y = 1.95;
    this.root.add(this.tagAnchor);
  }

  /** Reach out with the right hand, as if tapping a shoulder or pressing something in front of you. */
  reach() {
    this.reachT = 0;
  }

  /** A mug of chai in the left hand, or not. */
  holdMug(on: boolean) {
    this.mug.visible = on;
  }

  /** Sits down with the hips `hips` above the feet, or gets up (null). */
  sit(hips: number | null) {
    this.hips = hips;
    if (hips !== null) this.seatHips = hips;
  }

  get seated() {
    return this.sitK > 0.5;
  }

  update(dt: number, t: number, a: Act) {
    const { moving, airborne } = a;
    const k = (rate: number) => 1 - Math.exp(-dt * rate); // frame-rate-independent easing
    const target = moving ? 1 : 0;
    this.walkPhase += dt * 11 * target * a.pace;
    const swing = Math.sin(this.walkPhase) * 0.7 * target;
    this.typeK += ((a.typing && !moving && !airborne ? 1 : 0) - this.typeK) * k(8);
    this.waitK += ((a.waiting && !moving && !airborne && this.hips === null ? 1 : 0) - this.waitK) * k(6);
    this.danceK += ((a.dancing && !moving ? 1 : 0) - this.danceK) * k(6);

    if (airborne) {
      this.legL.rotation.x = lerp(this.legL.rotation.x, -0.5, k(20));
      this.legR.rotation.x = lerp(this.legR.rotation.x, 0.3, k(20));
      this.armL.rotation.z = lerp(this.armL.rotation.z, -2.4, k(20));
      this.armR.rotation.z = lerp(this.armR.rotation.z, 2.4, k(20));
      this.armL.rotation.x = this.armR.rotation.x = 0;
    } else {
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing;
      this.armR.rotation.x = swing;
      this.armL.rotation.z = lerp(this.armL.rotation.z, -0.1, k(18));
      this.armR.rotation.z = lerp(this.armR.rotation.z, 0.1, k(18));
    }
    this.sitK += ((this.hips === null ? 0 : 1) - this.sitK) * k(10);
    const sit = this.sitK > 0.001 ? this.sitK : 0;
    if (sit) {
      // Legs out over the edge of the seat, hands in the lap.
      for (const leg of [this.legL, this.legR]) leg.rotation.x = lerp(leg.rotation.x, -1.35, sit);
      for (const arm of [this.armL, this.armR]) arm.rotation.x = lerp(arm.rotation.x, -0.55, sit);
    }
    const ty = this.typeK;
    if (ty > 0.001) {
      // Forearms out to the keys, fingers going.
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.2 + Math.sin(t * 22) * 0.25, ty);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.2 + Math.sin(t * 22 + 1.7) * 0.25, ty);
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.15, ty);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.15, ty);
    }
    const wt = this.waitK;
    if (wt > 0.001) {
      // Arms folded across the front, a foot tapping.
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.3, wt);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.1, wt);
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.75, wt);
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.75, wt);
      this.legR.rotation.x = lerp(this.legR.rotation.x, -Math.max(0, Math.sin(t * 9)) * 0.25, wt);
    }
    const dn = this.danceK;
    if (dn > 0.001 && !airborne) {
      // Arms up, waving side to side, hips swinging.
      const w = Math.sin(t * 8 + this.seed);
      this.armL.rotation.z = lerp(this.armL.rotation.z, -2.5 + w * 0.35, dn);
      this.armR.rotation.z = lerp(this.armR.rotation.z, 2.5 + w * 0.35, dn);
      this.armL.rotation.x = lerp(this.armL.rotation.x, 0, dn);
      this.armR.rotation.x = lerp(this.armR.rotation.x, 0, dn);
    }
    // Talking: a hand comes up to make the point now and then.
    const gest = a.voice * (1 - ty) * (1 - wt) * (1 - dn) * (moving ? 0 : 1);
    if (gest > 0.001) {
      const g = Math.max(0, Math.sin(t * 2.3 + this.seed)) * gest;
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.1 + Math.sin(t * 6) * 0.15, g);
      this.armL.rotation.z = lerp(this.armL.rotation.z, -0.35, g);
    }
    let reach = 0;
    if (this.reachT >= 0) {
      this.reachT += dt;
      reach = reachCurve(this.reachT / REACH_TIME);
      // Forward is +z, so the character's right arm is the one on -x.
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.65, reach);
      this.armL.rotation.z = lerp(this.armL.rotation.z, 0.22, reach);
      if (this.reachT >= REACH_TIME) this.reachT = -1;
    }
    // Lean into the reach a little; lean over the keyboard while typing.
    this.body.rotation.x = reach * 0.12 + ty * 0.06;
    if (this.mug.visible) this.mug.quaternion.copy(this.armR.quaternion).invert();
    // Bob while walking; breathe and sway while standing about.
    const idle = (1 - target) * (1 - sit);
    const breathe = Math.sin(t * 2 + this.seed) * 0.012 * idle;
    const bounce = dn * Math.abs(Math.sin(t * 8 + this.seed)) * 0.08;
    this.body.position.y = moving && !airborne ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : breathe + bounce + ty * Math.abs(Math.sin(t * 11)) * 0.015;
    if (sit) this.body.position.y = lerp(this.body.position.y, this.seatHips - HIPS, sit);
    this.body.rotation.z = Math.sin(t * 0.9 + this.seed) * 0.025 * idle + dn * Math.sin(t * 4 + this.seed) * 0.12;

    // Look around now and then while idle; eyes on the screen while typing.
    this.lookAt -= dt;
    if (this.lookAt < 0) {
      this.lookAt = 2 + Math.random() * 4;
      this.lookYaw = idle > 0.5 && ty < 0.5 && Math.random() < 0.6 ? (Math.random() - 0.5) * 1.1 : 0;
    }
    this.head.rotation.y += (this.lookYaw * (1 - ty) - this.head.rotation.y) * k(4);

    // Lip flap: pop open fast on each syllable, close a little slower.
    const want = a.voice > 0 ? THREE.MathUtils.clamp(0.25 + 0.75 * Math.abs(Math.sin(t * 13 + Math.sin(t * 5.3) * 2)) * a.voice, 0, 1) : 0;
    this.mouthOpen += (want - this.mouthOpen) * k(want > this.mouthOpen ? 35 : 15);
    const talking = a.voice > 0.05;
    this.smile.visible = !talking;
    this.mouth.visible = talking;
    if (talking) this.mouth.scale.set(0.07 * (1 - this.mouthOpen * 0.2), 0.01 + this.mouthOpen * 0.045, 0.05);
    this.head.rotation.x = -this.mouthOpen * 0.08 + ty * 0.18 * sit;

    // Blink every few seconds (character.ts Worker.blink).
    this.blinkAt -= dt;
    const blinking = this.blinkAt < 0.12 && this.blinkAt > 0;
    if (this.blinkAt < 0) this.blinkAt = 2 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = blinking ? 0.1 : 1;
  }

  dispose() {
    for (const g of this.owned) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

/** Hair is a set of shapes on the head (whose center is 0,0,0; the face looks down +z). */
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
      // A curtain down the back, open at the front so the face shows.
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
      // Little puffs spread over the top and back of the head, leaving the face clear.
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
