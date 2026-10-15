import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, makeBall, strike, simulate, step, rack, canPlace, castAim, HEAD_SPOT, HX, HZ } from '../pool/js/physics.js';
import { newGame, judge, legalTargets, onTableSet } from '../pool/js/rules.js';
import { planShot, potCandidates, seeded } from '../pool/js/ai.js';

const lineUp = (b) => {
  const cue = makeBall(0, -0.5, 0);
  const obj = makeBall(1, 0, 0);
  strike(cue, { angle: 0, speed: 2, b });
  simulate([cue, obj]);
  return { cue, obj };
};

test('a struck ball slides, rolls and stops', () => {
  const b = makeBall(0, -1, 0);
  strike(b, { angle: 0, speed: 1 });
  const { time } = simulate([b]);
  assert.ok(b.x > -0.6 && b.x < HX - R, `stopped at ${b.x}`);
  assert.ok(time > 2 && time < 10, `took ${time}s`);
  assert.equal(b.vx, 0);
});

test('draw comes back, follow goes through, centre ball stops short of both', () => {
  const draw = lineUp(-0.4).cue.x;
  const centre = lineUp(0).cue.x;
  const follow = lineUp(0.4).cue.x;
  assert.ok(draw < -0.1, `draw ended at ${draw}`);
  assert.ok(follow > centre && centre > draw, `${draw} < ${centre} < ${follow}`);
});

test('a head-on hit passes the speed to the object ball', () => {
  const cue = makeBall(0, -0.2, 0);
  const obj = makeBall(1, 0, 0);
  strike(cue, { angle: 0, speed: 1.5, b: 0 });
  // Contact comes almost at once, while the cue ball is still sliding: a stun shot.
  const events = [];
  for (let i = 0; i < 2000 && !events.length; i++) step([cue, obj], 1 / 2000, events);
  const arrival = events[0].speed; // slower than 1.5: friction acts while it slides there
  assert.ok(obj.vx > 0.95 * arrival, `object ball got ${obj.vx} of ${arrival}`);
  assert.ok(Math.abs(cue.vx) < 0.15, `cue ball kept ${cue.vx}`);
});

test('a ball sent at a corner pocket drops; one sent at a cushion bounces back', () => {
  const potted = makeBall(3, HX - 0.4, HZ - 0.4);
  strike(potted, { angle: Math.PI / 4, speed: 1.5, b: 0.4 });
  simulate([potted]);
  assert.equal(potted.on, false);

  const bounced = makeBall(4, -0.3, 0.2);
  strike(bounced, { angle: Math.PI / 2, speed: 1, b: 0.4 });
  const { events } = simulate([bounced]);
  assert.ok(events.some((e) => e.type === 'rail'));
  assert.ok(bounced.on && bounced.z < HZ - R);
});

test('the rack holds all 15 balls without overlaps, 8 in the middle', () => {
  const balls = rack(seeded(5));
  assert.equal(balls.length, 16);
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      assert.ok(Math.hypot(balls[i].x - balls[j].x, balls[i].z - balls[j].z) >= 2 * R - 1e-6);
    }
  }
  const eight = balls.find((b) => b.id === 8);
  const apex = balls.find((b) => b.id === 1);
  assert.ok(eight.x > apex.x && Math.abs(eight.z) < 1e-3);
});

test('cue ball placement respects the kitchen and other balls', () => {
  const balls = rack(seeded(2)).filter((b) => b.id !== 0);
  assert.ok(canPlace(balls, HEAD_SPOT.x, 0, { kitchen: true }));
  assert.equal(canPlace(balls, 0.2, 0, { kitchen: true }), false);
  const apex = balls.find((b) => b.id === 1);
  assert.equal(canPlace(balls, apex.x - R, apex.z), false);
});

test('aim cast finds the ghost ball', () => {
  const cue = makeBall(0, -0.5, 0);
  const obj = makeBall(5, 0, 0);
  const hit = castAim([cue, obj], cue, 0);
  assert.equal(hit.kind, 'ball');
  assert.ok(Math.abs(hit.x - (-2 * R)) < 1e-6);
});

const ev = (...list) => list;

test('rules: scratch is a foul with ball in hand anywhere', () => {
  const game = { ...newGame(0), breakShot: false, ballInHand: null };
  const before = new Set([0, 1, 2, 8, 9, 10]);
  const { game: next, result } = judge(game, before, ev({ type: 'ball', a: 0, b: 1 }, { type: 'pocket', ball: 0 }));
  assert.equal(result.foul, 'Scratch');
  assert.equal(next.turn, 1);
  assert.equal(next.ballInHand, 'anywhere');
});

test('rules: first legal pot after the break claims the group and keeps the turn', () => {
  const game = { ...newGame(0), breakShot: false, ballInHand: null };
  const before = new Set([0, 3, 8, 11]);
  const { game: next, result } = judge(game, before, ev({ type: 'ball', a: 0, b: 11 }, { type: 'pocket', ball: 11 }));
  assert.equal(result.foul, null);
  assert.deepEqual(next.groups, ['stripes', 'solids']);
  assert.equal(next.turn, 0);
});

test('rules: hitting the 8 first on an open table is a foul', () => {
  const game = { ...newGame(0), breakShot: false, ballInHand: null };
  const { result } = judge(game, new Set([0, 3, 8, 11]), ev({ type: 'ball', a: 0, b: 8 }, { type: 'rail', ball: 8 }));
  assert.equal(result.foul, 'Wrong ball hit first');
});

test('rules: no rail after contact is a foul', () => {
  const game = { ...newGame(0), breakShot: false, ballInHand: null, groups: ['solids', 'stripes'] };
  const { result } = judge(game, new Set([0, 3, 8, 11]), ev({ type: 'ball', a: 0, b: 3 }));
  assert.equal(result.foul, 'No rail after contact');
});

test('rules: the 8 wins only after clearing your group, and loses otherwise', () => {
  const groups = ['solids', 'stripes'];
  const base = { ...newGame(0), breakShot: false, ballInHand: null, groups };
  const win = judge(base, new Set([0, 8, 11]), ev({ type: 'ball', a: 0, b: 8 }, { type: 'pocket', ball: 8 }));
  assert.equal(win.game.winner, 0);
  const early = judge(base, new Set([0, 2, 8, 11]), ev({ type: 'ball', a: 0, b: 2 }, { type: 'ball', a: 2, b: 8 }, { type: 'pocket', ball: 8 }));
  assert.equal(early.game.winner, 1);
  const scratchOn8 = judge(base, new Set([0, 8, 11]), ev({ type: 'ball', a: 0, b: 8 }, { type: 'pocket', ball: 8 }, { type: 'pocket', ball: 0 }));
  assert.equal(scratchOn8.game.winner, 1);
});

test('rules: legal targets follow the group and finish on the 8', () => {
  const g = { ...newGame(0), breakShot: false, groups: ['solids', 'stripes'] };
  assert.deepEqual(legalTargets(g, new Set([0, 2, 8, 12])), [2]);
  assert.deepEqual(legalTargets(g, new Set([0, 8, 12])), [8]);
});

test('AI finds and makes a straight-in pot', () => {
  const balls = [makeBall(0, 0.3, 0.2), makeBall(3, 0.8, 0.4)];
  const game = { ...newGame(1), breakShot: false, ballInHand: null, groups: ['stripes', 'solids'] };
  assert.ok(potCandidates(balls, game).length > 0);
  const shot = planShot(balls, game, 'pro', 7);
  const sim = balls.map((b) => ({ ...b }));
  strike(sim[0], shot);
  const { events } = simulate(sim);
  const { result } = judge(game, onTableSet(balls), events);
  assert.deepEqual(result.pocketed, [3]);
  assert.equal(result.foul, null);
});

const DEG = Math.PI / 180;

test('a jump shot clears a blocking ball and hits the one behind it', () => {
  const run = (elevation) => {
    const cue = makeBall(0, -0.6, 0);
    const blocker = makeBall(5, -0.25, 0);
    const target = makeBall(1, 0.35, 0);
    strike(cue, { angle: 0, speed: 4, elevation });
    const events = [];
    for (let i = 0; i < 4000 && !events.some((e) => e.type === 'ball'); i++) step([cue, blocker, target], 1 / 1000, events);
    const hit = events.find((e) => e.type === 'ball');
    return hit.a === 0 ? hit.b : hit.a;
  };
  assert.equal(run(0), 5, 'a level cue hits the blocker');
  assert.equal(run(45 * DEG), 1, 'a 45 degree jump clears it');
});

test('a masse curves towards the side the cue strikes, and a level cue barely bends', () => {
  const endZ = (a, elevation) => {
    const cue = makeBall(0, -0.8, 0);
    strike(cue, { angle: 0, speed: 1.6, a, elevation });
    for (let i = 0; i < 1500; i++) step([cue], 1 / 1000);
    return cue.z;
  };
  assert.ok(Math.abs(endZ(0.4, 0)) < 0.03, 'level english hardly bends the path');
  const right = endZ(0.4, 72 * DEG), left = endZ(-0.4, 72 * DEG);
  assert.ok(right > 0.15 && left < -0.15, `masse bends ${right} / ${left}`);
  assert.ok(Math.abs(right + left) < 1e-6, 'and symmetrically');
});

test('a ball that jumps the rail is a foul and is spotted', () => {
  const cue = makeBall(0, 0.9, 0);
  const obj = makeBall(3, 1.05, 0);
  strike(cue, { angle: 0, speed: 8.5, elevation: 50 * DEG });
  const { events } = simulate([cue, obj]);
  const off = events.filter((e) => e.type === 'offtable').map((e) => e.ball);
  assert.ok(off.length > 0, 'something left the table');
  const game = { ...newGame(0), breakShot: false, ballInHand: null, groups: ['solids', 'stripes'] };
  const { result } = judge(game, new Set([0, 3, 8, 11]), events);
  assert.ok(result.foul && /off the table/.test(result.foul), result.foul);
  if (off.includes(3)) assert.deepEqual(result.respot, [3]);
});
