import { B, BLOCKS, VOXEL } from './materials.js';
import { raycast } from './raycast.js';

const HEAT_PAD = 0.35; // metres beyond the carve radius that glow afterwards

/**
 * High-level destruction shared by every tool, explosion and impact:
 * carve the static world and any bodies in range, make fresh cuts glow,
 * detach whatever lost its connection to the ground, and emit effects.
 */
export class Destruction {
  constructor({ world, physics, debris, fire = null, fx = {} }) {
    this.world = world;
    this.physics = physics;
    this.debris = debris;
    this.fire = fire;
    this.fx = fx;
    this.time = 0;
    this.voxelsDestroyed = 0;
    this.biggestCollapse = 0;
    this.seeds = [];
  }

  /**
   * Carve a sphere out of the world and bodies.
   * radii: metres per tier [soft, medium, hard].
   * opts.heat: make surviving surfaces glow; opts.ignite: chance to set
   * flammable surfaces alight; opts.chips: fraction of removed voxels shown
   * as flying chips; opts.bodies: also carve dynamic bodies (default true).
   */
  carve(center, radii, opts = {}) {
    const w = this.world;
    const { removed, seeds } = w.carveSphere(center[0], center[1], center[2], radii);
    this.voxelsDestroyed += removed.length;
    for (const s of seeds) this.seeds.push(s);
    const rMax = Math.max(...radii);
    if (opts.heat && removed.length) this.heatShell(center, rMax + HEAT_PAD, opts.heat);
    if (opts.ignite && this.fire) this.fire.igniteSphere(center, rMax + 0.4, opts.ignite);
    const chips = removed.map((v) => ({ p: [(v.x + 0.5) * VOXEL, (v.y + 0.5) * VOXEL, (v.z + 0.5) * VOXEL], id: v.id }));
    if (opts.bodies !== false) {
      for (const body of [...this.debris.bodies.values()]) {
        if (!this.debris.bodies.has(body.id)) continue;
        const c = body.rb.worldCom();
        const reach = rMax + Math.max(body.nx, body.ny, body.nz) * VOXEL;
        if (Math.hypot(c.x - center[0], c.y - center[1], c.z - center[2]) > reach) continue;
        const r = this.debris.carve(body, center, radii);
        this.voxelsDestroyed += r.length;
        for (const v of r) chips.push(v);
      }
    }
    if (chips.length) this.fx.chips?.(subsample(chips, opts.chips ?? 1), opts.chipVel ?? null, center);
    this.resolve(opts.collapseVel);
    return chips.length;
  }

  // Remove an explicit list of voxels (fire burn-out).
  removeVoxels(list) {
    const { removed, seeds } = this.world.removeVoxels(list);
    this.voxelsDestroyed += removed.length;
    for (const s of seeds) this.seeds.push(s);
    return removed;
  }

  // Crush damage under a falling heavy body: no heat, few chips, dust.
  crush(point, radii) {
    const n = this.carve(point, radii, { chips: 0.3, bodies: false });
    if (n) this.fx.dust?.(point, Math.min(1, n / 40));
  }

  heatShell(center, r, t) {
    const w = this.world;
    const vr = Math.ceil(r / VOXEL);
    const vx = Math.floor(center[0] / VOXEL), vy = Math.floor(center[1] / VOXEL), vz = Math.floor(center[2] / VOXEL);
    for (let y = vy - vr; y <= vy + vr; y++)
      for (let z = vz - vr; z <= vz + vr; z++)
        for (let x = vx - vr; x <= vx + vr; x++) {
          const id = w.get(x, y, z);
          if (id === B.AIR || BLOCKS[id].transparent) continue;
          const d = Math.hypot((x + 0.5) * VOXEL - center[0], (y + 0.5) * VOXEL - center[1], (z + 0.5) * VOXEL - center[2]);
          if (d <= r) w.heatVoxel(x, y, z, t);
        }
  }

  /**
   * Detach every region that lost contact with the ground since the last
   * call. Small crumbs turn into chips; the rest become rigid bodies.
   */
  resolve(initialVel = null) {
    if (!this.seeds.length) return 0;
    const comps = this.world.findUnsupported(this.seeds);
    this.seeds.length = 0;
    let detached = 0;
    for (const comp of comps) {
      detached += comp.length;
      const body = this.debris.spawnFromWorld(comp, initialVel);
      if (body && comp.length > 200) this.fx.collapse?.(body, comp.length);
    }
    if (detached > this.biggestCollapse) this.biggestCollapse = detached;
    return detached;
  }

  /**
   * Explosion of a given power (1 = pipe bomb). Carves, heats, ignites,
   * shoves bodies and reports the blast for camera/player/audio effects.
   */
  explode(center, power = 1) {
    const radii = [1.9 * power, 1.35 * power, 0.55 * power];
    this.carve(center, radii, { heat: this.time, ignite: 0.35, chips: 0.5, chipVel: 9 * power });
    this.debris.impulse(center, 5.5 * power, 14 * power);
    this.physics.wakeInBox(center[0] - 6, center[1] - 6, center[2] - 6, center[0] + 6, center[1] + 6, center[2] + 6);
    this.fx.explosion?.(center, power);
  }

  /**
   * Find what a ray hits first: the voxel world (exact DDA) or a dynamic
   * object (Rapier ray cast). Returns a unified hit or null.
   */
  pick(origin, dir, maxDist, exclude = null) {
    const wh = raycast(this.world, origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], maxDist);
    const bh = this.physics.castDynamic({ x: origin[0], y: origin[1], z: origin[2] }, { x: dir[0], y: dir[1], z: dir[2] }, maxDist, exclude);
    if (bh && (!wh || bh.dist < wh.dist)) {
      return { kind: bh.owner.kind, ref: bh.owner.ref, dist: bh.dist, point: bh.point, normal: bh.normal, collider: bh.collider };
    }
    if (wh) {
      // Point on the face that was entered.
      const n = [wh.nx, wh.ny, wh.nz];
      return { kind: 'world', dist: wh.dist, point: wh.point, normal: n, voxel: [wh.x, wh.y, wh.z], id: wh.id };
    }
    return null;
  }
}

function subsample(list, frac) {
  if (frac >= 1) return list;
  const out = [];
  for (const v of list) if (Math.random() < frac) out.push(v);
  return out;
}
