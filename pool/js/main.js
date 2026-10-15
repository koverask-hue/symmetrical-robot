// Game controller: input, shots, rules, the computer opponent and the side sheet.
import { R, HX, HZ, rack, strike, Shot, canPlace, castAim, HEAD_SPOT, FOOT_SPOT, MAX_SPEED, cloneBalls } from './physics.js';
import { newGame, judge, onTableSet, groupOf, SOLIDS, STRIPES, legalTargets } from './rules.js';
import { LEVELS, planShot } from './ai.js';
import { PoolScene, MIN_ELEVATION } from './table.js';
import { VIEWS } from './camera.js';
import { Sound } from './audio.js';
import { ballColor } from './textures.js';

const $ = (id) => document.getElementById(id);
const PHYS_DT = 1 / 960;

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('eight-ball:' + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('eight-ball:' + k, JSON.stringify(v));
    } catch {
      /* settings just won't persist */
    }
  },
};

const state = {
  balls: [],
  game: null,
  phase: 'aim', // aim | stroke | rolling | ai | over
  aim: 0,
  power: 0,
  charging: null, // 'bar' | 'key'
  spin: { a: 0, b: 0 },
  opponent: store.get('opponent', 'computer') === 'two' ? 'two' : 'computer',
  level: LEVELS[store.get('level', 'medium')] ? store.get('level', 'medium') : 'medium',
  guide: ['full', 'short', 'off'].includes(store.get('guide', 'full')) ? store.get('guide', 'full') : 'full',
  sound: store.get('sound', true) !== false,
  view: VIEWS.includes(store.get('view', 'aim')) ? store.get('view', 'aim') : 'aim',
  elevation: MIN_ELEVATION,
  shot: null,
  before: null,
  rackId: 0,
  breaker: 0,
};

const scene = new PoolScene($('table'));
const sound = new Sound();
sound.setEnabled(state.sound);
const tweens = [];

function tween(duration, fn, ease = (t) => t) {
  return new Promise((resolve) => tweens.push({ age: 0, duration, fn, ease, resolve }));
}
const smooth = (t) => t * t * (3 - 2 * t);

// ---- helpers --------------------------------------------------------------

const cue = () => state.balls[0];
const humanTurn = () => state.opponent === 'two' || state.game.turn === 0;
const canAim = () => state.phase === 'aim' && humanTurn() && !state.game.over;

function names() {
  if (state.opponent === 'two') return ['Player 1', 'Player 2'];
  return ['You', `Computer · ${LEVELS[state.level].label}`];
}

let snackTimer = 0;
function snackbar(text, ms = 3200) {
  const el = $('snackbar');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => (el.hidden = true), ms);
}

function shotSpeed(power) {
  return 0.25 + Math.pow(power, 1.35) * (MAX_SPEED - 0.6);
}

// Find a legal spot for the cue ball near (x, z).
function freeSpot(x, z, kitchen) {
  const others = state.balls.filter((b) => b.id !== 0);
  if (canPlace(others, x, z, { kitchen })) return { x, z };
  for (let r = 0.02; r < 1.5; r += 0.02) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (canPlace(others, px, pz, { kitchen })) return { x: px, z: pz };
    }
  }
  return { x, z };
}

function aimAtPoint(x, z) {
  const c = cue();
  if (Math.hypot(x - c.x, z - c.z) < 1e-3) return;
  state.aim = Math.atan2(z - c.z, x - c.x);
}

// ---- rack / turns ---------------------------------------------------------

async function newRack() {
  state.rackId++;
  state.shot = null;
  state.balls = rack();
  state.game = newGame(state.breaker);
  state.breaker = 1 - state.breaker;
  state.aim = 0;
  state.power = 0;
  state.spin = { a: 0, b: 0 };
  syncSpin();
  scene.resetPockets();
  $('result-dialog').open && $('result-dialog').close();
  startTurn();
}

function startTurn() {
  const g = state.game;
  if (g.ballInHand) {
    const c = cue();
    const spot = g.ballInHand === 'kitchen' ? freeSpot(HEAD_SPOT.x - 0.08, c.on ? Math.max(-HZ + R, Math.min(HZ - R, c.z)) : 0, true) : freeSpot(c.on ? c.x : 0, c.on ? c.z : 0, false);
    Object.assign(c, { on: true, x: spot.x, z: spot.z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0, pocket: -1 });
    scene.ballMeshes.get(0).userData.inPocket = false;
  }
  if (g.breakShot) {
    const apex = state.balls.find((b) => b.id === 1);
    aimAtPoint(apex.x, apex.z);
  } else if (!humanTurn()) {
    // leave aim where it is
  } else {
    // Point roughly at the nearest legal ball to start with.
    const targets = legalTargets(g, onTableSet(state.balls)).map((id) => state.balls.find((b) => b.id === id)).filter(Boolean);
    const c = cue();
    targets.sort((p, q) => Math.hypot(p.x - c.x, p.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z));
    if (targets[0]) aimAtPoint(targets[0].x, targets[0].z);
  }
  state.power = 0;
  state.phase = humanTurn() ? 'aim' : 'ai';
  updateUI();
  if (!humanTurn()) computerTurn();
}

// ---- shooting -------------------------------------------------------------

async function shoot(power) {
  if (state.phase !== 'aim' && state.phase !== 'ai') return;
  if (power < 0.02) return;
  const speed = shotSpeed(power);
  state.phase = 'stroke';
  state.power = power;
  scene.hideGuide();
  scene.showPlacement(null);
  const pullFrom = 0.03 + power * 0.22;
  await tween(0.07 + 0.05 * (1 - power), (t) => scene.setCue(cue(), state.aim, pullFrom * (1 - t) + 0.001, state.spin.a, state.spin.b, state.elevation), (t) => t * t);
  sound.play('cue', speed);
  state.before = onTableSet(state.balls);
  strike(cue(), { angle: state.aim, speed, a: state.spin.a, b: state.spin.b });
  state.shot = new Shot(state.balls, { breakShot: state.game.breakShot });
  state.processed = 0;
  state.phase = 'rolling';
  state.power = 0;
  tween(0.25, (t) => scene.setCue(cue(), state.aim, 0.001 + t * 0.12, state.spin.a, state.spin.b, state.elevation)).then(() => (scene.cue.visible = false));
  updateUI();
}

function processEvents() {
  const ev = state.shot.events;
  for (; state.processed < ev.length; state.processed++) {
    const e = ev[state.processed];
    if (e.type === 'ball') sound.play('ball', e.speed);
    else if (e.type === 'rail') sound.play('rail', e.speed);
    else if (e.type === 'jaw') sound.play('jaw', e.speed);
    else if (e.type === 'pocket') {
      sound.play('pocket');
      scene.dropBall(e.ball, e.pocket, e.speed);
      updateRacks();
    }
  }
}

function endShot() {
  const shot = state.shot;
  state.shot = null;
  const { game, result } = judge(state.game, state.before, shot.events);
  state.game = game;
  if (result.respotEight) {
    const eight = state.balls.find((b) => b.id === 8);
    let x = FOOT_SPOT.x;
    while (!canPlace(state.balls.filter((b) => b.id !== 8), x, 0) && x < HX - R) x += 0.01;
    Object.assign(eight, { on: true, x, z: 0, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0, pocket: -1 });
    scene.ballMeshes.get(8).userData.inPocket = false;
    snackbar('The 8 went down on the break, so it is spotted.');
  }
  if (result.assigned) {
    const who = names()[state.game.groups.indexOf(result.assigned)];
    snackbar(`${who} ${who === 'You' ? 'have' : 'has'} ${result.assigned}.`);
  }
  if (result.foul && !game.over) {
    sound.play('foul');
    snackbar(`Foul: ${result.foul.toLowerCase()}. ${names()[game.turn]} ${game.turn === 0 && state.opponent !== 'two' ? 'have' : 'has'} ball in hand.`, 4000);
  }
  if (game.over) {
    state.phase = 'over';
    const n = names();
    const winner = n[game.winner];
    const human = state.opponent === 'two' || game.winner === 0;
    if (human) sound.play('win');
    $('result-title').textContent = state.opponent === 'two' ? `${winner} wins` : game.winner === 0 ? 'You win' : 'Computer wins';
    $('result-body').textContent = `${game.message}.`;
    updateUI();
    setTimeout(() => $('result-dialog').showModal(), 700);
    return;
  }
  startTurn();
}

// ---- computer -------------------------------------------------------------

let worker = null;
let workerOk = true;
let jobId = 0;
function plan(balls, game, level) {
  const seed = (Math.random() * 2 ** 31) | 0;
  if (workerOk) {
    try {
      worker ??= new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
      const id = ++jobId;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          workerOk = false;
          resolve(planShot(balls, game, level, seed));
        }, 8000);
        worker.onmessage = (e) => {
          if (e.data.id !== id) return;
          clearTimeout(timer);
          resolve(e.data.shot ?? planShot(balls, game, level, seed));
        };
        worker.onerror = () => {
          clearTimeout(timer);
          workerOk = false;
          resolve(planShot(balls, game, level, seed));
        };
        worker.postMessage({ id, balls: cloneBalls(balls), game, level, seed });
      });
    } catch {
      workerOk = false;
    }
  }
  return Promise.resolve(planShot(balls, game, level, seed));
}

async function computerTurn() {
  const rackId = state.rackId;
  state.phase = 'ai';
  updateUI();
  const started = performance.now();
  const p = await plan(state.balls, state.game, state.level);
  const wait = 700 - (performance.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (rackId !== state.rackId || state.phase !== 'ai') return;
  const c = cue();
  if (p.place) {
    const from = { x: c.x, z: c.z };
    await tween(0.5, (t) => {
      c.x = from.x + (p.place.x - from.x) * t;
      c.z = from.z + (p.place.z - from.z) * t;
    }, smooth);
  }
  // Line up: swing the cue round, settle the spin, draw back.
  const a0 = state.aim;
  let da = p.angle - a0;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  state.spin = { a: p.a, b: p.b };
  syncSpin();
  await tween(0.7, (t) => (state.aim = a0 + da * t), smooth);
  const target = Math.min(1, Math.pow(Math.max(0, (p.speed - 0.25) / (MAX_SPEED - 0.6)), 1 / 1.35));
  await tween(0.6, (t) => (state.power = target * smooth(t)));
  await new Promise((r) => setTimeout(r, 150));
  if (rackId !== state.rackId) return;
  await shoot(Math.max(0.03, target));
}

// ---- input ----------------------------------------------------------------

const canvas = $('table');
const pointers = new Map();
let gesture = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  sound.unlock();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    gesture = { kind: 'pinch' };
    return;
  }
  const hit = scene.pick(e.clientX, e.clientY);
  const c = cue();
  if (canAim() && state.game.ballInHand && hit.x !== null && Math.hypot(hit.x - c.x, hit.z - c.z) < R * 3) {
    gesture = { kind: 'place' };
    canvas.classList.add('is-placing');
  } else if (e.button === 1 || (e.button === 2 && e.shiftKey)) {
    gesture = { kind: 'pan' };
  } else if (e.button === 2 || !canAim()) {
    gesture = { kind: 'orbit', x: e.clientX, y: e.clientY };
  } else {
    gesture = { kind: 'aim', x: e.clientX, y: e.clientY, moved: 0 };
  }
});

canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev || !gesture) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  if (gesture.kind === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    prev.x = e.clientX;
    prev.y = e.clientY;
    const after = Math.hypot(a.x - b.x, a.y - b.y);
    scene.rig.zoom(before / Math.max(1, after));
    scene.rig.orbit(dx * 0.5, dy * 0.5);
    return;
  }
  prev.x = e.clientX;
  prev.y = e.clientY;
  if (gesture.kind === 'place') {
    const hit = scene.pick(e.clientX, e.clientY);
    if (hit.x === null) return;
    const kitchen = state.game.ballInHand === 'kitchen';
    const others = state.balls.filter((b) => b.id !== 0);
    const x = Math.max(-HX + R, Math.min(kitchen ? Math.min(HX - R, -HX / 2) : HX - R, hit.x));
    const z = Math.max(-HZ + R, Math.min(HZ - R, hit.z));
    if (canPlace(others, x, z, { kitchen })) {
      cue().x = x;
      cue().z = z;
    }
  } else if (gesture.kind === 'aim') {
    gesture.moved += Math.abs(dx) + Math.abs(dy);
    if (scene.rig.mode === 'top') {
      const hit = scene.pick(e.clientX, e.clientY);
      if (hit.x !== null) aimAtPoint(hit.x, hit.z);
    } else {
      state.aim += dx * (e.shiftKey ? 0.0004 : 0.0028);
    }
  } else if (gesture.kind === 'orbit') {
    scene.rig.orbit(dx, dy);
  } else if (gesture.kind === 'pan') {
    scene.rig.pan(dx, dy);
    syncViewButtons();
  }
});

const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.kind === 'aim' && gesture.moved < 6) {
    const hit = scene.pick(e.clientX, e.clientY);
    if (hit.ball !== null && hit.ball !== 0) {
      const b = state.balls.find((x) => x.id === hit.ball);
      aimAtPoint(b.x, b.z);
    } else if (hit.x !== null) aimAtPoint(hit.x, hit.z);
  }
  if (gesture.kind === 'place') canvas.classList.remove('is-placing');
  if (pointers.size === 0) gesture = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  scene.rig.zoom(Math.exp(Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 40) * 0.06));
}, { passive: false });

// Power bar: pull down, let go to shoot.
const power = $('power');
let barStart = null;
power.addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (!canAim()) return;
  power.setPointerCapture(e.pointerId);
  barStart = e.clientY;
  state.charging = 'bar';
});
power.addEventListener('pointermove', (e) => {
  if (state.charging !== 'bar') return;
  const track = power.querySelector('.power__track').getBoundingClientRect();
  state.power = Math.min(1, Math.max(0, (e.clientY - barStart) / (track.height * 0.85)));
});
const releaseBar = () => {
  if (state.charging !== 'bar') return;
  state.charging = null;
  const p = state.power;
  if (p >= 0.02) shoot(p);
  else state.power = 0;
};
power.addEventListener('pointerup', releaseBar);
power.addEventListener('pointercancel', () => {
  state.charging = null;
  state.power = 0;
});
power.addEventListener('keydown', (e) => {
  if (!canAim()) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    state.power = Math.min(1, Math.max(0, state.power + (e.key === 'ArrowDown' ? 0.05 : -0.05)));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    shoot(state.power);
  }
});

// Keyboard: arrows aim, Space charges and shoots, T toggles the top view.
const keys = new Set();
let chargeStart = 0;
addEventListener('keydown', (e) => {
  if (e.key === 'Shift') keys.add('Shift');
  if (e.target.closest?.('[role="slider"]')) return; // the power bar and spin pad handle their own keys
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    keys.add(e.key);
    if (e.target === document.body || e.target === canvas) e.preventDefault();
  } else if (e.code === 'Space' && !e.repeat && canAim() && (e.target === document.body || e.target === canvas)) {
    e.preventDefault();
    sound.unlock();
    state.charging = 'key';
    chargeStart = performance.now();
  } else if (e.key === 'Escape' && state.charging) {
    state.charging = null;
    state.power = 0;
  } else if (e.key === 't' || e.key === 'T') {
    setView(scene.rig.mode === 'top' ? 'aim' : 'top');
  } else if (['1', '2', '3', '4'].includes(e.key)) {
    setView(VIEWS[Number(e.key) - 1]);
  } else if (e.key === 'r' || e.key === 'R') {
    scene.rig.reset();
  }
});
addEventListener('keyup', (e) => {
  keys.delete(e.key);
  if (e.code === 'Space' && state.charging === 'key') {
    state.charging = null;
    shoot(state.power);
  }
});
addEventListener('blur', () => {
  keys.clear();
  if (state.charging === 'key') {
    state.charging = null;
    state.power = 0;
  }
});

function setView(view) {
  state.view = view;
  store.set('view', view);
  scene.rig.setMode(view);
  syncViewButtons();
}

function syncViewButtons() {
  for (const b of $('views').querySelectorAll('button[data-view]')) b.setAttribute('aria-checked', String(b.dataset.view === scene.rig.mode));
}

// Spin pad
const pad = $('spin-pad');
function setSpinFromEvent(e) {
  const rect = pad.getBoundingClientRect();
  let x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  let y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  x /= 0.9;
  y /= 0.9;
  const d = Math.hypot(x, y);
  if (d > 1) {
    x /= d;
    y /= d;
  }
  state.spin = { a: x * 0.5, b: -y * 0.5 };
  syncSpin();
}
let padDrag = false;
pad.addEventListener('pointerdown', (e) => {
  if (!canAim()) return;
  padDrag = true;
  pad.setPointerCapture(e.pointerId);
  setSpinFromEvent(e);
});
pad.addEventListener('pointermove', (e) => padDrag && setSpinFromEvent(e));
pad.addEventListener('pointerup', () => (padDrag = false));
pad.addEventListener('keydown', (e) => {
  if (!canAim()) return;
  const step = 0.05;
  const s = { ...state.spin };
  if (e.key === 'ArrowLeft') s.a -= step;
  else if (e.key === 'ArrowRight') s.a += step;
  else if (e.key === 'ArrowUp') s.b += step;
  else if (e.key === 'ArrowDown') s.b -= step;
  else return;
  e.preventDefault();
  e.stopPropagation();
  const d = Math.hypot(s.a, s.b);
  if (d > 0.5) {
    s.a *= 0.5 / d;
    s.b *= 0.5 / d;
  }
  state.spin = s;
  syncSpin();
});
$('spin-reset').addEventListener('click', () => {
  state.spin = { a: 0, b: 0 };
  syncSpin();
});

let shownElevation = -1;
function syncElevation() {
  const deg = Math.round((state.elevation * 180) / Math.PI);
  if (deg === shownElevation) return;
  shownElevation = deg;
  $('elevation').textContent = deg <= 5 ? `Cue nearly level (${deg}°).` : `Cue raised to ${deg}° to clear ${deg > 25 ? 'the ball or rail in the way' : 'the rail'}.`;
}

function syncSpin() {
  const { a, b } = state.spin;
  const tip = $('spin-tip');
  tip.setAttribute('cx', String((a / 0.5) * 54 * 0.9));
  tip.setAttribute('cy', String((-b / 0.5) * 54 * 0.9));
  const parts = [];
  const pct = (v) => Math.round((Math.abs(v) / 0.5) * 100);
  if (Math.abs(b) > 0.02) parts.push(`${b > 0 ? 'Follow' : 'Draw'} ${pct(b)}%`);
  if (Math.abs(a) > 0.02) parts.push(`${a > 0 ? 'right' : 'left'} english ${pct(a)}%`);
  const text = parts.length ? parts.join(', ') : 'Centre ball';
  $('spin-desc').textContent = parts.length
    ? `${text[0].toUpperCase()}${text.slice(1)}.`
    : 'Centre ball. Low draws the cue ball back, high follows through, left and right change how it comes off cushions.';
  pad.setAttribute('aria-valuetext', text);
}

// Settings
$('opponent').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-opp]');
  if (!b || b.dataset.opp === state.opponent) return;
  state.opponent = b.dataset.opp;
  store.set('opponent', state.opponent);
  if (state.phase === 'aim' || state.phase === 'ai') startTurn();
  else updateUI();
});
function renderLevels() {
  $('levels').replaceChildren(...Object.entries(LEVELS).map(([id, l]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.dataset.level = id;
    b.textContent = l.label;
    b.addEventListener('click', () => {
      state.level = id;
      store.set('level', id);
      updateUI();
    });
    return b;
  }));
}
$('guide').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-guide]');
  if (!b) return;
  state.guide = b.dataset.guide;
  store.set('guide', state.guide);
  updateUI();
});
$('btn-new').addEventListener('click', newRack);
$('views').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.view) setView(b.dataset.view);
  else if (b.id === 'view-reset') scene.rig.reset();
});
$('btn-sound').addEventListener('click', () => {
  state.sound = !state.sound;
  store.set('sound', state.sound);
  sound.unlock();
  sound.setEnabled(state.sound);
  syncSoundButton();
});
function syncSoundButton() {
  const b = $('btn-sound');
  b.querySelector('.msr').textContent = state.sound ? 'volume_up' : 'volume_off';
  b.setAttribute('aria-label', state.sound ? 'Mute sound' : 'Turn sound on');
  b.title = b.getAttribute('aria-label');
}
$('result-close').addEventListener('click', () => $('result-dialog').close());
$('result-new').addEventListener('click', () => {
  $('result-dialog').close();
  newRack();
});

// ---- UI -------------------------------------------------------------------

function mini(id, down) {
  const s = document.createElement('span');
  s.className = 'mini' + (id > 8 ? ' stripe' : '') + (id === 8 ? ' eight' : '') + (down ? ' down' : '');
  s.style.setProperty('--c', ballColor(id));
  s.title = down ? `${id} pocketed` : `${id}`;
  return s;
}

function updateRacks() {
  const onTable = onTableSet(state.balls);
  const g = state.game;
  for (const p of [0, 1]) {
    const group = g.groups[p];
    const wrap = $('rack-' + p);
    if (!group) {
      wrap.replaceChildren();
      continue;
    }
    const ids = group === 'solids' ? SOLIDS : STRIPES;
    const left = ids.filter((id) => onTable.has(id));
    const items = ids.map((id) => mini(id, !onTable.has(id)));
    if (!left.length) items.push(mini(8, !onTable.has(8)));
    wrap.replaceChildren(...items);
  }
}

function updateUI() {
  const g = state.game;
  const n = names();
  const turn = g.turn;
  for (const p of [0, 1]) {
    $('name-' + p).textContent = n[p];
    const group = g.groups[p];
    const left = group ? (group === 'solids' ? SOLIDS : STRIPES).filter((id) => state.balls.find((b) => b.id === id)?.on).length : null;
    $('group-' + p).textContent = !group ? 'Open table' : left === 0 ? `${group[0].toUpperCase()}${group.slice(1)} · on the 8` : `${group[0].toUpperCase()}${group.slice(1)} · ${left} left`;
    $('player-' + p).classList.toggle('is-active', !g.over && turn === p);
  }
  updateRacks();

  // Status line and turn pill
  const who = n[turn];
  const yours = humanTurn();
  let status;
  if (g.over) status = `${n[g.winner]} ${n[g.winner] === 'You' ? 'win' : 'wins'}. ${g.message}.`;
  else if (state.phase === 'ai') status = `${n[1]} is lining up a shot…`;
  else if (state.phase === 'rolling' || state.phase === 'stroke') status = 'Balls rolling…';
  else if (g.breakShot) status = g.ballInHand ? `${who === 'You' ? 'Your' : `${who}'s`} break. Drag the cue ball anywhere behind the line, then shoot.` : 'Break.';
  else if (g.ballInHand) status = `Ball in hand: drag the cue ball ${g.ballInHand === 'kitchen' ? 'anywhere behind the line' : 'anywhere on the table'}, then shoot.`;
  else {
    const group = g.groups[turn];
    const targets = legalTargets(g, onTableSet(state.balls));
    status = !group ? 'Open table: pot any ball except the 8 to claim its group.' : targets.includes(8) ? 'All your balls are down. Pocket the 8 to win.' : `Pot a ${group.slice(0, -1)}.`;
  }
  $('status').textContent = status;
  $('thinking').hidden = state.phase !== 'ai';
  $('turn-dot').classList.toggle('is-other', turn === 1);
  $('turn-text').textContent = g.over ? 'Game over' : state.opponent === 'two' ? `${who}'s shot` : yours ? (g.breakShot ? 'Your break' : 'Your shot') : `${n[1].split(' · ')[0]}'s shot`;
  const hint = $('hint');
  hint.hidden = !(canAim() && g.ballInHand);
  hint.textContent = 'Ball in hand: drag the cue ball';
  scene.kitchen.visible = canAim() && g.ballInHand === 'kitchen';

  // Settings
  for (const b of $('opponent').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.opp === state.opponent));
  $('levels').hidden = state.opponent === 'two';
  for (const b of $('levels').children) b.setAttribute('aria-checked', String(b.dataset.level === state.level));
  for (const b of $('guide').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.guide === state.guide));
  power.classList.toggle('is-disabled', !canAim());
}

// ---- frame loop -----------------------------------------------------------

let last = performance.now();
let first = true;
let physAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = Math.max(last, now);
  advance(dt);
  scene.rig.frame({ phase: state.phase, cue: cue(), aim: state.aim, balls: state.balls });
  scene.render(dt);
  if (first) {
    first = false;
    $('loading').classList.add('is-done');
  }
}

function advance(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.age += dt;
    const t = Math.min(1, tw.age / tw.duration);
    tw.fn(tw.ease(t));
    if (t >= 1) {
      tweens.splice(i, 1);
      tw.resolve();
    }
  }
  // Keyboard aim
  if (canAim() && (keys.has('ArrowLeft') || keys.has('ArrowRight'))) {
    const rate = keys.has('Shift') ? 0.04 : 0.5;
    state.aim += (keys.has('ArrowRight') ? 1 : -1) * rate * dt;
  }
  if (state.charging === 'key') state.power = Math.min(1, (performance.now() - chargeStart) / 1400);

  if (state.shot) {
    physAcc += dt;
    let done = false;
    while (physAcc >= PHYS_DT && !done) {
      physAcc -= PHYS_DT;
      done = state.shot.advance(PHYS_DT);
    }
    processEvents();
    if (done) {
      physAcc = 0;
      processEvents();
      endShot();
    }
  }
  scene.syncBalls(state.balls, dt);
  scene.updateDrops(dt);

  const aiming = (state.phase === 'aim' && humanTurn()) || state.phase === 'ai';
  if (aiming && !state.game.over) {
    const gap = 0.03 + state.power * 0.22;
    const want = scene.cueElevation(state.balls, cue(), state.aim, state.spin.b, gap);
    state.elevation += (want - state.elevation) * Math.min(1, dt * 12);
    scene.setCue(cue(), state.aim, gap, state.spin.a, state.spin.b, state.elevation);
    syncElevation();
    if (state.phase === 'aim') scene.showGuide(cue(), castAim(state.balls, cue(), state.aim), state.guide);
    else scene.hideGuide();
    scene.showPlacement(state.phase === 'aim' && state.game.ballInHand ? cue() : null, true);
  } else if (state.phase !== 'stroke' && state.phase !== 'rolling') {
    scene.hideGuide();
    scene.showPlacement(null);
    scene.cue.visible = false;
  }
  $('power-fill').style.height = `${state.power * 100}%`;
  $('power-grip').style.top = `${state.power * 100}%`;
  $('power-value').textContent = `${Math.round(state.power * 100)}%`;
  power.setAttribute('aria-valuenow', String(Math.round(state.power * 100)));
}
new ResizeObserver(() => scene.resize()).observe(canvas);

// ---- boot -----------------------------------------------------------------

renderLevels();
syncSoundButton();
setView(state.view);
syncSpin();
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });
newRack();
requestAnimationFrame(frame);

// Handle for automated checks.
window.eightBall = { state, scene, shoot, advance, startTurn, newRack, groupOf, setView };
