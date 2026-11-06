// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/player.ts: WASD / arrows relative to the camera, Shift to run, axis-separated moves that
// slide along furniture (tryMove's binary search for the free part of a blocked step), and the turn
// toward travel. Jumping, stairs, the loft, first person and pointer lock are gone; click-to-walk
// (a path round the furniture from nav.ts) is added.
import type { NavGrid, Rect } from './nav';

export const RADIUS = 0.28;
const WALK = 4.0; // m/s: a 44 m floor wants a brisk walk
const RUN = 7.2; // Shift: sprint
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function isTyping(e?: Event): boolean {
  const el = (e?.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export class Player {
  x = 0;
  z = 0;
  facing = Math.PI;
  speed = 0;
  moving = false;
  /** False while a window is open: keys type there instead of walking. */
  enabled = true;
  private keys = new Set<string>();
  private path: [number, number][] = [];
  private cleanup: (() => void)[] = [];

  constructor(private solids: () => Rect[], private bounds: Rect) {
    const down = (e: KeyboardEvent) => {
      if (!this.enabled || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (KEYS[e.code] || e.code.startsWith('Shift')) {
        this.keys.add(e.code);
        if (KEYS[e.code]) {
          this.path = []; // keys take over from a click-to-walk
          e.preventDefault(); // arrows would scroll
        }
      }
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    this.cleanup.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    });
  }

  place(x: number, z: number, facing = this.facing) {
    this.x = x;
    this.z = z;
    this.facing = facing;
    this.path = [];
  }

  /** Click-to-walk: a path round the furniture to (x, z). */
  walkTo(nav: NavGrid, x: number, z: number) {
    this.path = nav.path(this.x, this.z, x, z);
  }
  get walking() {
    return this.path.length > 0;
  }
  stop() {
    this.path = [];
    this.keys.clear();
  }

  /** `camYaw`: the camera's heading, so "up" is always away from the camera. */
  update(dt: number, camYaw: number) {
    dt = Math.min(dt, 0.05);
    let ix = 0, iz = 0;
    if (this.enabled) for (const k of this.keys) if (KEYS[k]) [ix, iz] = [ix + KEYS[k][0], iz + KEYS[k][1]];
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    let dx = 0, dz = 0;
    if (ix || iz) {
      const len = Math.hypot(ix, iz);
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      dx = (ix * c + iz * s) / len;
      dz = (-ix * s + iz * c) / len;
    } else if (this.path.length) {
      const [wx, wz] = this.path[0];
      const d = Math.hypot(wx - this.x, wz - this.z);
      if (d < 0.12) this.path.shift();
      else [dx, dz] = [(wx - this.x) / d, (wz - this.z) / d];
    }
    const want = dx || dz ? (run ? RUN : WALK) : 0;
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * (want ? 12 : 18)));
    if (this.speed < 0.05) this.speed = 0;
    this.moving = this.speed > 0.05 && (!!dx || !!dz);
    if (dx || dz) {
      const step = this.speed * dt;
      const bx = this.x, bz = this.z;
      this.tryMove(this.x + dx * step, this.z);
      this.tryMove(this.x, this.z + dz * step);
      // A click-to-walk that is stuck (someone's chair in the way) gives up rather than running on the spot.
      if (!(ix || iz) && Math.hypot(this.x - bx, this.z - bz) < step * 0.1) this.path = [];
      this.facing += angleTo(this.facing, Math.atan2(dx, dz)) * Math.min(1, dt * 14);
    }
  }

  private blocked(x: number, z: number) {
    const b = this.bounds;
    if (x < b.minX + RADIUS || x > b.maxX - RADIUS || z < b.minZ + RADIUS || z > b.maxZ - RADIUS) return true;
    return this.solids().some((c) => touches(c, x, z) && !touches(c, this.x, this.z)); // already inside one (a seat): let it walk out
  }

  private tryMove(x: number, z: number) {
    if (!this.blocked(x, z)) {
      this.x = x;
      this.z = z;
      return;
    }
    // Use the free part of this axis's step, so the other axis can slide along the surface.
    const dx = x - this.x, dz = z - this.z;
    let free = 0, stop = 1;
    for (let i = 0; i < 10; i++) {
      const f = (free + stop) / 2;
      if (this.blocked(this.x + dx * f, this.z + dz * f)) stop = f;
      else free = f;
    }
    this.x += dx * free;
    this.z += dz * free;
  }

  dispose() {
    for (const c of this.cleanup) c();
  }
}

/** Whether a body of radius RADIUS at (x, z) overlaps the footprint. */
function touches(c: Rect, x: number, z: number) {
  const nx = Math.min(Math.max(x, c.minX), c.maxX), nz = Math.min(Math.max(z, c.minZ), c.maxZ);
  return (x - nx) ** 2 + (z - nz) ** 2 < RADIUS * RADIUS;
}
