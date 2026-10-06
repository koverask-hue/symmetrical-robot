import { B, VOXEL } from './materials.js';

/**
 * Voxel traversal (Amanatides & Woo). Origin/dir in metres; dir need not be
 * normalised. Returns the first solid voxel within maxDist metres or null.
 * `ignore(id)` may skip voxel types (e.g. let bullets pass glass shards).
 */
export function raycast(world, ox, oy, oz, dx, dy, dz, maxDist, ignore = null) {
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) return null;
  dx /= len; dy /= len; dz /= len;
  const px = ox / VOXEL, py = oy / VOXEL, pz = oz / VOXEL;
  let x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const tDeltaX = stepX ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = stepZ ? Math.abs(1 / dz) : Infinity;
  let tMaxX = stepX > 0 ? (x + 1 - px) * tDeltaX : stepX < 0 ? (px - x) * tDeltaX : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - py) * tDeltaY : stepY < 0 ? (py - y) * tDeltaY : Infinity;
  let tMaxZ = stepZ > 0 ? (z + 1 - pz) * tDeltaZ : stepZ < 0 ? (pz - z) * tDeltaZ : Infinity;
  const maxT = maxDist / VOXEL;
  let t = 0;
  let nx = 0, ny = 0, nz = 0;
  // Starting inside a solid voxel counts as an immediate hit.
  for (let guard = 0; guard < 4096; guard++) {
    const id = world.get(x, y, z);
    if (id !== B.AIR && !(ignore && ignore(id))) {
      return {
        x, y, z, id, nx, ny, nz,
        dist: t * VOXEL,
        point: [ox + dx * t * VOXEL, oy + dy * t * VOXEL, oz + dz * t * VOXEL],
      };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      t = tMaxX; tMaxX += tDeltaX; x += stepX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      t = tMaxY; tMaxY += tDeltaY; y += stepY; nx = 0; ny = -stepY; nz = 0;
    } else {
      t = tMaxZ; tMaxZ += tDeltaZ; z += stepZ; nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxT) return null;
    // Left the world sideways or upward: nothing more to hit. (Below is bedrock.)
    if (y >= world.sy && stepY >= 0) return null;
    if ((x < 0 && stepX <= 0) || (z < 0 && stepZ <= 0) || (x >= world.sx && stepX >= 0) || (z >= world.sz && stepZ >= 0)) return null;
  }
  return null;
}
