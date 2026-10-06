// Off-main-thread chunk mesher. Receives a chunk padded by one voxel on every
// side (so faces and AO at the border are correct) and returns typed arrays,
// transferred rather than copied.
import { meshVoxels } from './mesher.js';

const P = 18; // 16 + 2 padding

self.onmessage = (e) => {
  const { key, version, vox, heat, ox, oy, oz } = e.data;
  const get = (x, y, z) => vox[x + 1 + P * (z + 1 + P * (y + 1))];
  const heatOf = heat ? (x, y, z) => heat[x + 16 * (z + 16 * y)] : null;
  const { opaque, glass } = meshVoxels(get, 0, 0, 0, 16, 16, 16, ox, oy, oz, heatOf);
  const transfer = [];
  for (const b of [opaque, glass]) transfer.push(b.pos.buffer, b.nor.buffer, b.col.buffer, b.surf.buffer, b.idx.buffer);
  self.postMessage({ key, version, opaque, glass }, transfer);
};
