import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { B, VOXEL } from '../src/materials.js';
import { raycast } from '../src/raycast.js';

function flat() {
  const w = new World(32, 32, 32);
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) w.put(x, 0, z, B.BEDROCK);
  return w;
}

test('get treats below-world as bedrock and outside as air', () => {
  const w = flat();
  assert.equal(w.get(0, -1, 0), B.BEDROCK);
  assert.equal(w.get(-1, 5, 0), B.AIR);
  assert.equal(w.get(0, 99, 0), B.AIR);
});

test('index and coords round-trip', () => {
  const w = flat();
  for (const [x, y, z] of [[0, 0, 0], [31, 31, 31], [5, 17, 9]]) assert.deepEqual(w.coords(w.index(x, y, z)), [x, y, z]);
});

test('material swaps do not produce physics edits, solid/air changes do', () => {
  const w = flat();
  w.set(3, 3, 3, B.PLANK);
  assert.equal(w.edits.length, 1);
  w.set(3, 3, 3, B.CHAR);
  assert.equal(w.edits.length, 1);
  w.set(3, 3, 3, B.AIR);
  assert.equal(w.edits.length, 2);
});

test('set marks the owning chunk and neighbours dirty and records an edit', () => {
  const w = flat();
  w.dirty.clear();
  w.set(16, 16, 16, B.BRICK);
  assert.equal(w.edits.length, 1);
  // Voxel 16 sits on the boundary of chunks 0 and 1 on every axis -> 8 chunks.
  assert.equal(w.dirty.size, 8);
});

test('raycast hits the first solid voxel with the entry face normal', () => {
  const w = flat();
  w.put(10, 1, 4, B.BRICK);
  const h = raycast(w, 0.1, 0.3, 1.1, 1, 0, 0, 10);
  assert.ok(h);
  assert.deepEqual([h.x, h.y, h.z], [10, 1, 4]);
  assert.deepEqual([h.nx, h.ny, h.nz], [-1, 0, 0]);
  assert.ok(Math.abs(h.dist - (10 * VOXEL - 0.1)) < 1e-9);
});

test('raycast straight down hits bedrock, and misses past maxDist', () => {
  const w = flat();
  const h = raycast(w, 1.1, 5, 1.1, 0, -1, 0, 20);
  assert.equal(h.y, 0);
  assert.equal(h.ny, 1);
  assert.equal(raycast(w, 1.1, 5, 1.1, 0, -1, 0, 1), null);
  assert.equal(raycast(w, 1.1, 5, 1.1, 0, 1, 0, 100), null);
});

test('a pillar stays put; cutting its base detaches what is above', () => {
  const w = flat();
  for (let y = 1; y < 12; y++) w.put(5, y, 5, B.CONCRETE);
  // Overhang on top.
  for (let x = 6; x < 10; x++) w.put(x, 11, 5, B.CONCRETE);
  assert.equal(w.findUnsupported([w.index(5, 6, 5)]).length, 0);
  const { removed, seeds } = w.removeVoxels([{ x: 5, y: 3, z: 5 }]);
  assert.equal(removed.length, 1);
  const comps = w.findUnsupported(seeds);
  assert.equal(comps.length, 1);
  assert.equal(comps[0].length, 8 + 4); // y 4..11 of the pillar + overhang
});

test('two floating pieces are reported separately, grounded part is not', () => {
  const w = flat();
  for (let y = 1; y < 10; y++) w.put(3, y, 3, B.BRICK);
  const { seeds } = w.removeVoxels([{ x: 3, y: 3, z: 3 }, { x: 3, y: 6, z: 3 }]);
  const comps = w.findUnsupported(seeds).map((c) => c.length).sort();
  assert.deepEqual(comps, [2, 3]); // y4..5 and y7..9; y1..2 grounded
});

test('bedrock is indestructible and anchors', () => {
  const w = flat();
  w.put(4, 1, 4, B.WBRICK);
  const { removed } = w.carveSphere(4 * VOXEL, 0.5 * VOXEL, 4 * VOXEL, [5, 5, 5]);
  assert.ok(removed.every((v) => v.id !== B.BEDROCK));
  assert.equal(w.get(4, 0, 4), B.BEDROCK);
});

test('carveSphere respects per-tier radii', () => {
  const w = flat();
  for (let x = 1; x < 30; x++) {
    w.put(x, 5, 10, B.METAL);
    w.put(x, 5, 12, B.GLASS);
  }
  w.carveSphere(15 * VOXEL, 5.5 * VOXEL, 11 * VOXEL, [2, 1, 0], () => 0);
  assert.equal(w.get(15, 5, 10), B.METAL);
  assert.equal(w.get(15, 5, 12), B.AIR);
});

test('flood fill is bounded by maxVisit (large regions assumed supported)', () => {
  const w = new World(32, 32, 32);
  for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) w.put(x, 10, z, B.CONCRETE);
  assert.equal(w.findUnsupported([w.index(0, 10, 0)], 100).length, 0);
  assert.equal(w.findUnsupported([w.index(0, 10, 0)]).length, 1);
});
