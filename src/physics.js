import RAPIER from '../vendor/rapier/rapier.mjs';
import { B, VOXEL } from './materials.js';
import { CHUNK } from './world.js';

export { RAPIER };

let ready = null;
export function initPhysics() {
  ready ??= RAPIER.init();
  return ready;
}

export const STEP = 1 / 60;
const MAX_STEPS = 4; // never spiral: drop simulated time rather than stall a frame

/**
 * Rapier world wrapper. The static voxel world is one fixed body with a voxel
 * collider per 16^3 chunk; neighbouring chunk colliders are coupled so bodies
 * do not catch on internal edges at chunk seams. Edits to the voxel grid are
 * replayed onto the colliders in sync().
 */
export class Physics {
  constructor(world) {
    this.world = world;
    this.pw = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.pw.timestep = STEP;
    this.pw.integrationParameters.numSolverIterations = 6;
    this.events = new RAPIER.EventQueue(true);
    this.chunkColliders = new Map(); // chunkKey -> collider
    this.owners = new Map(); // collider handle -> { kind, ref }
    this.acc = 0;
    this.stepped = 0; // physics steps taken in the last update()
    this.vs = { x: VOXEL, y: VOXEL, z: VOXEL };
  }

  buildWorld() {
    const w = this.world;
    for (let cy = 0; cy < w.cy; cy++)
      for (let cz = 0; cz < w.cz; cz++)
        for (let cx = 0; cx < w.cx; cx++) this.createChunkCollider(cx, cy, cz);
    // Couple every pair of chunks sharing a face, edge or corner, once.
    const half = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const lin = dx + 3 * (dz + 3 * dy);
          if (lin > 0) half.push([dx, dy, dz]);
        }
    for (const [key, c] of this.chunkColliders) {
      const [cx, cy, cz] = w.chunkCoords(key);
      for (const [dx, dy, dz] of half) {
        const n = this.neighbourCollider(cx + dx, cy + dy, cz + dz);
        if (n) c.combineVoxelStates(n, dx * CHUNK, dy * CHUNK, dz * CHUNK);
      }
    }
    w.edits.length = 0;
  }

  neighbourCollider(cx, cy, cz) {
    const w = this.world;
    if (cx < 0 || cy < 0 || cz < 0 || cx >= w.cx || cy >= w.cy || cz >= w.cz) return null;
    return this.chunkColliders.get(w.chunkKey(cx, cy, cz)) || null;
  }

  createChunkCollider(cx, cy, cz) {
    const w = this.world;
    const coords = [];
    for (let y = 0; y < CHUNK; y++)
      for (let z = 0; z < CHUNK; z++)
        for (let x = 0; x < CHUNK; x++)
          if (w.get(cx * CHUNK + x, cy * CHUNK + y, cz * CHUNK + z) !== B.AIR) coords.push(x, y, z);
    if (!coords.length) return null;
    // One fixed body per chunk. Editing a collider makes Rapier recompute its
    // parent body's mass properties over every attached collider; with one
    // shared ground body that meant all ~400k voxels (~30 ms) per edit.
    const body = this.pw.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(cx * CHUNK * VOXEL, cy * CHUNK * VOXEL, cz * CHUNK * VOXEL),
    );
    const desc = RAPIER.ColliderDesc.voxels(new Int32Array(coords), this.vs).setFriction(0.8);
    const c = this.pw.createCollider(desc, body);
    const key = w.chunkKey(cx, cy, cz);
    this.chunkColliders.set(key, c);
    this.owners.set(c.handle, { kind: 'world', ref: key });
    return c;
  }

  // Replay grid edits onto the chunk colliders.
  sync() {
    const w = this.world;
    const edits = w.edits;
    if (!edits.length) return;
    const sx = w.sx, sxz = w.sx * w.sz;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let e = 0; e < edits.length; e++) {
      const i = edits[e];
      const y = Math.floor(i / sxz);
      const r = i - y * sxz;
      const z = Math.floor(r / sx);
      const x = r - z * sx;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
      const filled = w.data[i] !== B.AIR;
      const cx = x >> 4, cy = y >> 4, cz = z >> 4;
      const lx = x & 15, ly = y & 15, lz = z & 15;
      let c = this.chunkColliders.get(w.chunkKey(cx, cy, cz));
      if (!c) {
        if (!filled) continue;
        // First voxel in an empty chunk (e.g. baked debris): build it whole
        // and couple it to its neighbours.
        c = this.createChunkCollider(cx, cy, cz);
        if (!c) continue;
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy && !dz) continue;
              const n = this.neighbourCollider(cx + dx, cy + dy, cz + dz);
              if (n) c.combineVoxelStates(n, dx * CHUNK, dy * CHUNK, dz * CHUNK);
            }
        continue;
      }
      c.setVoxel(lx, ly, lz, filled);
      // Keep seam coupling valid for voxels on the chunk border.
      const ax = lx === 0 ? -1 : lx === 15 ? 1 : 0;
      const ay = ly === 0 ? -1 : ly === 15 ? 1 : 0;
      const az = lz === 0 ? -1 : lz === 15 ? 1 : 0;
      if (ax || ay || az) {
        for (let dy = ay < 0 ? -1 : 0; dy <= (ay > 0 ? 1 : 0); dy++)
          for (let dz = az < 0 ? -1 : 0; dz <= (az > 0 ? 1 : 0); dz++)
            for (let dx = ax < 0 ? -1 : 0; dx <= (ax > 0 ? 1 : 0); dx++) {
              if (!dx && !dy && !dz) continue;
              const n = this.neighbourCollider(cx + dx, cy + dy, cz + dz);
              if (n) c.propagateVoxelChange(n, lx, ly, lz, dx * CHUNK, dy * CHUNK, dz * CHUNK);
            }
      }
    }
    edits.length = 0;
    // Sleeping bodies resting on edited voxels must notice they lost support.
    this.wakeInBox(x0 * VOXEL, y0 * VOXEL, z0 * VOXEL, (x1 + 1) * VOXEL, (y1 + 1) * VOXEL, (z1 + 1) * VOXEL, 0.5);
  }

  wakeInBox(ax, ay, az, bx, by, bz, pad = 0) {
    const c = { x: (ax + bx) / 2, y: (ay + by) / 2, z: (az + bz) / 2 };
    const h = { x: (bx - ax) / 2 + pad, y: (by - ay) / 2 + pad, z: (bz - az) / 2 + pad };
    // Never mutate inside a Rapier query callback: the query holds the body
    // set borrowed, and wasm-bindgen swallows the aliasing error while leaving
    // the borrow stuck (the world then cannot be freed). Collect, then wake.
    const found = [];
    this.pw.collidersWithAabbIntersectingAabb(c, h, (col) => {
      found.push(col);
      return true;
    });
    for (const col of found) {
      const body = col.parent();
      if (body && body.isDynamic() && body.isSleeping()) body.wakeUp();
    }
  }

  register(collider, kind, ref) {
    this.owners.set(collider.handle, { kind, ref });
  }

  unregister(collider) {
    this.owners.delete(collider.handle);
  }

  ownerOf(handle) {
    return this.owners.get(handle) || null;
  }

  // Fixed-step update. Returns the number of steps taken.
  update(dt, onStep) {
    this.sync();
    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS);
    let n = 0;
    while (this.acc >= STEP) {
      onStep?.(STEP);
      this.pw.step(this.events);
      this.acc -= STEP;
      n++;
    }
    this.stepped = n;
    return n;
  }

  // Ray against dynamic things only (bodies, targets, props); the voxel world
  // is hit-tested exactly with the grid DDA instead.
  castDynamic(origin, dir, maxDist, excludeCollider = null) {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.pw.castRayAndGetNormal(
      ray, maxDist, true, undefined, undefined, excludeCollider ?? undefined, undefined,
      (c) => {
        const o = this.owners.get(c.handle);
        return !!o && o.kind !== 'world' && o.kind !== 'player';
      },
    );
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return {
      dist: hit.timeOfImpact,
      point: [p.x, p.y, p.z],
      normal: [hit.normal.x, hit.normal.y, hit.normal.z],
      collider: hit.collider,
      owner: this.owners.get(hit.collider.handle),
    };
  }
}
