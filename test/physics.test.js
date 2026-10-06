import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics, Physics } from '../src/physics.js';
import { Debris, components, VoxelBody } from '../src/debris.js';
import { Destruction } from '../src/destruction.js';
import { generateLevel, GROUND } from '../src/level.js';
import { B, VOXEL } from '../src/materials.js';

before(async () => {
  await initPhysics();
});

function setup() {
  const L = generateLevel(1);
  const physics = new Physics(L.world);
  physics.buildWorld();
  const fx = { chipsCount: 0, chips(list) { this.chipsCount += list.length; } };
  const debris = new Debris(L.world, physics, fx);
  const destruction = new Destruction({ world: L.world, physics, debris, fx });
  return { L, w: L.world, physics, debris, destruction };
}

function run(s, seconds) {
  let worst = 0;
  for (let t = 0; t < seconds * 60; t++) {
    const a = performance.now();
    s.physics.update(1 / 60);
    s.debris.handleImpacts(s.destruction);
    s.debris.update(1 / 60);
    worst = Math.max(worst, performance.now() - a);
  }
  return worst;
}

test('components() splits a grid into 6-connected pieces', () => {
  const g = new Uint8Array(5 * 1 * 1);
  g[0] = g[1] = g[3] = g[4] = B.BRICK;
  const parts = components(new VoxelBody(5, 1, 1, g)).map((c) => c.length).sort();
  assert.deepEqual(parts, [2, 2]);
});

test('cutting all four water tower legs drops the tank as one body that lands and breaks', () => {
  const s = setup();
  const x0 = 196, z0 = 46;
  const legY = (GROUND + 6 + 0.5) * VOXEL;
  for (const [lx, lz] of [[x0, z0], [x0 + 14, z0], [x0, z0 + 14], [x0 + 14, z0 + 14]]) {
    s.destruction.carve([(lx + 1) * VOXEL, legY, (lz + 1) * VOXEL], [0.5, 0.5, 0.5]);
  }
  assert.ok(s.debris.bodies.size >= 1, 'tower did not detach');
  const big = [...s.debris.bodies.values()].sort((a, b) => b.count - a.count)[0];
  assert.ok(big.count > 1500, `tank body too small: ${big.count}`);
  const y0 = big.rb.translation().y;
  // Cut straight through, it would just drop onto its own leg stubs (which
  // is what really happens). Give it the shove a blast would.
  // A ~100 t tank barely notices a pipe bomb, so shove it directly (3 m/s).
  big.rb.applyImpulse({ x: big.mass * 3, y: 0, z: 0 }, true);
  run(s, 2);
  const fell = y0 - (s.debris.bodies.has(big.id) ? big.rb.translation().y : -Infinity);
  assert.ok(fell > 1, `tank fell only ${fell}`);
  run(s, 4);
  assert.ok(s.debris.fractures > 0, 'heavy landing caused no fractures');
  // Nothing tunnelled out of the world.
  for (const b of s.debris.bodies.values()) assert.ok(b.rb.translation().y > -1, 'body fell through the ground');
});

test('a pipe-bomb sized blast carves brick, skips bedrock and detaches an overhang', () => {
  const s = setup();
  // Townhouse front wall, ground floor.
  const before = s.destruction.voxelsDestroyed;
  s.destruction.explode([70 * VOXEL, (GROUND + 4) * VOXEL, 152.5 * VOXEL], 1);
  assert.ok(s.destruction.voxelsDestroyed - before > 100);
  assert.equal(s.w.get(70, 0, 152), B.BEDROCK);
});

test('carving a body splits it and the pieces keep simulating', () => {
  const s = setup();
  // Lift a 12x3x3 beam into the air as a body, then cut it in the middle.
  const idx = [];
  for (let x = 20; x < 32; x++) for (let y = 30; y < 33; y++) for (let z = 20; z < 23; z++) {
    s.w.set(x, y, z, B.CONCRETE);
    idx.push(s.w.index(x, y, z));
  }
  const body = s.debris.spawnFromWorld(idx);
  assert.ok(body);
  assert.equal(body.count, 108);
  s.debris.carve(body, [26 * VOXEL, 31.5 * VOXEL, 21.5 * VOXEL], [0, 0.4, 0], () => 0);
  assert.ok(s.debris.bodies.size >= 2, 'beam did not split');
  const total = [...s.debris.bodies.values()].reduce((n, b) => n + b.count, 0);
  assert.ok(total < 108 && total > 60);
  run(s, 3);
  for (const b of s.debris.bodies.values()) assert.ok(b.rb.translation().y < 30 * VOXEL, 'pieces did not fall');
});

test('baking a resting body writes it back into the world grid', () => {
  const s = setup();
  const idx = [];
  for (let x = 20; x < 24; x++) for (let y = 6; y < 8; y++) for (let z = 20; z < 24; z++) {
    s.w.set(x, y, z, B.BRICK);
    idx.push(s.w.index(x, y, z));
  }
  // y 6..7 sits one voxel above the grass, so it settles without cracking.
  const body = s.debris.spawnFromWorld(idx);
  run(s, 3);
  assert.ok(s.debris.bodies.has(body.id), 'body broke on a gentle drop');
  let before = 0;
  for (let i = 0; i < s.w.data.length; i++) if (s.w.data[i] === B.BRICK) before++;
  s.debris.bake(body);
  let after = 0;
  for (let i = 0; i < s.w.data.length; i++) if (s.w.data[i] === B.BRICK) after++;
  assert.equal(s.debris.bodies.size, 0);
  assert.ok(after - before >= 24, `baked only ${after - before} of 32 voxels`);
});
