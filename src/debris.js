import { RAPIER } from './physics.js';
import { B, BLOCKS, VOXEL } from './materials.js';

export const MIN_BODY_VOXELS = 4; // smaller fragments become particles
export const MAX_BODIES = 180;
const MAX_BODY_VOXELS_TOTAL = 160000;
const FRACTURE_PER_FRAME = 4;
const FRACTURE_COOLDOWN = 0.3;
// Rapier reports roughly 40 N of contact force per kg per m/s of impact speed
// (measured: a 104 t tank landing at 5.6 m/s peaks at ~224 N/kg). Convert to an
// impact-speed estimate so thresholds read in m/s.
const FORCE_PER_KG_PER_MS = 40;
const EVENT_SPEED = 1.5; // m/s: report impacts (sound, dust) above this
const FRACTURE_SPEED = 4; // m/s: crack the body above this
const CRUSH_SPEED = 5; // m/s: heavy bodies also crush the world above this

let nextId = 1;

// Quaternion helpers on plain {x,y,z,w} / [x,y,z] so this module stays
// independent of the renderer.
function rotate(q, v) {
  const { x: qx, y: qy, z: qz, w: qw } = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  return [vx + qw * tx + (qy * tz - qz * ty), vy + qw * ty + (qz * tx - qx * tz), vz + qw * tz + (qx * ty - qy * tx)];
}
const conj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/**
 * A detached piece of the world: a small voxel grid attached to a Rapier
 * dynamic body. The body's origin is the min corner of voxel (0,0,0).
 */
export class VoxelBody {
  constructor(nx, ny, nz, grid) {
    this.id = nextId++;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.grid = grid;
    this.count = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i]) this.count++;
    this.rb = null;
    this.collider = null;
    this.mass = 0;
    this.version = 0; // bumped whenever the mesh must be rebuilt
    this.lastFracture = -1;
    this.born = 0;
    this.sleepSince = -1;
    this.hasGlass = false;
  }

  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return B.AIR;
    return this.grid[x + this.nx * (z + this.nz * y)];
  }

  pose() {
    return { t: this.rb.translation(), q: this.rb.rotation() };
  }

  worldToLocal(p) {
    const { t, q } = this.pose();
    const l = rotate(conj(q), [p[0] - t.x, p[1] - t.y, p[2] - t.z]);
    return [l[0] / VOXEL, l[1] / VOXEL, l[2] / VOXEL];
  }

  localToWorld(l) {
    const { t, q } = this.pose();
    const r = rotate(q, [l[0] * VOXEL, l[1] * VOXEL, l[2] * VOXEL]);
    return [r[0] + t.x, r[1] + t.y, r[2] + t.z];
  }
}

/**
 * Owns all dynamic voxel bodies. Rendering listens through `onAdd`,
 * `onChange` and `onRemove`; effects through the `fx` object.
 */
export class Debris {
  constructor(world, physics, fx = {}) {
    this.world = world;
    this.physics = physics;
    this.fx = fx;
    this.bodies = new Map(); // id -> VoxelBody
    this.byCollider = new Map(); // collider handle -> VoxelBody
    this.onAdd = null;
    this.onChange = null;
    this.onRemove = null;
    this.time = 0;
    this.fractures = 0;
    this.totalVoxels = 0;
    this.pendingWorldSeeds = []; // structural checks requested by crush damage
  }

  /**
   * Detach a connected set of world voxels (indices) into a new body.
   * Returns the body, or null when the piece was too small and became chips.
   */
  spawnFromWorld(indices, linvel = null) {
    const w = this.world;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -1, y1 = -1, z1 = -1;
    const pts = new Array(indices.length);
    for (let k = 0; k < indices.length; k++) {
      const [x, y, z] = w.coords(indices[k]);
      pts[k] = [x, y, z, w.data[indices[k]]];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    for (const [x, y, z] of pts) w.set(x, y, z, B.AIR);
    if (indices.length < MIN_BODY_VOXELS || this.bodies.size >= MAX_BODIES) {
      this.fx.chips?.(pts.map(([x, y, z, id]) => ({ p: [(x + 0.5) * VOXEL, (y + 0.5) * VOXEL, (z + 0.5) * VOXEL], id })), linvel);
      return null;
    }
    const nx = x1 - x0 + 1, ny = y1 - y0 + 1, nz = z1 - z0 + 1;
    const grid = new Uint8Array(nx * ny * nz);
    for (const [x, y, z, id] of pts) grid[x - x0 + nx * (z - z0 + nz * (y - y0))] = id;
    const body = new VoxelBody(nx, ny, nz, grid);
    this.attach(body, [x0 * VOXEL, y0 * VOXEL, z0 * VOXEL], { x: 0, y: 0, z: 0, w: 1 }, linvel || [0, 0, 0], [0, 0, 0]);
    return body;
  }

  attach(body, pos, rot, linvel, angvel) {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos[0], pos[1], pos[2])
      .setRotation(rot)
      .setLinvel(linvel[0], linvel[1], linvel[2])
      .setAngvel({ x: angvel[0], y: angvel[1], z: angvel[2] })
      .setCcdEnabled(body.count < 64) // small fast chunks tunnel otherwise
      .setAngularDamping(0.15)
      .setLinearDamping(0.02);
    body.rb = this.physics.pw.createRigidBody(desc);
    body.born = this.time;
    this.buildCollider(body);
    this.bodies.set(body.id, body);
    this.totalVoxels += body.count;
    body.version++;
    this.onAdd?.(body);
    this.enforceBudget();
  }

  buildCollider(body) {
    if (body.collider) {
      this.byCollider.delete(body.collider.handle);
      this.physics.unregister(body.collider);
      this.physics.pw.removeCollider(body.collider, true);
      body.collider = null;
    }
    const coords = [];
    let dens = 0;
    body.hasGlass = false;
    const { nx, ny, nz, grid } = body;
    for (let y = 0; y < ny; y++)
      for (let z = 0; z < nz; z++)
        for (let x = 0; x < nx; x++) {
          const id = grid[x + nx * (z + nz * y)];
          if (!id) continue;
          coords.push(x, y, z);
          dens += BLOCKS[id].density;
          if (BLOCKS[id].transparent) body.hasGlass = true;
        }
    const n = coords.length / 3;
    const density = (dens / Math.max(1, n)) * 1000; // kg / m^3
    const desc = RAPIER.ColliderDesc.voxels(new Int32Array(coords), this.physics.vs)
      .setDensity(density)
      .setFriction(0.75)
      .setRestitution(0.05)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    body.collider = this.physics.pw.createCollider(desc, body.rb);
    body.mass = body.rb.mass();
    body.collider.setContactForceEventThreshold(body.mass * FORCE_PER_KG_PER_MS * EVENT_SPEED);
    this.byCollider.set(body.collider.handle, body);
    this.physics.register(body.collider, 'body', body);
  }

  remove(body) {
    if (!this.bodies.has(body.id)) return;
    this.bodies.delete(body.id);
    this.totalVoxels -= body.count;
    if (body.collider) {
      this.byCollider.delete(body.collider.handle);
      this.physics.unregister(body.collider);
    }
    this.physics.pw.removeRigidBody(body.rb);
    body.rb = null;
    body.collider = null;
    this.onRemove?.(body);
  }

  /**
   * Remove voxels of `body` within a world-space sphere using per-tier radii.
   * Splits the body into its connected pieces afterwards.
   * Returns removed voxels with world positions.
   */
  carve(body, center, radii, rand = Math.random) {
    const rMax = Math.max(radii[0] || 0, radii[1] || 0, radii[2] || 0);
    const lc = body.worldToLocal(center);
    const vr = rMax / VOXEL + 1;
    const removed = [];
    const { nx, ny, nz, grid } = body;
    const xa = Math.max(0, Math.floor(lc[0] - vr)), xb = Math.min(nx - 1, Math.ceil(lc[0] + vr));
    const ya = Math.max(0, Math.floor(lc[1] - vr)), yb = Math.min(ny - 1, Math.ceil(lc[1] + vr));
    const za = Math.max(0, Math.floor(lc[2] - vr)), zb = Math.min(nz - 1, Math.ceil(lc[2] + vr));
    for (let y = ya; y <= yb; y++)
      for (let z = za; z <= zb; z++)
        for (let x = xa; x <= xb; x++) {
          const i = x + nx * (z + nz * y);
          const id = grid[i];
          if (!id) continue;
          const tier = BLOCKS[id].tier;
          const r = tier >= 3 ? 0 : radii[tier] || 0;
          if (r <= 0) continue;
          const d = Math.hypot(x + 0.5 - lc[0], y + 0.5 - lc[1], z + 0.5 - lc[2]) * VOXEL;
          if (d > r) continue;
          if (d > r * 0.75 && rand() > (r - d) / (r * 0.25)) continue;
          grid[i] = B.AIR;
          removed.push({ p: body.localToWorld([x + 0.5, y + 0.5, z + 0.5]), id });
        }
    if (removed.length) {
      body.count -= removed.length;
      this.totalVoxels -= removed.length;
      this.restructure(body);
    }
    return removed;
  }

  /**
   * After voxels were removed from a body: drop it if empty, otherwise split
   * it into connected components (largest stays in this body) and rebuild
   * its collider and mesh.
   */
  restructure(body) {
    if (body.count <= 0) {
      this.remove(body);
      return;
    }
    const comps = components(body);
    if (comps.length > 1) {
      comps.sort((a, b) => b.length - a.length);
      const lin = body.rb.linvel(), ang = body.rb.angvel(), com = body.rb.worldCom();
      const rot = body.rb.rotation();
      for (let c = 1; c < comps.length; c++) {
        const comp = comps[c];
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -1, y1 = -1, z1 = -1;
        for (const i of comp) {
          const x = i % body.nx, r = (i - x) / body.nx, z = r % body.nz, y = (r - z) / body.nz;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        const pieces = [];
        for (const i of comp) {
          const x = i % body.nx, r = (i - x) / body.nx, z = r % body.nz, y = (r - z) / body.nz;
          pieces.push([x, y, z, body.grid[i]]);
          body.grid[i] = B.AIR;
        }
        body.count -= comp.length;
        this.totalVoxels -= comp.length;
        const origin = body.localToWorld([x0, y0, z0]);
        // Velocity of the parent at the piece's position: v + w x r.
        const mid = body.localToWorld([(x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2, (z0 + z1 + 1) / 2]);
        const r = [mid[0] - com.x, mid[1] - com.y, mid[2] - com.z];
        const v = [lin.x + ang.y * r[2] - ang.z * r[1], lin.y + ang.z * r[0] - ang.x * r[2], lin.z + ang.x * r[1] - ang.y * r[0]];
        if (comp.length < MIN_BODY_VOXELS || this.bodies.size >= MAX_BODIES) {
          this.fx.chips?.(pieces.map(([x, y, z, id]) => ({ p: body.localToWorld([x + 0.5, y + 0.5, z + 0.5]), id })), v);
          continue;
        }
        const nx = x1 - x0 + 1, ny = y1 - y0 + 1, nz = z1 - z0 + 1;
        const grid = new Uint8Array(nx * ny * nz);
        for (const [x, y, z, id] of pieces) grid[x - x0 + nx * (z - z0 + nz * (y - y0))] = id;
        const child = new VoxelBody(nx, ny, nz, grid);
        this.attach(child, origin, rot, v, [ang.x, ang.y, ang.z]);
      }
    }
    if (body.count < MIN_BODY_VOXELS) {
      const bits = [];
      for (let i = 0; i < body.grid.length; i++)
        if (body.grid[i]) {
          const x = i % body.nx, r = (i - x) / body.nx, z = r % body.nz, y = (r - z) / body.nz;
          bits.push({ p: body.localToWorld([x + 0.5, y + 0.5, z + 0.5]), id: body.grid[i] });
        }
      const v = body.rb.linvel();
      this.fx.chips?.(bits, [v.x, v.y, v.z]);
      this.remove(body);
      return;
    }
    this.buildCollider(body);
    body.rb.wakeUp();
    body.version++;
    this.onChange?.(body);
  }

  // Radial push from an explosion. Lighter bodies fly further.
  impulse(center, radius, strength) {
    for (const body of this.bodies.values()) {
      const c = body.rb.worldCom();
      const dx = c.x - center[0], dy = c.y - center[1], dz = c.z - center[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      const f = (1 - d / radius) * strength;
      const dv = f / (1 + body.mass / 4000); // m/s
      const inv = 1 / Math.max(d, 0.3);
      const j = body.mass * dv;
      body.rb.applyImpulse({ x: dx * inv * j, y: (dy * inv + 0.6) * j, z: dz * inv * j }, true);
      body.rb.applyTorqueImpulse({ x: (Math.random() - 0.5) * j * 0.3, y: (Math.random() - 0.5) * j * 0.3, z: (Math.random() - 0.5) * j * 0.3 }, true);
    }
  }

  // Process contact-force events: hard impacts crack bodies and can crush the
  // world they land on. Call once after the physics step(s). One impact can
  // arrive split over several chunk colliders, so forces are summed per body.
  handleImpacts(destruction) {
    const perBody = new Map(); // body -> { force, best, h1, h2, other }
    this.physics.events.drainContactForceEvents((e) => {
      const h1 = e.collider1(), h2 = e.collider2(), f = e.totalForceMagnitude();
      for (const [h, o] of [[h1, h2], [h2, h1]]) {
        const body = this.byCollider.get(h);
        if (!body) continue;
        let rec = perBody.get(body);
        if (!rec) perBody.set(body, (rec = { force: 0, best: 0, h1, h2, other: o }));
        rec.force += f;
        if (f > rec.best) Object.assign(rec, { best: f, h1, h2, other: o });
      }
    });
    // Hardest hits first, so the per-frame budgets go to what matters.
    const list = [];
    for (const [body, rec] of perBody) {
      if (this.bodies.has(body.id)) list.push([body, rec, rec.force / (body.mass * FORCE_PER_KG_PER_MS)]);
    }
    list.sort((a, b) => b[2] - a[2]);
    let budget = FRACTURE_PER_FRAME;
    let sounds = 12;
    for (const [body, rec, speed] of list) {
      if (!this.bodies.has(body.id)) continue;
      const mat = body.grid.find((v) => v) || B.CONCRETE;
      const fracture = speed >= FRACTURE_SPEED && budget > 0 && this.time - body.lastFracture >= FRACTURE_COOLDOWN;
      if (!fracture) {
        // Sound and dust only need roughly where: the centre of mass will do.
        if (sounds-- > 0) {
          const c = body.rb.worldCom();
          this.fx.impact?.([c.x, c.y, c.z], mat, speed, body.mass);
        }
        continue;
      }
      const point = this.contactPoint(body, this.physics.ownerOf(rec.other));
      if (!point) continue;
      this.fx.impact?.(point, mat, speed, body.mass);
      budget--;
      body.lastFracture = this.time;
      this.fractures++;
      const over = speed - FRACTURE_SPEED;
      const r = VOXEL * Math.min(1.6 + over * 0.6, 4.5);
      const radii = [r, over > 2 ? r * 0.6 : r * 0.3, 0];
      const other = this.physics.ownerOf(rec.other);
      const removed = this.carve(body, point, radii);
      if (removed.length) this.fx.chips?.(removed, null, point);
      // A heavy piece slamming into the static world crushes what is under it.
      if (other && other.kind === 'world' && body.mass > 1500 && speed > CRUSH_SPEED && destruction) {
        const cr = VOXEL * Math.min(1.2 + (speed - CRUSH_SPEED) * 0.5, 4);
        destruction.crush(point, [cr, speed > CRUSH_SPEED + 3 ? cr * 0.5 : 0, 0]);
      }
    }
  }

  /**
   * Where `body` touches the thing it hit: the mean of its voxels that have a
   * solid neighbour in the other object (the static world or another body).
   * Computed from occupancy rather than Rapier manifold frames, which for
   * voxel shapes are relative to internal sub-shapes.
   */
  contactPoint(body, other) {
    const w = this.world;
    const ob = other && other.kind === 'body' && this.bodies.has(other.ref.id) ? other.ref : null;
    // Poses are fetched once: each rb.translation()/rotation() is a WASM call.
    const { t, q } = body.pose();
    const op = ob ? ob.pose() : null;
    const oiq = op ? conj(op.q) : null;
    const probe = (x, y, z) => {
      if (ob) {
        const l = rotate(oiq, [x - op.t.x, y - op.t.y, z - op.t.z]);
        return ob.get(Math.floor(l[0] / VOXEL), Math.floor(l[1] / VOXEL), Math.floor(l[2] / VOXEL)) !== B.AIR;
      }
      return w.get(Math.floor(x / VOXEL), Math.floor(y / VOXEL), Math.floor(z / VOXEL)) !== B.AIR;
    };
    const { nx, nz, grid } = body;
    const stride = Math.max(1, Math.ceil(body.count / 800));
    const d = VOXEL * 0.75;
    let sx = 0, sy = 0, sz = 0, n = 0, k = 0;
    let low = null;
    for (let i = 0; i < grid.length; i++) {
      if (!grid[i] || k++ % stride) continue;
      const x = i % nx, r = (i - x) / nx, z = r % nz, y = (r - z) / nz;
      const v = rotate(q, [(x + 0.5) * VOXEL, (y + 0.5) * VOXEL, (z + 0.5) * VOXEL]);
      const px = v[0] + t.x, py = v[1] + t.y, pz = v[2] + t.z;
      if (!low || py < low[1]) low = [px, py, pz];
      if (probe(px, py - d, pz) || probe(px + d, py, pz) || probe(px - d, py, pz) ||
          probe(px, py, pz + d) || probe(px, py, pz - d) || probe(px, py + d, pz)) {
        sx += px; sy += py; sz += pz; n++;
      }
    }
    return n ? [sx / n, sy / n, sz / n] : low;
  }

  update(dt) {
    this.time += dt;
    for (const body of this.bodies.values()) {
      const t = body.rb.translation();
      if (t.y < -20) {
        this.remove(body);
        continue;
      }
      if (body.rb.isSleeping()) {
        if (body.sleepSince < 0) body.sleepSince = this.time;
      } else body.sleepSince = -1;
    }
  }

  // Too many bodies: freeze the oldest sleeping ones back into the static
  // world so the simulation and draw calls stay bounded.
  enforceBudget() {
    if (this.bodies.size <= MAX_BODIES * 0.85 && this.totalVoxels <= MAX_BODY_VOXELS_TOTAL) return;
    const sleeping = [...this.bodies.values()].filter((b) => b.rb.isSleeping()).sort((a, b) => a.born - b.born);
    for (const b of sleeping) {
      if (this.bodies.size <= MAX_BODIES * 0.7 && this.totalVoxels <= MAX_BODY_VOXELS_TOTAL * 0.8) break;
      this.bake(b);
    }
  }

  /**
   * Write a body's voxels back into the world grid. Each world cell whose
   * centre falls inside a body voxel is filled, which avoids the holes a
   * forward (body -> world) rasterisation would leave on rotated bodies.
   */
  bake(body) {
    if (!this.bodies.has(body.id)) return;
    const w = this.world;
    const { nx, ny, nz } = body;
    let ax = Infinity, ay = Infinity, az = Infinity, bx = -Infinity, by = -Infinity, bz = -Infinity;
    for (const cx of [0, nx]) for (const cy of [0, ny]) for (const cz of [0, nz]) {
      const p = body.localToWorld([cx, cy, cz]);
      ax = Math.min(ax, p[0]); bx = Math.max(bx, p[0]);
      ay = Math.min(ay, p[1]); by = Math.max(by, p[1]);
      az = Math.min(az, p[2]); bz = Math.max(bz, p[2]);
    }
    const { t, q } = body.pose();
    const iq = conj(q);
    for (let y = Math.floor(ay / VOXEL); y <= Math.floor(by / VOXEL); y++)
      for (let z = Math.floor(az / VOXEL); z <= Math.floor(bz / VOXEL); z++)
        for (let x = Math.floor(ax / VOXEL); x <= Math.floor(bx / VOXEL); x++) {
          if (!w.inBounds(x, y, z) || w.get(x, y, z) !== B.AIR) continue;
          const l = rotate(iq, [(x + 0.5) * VOXEL - t.x, (y + 0.5) * VOXEL - t.y, (z + 0.5) * VOXEL - t.z]);
          const id = body.get(Math.floor(l[0] / VOXEL), Math.floor(l[1] / VOXEL), Math.floor(l[2] / VOXEL));
          if (id) w.set(x, y, z, id);
        }
    this.remove(body);
  }

  clear() {
    for (const b of [...this.bodies.values()]) this.remove(b);
  }
}

// 6-connected components of a body's grid, as arrays of grid indices.
export function components(body) {
  const { nx, ny, nz, grid } = body;
  const seen = new Uint8Array(grid.length);
  const out = [];
  const stack = [];
  for (let s = 0; s < grid.length; s++) {
    if (!grid[s] || seen[s]) continue;
    const comp = [];
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop();
      comp.push(i);
      const x = i % nx, r = (i - x) / nx, z = r % nz, y = (r - z) / nz;
      const nb = (j) => {
        if (grid[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      };
      if (x > 0) nb(i - 1);
      if (x < nx - 1) nb(i + 1);
      if (z > 0) nb(i - nx);
      if (z < nz - 1) nb(i + nx);
      if (y > 0) nb(i - nx * nz);
      if (y < ny - 1) nb(i + nx * nz);
    }
    out.push(comp);
  }
  return out;
}
