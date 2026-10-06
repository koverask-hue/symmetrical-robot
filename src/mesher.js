import { B, BLOCKS, VOXEL } from './materials.js';
import { hash3 } from './rng.js';

// Growable typed buffers so meshing a chunk does not churn the GC.
class Buf {
  constructor(n = 4096) {
    this.pos = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.surf = new Float32Array(n * 3); // roughness, metalness, heat timestamp
    this.idx = new Uint32Array(n * 1.5);
    this.v = 0;
    this.i = 0;
  }
  reset() {
    this.v = 0;
    this.i = 0;
  }
  ensure(nv) {
    if ((this.v + nv) * 3 > this.pos.length) {
      const grow = (a, n) => {
        const b = new a.constructor(n);
        b.set(a);
        return b;
      };
      const cap = Math.max(this.pos.length * 2, (this.v + nv) * 3);
      this.pos = grow(this.pos, cap);
      this.nor = grow(this.nor, cap);
      this.col = grow(this.col, cap);
      this.surf = grow(this.surf, cap);
      this.idx = grow(this.idx, cap / 2);
    }
  }
  // Exact-size copies for handing to a BufferGeometry.
  take() {
    return {
      pos: this.pos.slice(0, this.v * 3),
      nor: this.nor.slice(0, this.v * 3),
      col: this.col.slice(0, this.v * 3),
      surf: this.surf.slice(0, this.v * 3),
      idx: this.idx.slice(0, this.i),
    };
  }
}

const AO = [0.42, 0.62, 0.8, 1.0];

// For each of 6 directions: normal, and the two tangent axes.
const FACES = [];
for (let a = 0; a < 3; a++) {
  for (const s of [1, -1]) {
    const n = [0, 0, 0];
    n[a] = s;
    FACES.push({ n, a, u: (a + 1) % 3, v: (a + 2) % 3, s });
  }
}

function shade(id, x, y, z) {
  const b = BLOCKS[id];
  let f = 1 + (hash3(x, y, z) - 0.5) * 2 * b.noise;
  switch (b.pattern) {
    case 'brick': {
      const brick = Math.floor((x + z + (y & 1)) / 2);
      f *= 0.92 + hash3(brick, y, 7) * 0.16;
      break;
    }
    case 'plank':
      f *= 0.9 + hash3(y, (x + z) >> 3, 3) * 0.2;
      break;
    case 'tile':
      f *= ((x >> 1) + (z >> 1)) & 1 ? 0.94 : 1.04;
      break;
  }
  return f;
}

const opaqueBuf = new Buf(1 << 15);
const glassBuf = new Buf(1 << 12);

export const COLD = -1e5; // heat timestamp meaning "never heated"

/**
 * Mesh the voxels in [x0, x0+nx) x [y0, y0+ny) x [z0, z0+nz) read through
 * `get(x,y,z)`. Positions are emitted as (voxel + offset) * VOXEL metres.
 * `heatOf(x,y,z)` (optional) returns when a voxel was heated, for glowing cuts.
 * Returns { opaque, glass } buffer sets (either may be empty).
 */
export function meshVoxels(get, x0, y0, z0, nx, ny, nz, ox = 0, oy = 0, oz = 0, heatOf = null) {
  const ob = opaqueBuf, gb = glassBuf;
  ob.reset();
  gb.reset();
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  for (let y = y0; y < y0 + ny; y++)
    for (let z = z0; z < z0 + nz; z++)
      for (let x = x0; x < x0 + nx; x++) {
        const id = get(x, y, z);
        if (id === B.AIR) continue;
        const blk = BLOCKS[id];
        const glass = blk.transparent;
        let base = null;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nb = get(x + F.n[0], y + F.n[1], z + F.n[2]);
          if (nb !== B.AIR) {
            const nbT = BLOCKS[nb].transparent;
            // Opaque behind opaque, or glass behind any glass: hidden.
            if (!nbT || glass) continue;
          }
          if (!base) {
            const s = shade(id, x, y, z);
            base = [blk.color[0] * s, blk.color[1] * s, blk.color[2] * s];
          }
          const heat = heatOf ? heatOf(x, y, z) : COLD;
          const buf = glass ? gb : ob;
          buf.ensure(4);
          const vi = buf.v;
          p[0] = x; p[1] = y; p[2] = z;
          // The face plane sits on the far side of the voxel for +normals.
          const plane = (F.a === 0 ? x : F.a === 1 ? y : z) + (F.s > 0 ? 1 : 0);
          const ao = [1, 1, 1, 1];
          const corners = F.s > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
          for (let c = 0; c < 4; c++) {
            const cu = corners[c][0], cv = corners[c][1];
            if (!glass) {
              // Occlusion from the three voxels around this corner in the layer outside the face.
              q[0] = x + F.n[0]; q[1] = y + F.n[1]; q[2] = z + F.n[2];
              const du = cu ? 1 : -1, dv = cv ? 1 : -1;
              q[F.u] += du;
              const s1 = solidOpaque(get(q[0], q[1], q[2]));
              q[F.v] += dv;
              const cr = solidOpaque(get(q[0], q[1], q[2]));
              q[F.u] -= du;
              const s2 = solidOpaque(get(q[0], q[1], q[2]));
              ao[c] = AO[s1 && s2 ? 0 : 3 - (s1 + s2 + cr)];
            }
            const vx = [0, 0, 0];
            vx[F.a] = plane;
            vx[F.u] = p[F.u] + cu;
            vx[F.v] = p[F.v] + cv;
            const o = (vi + c) * 3;
            buf.pos[o] = (vx[0] + ox) * VOXEL;
            buf.pos[o + 1] = (vx[1] + oy) * VOXEL;
            buf.pos[o + 2] = (vx[2] + oz) * VOXEL;
            buf.nor[o] = F.n[0];
            buf.nor[o + 1] = F.n[1];
            buf.nor[o + 2] = F.n[2];
            buf.col[o] = base[0] * ao[c];
            buf.col[o + 1] = base[1] * ao[c];
            buf.col[o + 2] = base[2] * ao[c];
            buf.surf[o] = blk.rough;
            buf.surf[o + 1] = blk.metal;
            buf.surf[o + 2] = heat;
          }
          // Flip the quad diagonal towards the brighter pair to avoid AO streaks.
          const ii = buf.i;
          if (ao[0] + ao[2] >= ao[1] + ao[3]) {
            buf.idx[ii] = vi; buf.idx[ii + 1] = vi + 1; buf.idx[ii + 2] = vi + 2;
            buf.idx[ii + 3] = vi; buf.idx[ii + 4] = vi + 2; buf.idx[ii + 5] = vi + 3;
          } else {
            buf.idx[ii] = vi + 1; buf.idx[ii + 1] = vi + 2; buf.idx[ii + 2] = vi + 3;
            buf.idx[ii + 3] = vi + 1; buf.idx[ii + 4] = vi + 3; buf.idx[ii + 5] = vi;
          }
          buf.v += 4;
          buf.i += 6;
        }
      }
  return { opaque: ob.take(), glass: gb.take() };
}

function solidOpaque(id) {
  return id !== B.AIR && !BLOCKS[id].transparent ? 1 : 0;
}
