import { B, VOXEL } from './materials.js';
import { World } from './world.js';
import { makeRng } from './rng.js';

export const SIZE_X = 256;
export const SIZE_Y = 64;
export const SIZE_Z = 256;
export const GROUND = 5; // first air layer above the grass
export const FLOOR_H = 12; // voxels per storey (3 m)

// Inclusive-min / exclusive-max box fill in voxel coordinates.
function box(w, x0, y0, z0, x1, y1, z1, id) {
  const ax = Math.max(0, Math.min(x0, x1)), bx = Math.min(w.sx, Math.max(x0, x1));
  const ay = Math.max(0, Math.min(y0, y1)), by = Math.min(w.sy, Math.max(y0, y1));
  const az = Math.max(0, Math.min(z0, z1)), bz = Math.min(w.sz, Math.max(z0, z1));
  for (let y = ay; y < by; y++)
    for (let z = az; z < bz; z++) {
      const row = w.sx * (z + w.sz * y);
      for (let x = ax; x < bx; x++) w.data[row + x] = id;
    }
}

const m = (v) => (v + 0.5) * VOXEL; // voxel centre -> metres
const surface = (v) => v * VOXEL; // voxel boundary -> metres

/**
 * A stair flight inside a building, climbing one storey of FLOOR_H.
 * `lane` 0 climbs towards +z from zs, lane 1 climbs towards -z back to zs.
 * Steps are solid columns so they are supported by the slab underneath, and
 * the slab above the flight is opened for headroom.
 */
function stairFlight(w, lx, zs, yFloor, lane, id) {
  // Headroom first: open the slab above (and any ceiling layer under it).
  box(w, lx, yFloor + FLOOR_H - 1, zs, lx + 4, yFloor + FLOOR_H + 1, zs + FLOOR_H - 1, B.AIR);
  const steps = FLOOR_H - 1;
  for (let i = 0; i < steps; i++) {
    const z = lane === 0 ? zs + i : zs + FLOOR_H - 2 - i;
    box(w, lx, yFloor + 1, z, lx + 4, yFloor + 2 + i, z + 1, id);
  }
}

function stairs(w, x0, zs, floors, id, maxFloor = floors - 1) {
  for (let k = 0; k < Math.min(floors - 1, maxFloor); k++) {
    const lane = k % 2;
    stairFlight(w, x0 + lane * 4, zs, GROUND + k * FLOOR_H, lane, id);
  }
}

// Punch window openings into a wall face and glaze them.
function windows(w, axis, fixed, from, to, yFloor, thick, outward, opts = {}) {
  const spacing = opts.spacing ?? 10, width = opts.width ?? 4, sill = opts.sill ?? 4, height = opts.height ?? 5;
  for (let a = from + 3; a + width <= to - 3; a += spacing) {
    for (let t = 0; t < thick; t++) {
      const c = fixed + outward * t;
      const glass = t === 0 ? B.GLASS : B.AIR;
      for (let y = yFloor + sill; y < yFloor + sill + height; y++)
        for (let s = a; s < a + width; s++) {
          if (axis === 'x') w.put(s, y, c, glass);
          else w.put(c, y, s, glass);
        }
      // Sill trim on the outer face.
      if (t === 0)
        for (let s = a - 1; s < a + width + 1; s++) {
          if (axis === 'x') w.put(s, yFloor + sill - 1, c, B.TRIM);
          else w.put(c, yFloor + sill - 1, s, B.TRIM);
        }
    }
  }
}

function gableRoof(w, x0, z0, x1, z1, yBase, tile, gableWall) {
  // Ridge runs along z; slopes descend towards x0 and x1, 2 voxels thick so
  // the tiles are face-connected (diagonal-only contact would fall apart).
  const half = Math.ceil((x1 - x0 + 2) / 2);
  for (let i = 0; i <= half; i++) {
    const y = yBase + i;
    const a = x0 - 1 + i, b = x1 + 1 - i; // b is exclusive
    if (a >= b) break;
    box(w, a, y, z0 - 1, Math.min(a + 2, b), y + 1, z1 + 1, tile);
    box(w, Math.max(b - 2, a), y, z0 - 1, b, y + 1, z1 + 1, tile);
    // Gable end walls fill the triangle at both ends.
    box(w, a + 1, y, z0, b - 1, y + 1, z0 + 2, gableWall);
    box(w, a + 1, y, z1 - 2, b - 1, y + 1, z1, gableWall);
  }
}

function townhouse(w, rng, x0, z0, targets) {
  const W = 32, D = 30, floors = 3, T = 2;
  const x1 = x0 + W, z1 = z0 + D;
  const wall = rng.pick([B.BRICK, B.BRICK, B.WBRICK]);
  const top = GROUND + floors * FLOOR_H;
  box(w, x0, GROUND - 1, z0, x1, GROUND, z1, B.CONCRETE); // footing
  box(w, x0, GROUND, z0, x1, top + 1, z1, wall);
  box(w, x0 + T, GROUND + 1, z0 + T, x1 - T, top, z1 - T, B.AIR);
  for (let k = 0; k < floors; k++) {
    const yf = GROUND + k * FLOOR_H;
    box(w, x0 + T, yf, z0 + T, x1 - T, yf + 1, z1 - T, k === 0 ? B.DARKWOOD : B.PLANK);
    if (k > 0) box(w, x0 + T, yf - 1, z0 + T, x1 - T, yf, z1 - T, B.PLASTER); // ceiling layer
    windows(w, 'x', z0, x0, x1, yf, T, 1);
    windows(w, 'x', z1 - 1, x0, x1, yf, T, -1);
    windows(w, 'z', x0, z0, z1, yf, T, 1);
    windows(w, 'z', x1 - 1, z0, z1, yf, T, -1);
    // Interior partition with a doorway.
    const px = x0 + 18;
    box(w, px, yf + 1, z0 + T, px + 1, yf + FLOOR_H, z1 - T, B.PLASTER);
    box(w, px, yf + 1, z0 + 12, px + 1, yf + 10, z0 + 16, B.AIR);
    if (k > 0) box(w, px + 2, yf + 1, z0 + 6, px + 10, yf + 2, z0 + 14, B.CARPET);
  }
  // Front door facing -z (towards the street).
  box(w, x0 + 22, GROUND + 1, z0, x0 + 26, GROUND + 10, z0 + T, B.AIR);
  box(w, x0 + 21, GROUND + 10, z0, x0 + 27, GROUND + 11, z0 + 1, B.TRIM);
  stairs(w, x0 + T, z0 + T + 3, floors, B.DARKWOOD);
  gableRoof(w, x0, z0, x1, z1, top + 1, B.ROOF, wall);
  // Target: top floor, back room.
  targets.push({
    name: 'Ledger', value: 1500, required: true,
    pos: [m(x0 + 26), surface(GROUND + 2 * FLOOR_H + 1), m(z1 - 6)],
  });
  return { x0, z0, x1, z1 };
}

function office(w, rng, x0, z0, targets) {
  const W = 44, D = 36, floors = 4;
  const x1 = x0 + W, z1 = z0 + D;
  const top = GROUND + floors * FLOOR_H;
  box(w, x0, GROUND - 1, z0, x1, GROUND, z1, B.CONCRETE);
  // Glass curtain wall, then concrete columns and spandrel bands over it.
  box(w, x0, GROUND, z0, x1, top, z1, B.GLASS);
  box(w, x0 + 1, GROUND, z0 + 1, x1 - 1, top, z1 - 1, B.AIR);
  for (let x = x0; x < x1; x += 8) {
    box(w, x, GROUND, z0, x + 2, top, z0 + 2, B.CONCRETE);
    box(w, x, GROUND, z1 - 2, x + 2, top, z1, B.CONCRETE);
  }
  for (let z = z0; z < z1; z += 9) {
    box(w, x0, GROUND, z, x0 + 2, top, z + 2, B.CONCRETE);
    box(w, x1 - 2, GROUND, z, x1, top, z + 2, B.CONCRETE);
  }
  box(w, x1 - 2, GROUND, z1 - 2, x1, top, z1, B.CONCRETE);
  for (let k = 0; k <= floors; k++) {
    const yf = GROUND + k * FLOOR_H;
    box(w, x0, yf, z0, x1, yf + 1, z1, B.CONCRETE);
    if (k > 0 && k < floors) {
      // Spandrel band below each slab.
      box(w, x0, yf - 2, z0, x1, yf, z0 + 1, B.CONCRETE);
      box(w, x0, yf - 2, z1 - 1, x1, yf, z1, B.CONCRETE);
      box(w, x0, yf - 2, z0, x0 + 1, yf, z1, B.CONCRETE);
      box(w, x1 - 1, yf - 2, z0, x1, yf, z1, B.CONCRETE);
    }
    if (k < floors) {
      // Interior steel columns: the floors hang on these.
      for (const [cx, cz] of [[x0 + 16, z0 + 12], [x0 + 30, z0 + 12], [x0 + 16, z0 + 24], [x0 + 30, z0 + 24]])
        box(w, cx, yf + 1, cz, cx + 2, yf + FLOOR_H, cz + 2, B.STEEL);
      // Partition offices along the back.
      box(w, x0 + 12, yf + 1, z0 + 26, x1 - 2, yf + FLOOR_H, z0 + 27, B.PLASTER);
      for (let x = x0 + 16; x < x1 - 6; x += 10) box(w, x, yf + 1, z0 + 26, x + 4, yf + 10, z0 + 27, B.AIR);
      box(w, x0 + 22, yf + 1, z0 + 27, x0 + 23, yf + FLOOR_H, z1 - 2, B.PLASTER);
      // Desks.
      for (let x = x0 + 26; x < x1 - 6; x += 8) box(w, x, yf + 1, z0 + 30, x + 4, yf + 4, z0 + 32, B.DARKWOOD);
    }
  }
  // Parapet.
  box(w, x0, top + 1, z0, x1, top + 3, z0 + 1, B.CONCRETE);
  box(w, x0, top + 1, z1 - 1, x1, top + 3, z1, B.CONCRETE);
  box(w, x0, top + 1, z0, x0 + 1, top + 3, z1, B.CONCRETE);
  box(w, x1 - 1, top + 1, z0, x1, top + 3, z1, B.CONCRETE);
  // Entrance facing +z (street side): replace glass between two columns.
  box(w, x0 + 18, GROUND + 1, z1 - 2, x0 + 24, GROUND + 10, z1, B.AIR);
  stairs(w, x0 + 3, z0 + 5, floors, B.CONCRETE);
  // Wall the stair core off from the open floor, with an opening at each end
  // so both landings (near and far) lead out.
  for (let k = 0; k < floors; k++) {
    const yf = GROUND + k * FLOOR_H;
    box(w, x0 + 11, yf + 1, z0 + 1, x0 + 12, yf + FLOOR_H, z0 + 19, B.PLASTER);
    box(w, x0 + 11, yf + 1, z0 + 1, x0 + 12, yf + 10, z0 + 5, B.AIR);
    box(w, x0 + 11, yf + 1, z0 + 15, x0 + 12, yf + 10, z0 + 19, B.AIR);
  }
  targets.push({
    name: 'Server Drive', value: 2500, required: true,
    pos: [m(x1 - 6), surface(GROUND + 3 * FLOOR_H + 1), m(z0 + 32)],
  });
  return { x0, z0, x1, z1 };
}

function bank(w, rng, x0, z0, targets) {
  const W = 40, D = 32, H = 18, T = 2;
  const x1 = x0 + W, z1 = z0 + D;
  const top = GROUND + H;
  box(w, x0, GROUND - 1, z0, x1, GROUND, z1, B.CONCRETE);
  box(w, x0, GROUND, z0, x1, top, z1, B.WBRICK);
  box(w, x0 + T, GROUND + 1, z0 + T, x1 - T, top, z1 - T, B.AIR);
  box(w, x0 + T, GROUND, z0 + T, x1 - T, GROUND + 1, z1 - T, B.PAVING);
  box(w, x0 - 1, top, z0 - 5, x1 + 1, top + 2, z1 + 1, B.CONCRETE); // roof with portico
  // Columns at the front.
  for (let x = x0 + 2; x < x1 - 2; x += 8) box(w, x, GROUND, z0 - 4, x + 2, top, z0 - 2, B.WBRICK);
  box(w, x0, GROUND - 1, z0 - 5, x1, GROUND, z0, B.PAVING);
  windows(w, 'x', z0, x0, x1, GROUND, T, 1, { sill: 5, height: 9, spacing: 9 });
  windows(w, 'z', x0, z0, z1, GROUND, T, 1, { sill: 5, height: 9, spacing: 9 });
  windows(w, 'z', x1 - 1, z0, z1, GROUND, T, -1, { sill: 5, height: 9, spacing: 9 });
  box(w, x0 + 18, GROUND + 1, z0, x0 + 22, GROUND + 11, z0 + T, B.AIR); // door, facing the street (-z)
  // Counter.
  box(w, x0 + 4, GROUND + 1, z0 + 12, x1 - 4, GROUND + 5, z0 + 14, B.DARKWOOD);
  box(w, x0 + 18, GROUND + 1, z0 + 12, x0 + 22, GROUND + 5, z0 + 14, B.AIR);
  // Vault: hard steel box with no door. Bring a cutter or a rocket.
  const vx0 = x0 + 12, vz0 = z0 + 17, vx1 = vx0 + 16, vz1 = vz0 + 13, VT = 2;
  box(w, vx0, GROUND, vz0, vx1, GROUND + 13, vz1, B.VAULT);
  box(w, vx0 + VT, GROUND + 1, vz0 + VT, vx1 - VT, GROUND + 11, vz1 - VT, B.AIR);
  box(w, vx0 + VT, GROUND, vz0 + VT, vx1 - VT, GROUND + 1, vz1 - VT, B.METAL);
  targets.push({
    name: 'Gold Bars', value: 4000, required: true,
    pos: [m(vx0 + 8), surface(GROUND + 1), m(vz0 + 6)],
  });
  return { x0, z0: z0 - 5, x1, z1 };
}

function barn(w, rng, x0, z0, targets) {
  const W = 28, D = 36, H = 20;
  const x1 = x0 + W, z1 = z0 + D;
  box(w, x0, GROUND - 1, z0, x1, GROUND, z1, B.GRAVEL);
  box(w, x0, GROUND, z0, x1, GROUND + H, z1, B.PLANK);
  box(w, x0 + 1, GROUND, z0 + 1, x1 - 1, GROUND + H, z1 - 1, B.AIR);
  box(w, x0 + 1, GROUND - 1, z0 + 1, x1 - 1, GROUND, z1 - 1, B.GRAVEL);
  for (const [px, pz] of [[x0, z0], [x1 - 2, z0], [x0, z1 - 2], [x1 - 2, z1 - 2], [x0, z0 + 17], [x1 - 2, z0 + 17]])
    box(w, px, GROUND, pz, px + 2, GROUND + H, pz + 2, B.DARKWOOD);
  // Big doors on the +z side (towards the street), then a plank floor whose
  // walking surface (GROUND+1) matches the other buildings' ground floors.
  box(w, x0 + 8, GROUND, z1 - 1, x0 + 20, GROUND + 14, z1, B.AIR);
  box(w, x0 + 1, GROUND, z0 + 1, x1 - 1, GROUND + 1, z1 - 1, B.DARKWOOD);
  box(w, x0 + 8, GROUND, z1 - 1, x0 + 20, GROUND + 1, z1, B.DARKWOOD);
  // Hayloft over the back half, with a flight of stairs up.
  const loftY = GROUND + FLOOR_H;
  box(w, x0 + 1, loftY, z0 + 1, x1 - 1, loftY + 1, z0 + 18, B.DARKWOOD);
  // Climbs towards -z from the open floor and lands on the loft edge (z0+17).
  stairFlight(w, x1 - 6, z0 + 18, GROUND, 1, B.PLANK);
  // Hay bales / crates.
  for (let i = 0; i < 6; i++) {
    const cx = rng.int(x0 + 2, x0 + 14), cz = rng.int(z0 + 2, z0 + 14);
    box(w, cx, loftY + 1, cz, cx + 3, loftY + 4, cz + 3, B.CRATE);
  }
  for (let i = 0; i < 4; i++) {
    const cx = rng.int(x0 + 2, x0 + 8), cz = rng.int(z0 + 20, z0 + 30);
    box(w, cx, GROUND + 1, cz, cx + 3, GROUND + 4, cz + 3, B.CRATE);
  }
  gableRoof(w, x0, z0, x1, z1, GROUND + H, B.DARKWOOD, B.PLANK);
  targets.push({
    name: 'Antique Clock', value: 800, required: false,
    pos: [m(x0 + 20), surface(loftY + 1), m(z0 + 6)],
  });
  return { x0, z0, x1, z1 };
}

function waterTower(w, rng, x0, z0, targets) {
  const S = 16, legH = 30;
  const yTop = GROUND + legH;
  for (const [lx, lz] of [[x0, z0], [x0 + S - 2, z0], [x0, z0 + S - 2], [x0 + S - 2, z0 + S - 2]])
    box(w, lx, GROUND - 1, lz, lx + 2, yTop, lz + 2, B.STEEL);
  // One ring of bracing halfway up.
  const by = GROUND + 14;
  box(w, x0, by, z0, x0 + S, by + 1, z0 + 1, B.STEEL);
  box(w, x0, by, z0 + S - 1, x0 + S, by + 1, z0 + S, B.STEEL);
  box(w, x0, by, z0, x0 + 1, by + 1, z0 + S, B.STEEL);
  box(w, x0 + S - 1, by, z0, x0 + S, by + 1, z0 + S, B.STEEL);
  // Platform and wooden tank.
  box(w, x0 - 1, yTop, z0 - 1, x0 + S + 1, yTop + 1, z0 + S + 1, B.METAL);
  const cx = x0 + S / 2, cz = z0 + S / 2, R = 8.5;
  for (let y = yTop + 1; y < yTop + 13; y++)
    for (let z = z0 - 2; z < z0 + S + 2; z++)
      for (let x = x0 - 2; x < x0 + S + 2; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d < R && (d > R - 1.6 || y === yTop + 12)) w.put(x, y, z, B.PLANK);
      }
  for (let i = 0; i < 4; i++) {
    const r = R - 1.5 - i * 2;
    for (let z = z0 - 2; z < z0 + S + 2; z++)
      for (let x = x0 - 2; x < x0 + S + 2; x++)
        if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < r) w.put(x, yTop + 13 + i, z, B.ROOF);
  }
  // Up top. The only way to it is to bring it down.
  targets.push({
    name: 'Radio Beacon', value: 1200, required: false,
    pos: [m(cx + 4), surface(yTop + 15), m(cz)],
  });
  return { x0: x0 - 2, z0: z0 - 2, x1: x0 + S + 2, z1: z0 + S + 2 };
}

function tree(w, rng, x, z) {
  const h = rng.int(12, 18);
  box(w, x, GROUND, z, x + 2, GROUND + h, z + 2, B.BARK);
  const r = rng.range(4.5, 6.5);
  const cy = GROUND + h + 1;
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let zz = Math.floor(z + 1 - r); zz <= z + 1 + r; zz++)
      for (let xx = Math.floor(x + 1 - r); xx <= x + 1 + r; xx++) {
        const d = Math.hypot(xx + 0.5 - (x + 1), (y - cy) * 1.2, zz + 0.5 - (z + 1));
        if (d < r - rng.next() * 1.2 && w.get(xx, y, zz) === B.AIR) w.put(xx, y, zz, B.LEAVES);
      }
}

function car(w, rng, x, z, alongX, color) {
  const L = 16, Wd = 8;
  const [lx, lz] = alongX ? [L, Wd] : [Wd, L];
  const y = GROUND;
  for (const [ox, oz] of alongX ? [[2, 0], [L - 5, 0], [2, Wd - 1], [L - 5, Wd - 1]] : [[0, 2], [0, L - 5], [Wd - 1, 2], [Wd - 1, L - 5]])
    box(w, x + ox, y, z + oz, x + ox + (alongX ? 3 : 1), y + 3, z + oz + (alongX ? 1 : 3), B.TIRE);
  box(w, x, y + 1, z, x + lx, y + 5, z + lz, color);
  const [cx0, cz0, cx1, cz1] = alongX ? [x + 3, z, x + L - 4, z + Wd] : [x, z + 3, x + Wd, z + L - 4];
  box(w, cx0, y + 5, cz0, cx1, y + 8, cz1, B.GLASS);
  box(w, cx0, y + 8, cz0, cx1, y + 9, cz1, color);
  box(w, cx0 + 1, y + 5, cz0 + 1, cx1 - 1, y + 8, cz1 - 1, B.AIR);
}

function van(w, x, z) {
  // Escape vehicle, parked along x with its open back doors facing -x.
  const L = 22, Wd = 10, y = GROUND;
  for (const [ox, oz] of [[3, -1], [L - 6, -1], [3, Wd], [L - 6, Wd]]) box(w, x + ox, y, z + oz, x + ox + 4, y + 4, z + oz + 1, B.TIRE);
  box(w, x, y + 1, z, x + L, y + 12, z + Wd, B.VANRED);
  box(w, x + 1, y + 2, z + 1, x + L - 7, y + 11, z + Wd - 1, B.AIR);
  box(w, x, y + 2, z + 1, x + 1, y + 11, z + Wd - 1, B.AIR); // open back
  box(w, x + L - 1, y + 6, z + 1, x + L, y + 10, z + Wd - 1, B.GLASS);
  box(w, x + L - 6, y + 6, z, x + L - 2, y + 10, z + 1, B.GLASS);
  box(w, x + L - 6, y + 6, z + Wd - 1, x + L - 2, y + 10, z + Wd, B.GLASS);
}

function fence(w, x0, z0, x1, z1, gap0, gap1) {
  const alongX = z0 === z1;
  const n = alongX ? x1 - x0 : z1 - z0;
  for (let i = 0; i < n; i++) {
    const x = alongX ? x0 + i : x0, z = alongX ? z0 : z0 + i;
    const a = alongX ? x : z;
    if (a >= gap0 && a < gap1) continue; // gate
    if (w.get(x, GROUND, z) !== B.AIR) continue;
    w.put(x, GROUND + 3, z, B.TRIM);
    if (i % 3 === 0) box(w, x, GROUND, z, x + 1, GROUND + 5, z + 1, B.TRIM);
  }
}

export function generateLevel(seed = 1) {
  const rng = makeRng(seed);
  const w = new World(SIZE_X, SIZE_Y, SIZE_Z);
  // Ground: bedrock, dirt, grass.
  box(w, 0, 0, 0, w.sx, 1, w.sz, B.BEDROCK);
  box(w, 0, 1, 0, w.sx, GROUND - 1, w.sz, B.DIRT);
  box(w, 0, GROUND - 1, 0, w.sx, GROUND, w.sz, B.GRASS);
  // Main street along x, sidewalks, a side street along z.
  const road0 = 116, road1 = 140;
  box(w, 0, GROUND - 1, road0, w.sx, GROUND, road1, B.ASPHALT);
  box(w, 0, GROUND - 1, road0 - 6, w.sx, GROUND, road0, B.PAVING);
  box(w, 0, GROUND - 1, road1, w.sx, GROUND, road1 + 6, B.PAVING);
  for (let x = 0; x < w.sx; x += 12) box(w, x, GROUND - 1, 127, x + 6, GROUND, 129, B.LINE);
  box(w, 160, GROUND - 1, 0, 172, GROUND, road0 - 6, B.ASPHALT);

  const targets = [];
  const plots = [];
  plots.push(townhouse(w, rng, 60, 152, targets));
  plots.push(office(w, rng, 102, 64, targets));
  plots.push(bank(w, rng, 178, 158, targets));
  plots.push(barn(w, rng, 40, 50, targets));
  plots.push(waterTower(w, rng, 196, 46, targets));
  fence(w, 56, 148, 98, 148, 78, 90); // gate in front of the townhouse door (x 82..86)
  fence(w, 36, 98, 72, 98, 46, 62); // gate in front of the barn doors (x 48..60)

  van(w, 226, 142 - 10 - 2);
  car(w, rng, 120, 141, true, B.VANRED);
  car(w, rng, 30, 105, true, B.METAL);
  car(w, rng, 150, 106, true, B.VAULT);

  // Trees on free grass, away from plots and roads.
  const occupied = (x, z, pad) =>
    plots.some((p) => x > p.x0 - pad && x < p.x1 + pad && z > p.z0 - pad && z < p.z1 + pad) ||
    (z > road0 - 14 && z < road1 + 14) || (x > 152 && x < 180 && z < road0) ||
    (x < 40 && z > 110 && z < 150) || (x > 210 && z > 110 && z < 160);
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < 22; tries++) {
    const x = rng.int(6, w.sx - 8), z = rng.int(6, w.sz - 8);
    if (occupied(x, z, 8)) continue;
    tree(w, rng, x, z);
    plots.push({ x0: x - 4, z0: z - 4, x1: x + 6, z1: z + 6 });
    placed++;
  }
  // Crates scattered on the street side.
  for (let i = 0; i < 8; i++) {
    const x = rng.int(20, 230), z = rng.chance(0.5) ? rng.int(road0 - 6, road0 - 3) : rng.int(road1 + 1, road1 + 4);
    if (w.get(x, GROUND, z) === B.AIR && w.get(x + 2, GROUND, z + 2) === B.AIR) box(w, x, GROUND, z, x + 3, GROUND + 3, z + 3, B.CRATE);
  }

  return {
    world: w,
    seed,
    name: 'Harrow Street',
    spawn: { pos: [m(12), surface(GROUND), m(128)], yaw: -Math.PI / 2 },
    targets,
    escape: { pos: [m(222), surface(GROUND), m(135)], radius: 2.6 },
    alarmTime: 60,
    loadout: { hammer: Infinity, shotgun: 16, bomb: 5, rocket: 3, cutter: 20, extinguisher: 30 },
  };
}
