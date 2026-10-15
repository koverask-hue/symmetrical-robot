// Computer opponent. It finds pottable balls with ghost-ball geometry, tests the best candidates in the
// real physics (spin and pace variations included), scores the outcomes with the real rules, and then
// misses like a person of the chosen level would: by adding aim and pace error.
import { R, HX, HZ, POCKETS, cloneBalls, strike, simulate, canPlace, HEAD_STRING_X, HEAD_SPOT } from './physics.js';
import { judge, legalTargets, onTableSet } from './rules.js';

const DEG = Math.PI / 180;

export const LEVELS = {
  easy: { label: 'Easy', aim: 1.7 * DEG, pace: 0.15, candidates: 3, simulate: false, safety: false, position: false },
  medium: { label: 'Medium', aim: 0.65 * DEG, pace: 0.07, candidates: 6, simulate: true, safety: false, position: false },
  hard: { label: 'Hard', aim: 0.22 * DEG, pace: 0.035, candidates: 10, simulate: true, safety: true, position: true },
  pro: { label: 'Pro', aim: 0.07 * DEG, pace: 0.015, candidates: 14, simulate: true, safety: true, position: true },
};

export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gauss(rnd) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
}

// The point a pottable ball should be sent at for each pocket.
function pocketAim(k) {
  const p = POCKETS[k];
  if (p.corner) return { x: Math.sign(p.x) * (HX - 0.012), z: Math.sign(p.z) * (HZ - 0.012) };
  return { x: 0, z: Math.sign(p.z) * (HZ + 0.01) };
}

function segmentClear(balls, ax, az, bx, bz, ignore, width = 2 * R) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1e-9;
  for (const b of balls) {
    if (!b.on || ignore.includes(b.id)) continue;
    let t = ((b.x - ax) * dx + (b.z - az) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ox = b.x - (ax + dx * t), oz = b.z - (az + dz * t);
    if (ox * ox + oz * oz < (width - 1e-4) ** 2) return false;
  }
  return true;
}

// Every direct pot available to the player whose turn it is, easiest first.
export function potCandidates(balls, game) {
  const cue = balls[0];
  if (!cue.on) return [];
  const onTable = onTableSet(balls);
  const targets = legalTargets(game, onTable);
  const out = [];
  for (const id of targets) {
    const t = balls.find((b) => b.id === id);
    if (!t?.on) continue;
    for (let k = 0; k < POCKETS.length; k++) {
      const aim = pocketAim(k);
      let ux = aim.x - t.x, uz = aim.z - t.z;
      const dTP = Math.hypot(ux, uz);
      ux /= dTP;
      uz /= dTP;
      if (!POCKETS[k].corner && Math.abs(uz) < 0.55) continue; // too thin an entry for a side pocket
      if (!segmentClear(balls, t.x, t.z, aim.x, aim.z, [0, id])) continue;
      const gx = t.x - ux * 2 * R, gz = t.z - uz * 2 * R;
      if (Math.abs(gx) > HX - R || Math.abs(gz) > HZ - R) continue;
      let wx = gx - cue.x, wz = gz - cue.z;
      const dCG = Math.hypot(wx, wz);
      if (dCG < 1e-3) continue;
      wx /= dCG;
      wz /= dCG;
      const cos = wx * ux + wz * uz;
      if (cos < Math.cos(78 * DEG)) continue;
      if (!segmentClear(balls, cue.x, cue.z, gx, gz, [0, id])) continue;
      const needObj = Math.sqrt(2 * 0.16 * dTP) + 0.35;
      const speed = Math.min(6, Math.max(0.6, Math.sqrt((needObj / (0.94 * Math.max(cos, 0.25))) ** 2 + 2 * 0.3 * dCG)));
      out.push({ angle: Math.atan2(wz, wx), speed, a: 0, b: 0, target: id, pocket: k, difficulty: dCG * 0.5 + dTP + (1 - cos) * 3.2 });
    }
  }
  return out.sort((p, q) => p.difficulty - q.difficulty);
}

function evaluate(balls, game, shot, me, level, random) {
  const sim = cloneBalls(balls);
  const before = onTableSet(sim);
  strike(sim[0], shot);
  const { events } = simulate(sim, { dt: 1 / 600, breakShot: game.breakShot, random });
  const { game: next, result } = judge(game, before, events);
  let score;
  if (next.over) score = next.winner === me ? 10000 : -10000;
  else if (result.foul) score = -500;
  else if (next.turn === me) {
    score = 300 + result.pocketed.length * 20;
    if (level.position) {
      const follow = potCandidates(sim, next);
      score += Math.min(3, follow.length) * 40 + (follow[0] ? 60 - follow[0].difficulty * 20 : -80);
    }
  } else {
    score = -100;
    if (level.safety) score -= Math.min(4, potCandidates(sim, next).length) * 35;
  }
  return score;
}

function placeCueBall(balls, game, random) {
  const kitchen = game.ballInHand === 'kitchen';
  const cue = balls[0];
  const others = balls.filter((b) => b.id !== 0);
  if (game.breakShot) {
    for (let i = 0; i < 20; i++) {
      const z = (random() - 0.5) * 0.4;
      if (canPlace(others, HEAD_SPOT.x - 0.05, z, { kitchen })) return { x: HEAD_SPOT.x - 0.05, z };
    }
  }
  // Look for a straight-in shot we can set up from somewhere legal.
  const probe = cloneBalls(balls);
  probe[0].on = false;
  const spots = [];
  for (const id of legalTargets(game, onTableSet(balls))) {
    const t = balls.find((b) => b.id === id);
    for (let k = 0; k < POCKETS.length; k++) {
      const aim = pocketAim(k);
      let ux = aim.x - t.x, uz = aim.z - t.z;
      const d = Math.hypot(ux, uz);
      ux /= d;
      uz /= d;
      if (!POCKETS[k].corner && Math.abs(uz) < 0.6) continue;
      if (!segmentClear(probe, t.x, t.z, aim.x, aim.z, [id])) continue;
      for (const back of [0.2, 0.32, 0.45]) {
        for (const side of [0, 0.08, -0.08]) {
          const x = t.x - ux * (2 * R + back) - uz * side;
          const z = t.z - uz * (2 * R + back) + ux * side;
          if (!canPlace(others, x, z, { kitchen })) continue;
          if (!segmentClear(probe, x, z, t.x - ux * 2 * R, t.z - uz * 2 * R, [id])) continue;
          spots.push({ x, z, score: d + back * 0.5 + Math.abs(side) });
        }
      }
    }
  }
  spots.sort((p, q) => p.score - q.score);
  if (spots.length) return spots[Math.floor(random() * Math.min(2, spots.length))];
  for (let i = 0; i < 200; i++) {
    const x = kitchen ? -HX + R + random() * (HEAD_STRING_X + HX - 2 * R) : (random() * 2 - 1) * (HX - R);
    const z = (random() * 2 - 1) * (HZ - R);
    if (canPlace(others, x, z, { kitchen })) return { x, z };
  }
  return { x: cue.x, z: cue.z };
}

// Plan a shot for game.turn. Returns { angle, speed, a, b, place? }.
export function planShot(inputBalls, game, levelName = 'medium', seed = 1) {
  const level = LEVELS[levelName] ?? LEVELS.medium;
  const random = seeded(seed);
  const balls = cloneBalls(inputBalls);
  const me = game.turn;
  let place = null;
  if (game.ballInHand) {
    place = placeCueBall(balls, game, random);
    balls[0].on = true;
    balls[0].x = place.x;
    balls[0].z = place.z;
    balls[0].vx = balls[0].vz = 0;
  }
  const cue = balls[0];
  let shot;

  if (game.breakShot) {
    const apex = balls.find((b) => b.id === 1) ?? balls[1];
    shot = { angle: Math.atan2(apex.z - cue.z, apex.x - cue.x), speed: 8.2 + random() * 0.6, a: 0, b: -0.1 };
  } else {
    const pots = potCandidates(balls, game).slice(0, level.candidates);
    if (!level.simulate) {
      shot = pots[0] ?? null;
    } else {
      let best = null;
      const variants = level.position
        ? [[1, 0], [1, -0.3], [1, 0.3], [0.8, -0.2], [1.25, 0.2], [1.15, -0.35]]
        : [[1, 0], [1, -0.25], [1, 0.25]];
      for (const c of pots) {
        for (const [pace, spin] of variants) {
          const s = { ...c, speed: Math.min(6.5, c.speed * pace), b: spin };
          const score = evaluate(balls, game, s, me, level, random) - c.difficulty * 15;
          if (!best || score > best.score) best = { ...s, score };
        }
      }
      shot = best && best.score > -50 ? best : null;
      if (level.safety && (!shot || shot.score < 150)) {
        const safe = safetyShot(balls, game, me, level, random);
        if (safe && (!shot || safe.score > shot.score)) shot = safe;
      }
      if (!shot && best) shot = best;
    }
    if (!shot) shot = desperation(balls, game, random);
  }

  // Human error.
  const angle = shot.angle + gauss(random) * level.aim;
  const speed = Math.max(0.3, shot.speed * (1 + gauss(random) * level.pace));
  return { angle, speed, a: shot.a ?? 0, b: shot.b ?? 0, place, target: shot.target ?? null, pocket: shot.pocket ?? null };
}

// Roll a legal ball softly to a cushion and leave the opponent nothing.
function safetyShot(balls, game, me, level, random) {
  const cue = balls[0];
  const targets = legalTargets(game, onTableSet(balls));
  let best = null;
  for (const id of targets) {
    const t = balls.find((b) => b.id === id);
    const base = Math.atan2(t.z - cue.z, t.x - cue.x);
    const halfWidth = Math.asin(Math.min(1, (2 * R) / Math.hypot(t.x - cue.x, t.z - cue.z)));
    for (const off of [-0.7, -0.35, 0, 0.35, 0.7]) {
      for (const speed of [0.9, 1.5, 2.3]) {
        const s = { angle: base + off * halfWidth, speed, a: 0, b: 0 };
        const score = evaluate(balls, game, s, me, level, random);
        if (!best || score > best.score) best = { ...s, score };
      }
    }
  }
  return best;
}

// Nothing makes sense: hit the nearest legal ball firmly and hope.
function desperation(balls, game, random) {
  const cue = balls[0];
  const targets = legalTargets(game, onTableSet(balls)).map((id) => balls.find((b) => b.id === id));
  targets.sort((p, q) => Math.hypot(p.x - cue.x, p.z - cue.z) - Math.hypot(q.x - cue.x, q.z - cue.z));
  const t = targets[0];
  if (!t) return { angle: random() * Math.PI * 2, speed: 2, a: 0, b: 0 };
  return { angle: Math.atan2(t.z - cue.z, t.x - cue.x), speed: 2.6, a: 0, b: 0 };
}
