// Walkable grid over the office floor: A* round the furniture, then string-pulled into a few straight
// legs so people cut corners like people do. Pure (no three.js) so nav.check.mjs runs under plain node.

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

const CELL = 0.2;

export class NavGrid {
  readonly nx: number;
  readonly nz: number;
  private blocked: Uint8Array;
  private bounds: Rect;

  /** `bounds` is the walkable floor; every rect in `solids` is grown by `radius` and marked blocked. */
  constructor(bounds: Rect, solids: Rect[], radius: number) {
    this.bounds = bounds;
    this.nx = Math.ceil((bounds.maxX - bounds.minX) / CELL);
    this.nz = Math.ceil((bounds.maxZ - bounds.minZ) / CELL);
    this.blocked = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const [x, z] = this.center(i, j);
        const edge = x - bounds.minX < radius || bounds.maxX - x < radius || z - bounds.minZ < radius || bounds.maxZ - z < radius;
        if (edge || solids.some((r) => x > r.minX - radius && x < r.maxX + radius && z > r.minZ - radius && z < r.maxZ + radius)) this.blocked[j * this.nx + i] = 1;
      }
  }

  private center(i: number, j: number): [number, number] {
    return [this.bounds.minX + (i + 0.5) * CELL, this.bounds.minZ + (j + 0.5) * CELL];
  }
  private cell(x: number, z: number): [number, number] {
    const i = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.bounds.minX) / CELL)));
    const j = Math.min(this.nz - 1, Math.max(0, Math.floor((z - this.bounds.minZ) / CELL)));
    return [i, j];
  }
  free(x: number, z: number) {
    const [i, j] = this.cell(x, z);
    return !this.blocked[j * this.nx + i];
  }

  /** The free cell nearest (x, z), searching outward ring by ring. */
  private nearestFree(x: number, z: number): number {
    const [ci, cj] = this.cell(x, z);
    for (let r = 0; r < Math.max(this.nx, this.nz); r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i >= 0 && j >= 0 && i < this.nx && j < this.nz && !this.blocked[j * this.nx + i]) return j * this.nx + i;
        }
    return cj * this.nx + ci;
  }

  /** Straight walk from a to b stays on free cells (sampled every half cell). */
  clear(ax: number, az: number, bx: number, bz: number) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL * 0.5));
    for (let s = 1; s < n; s++) if (!this.free(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n)) return false;
    return true;
  }

  /**
   * Waypoints from (ax, az) to (bx, bz), not including the start. Either end may sit inside a grown
   * rect (a seat tucked under a desk): the path leaves from / arrives at the nearest free cell and
   * makes the last short hop straight in.
   */
  path(ax: number, az: number, bx: number, bz: number): [number, number][] {
    if (this.clear(ax, az, bx, bz)) return [[bx, bz]];
    const start = this.nearestFree(ax, az), goal = this.nearestFree(bx, bz);
    const N = this.nx * this.nz;
    const g = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const gi = goal % this.nx, gj = Math.floor(goal / this.nx);
    const h = (c: number) => Math.hypot((c % this.nx) - gi, Math.floor(c / this.nx) - gj);
    // ponytail: binary heap would beat this sorted-insert open list; the grid is ~10k cells, paths are rare.
    const open: { c: number; f: number }[] = [{ c: start, f: h(start) }];
    g[start] = 0;
    while (open.length) {
      const { c } = open.shift()!;
      if (c === goal) break;
      if (closed[c]) continue;
      closed[c] = 1;
      const ci = c % this.nx, cj = Math.floor(c / this.nx);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const n = j * this.nx + i;
          if (this.blocked[n] || closed[n]) continue;
          if (di && dj && (this.blocked[cj * this.nx + i] || this.blocked[j * this.nx + ci])) continue; // no corner cutting
          const ng = g[c] + (di && dj ? Math.SQRT2 : 1);
          if (ng >= g[n]) continue;
          g[n] = ng;
          from[n] = c;
          const f = ng + h(n);
          let k = open.findIndex((o) => o.f > f);
          if (k < 0) k = open.length;
          open.splice(k, 0, { c: n, f });
        }
    }
    if (from[goal] < 0 && goal !== start) return [[bx, bz]]; // unreachable: walk straight (never happens on this floor)
    const cells: [number, number][] = [];
    for (let c = goal; c !== start && c >= 0; c = from[c]) cells.push(this.center(c % this.nx, Math.floor(c / this.nx)));
    cells.reverse();
    cells.push([bx, bz]);
    // String-pull: from each kept point, skip ahead to the farthest point still in straight view.
    const out: [number, number][] = [];
    let [px, pz] = this.free(ax, az) ? [ax, az] : this.center(start % this.nx, Math.floor(start / this.nx));
    if (px !== ax || pz !== az) out.push([px, pz]);
    let i = 0;
    while (i < cells.length) {
      let far = i;
      for (let k = cells.length - 1; k > i; k--)
        if (this.clear(px, pz, cells[k][0], cells[k][1])) {
          far = k;
          break;
        }
      out.push(cells[far]);
      [px, pz] = cells[far];
      i = far + 1;
    }
    return out;
  }
}
