import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLevel, GROUND } from '../src/level.js';
import { B, BLOCKS, VOXEL } from '../src/materials.js';

const L = generateLevel(1);
const w = L.world;
const vox = (m) => Math.floor(m / VOXEL);

test('generation is deterministic per seed', () => {
  const a = generateLevel(7), b = generateLevel(7), c = generateLevel(8);
  assert.deepEqual(Buffer.from(a.world.data), Buffer.from(b.world.data));
  assert.notDeepEqual(Buffer.from(a.world.data), Buffer.from(c.world.data));
});

test('ground layers are intact and bedrock spans the map', () => {
  for (let z = 0; z < w.sz; z += 17) for (let x = 0; x < w.sx; x += 13) assert.equal(w.get(x, 0, z), B.BEDROCK);
});

function playerFits(px, py, pz) {
  // 0.6 x 1.75 m box with feet at py.
  for (let y = vox(py + 0.01); y <= vox(py + 1.74); y++)
    for (let z = vox(pz - 0.3); z <= vox(pz + 0.29); z++)
      for (let x = vox(px - 0.3); x <= vox(px + 0.29); x++) if (w.get(x, y, z) !== B.AIR) return false;
  return true;
}

test('spawn point is clear and on the ground', () => {
  const [x, y, z] = L.spawn.pos;
  assert.ok(playerFits(x, y, z));
  assert.notEqual(w.get(vox(x), vox(y) - 1, vox(z)), B.AIR);
});

test('every target sits in free space on a solid surface', () => {
  assert.equal(L.targets.filter((t) => t.required).length, 3);
  for (const t of L.targets) {
    const [x, y, z] = t.pos;
    assert.equal(w.get(vox(x), vox(y), vox(z)), B.AIR, `${t.name} embedded`);
    assert.notEqual(w.get(vox(x), vox(y) - 1, vox(z)), B.AIR, `${t.name} floating`);
  }
});

test('escape zone is open ground', () => {
  const [x, y, z] = L.escape.pos;
  assert.ok(playerFits(x, y, z));
});

test('everything except loose foliage is connected to the ground', () => {
  const seeds = [];
  for (let i = 0; i < w.data.length; i++) if (w.data[i] !== B.AIR) seeds.push(i);
  const comps = w.findUnsupported(seeds, 1e9);
  const bad = comps.filter((c) => c.some((i) => w.data[i] !== B.LEAVES));
  assert.equal(bad.length, 0, `floating non-leaf regions: ${bad.map((c) => `${c.length}@${w.coords(c[0])}:${BLOCKS[w.data[c[0]]].name}`).join(', ')}`);
});

// Walk reachability: BFS over player positions (column x,z at foot height y)
// with a 3x3-voxel footprint (0.75 m, covering the 0.6 m capsule). The
// player stands on the highest support under any part of the footprint,
// may step up one voxel (the controller autosteps 0.3 m) and may drop down.
function reachable(from) {
  const clear = (x, y, z) => {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) if (w.get(x + dx, y, z + dz) !== B.AIR) return false;
    return true;
  };
  const clearSpan = (x, y0, y1, z) => {
    for (let y = y0; y <= y1; y++) if (!clear(x, y, z)) return false;
    return true;
  };
  const supported = (x, y, z) => !clear(x, y - 1, z);
  const key = (x, y, z) => x + w.sx * (z + w.sz * y);
  const seen = new Uint8Array(w.sx * w.sy * w.sz);
  const q = [from];
  seen[key(...from)] = 1;
  while (q.length) {
    const [x, y, z] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 1 || nz < 1 || nx >= w.sx - 1 || nz >= w.sz - 1) continue;
      let ny = -1;
      if (clear(x, y + 7, z) && clearSpan(nx, y + 1, y + 7, nz) && supported(nx, y + 1, nz)) ny = y + 1;
      else if (clearSpan(nx, y, y + 6, nz)) {
        ny = y;
        while (ny > 1 && !supported(nx, ny, nz)) ny--;
      }
      if (ny < 1) continue;
      const k = key(nx, ny, nz);
      if (!seen[k]) {
        seen[k] = 1;
        q.push([nx, ny, nz]);
      }
    }
  }
  return (x, y, z) => !!seen[key(x, y, z)];
}

test('required targets in the townhouse and office are reachable on foot; vault is sealed', () => {
  const s = L.spawn.pos;
  const can = reachable([vox(s[0]), vox(s[1]), vox(s[2])]);
  const near = (t) => {
    const [x, y, z] = t.pos.map(vox);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (can(x + dx, y, z + dz)) return true;
    return false;
  };
  const byName = Object.fromEntries(L.targets.map((t) => [t.name, t]));
  assert.ok(near(byName['Ledger']), 'townhouse top floor unreachable');
  assert.ok(near(byName['Server Drive']), 'office top floor unreachable');
  assert.ok(near(byName['Antique Clock']), 'barn loft unreachable');
  assert.ok(!near(byName['Gold Bars']), 'vault should require tools');
  assert.ok(!near(byName['Radio Beacon']), 'water tower top should require tools');
  const e = L.escape.pos.map(vox);
  assert.ok(can(e[0], e[1], e[2]), 'escape zone unreachable');
});
