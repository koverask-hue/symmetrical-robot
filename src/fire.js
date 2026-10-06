import { B, BLOCKS, VOXEL } from './materials.js';
import { DIRS } from './world.js';

const TICK = 0.1;
export const MAX_FIRES = 900;
const SPREAD = 0.032; // per neighbour per tick
const SPREAD_UP = 0.085; // flames climb

/**
 * Voxel fire. Flammable voxels burn for a few seconds, spread to flammable
 * neighbours (faster upwards), then either char or crumble away, which can
 * bring down whatever they were holding up.
 */
export class Fire {
  constructor(world, rand = Math.random) {
    this.world = world;
    this.rand = rand;
    this.burning = new Map(); // voxel index -> seconds left
    this.acc = 0;
    this.destruction = null; // set by the game; used to remove burnt voxels
    this.burntOut = 0;
  }

  get count() {
    return this.burning.size;
  }

  ignite(x, y, z) {
    const w = this.world;
    if (!w.inBounds(x, y, z) || this.burning.size >= MAX_FIRES) return false;
    const i = w.index(x, y, z);
    const id = w.data[i];
    if (!id || !BLOCKS[id].flammable || this.burning.has(i)) return false;
    this.burning.set(i, 4 + this.rand() * 6);
    return true;
  }

  igniteSphere(c, r, chance) {
    const vr = Math.ceil(r / VOXEL);
    const vx = Math.floor(c[0] / VOXEL), vy = Math.floor(c[1] / VOXEL), vz = Math.floor(c[2] / VOXEL);
    let n = 0;
    for (let y = vy - vr; y <= vy + vr; y++)
      for (let z = vz - vr; z <= vz + vr; z++)
        for (let x = vx - vr; x <= vx + vr; x++) {
          const d = Math.hypot((x + 0.5) * VOXEL - c[0], (y + 0.5) * VOXEL - c[1], (z + 0.5) * VOXEL - c[2]);
          if (d <= r && this.rand() < chance && this.ignite(x, y, z)) n++;
        }
    return n;
  }

  // Put out fires inside a cone (extinguisher). Returns how many.
  extinguish(origin, dir, range, cosHalfAngle) {
    let n = 0;
    for (const i of [...this.burning.keys()]) {
      const [x, y, z] = this.world.coords(i);
      const dx = (x + 0.5) * VOXEL - origin[0], dy = (y + 0.5) * VOXEL - origin[1], dz = (z + 0.5) * VOXEL - origin[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > range || d < 1e-6) continue;
      if ((dx * dir[0] + dy * dir[1] + dz * dir[2]) / d < cosHalfAngle) continue;
      this.burning.delete(i);
      n++;
    }
    return n;
  }

  /** Advance the simulation. Returns voxels that burnt away this call. */
  update(dt) {
    this.acc += dt;
    const out = [];
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.tick(out);
    }
    if (out.length && this.destruction) {
      this.destruction.removeVoxels(out);
      this.destruction.resolve();
    }
    return out;
  }

  tick(out) {
    const w = this.world;
    const ignite = [];
    for (const [i, left] of this.burning) {
      const id = w.data[i];
      // Already destroyed or replaced by something that cannot burn.
      if (!id || !BLOCKS[id].flammable) {
        this.burning.delete(i);
        continue;
      }
      const t = left - TICK;
      const [x, y, z] = w.coords(i);
      if (t <= 0) {
        this.burning.delete(i);
        this.burntOut++;
        if (this.rand() < 0.5) out.push({ x, y, z });
        else w.set(x, y, z, B.CHAR);
        continue;
      }
      this.burning.set(i, t);
      for (let k = 0; k < 6; k++) {
        const p = DIRS[k][1] > 0 ? SPREAD_UP : SPREAD;
        if (this.rand() < p) ignite.push([x + DIRS[k][0], y + DIRS[k][1], z + DIRS[k][2]]);
      }
    }
    for (const [x, y, z] of ignite) this.ignite(x, y, z);
  }

  // Up to n random burning voxel centres (metres), for visuals.
  sample(n) {
    const out = [];
    if (!this.burning.size) return out;
    const keys = [...this.burning.keys()];
    const step = Math.max(1, keys.length / n);
    for (let f = this.rand() * step; f < keys.length && out.length < n; f += step) {
      const [x, y, z] = this.world.coords(keys[Math.floor(f)]);
      out.push([(x + 0.5) * VOXEL, (y + 1) * VOXEL, (z + 0.5) * VOXEL]);
    }
    return out;
  }

  clear() {
    this.burning.clear();
    this.acc = 0;
  }
}
