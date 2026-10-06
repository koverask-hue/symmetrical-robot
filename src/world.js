import { B, BLOCKS, VOXEL } from './materials.js';

export const CHUNK = 16;

// Dense voxel grid. Index layout is x-fastest, then z, then y, so a horizontal
// slice is contiguous (level generation and the mesher both walk it that way).
export class World {
  constructor(sx, sy, sz) {
    if (sx % CHUNK || sy % CHUNK || sz % CHUNK) throw new Error('world size must be a multiple of CHUNK');
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.data = new Uint8Array(sx * sy * sz);
    this.cx = sx / CHUNK;
    this.cy = sy / CHUNK;
    this.cz = sz / CHUNK;
    this.dirty = new Set(); // chunk keys needing a remesh
    this.edits = []; // voxel indices changed since the physics last synced
    this.heat = new Map(); // chunkKey -> Map(voxelIndex -> time it was heated)
    // Scratch marks for flood fills; an epoch counter avoids clearing between passes.
    this.mark = new Uint32Array(sx * sy * sz);
    this.epoch = 0;
  }

  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  index(x, y, z) {
    return x + this.sx * (z + this.sz * y);
  }

  coords(i) {
    const x = i % this.sx;
    const r = (i - x) / this.sx;
    const z = r % this.sz;
    return [x, (r - z) / this.sz, z];
  }

  // Below the world is solid bedrock; everything else outside is air.
  get(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (x < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return B.AIR;
    return this.data[x + this.sx * (z + this.sz * y)];
  }

  // Raw write without dirty tracking; only for bulk generation before meshing.
  put(x, y, z, v) {
    if (this.inBounds(x, y, z)) this.data[this.index(x, y, z)] = v;
  }

  set(x, y, z, v) {
    if (!this.inBounds(x, y, z)) return false;
    const i = this.index(x, y, z);
    if (this.data[i] === v) return false;
    this.data[i] = v;
    this.touch(x, y, z);
    return true;
  }

  // A voxel change can alter faces and ambient occlusion one voxel away, so
  // dirty every chunk overlapping the 3x3x3 neighbourhood.
  touch(x, y, z) {
    this.edits.push(x + this.sx * (z + this.sz * y));
    const x0 = Math.max(0, (x - 1) >> 4), x1 = Math.min(this.cx - 1, (x + 1) >> 4);
    const y0 = Math.max(0, (y - 1) >> 4), y1 = Math.min(this.cy - 1, (y + 1) >> 4);
    const z0 = Math.max(0, (z - 1) >> 4), z1 = Math.min(this.cz - 1, (z + 1) >> 4);
    for (let cy = y0; cy <= y1; cy++)
      for (let cz = z0; cz <= z1; cz++)
        for (let cx = x0; cx <= x1; cx++) this.dirty.add(this.chunkKey(cx, cy, cz));
  }

  chunkKey(cx, cy, cz) {
    return cx + this.cx * (cz + this.cz * cy);
  }

  chunkCoords(key) {
    const cx = key % this.cx;
    const r = (key - cx) / this.cx;
    const cz = r % this.cz;
    return [cx, (r - cz) / this.cz, cz];
  }

  // Record that a voxel was heated (blasted or cut) at time t; the renderer
  // makes its faces glow and cool down from that moment.
  heatVoxel(x, y, z, t) {
    if (!this.inBounds(x, y, z) || this.get(x, y, z) === B.AIR) return;
    const key = this.chunkKey(x >> 4, y >> 4, z >> 4);
    let m = this.heat.get(key);
    if (!m) this.heat.set(key, (m = new Map()));
    m.set(this.index(x, y, z), t);
    this.dirty.add(key);
  }

  // Drop heat records older than maxAge seconds (cool faces need no record).
  coolDown(now, maxAge) {
    for (const [key, m] of this.heat) {
      for (const [i, t] of m) if (now - t > maxAge) m.delete(i);
      if (!m.size) this.heat.delete(key);
    }
  }

  markAllDirty() {
    for (let k = 0; k < this.cx * this.cy * this.cz; k++) this.dirty.add(k);
  }

  nextEpoch() {
    this.epoch++;
    if (this.epoch >= 0xffffffff) {
      this.mark.fill(0);
      this.epoch = 1;
    }
    return this.epoch;
  }

  // World-space metres -> voxel coordinate.
  static toVoxel(m) {
    return Math.floor(m / VOXEL);
  }

  solidAt(px, py, pz) {
    return this.get(Math.floor(px / VOXEL), Math.floor(py / VOXEL), Math.floor(pz / VOXEL)) !== B.AIR;
  }

  /**
   * Remove voxels inside a sphere. `radii` gives the carve radius in metres per
   * tier ([soft, medium, hard]); tier 3 is never removed. Edge voxels are
   * removed with a falloff chance so holes look ragged rather than spherical.
   * Returns removed voxels as {x,y,z,id} and the set of surviving solid
   * neighbours (indices) to seed a structural check from.
   */
  carveSphere(cx, cy, cz, radii, rand = Math.random) {
    const removed = [];
    const rMax = Math.max(radii[0] || 0, radii[1] || 0, radii[2] || 0);
    if (rMax <= 0) return { removed, seeds: [] };
    const vr = Math.ceil(rMax / VOXEL) + 1;
    const vx = Math.floor(cx / VOXEL), vy = Math.floor(cy / VOXEL), vz = Math.floor(cz / VOXEL);
    for (let y = vy - vr; y <= vy + vr; y++) {
      if (y < 0 || y >= this.sy) continue;
      for (let z = vz - vr; z <= vz + vr; z++) {
        if (z < 0 || z >= this.sz) continue;
        for (let x = vx - vr; x <= vx + vr; x++) {
          if (x < 0 || x >= this.sx) continue;
          const i = this.index(x, y, z);
          const id = this.data[i];
          if (id === B.AIR) continue;
          const tier = BLOCKS[id].tier;
          if (tier >= 3) continue;
          const r = radii[tier] || 0;
          if (r <= 0) continue;
          const dx = (x + 0.5) * VOXEL - cx, dy = (y + 0.5) * VOXEL - cy, dz = (z + 0.5) * VOXEL - cz;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > r) continue;
          // Inner 75% always goes, the rim is probabilistic.
          if (d > r * 0.75 && rand() > (r - d) / (r * 0.25)) continue;
          this.data[i] = B.AIR;
          this.touch(x, y, z);
          removed.push({ x, y, z, id });
        }
      }
    }
    return { removed, seeds: this.neighbourSeeds(removed) };
  }

  // Remove an explicit list of voxel coords (fire burn-out, crush damage).
  removeVoxels(list) {
    const removed = [];
    for (const v of list) {
      if (!this.inBounds(v.x, v.y, v.z)) continue;
      const i = this.index(v.x, v.y, v.z);
      const id = this.data[i];
      if (id === B.AIR || BLOCKS[id].tier >= 3) continue;
      this.data[i] = B.AIR;
      this.touch(v.x, v.y, v.z);
      removed.push({ x: v.x, y: v.y, z: v.z, id });
    }
    return { removed, seeds: this.neighbourSeeds(removed) };
  }

  neighbourSeeds(removed) {
    const seeds = [];
    if (!removed.length) return seeds;
    const ep = this.nextEpoch();
    for (const v of removed) {
      for (let k = 0; k < 6; k++) {
        const x = v.x + DIRS[k][0], y = v.y + DIRS[k][1], z = v.z + DIRS[k][2];
        if (!this.inBounds(x, y, z)) continue;
        const i = this.index(x, y, z);
        if (this.data[i] === B.AIR || this.mark[i] === ep) continue;
        this.mark[i] = ep;
        seeds.push(i);
      }
    }
    return seeds;
  }

  /**
   * Find solid regions reachable from `seeds` that no longer connect to the
   * ground. Depth-first with "down" explored first, so supported regions
   * usually terminate after a short dive. Regions larger than `maxVisit` are
   * assumed supported to bound the cost of a single check.
   * Returns an array of components, each an array of voxel indices.
   */
  findUnsupported(seeds, maxVisit = 60000) {
    const out = [];
    if (!seeds.length) return out;
    const ep = this.nextEpoch(); // mark === ep: proven grounded
    const ep2 = this.nextEpoch(); // mark === ep2: visited, verdict pending or floating
    const sx = this.sx, sy = this.sy, sz = this.sz, sxz = sx * sz;
    const data = this.data, mark = this.mark;
    const stack = [];
    let grounded = false;
    const visit = (j) => {
      if (data[j] === B.AIR) return;
      const m = mark[j];
      if (m === ep) grounded = true;
      else if (m !== ep2) {
        mark[j] = ep2;
        stack.push(j);
      }
    };
    for (const seed of seeds) {
      if (data[seed] === B.AIR || mark[seed] === ep || mark[seed] === ep2) continue;
      const comp = [];
      grounded = false;
      stack.length = 0;
      stack.push(seed);
      mark[seed] = ep2;
      while (stack.length && !grounded) {
        const i = stack.pop();
        comp.push(i);
        const y = Math.floor(i / sxz);
        if (y === 0 || BLOCKS[data[i]].tier >= 3 || comp.length > maxVisit) {
          grounded = true;
          break;
        }
        const r = i - y * sxz;
        const z = Math.floor(r / sx);
        const x = r - z * sx;
        // Last pushed is explored first, so "down" is tried before anything else.
        if (y + 1 < sy) visit(i + sxz);
        if (z + 1 < sz) visit(i + sx);
        if (z > 0) visit(i - sx);
        if (x + 1 < sx) visit(i + 1);
        if (x > 0) visit(i - 1);
        visit(i - sxz);
      }
      if (grounded) {
        // Everything reached from a grounded voxel is grounded, including what
        // was still queued; later seeds touching any of it stop immediately.
        for (const i of comp) mark[i] = ep;
        for (const i of stack) mark[i] = ep;
      } else {
        out.push(comp);
      }
    }
    return out;
  }
}

export const DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
