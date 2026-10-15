// Pool ball physics. Pure and DOM-free so it runs in the page, in the AI worker and in Node tests.
//
// Coordinates match three.js: the bed is the x-z plane, y is up, units are metres. Each ball has a
// centre (x, z), a velocity (vx, vz) and an angular velocity (wx, wy, wz); wy is side spin (english).
// A ball slides until the cloth's friction brings its contact point to rest, then rolls. That is what
// makes stun, draw and follow come out right: spin survives a ball-ball collision, velocity does not.

export const R = 0.028575; // 57.15 mm ball
export const TABLE = { L: 2.54, W: 1.27 }; // 9-foot table playing surface
export const HX = TABLE.L / 2;
export const HZ = TABLE.W / 2;
export const HEAD_STRING_X = -HX / 2; // the kitchen is x < HEAD_STRING_X
export const FOOT_SPOT = { x: HX / 2, z: 0 };
export const HEAD_SPOT = { x: -HX / 2, z: 0 };

const G = 9.81;
export const PHYS = {
  muSlide: 0.2, // cloth sliding friction
  muRoll: 0.011, // rolling resistance
  muSpin: 0.044, // decay of side spin
  eBall: 0.94,
  muBall: 0.055, // ball-ball friction: cut-induced throw and spin transfer
  eRail: 0.78,
  muRail: 0.2,
  eJaw: 0.55,
};
export const MAX_SPEED = 9; // m/s, a hard break

const CORNER_M = 0.082; // cushion nose to corner, along each rail
const SIDE_S = 0.066; // half-width of a side pocket mouth

export const POCKETS = [
  { x: -HX - 0.03, z: -HZ - 0.03, r: 0.066, corner: true },
  { x: HX + 0.03, z: -HZ - 0.03, r: 0.066, corner: true },
  { x: -HX - 0.03, z: HZ + 0.03, r: 0.066, corner: true },
  { x: HX + 0.03, z: HZ + 0.03, r: 0.066, corner: true },
  { x: 0, z: -HZ - 0.05, r: 0.06, corner: false },
  { x: 0, z: HZ + 0.05, r: 0.06, corner: false },
];

// Cushion noses and pocket jaws as line segments. `jaw` segments are deader than cushions.
function buildSegments() {
  const segs = [];
  const add = (ax, az, bx, bz, jaw = false) => segs.push({ ax, az, bx, bz, jaw });
  for (const sz of [-1, 1]) {
    const z = sz * HZ;
    add(-HX + CORNER_M, z, -SIDE_S, z);
    add(SIDE_S, z, HX - CORNER_M, z);
    // side pocket jaws flare slightly outward
    add(-SIDE_S, z, -SIDE_S - 0.008, z + sz * 0.06, true);
    add(SIDE_S, z, SIDE_S + 0.008, z + sz * 0.06, true);
    // corner jaws on the long rails
    add(-HX + CORNER_M, z, -HX + CORNER_M - 0.04, z + sz * 0.06, true);
    add(HX - CORNER_M, z, HX - CORNER_M + 0.04, z + sz * 0.06, true);
  }
  for (const sx of [-1, 1]) {
    const x = sx * HX;
    add(x, -HZ + CORNER_M, x, HZ - CORNER_M);
    add(x, -HZ + CORNER_M, x + sx * 0.06, -HZ + CORNER_M - 0.04, true);
    add(x, HZ - CORNER_M, x + sx * 0.06, HZ - CORNER_M + 0.04, true);
  }
  for (const s of segs) {
    s.dx = s.bx - s.ax;
    s.dz = s.bz - s.az;
    s.len2 = s.dx * s.dx + s.dz * s.dz;
  }
  return segs;
}
export const SEGMENTS = buildSegments();

export function makeBall(id, x, z) {
  return { id, x, z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0, on: true, pocket: -1 };
}

export function cloneBalls(balls) {
  return balls.map((b) => ({ ...b }));
}

// Standard triangle rack at the foot spot: 8 in the middle, one of each group in the back corners.
export function rack(random = Math.random) {
  const balls = [makeBall(0, HEAD_SPOT.x, HEAD_SPOT.z)];
  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  shuffle(solids);
  shuffle(stripes);
  // Rows 0..4; positions by [row][k]. Apex is the 1 by convention; back corners differ in group.
  const order = new Array(15).fill(null);
  const idx = (row, k) => (row * (row + 1)) / 2 + k;
  order[idx(2, 1)] = 8;
  const apexFromSolids = solids.indexOf(1);
  solids.splice(apexFromSolids, 1);
  order[idx(0, 0)] = 1;
  const flip = random() < 0.5;
  order[idx(4, 0)] = flip ? solids.pop() : stripes.pop();
  order[idx(4, 4)] = flip ? stripes.pop() : solids.pop();
  const rest = shuffle([...solids, ...stripes]);
  for (let i = 0; i < 15; i++) if (order[i] == null) order[i] = rest.pop();
  const gap = 2 * R + 0.0004;
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) {
      const id = order[idx(row, k)];
      const x = FOOT_SPOT.x + row * gap * Math.cos(Math.PI / 6);
      const z = (k - row / 2) * gap;
      balls.push(makeBall(id, x + (random() - 0.5) * 4e-4, z + (random() - 0.5) * 4e-4));
    }
  }
  return balls;
}

// Strike the cue ball. angle: aim direction in the x-z plane (radians; 0 = +x). speed in m/s.
// a, b: tip offset from centre in units of R (a = right english, b = follow; |(a, b)| <= 0.5).
export function strike(ball, { angle, speed, a = 0, b = 0 }) {
  const off = Math.hypot(a, b);
  if (off > 0.5) {
    a *= 0.5 / off;
    b *= 0.5 / off;
  }
  speed = Math.min(MAX_SPEED, Math.max(0, speed));
  const th = angle - a * 0.022; // squirt: side english pushes the cue ball slightly off line
  const dx = Math.cos(th), dz = Math.sin(th);
  ball.vx = dx * speed;
  ball.vz = dz * speed;
  // omega = 5V / (2R^2) * (p x d) with p the tip contact point. b = 0.4 gives natural roll.
  const k = (5 * speed) / (2 * R);
  ball.wy = k * a;
  ball.wx = k * b * dz;
  ball.wz = -k * b * dx;
}

export function isMoving(ball) {
  return ball.on && (ball.vx !== 0 || ball.vz !== 0 || ball.wx !== 0 || ball.wz !== 0 || Math.abs(ball.wy) > 0.5);
}

export function anyMoving(balls) {
  return balls.some((b) => b.on && (b.vx !== 0 || b.vz !== 0));
}

// Advance the simulation by dt seconds. Collisions, rails and pockets are appended to `events`.
export function step(balls, dt, events = null, time = 0) {
  const kSlide = PHYS.muSlide * G * dt;
  const kSlideW = ((5 * PHYS.muSlide * G) / (2 * R)) * dt;
  const kRoll = PHYS.muRoll * G * dt;
  const kSpin = ((5 * PHYS.muSpin * G) / (2 * R)) * dt;

  for (const b of balls) {
    if (!b.on) continue;
    // Cloth friction
    const ux = b.vx + R * b.wz;
    const uz = b.vz - R * b.wx;
    const slip = Math.hypot(ux, uz);
    if (slip > 1e-3) {
      const nx = ux / slip, nz = uz / slip;
      b.vx -= kSlide * nx;
      b.vz -= kSlide * nz;
      b.wx += kSlideW * nz;
      b.wz -= kSlideW * nx;
      const ux2 = b.vx + R * b.wz, uz2 = b.vz - R * b.wx;
      if (ux2 * ux + uz2 * uz <= 0) {
        // Slip reversed within the step: the ball has started rolling.
        b.wx = b.vz / R;
        b.wz = -b.vx / R;
      }
    } else {
      const sp = Math.hypot(b.vx, b.vz);
      if (sp <= kRoll || sp < 2e-3) {
        b.vx = b.vz = b.wx = b.wz = 0;
      } else {
        const f = (sp - kRoll) / sp;
        b.vx *= f;
        b.vz *= f;
        b.wx = b.vz / R;
        b.wz = -b.vx / R;
      }
    }
    if (b.wy !== 0) b.wy = Math.abs(b.wy) <= kSpin ? 0 : b.wy - Math.sign(b.wy) * kSpin;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
  }

  // Ball-ball contacts are solved together (sequential impulses with accumulated, clamped impulse),
  // so a struck rack shares the blow among all touching balls instead of whichever pair comes first.
  const n = balls.length;
  const contacts = [];
  for (let i = 0; i < n; i++) {
    const p = balls[i];
    if (!p.on) continue;
    for (let j = i + 1; j < n; j++) {
      const q = balls[j];
      if (!q.on) continue;
      const dx = q.x - p.x, dz = q.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= (2 * R + 1e-4) ** 2 || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const v0 = (q.vx - p.vx) * nx + (q.vz - p.vz) * nz;
      if (v0 >= 0 && d >= 2 * R) continue;
      contacts.push({ p, q, nx, nz, d, v0, target: v0 < -0.01 ? -PHYS.eBall * v0 : 0, J: 0 });
    }
  }
  if (contacts.length) {
    for (let it = 0; it < (contacts.length > 1 ? 16 : 1); it++) {
      for (const c of contacts) {
        const vrel = (c.q.vx - c.p.vx) * c.nx + (c.q.vz - c.p.vz) * c.nz;
        const nJ = Math.max(0, c.J + (c.target - vrel) / 2);
        const dJ = nJ - c.J;
        c.J = nJ;
        c.p.vx -= dJ * c.nx;
        c.p.vz -= dJ * c.nz;
        c.q.vx += dJ * c.nx;
        c.q.vz += dJ * c.nz;
      }
    }
    for (const c of contacts) {
      const { p, q, nx, nz } = c;
      if (c.J > 0) {
        // Friction at the contact: throw, and spin transfer between the balls.
        const tx = -nz, tz = nx;
        const sp = (p.vx - q.vx) * tx + (p.vz - q.vz) * tz - R * (p.wy + q.wy);
        const jt = Math.min(PHYS.muBall * c.J, Math.abs(sp) / 7) * Math.sign(sp);
        p.vx -= jt * tx;
        p.vz -= jt * tz;
        q.vx += jt * tx;
        q.vz += jt * tz;
        const dw = (5 / (2 * R)) * jt;
        p.wy += dw;
        q.wy += dw;
        if (c.v0 < -0.02) events?.push({ type: 'ball', a: p.id, b: q.id, speed: -c.v0, t: time });
      }
      if (c.d < 2 * R) {
        const push = (2 * R - c.d) / 2;
        p.x -= nx * push;
        p.z -= nz * push;
        q.x += nx * push;
        q.z += nz * push;
      }
    }
  }

  // Cushions, jaws and pockets
  for (const b of balls) {
    if (!b.on) continue;
    for (const s of SEGMENTS) {
      let t = ((b.x - s.ax) * s.dx + (b.z - s.az) * s.dz) / s.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = s.ax + s.dx * t, cz = s.az + s.dz * t;
      const ox = b.x - cx, oz = b.z - cz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 1e-9;
      const nx = ox / d, nz = oz / d; // from cushion towards ball centre
      const vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        const e = s.jaw ? PHYS.eJaw : PHYS.eRail * (1 - Math.min(0.15, -vn * 0.02));
        const jn = -(1 + e) * vn;
        b.vx += jn * nx;
        b.vz += jn * nz;
        // Contact friction against the rubber: english changes the rebound angle.
        const tx = -nz, tz = nx;
        const sp = b.vx * tx + b.vz * tz + R * b.wy; // contact point is at -n*R
        const jt = Math.min(PHYS.muRail * jn, Math.abs(sp) / 3.5) * Math.sign(sp);
        b.vx -= jt * tx;
        b.vz -= jt * tz;
        b.wy -= (5 / (2 * R)) * jt;
        events?.push({ type: s.jaw ? 'jaw' : 'rail', ball: b.id, speed: -vn, t: time });
      }
      b.x = cx + nx * R;
      b.z = cz + nz * R;
    }
    for (let k = 0; k < POCKETS.length; k++) {
      const pk = POCKETS[k];
      const dx = b.x - pk.x, dz = b.z - pk.z;
      const out = Math.abs(b.x) > HX + 0.12 || Math.abs(b.z) > HZ + 0.12;
      if (dx * dx + dz * dz < pk.r * pk.r || (out && k === nearestPocket(b.x, b.z))) {
        b.on = false;
        b.pocket = k;
        events?.push({ type: 'pocket', ball: b.id, pocket: k, speed: Math.hypot(b.vx, b.vz), t: time });
        break;
      }
    }
  }
}

export function nearestPocket(x, z) {
  let best = 0, bd = Infinity;
  POCKETS.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

// Break scatter. Real balls are not perfectly rigid, so the shock of a hard break spreads through
// the rack far more evenly than an ideal rigid-body solve predicts (which sends nearly all of it down
// the two edges). This one deliberate tweak, applied when the cue ball first meets the rack on the
// opening shot, gives each racked ball a kick away from the rack's centre in proportion to the break
// speed. Everything after that is ordinary physics.
export function breakScatter(balls, cueSpeed, random = Math.random) {
  const rackBalls = balls.filter((b) => b.on && b.id !== 0);
  const cx = rackBalls.reduce((s, b) => s + b.x, 0) / rackBalls.length;
  const cz = rackBalls.reduce((s, b) => s + b.z, 0) / rackBalls.length;
  const k = Math.min(1, cueSpeed / 8);
  for (const b of rackBalls) {
    let a = Math.atan2(b.z - cz, b.x - cx);
    if (Math.hypot(b.z - cz, b.x - cx) < R) a = random() * Math.PI * 2;
    a += (random() - 0.5) * 1.2;
    const sp = k * (0.9 + random() * 2.1);
    b.vx += Math.cos(a) * sp;
    b.vz += Math.sin(a) * sp;
  }
}

// A shot in progress: steps the physics and applies the break scatter at the right moment.
export class Shot {
  constructor(balls, { breakShot = false, random = Math.random } = {}) {
    this.balls = balls;
    this.breakShot = breakShot;
    this.random = random;
    this.events = [];
    this.time = 0;
    this.scattered = !breakShot;
    this.cueSpeed = Math.hypot(balls[0].vx, balls[0].vz);
  }

  advance(dt) {
    const from = this.events.length;
    step(this.balls, dt, this.events, this.time);
    this.time += dt;
    if (!this.scattered) {
      for (let i = from; i < this.events.length; i++) {
        const e = this.events[i];
        if (e.type === 'ball' && (e.a === 0 || e.b === 0)) {
          this.scattered = true;
          breakScatter(this.balls, this.cueSpeed, this.random);
          break;
        }
      }
    }
    return !anyMoving(this.balls);
  }
}

// Run a shot to completion. Returns the events; balls are mutated in place.
export function simulate(balls, { dt = 1 / 800, maxTime = 20, breakShot = false, random = Math.random } = {}) {
  const shot = new Shot(balls, { breakShot, random });
  while (shot.time < maxTime && !shot.advance(dt));
  const events = shot.events;
  const t = shot.time;
  for (const b of balls) b.wy = 0;
  return { events, time: t };
}

// True if a ball could sit at (x, z) without overlapping anything or the cushions.
export function canPlace(balls, x, z, { kitchen = false, ignore = 0 } = {}) {
  const lim = 0.0005;
  if (Math.abs(x) > HX - R - lim || Math.abs(z) > HZ - R - lim) return false;
  if (kitchen && x > HEAD_STRING_X) return false;
  return balls.every((b) => !b.on || b.id === ignore || (b.x - x) ** 2 + (b.z - z) ** 2 >= (2 * R + lim) ** 2);
}

// Where would the cue ball, sent along `angle`, first touch something? Used for the aiming guide.
export function castAim(balls, cue, angle, maxDist = 4) {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  let best = { t: maxDist, kind: 'none' };
  for (const b of balls) {
    if (!b.on || b.id === cue.id) continue;
    const ox = cue.x - b.x, oz = cue.z - b.z;
    const bq = ox * dx + oz * dz;
    const c = ox * ox + oz * oz - 4 * R * R;
    const disc = bq * bq - c;
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t > 0 && t < best.t) best = { t, kind: 'ball', ball: b };
  }
  // Cushions: march along the ray (the jaws make an analytic test fiddly, and this is cheap).
  const stepLen = 0.004;
  for (let t = 0; t < best.t; t += stepLen) {
    const x = cue.x + dx * t, z = cue.z + dz * t;
    for (const s of SEGMENTS) {
      let u = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ox = x - (s.ax + s.dx * u), oz = z - (s.az + s.dz * u);
      if (ox * ox + oz * oz < R * R) {
        const d = Math.hypot(ox, oz) || 1;
        return { t, kind: 'rail', x, z, nx: ox / d, nz: oz / d };
      }
    }
    for (const p of POCKETS) if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) return { t, kind: 'pocket', x, z };
  }
  const x = cue.x + dx * best.t, z = cue.z + dz * best.t;
  if (best.kind !== 'ball') return { t: best.t, kind: 'none', x, z };
  // Object ball heads along the line of centres; the cue ball leaves along the tangent.
  const nx = (best.ball.x - x) / (2 * R), nz = (best.ball.z - z) / (2 * R);
  const cos = dx * nx + dz * nz;
  const tx = dx - nx * cos, tz = dz - nz * cos;
  return { t: best.t, kind: 'ball', ball: best.ball, x, z, objDir: { x: nx, z: nz }, cueDir: { x: tx, z: tz }, cut: Math.acos(Math.min(1, cos)) };
}
