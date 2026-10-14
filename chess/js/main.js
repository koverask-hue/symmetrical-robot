// Game controller: rules (chess.js), opponent (Stockfish), 3D choreography and the side sheet UI.
import { Chess } from '../vendor/chess.js';
import { Stage } from './scene.js';
import { Effects } from './fx.js';
import { Animator } from './animator.js';
import { Sound } from './audio.js';
import { Engine } from './engine.js';
import { clampElo, engineSettings, describeSettings, tierName, PRESETS, ELO_MIN, ELO_MAX } from './elo.js';

const $ = (id) => document.getElementById(id);
const NAME = { w: 'Marble', b: 'Obsidian' };
const GLYPH = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('wizards-chess:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('wizards-chess:' + key, JSON.stringify(value));
    } catch {
      /* storage unavailable: settings just won't persist */
    }
  },
};

const state = {
  chess: new Chess(),
  side: ['w', 'b', 'two'].includes(store.get('side', 'w')) ? store.get('side', 'w') : 'w',
  elo: clampElo(store.get('elo', 1500)),
  sound: store.get('sound', true) !== false,
  selected: null,
  hover: null,
  busy: true, // pieces are animating
  thinking: false,
  over: null, // { title, body } once the game has ended
  hint: null,
  gameId: 0,
  thinkToken: 0,
};
const chess = () => state.chess;

const stage = new Stage($('board'));
const fx = new Effects(stage.scene);
const sound = new Sound();
sound.setEnabled(state.sound);
const anim = new Animator(stage, fx, sound);
const engine = new Engine();
engine.addEventListener('ready', () => {
  if (engine.kind === 'fallback') snackbar('Stockfish could not start in this browser, so a lighter backup engine is playing.', 6000);
  updateUI();
});

// ---- rendering loop -----------------------------------------------------

let last = performance.now();
let firstFrame = true;
function frame(now) {
  requestAnimationFrame(frame);
  // rAF timestamps can predate `last` after a long task, so never let dt go negative.
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = Math.max(last, now);
  anim.update(dt);
  fx.update(dt);
  stage.render(now / 1000, dt);
  if (firstFrame) {
    firstFrame = false;
    $('loading').classList.add('is-done');
  }
}
new ResizeObserver(() => stage.resize()).observe($('board'));

// ---- helpers ------------------------------------------------------------

function humanTurn() {
  return !state.over && !state.busy && !state.thinking && (state.side === 'two' || chess().turn() === state.side);
}

function kingSquare(color) {
  for (const row of chess().board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

function save() {
  store.set('pgn', chess().pgn());
}

let snackTimer = 0;
function snackbar(text, ms = 2800) {
  const el = $('snackbar');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => (el.hidden = true), ms);
}

function refreshHighlights() {
  const hist = chess().history({ verbose: true });
  const lastMove = state.hint || hist[hist.length - 1] || null;
  stage.setHighlights({
    lastMove,
    check: chess().inCheck() ? kingSquare(chess().turn()) : null,
    hover: humanTurn() ? state.hover : null,
    selected: state.selected,
  });
}

function select(square) {
  state.selected = square;
  anim.select(square);
  stage.showRune(square);
  const seen = new Set();
  const targets = [];
  if (square) {
    for (const m of chess().moves({ square, verbose: true })) {
      if (seen.has(m.to)) continue; // promotions list four moves to one square
      seen.add(m.to);
      targets.push({ square: m.to, capture: m.flags.includes('c') || m.flags.includes('e') });
    }
  }
  stage.showTargets(targets);
  refreshHighlights();
}

// ---- moves --------------------------------------------------------------

async function animateMove(move, id) {
  const f = move.flags;
  if (f.includes('k') || f.includes('q')) {
    const rank = move.color === 'w' ? '1' : '8';
    const king = f.includes('k');
    await anim.castle(move.from, move.to, (king ? 'h' : 'a') + rank, (king ? 'f' : 'd') + rank);
  } else if (f.includes('e')) {
    await anim.capture(move.from, move.to, move.to[0] + move.from[1]);
  } else if (f.includes('c')) {
    await anim.capture(move.from, move.to, move.to);
  } else {
    await anim.move(move.from, move.to);
  }
  if (move.promotion && id === state.gameId) await anim.promote(move.to, move.promotion);
}

async function playMove(move) {
  const id = state.gameId;
  state.busy = true;
  state.hint = null;
  select(null);
  updateUI();
  await animateMove(move, id);
  if (id !== state.gameId) return; // a new game or undo happened mid-animation
  if (!anim.matches(chess().board())) anim.rebuild(chess().board());
  state.busy = false;
  save();
  await afterMove();
}

async function afterMove() {
  const c = chess();
  if (c.isGameOver()) {
    const vsEngine = state.side !== 'two';
    if (c.isCheckmate()) {
      const loser = c.turn();
      const winner = loser === 'w' ? 'b' : 'w';
      state.busy = true;
      updateUI();
      await anim.topple(kingSquare(loser));
      state.busy = false;
      const body = vsEngine ? (winner === state.side ? 'You win. The cathedral bells ring for you.' : 'Stockfish wins this one.') : `${NAME[winner]} wins.`;
      endGame('Checkmate', `${NAME[winner]} defeats ${NAME[loser]}. ${body}`);
    } else {
      let reason = 'Draw by the fifty-move rule.';
      if (c.isStalemate()) reason = `Stalemate: ${NAME[c.turn()]} has no legal move but is not in check.`;
      else if (c.isThreefoldRepetition()) reason = 'Draw by threefold repetition.';
      else if (c.isInsufficientMaterial()) reason = 'Draw: neither side has enough material to mate.';
      sound.play('toll', 0.6);
      endGame('Draw', reason);
    }
    return;
  }
  if (c.inCheck()) {
    sound.play('toll', 0.45);
    snackbar(`${NAME[c.turn()]} is in check.`);
  }
  updateUI();
  maybeEngine();
}

function endGame(title, body) {
  state.over = { title, body };
  updateUI();
  $('result-title').textContent = title;
  $('result-body').textContent = body;
  $('result-dialog').showModal();
}

async function maybeEngine() {
  if (state.over || state.busy || state.side === 'two' || chess().turn() === state.side) return;
  const token = ++state.thinkToken;
  const fen = chess().fen();
  state.thinking = true;
  updateUI();
  const started = performance.now();
  const uci = await engine.bestMove(fen, state.elo);
  if (token !== state.thinkToken) return;
  // A short beat so even instant replies feel considered.
  const pause = 500 - (performance.now() - started);
  if (pause > 0) await new Promise((r) => setTimeout(r, pause));
  if (token !== state.thinkToken) return;
  state.thinking = false;
  if (!uci || chess().fen() !== fen) {
    updateUI();
    return;
  }
  let move = null;
  try {
    move = chess().move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch (err) {
    console.error('Engine suggested an illegal move', uci, err);
  }
  if (move) await playMove(move);
  else updateUI();
}

function stopThinking() {
  state.thinkToken++;
  state.thinking = false;
  engine.cancel();
}

async function tryMove(from, to) {
  const options = chess().moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (!options.length) return false;
  let promotion;
  if (options[0].promotion) promotion = await askPromotion(options[0].color);
  const move = chess().move({ from, to, promotion });
  await playMove(move);
  return true;
}

function onSquare(square) {
  if (!square || !humanTurn()) return;
  if (state.selected && state.selected !== square) {
    const legal = chess().moves({ square: state.selected, verbose: true }).some((m) => m.to === square);
    if (legal) {
      tryMove(state.selected, square);
      return;
    }
  }
  const p = chess().get(square);
  if (p && p.color === chess().turn() && state.selected !== square) select(square);
  else select(null);
}

function askPromotion(color) {
  const dlg = $('promo-dialog');
  for (const b of dlg.querySelectorAll('button[data-piece]')) b.querySelector('.glyph').textContent = GLYPH[color][b.dataset.piece];
  return new Promise((resolve) => {
    const pick = (e) => {
      const b = e.target.closest('button[data-piece]');
      if (!b) return;
      done(b.dataset.piece);
    };
    const done = (piece) => {
      dlg.removeEventListener('click', pick);
      dlg.removeEventListener('cancel', cancel);
      dlg.close();
      resolve(piece);
    };
    const cancel = (e) => {
      e.preventDefault();
      done('q');
    };
    dlg.addEventListener('click', pick);
    dlg.addEventListener('cancel', cancel);
    dlg.showModal();
    dlg.querySelector('button[data-piece="q"]').focus();
  });
}

// "knight to f3", "Nf3", "e2e4", "castle queenside" -> a legal move, or an explanation.
function parseCast(text) {
  const c = chess();
  const raw = text.trim();
  if (!raw) return { error: 'Type a move such as e4 or Nf3.' };
  let s = raw.toLowerCase();
  if (/\b(castles?|castling)\b|^o-o/.test(s)) s = /queen|long|o-o-o/.test(s) ? 'o-o-o' : 'o-o';
  s = s
    .replace(/\b(knight|horse)\b/g, 'n').replace(/\bbishop\b/g, 'b').replace(/\brook\b/g, 'r')
    .replace(/\bqueen\b/g, 'q').replace(/\bking\b/g, 'k').replace(/\bpawn\b/g, '')
    .replace(/\b(takes|captures|x)\b/g, 'x')
    .replace(/\b(to|moves?|goes|on|the|a|promotes?|=)\b/g, '')
    .replace(/[\s=+#!?]/g, '')
    .replace(/0/g, 'o');
  const norm = (san) => san.toLowerCase().replace(/[=+#x]/g, '');
  const want = s.replace(/x/g, '');
  const moves = c.moves({ verbose: true });
  const hits = moves.filter((m) => norm(m.san) === want || m.from + m.to + (m.promotion || '') === want || (m.from + m.to === want && (!m.promotion || m.promotion === 'q')));
  // Lower-case input makes "b" mean both bishop and the b-file; prefer the reading the case suggests.
  let pick = hits;
  if (hits.length > 1) {
    const exact = hits.filter((m) => m.san.replace(/[+#]/g, '') === raw.replace(/[+#]/g, ''));
    if (exact.length === 1) pick = exact;
    else {
      const pawn = hits.filter((m) => m.piece === 'p');
      const piece = hits.filter((m) => m.piece !== 'p');
      pick = /^[A-Z]/.test(raw) ? piece : pawn.length ? pawn : piece;
    }
  }
  if (pick.length === 1) return { move: pick[0] };
  if (pick.length > 1) return { error: `"${raw}" fits ${pick.length} moves: ${pick.map((m) => m.san).join(', ')}.` };
  return { error: `"${raw}" is not a legal move for ${NAME[c.turn()]} right now.` };
}

// ---- commands -----------------------------------------------------------

async function newGame() {
  stopThinking();
  state.gameId++;
  state.over = null;
  state.hint = null;
  select(null);
  engine.newGame();
  state.busy = true;
  updateUI();
  await anim.despawn();
  fx.clearShards();
  chess().reset();
  save();
  if (state.side !== 'two') stage.rig.faceSide(state.side);
  updateUI();
  const id = state.gameId;
  await anim.spawn(chess().board());
  if (id !== state.gameId) return;
  state.busy = false;
  updateUI();
  maybeEngine();
}

function undo() {
  if (state.busy || $('btn-undo').disabled) return;
  stopThinking();
  state.gameId++;
  let plies = 1;
  if (state.side !== 'two' && chess().turn() === state.side && chess().history().length >= 2) plies = 2;
  for (let i = 0; i < plies; i++) chess().undo();
  state.over = null;
  state.hint = null;
  anim.rebuild(chess().board());
  select(null);
  save();
  updateUI();
  maybeEngine();
}

async function hint() {
  if (!humanTurn()) return;
  const fen = chess().fen();
  $('btn-hint').disabled = true;
  const uci = await engine.bestMove(fen, ELO_MAX, { analysis: true });
  updateUI();
  if (!uci || chess().fen() !== fen) return;
  const m = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  select(m.from);
  state.hint = { from: m.from, to: m.to };
  refreshHighlights();
  snackbar(`Stockfish suggests ${m.san}.`);
}

function setSide(side) {
  state.side = side;
  store.set('side', side);
  if (side !== 'two') stage.rig.faceSide(side);
  if (state.thinking) stopThinking();
  updateUI();
  maybeEngine();
}

function setElo(elo) {
  state.elo = clampElo(elo);
  updateUI();
}

// ---- UI -----------------------------------------------------------------

function renderPresets() {
  const wrap = $('elo-presets');
  wrap.replaceChildren(...PRESETS.map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.elo = p.elo;
    b.textContent = p.label;
    b.addEventListener('click', () => {
      setElo(p.elo);
      store.set('elo', state.elo);
    });
    return b;
  }));
}

function updateUI() {
  const c = chess();
  const turn = c.turn();

  // Turn pill over the board
  $('turn-swatch').classList.toggle('is-black', turn === 'b');
  $('turn-text').textContent = state.over ? state.over.title : `${NAME[turn]} to move`;

  // Status card
  let title;
  let body;
  if (state.over) {
    title = state.over.title;
    body = state.over.body;
  } else if (state.thinking) {
    title = 'Stockfish is thinking';
    body = `Playing ${NAME[turn]} at ${state.elo} Elo.`;
  } else if (state.side === 'two') {
    title = `${NAME[turn]}'s move`;
    body = 'Two players share this board. Click a piece, then a glowing square.';
  } else if (turn === state.side) {
    title = c.inCheck() ? 'Check' : 'Your move';
    body = c.inCheck() ? 'Your king is attacked. Block, capture or step aside.' : `Click ${turn === 'w' ? 'a marble' : 'an obsidian'} piece, then a glowing square.`;
  } else {
    title = 'Stockfish to move';
    body = 'Waiting for the pieces to settle.';
  }
  const hist = c.history({ verbose: true });
  if (!state.over && hist.length) body = `Last move ${hist[hist.length - 1].san}. ${body}`;
  $('status-title').textContent = title;
  $('status-body').textContent = body;
  $('thinking').hidden = !state.thinking;

  const chip = $('engine-chip');
  chip.classList.toggle('chip--warn', engine.kind === 'fallback');
  chip.textContent = engine.kind === 'loading' ? 'Loading Stockfish…' : engine.kind === 'stockfish' ? 'Stockfish 18' : 'Backup engine';

  // Strength
  const s = engineSettings(state.elo);
  $('elo-value').textContent = state.elo;
  $('elo-tier').textContent = tierName(state.elo);
  $('elo-desc').textContent = engine.kind === 'fallback'
    ? `Stockfish could not start here; the backup engine tops out near 1600 whatever the setting.`
    : describeSettings(s) + (state.side === 'two' ? '. Used for hints only in two-player mode.' : '.');
  const slider = $('elo');
  if (Number(slider.value) !== state.elo) slider.value = state.elo;
  slider.style.setProperty('--fill', `${((state.elo - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 100}%`);
  slider.setAttribute('aria-valuetext', `${state.elo} Elo, ${tierName(state.elo)}`);
  for (const b of $('elo-presets').children) b.setAttribute('aria-pressed', String(Number(b.dataset.elo) === state.elo));

  // Side
  for (const b of $('side').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.side === state.side));

  // Buttons
  // Against the engine, undo needs one of your own moves to take back.
  const ownMoves = state.side === 'two' ? hist.length : hist.filter((m) => m.color === state.side).length;
  $('btn-undo').disabled = state.busy || !ownMoves;
  $('btn-hint').disabled = !humanTurn() || engine.kind === 'loading';
  $('cast-input').disabled = !humanTurn();

  // Moves
  const list = $('moves');
  const items = [];
  for (let i = 0; i < hist.length; i += 2) {
    const li = document.createElement('li');
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = `${i / 2 + 1}.`;
    li.append(n);
    for (const k of [i, i + 1]) {
      const m = document.createElement('span');
      m.className = 'm' + (k === hist.length - 1 ? ' is-last' : '');
      m.textContent = hist[k] ? hist[k].san : '';
      li.append(m);
    }
    items.push(li);
  }
  list.replaceChildren(...items);
  list.scrollTop = list.scrollHeight;
  $('moves-empty').hidden = hist.length > 0;

  // Captured pieces: what each side has taken
  const taken = { w: [], b: [] };
  const order = 'qrbnp';
  for (const m of hist) if (m.captured) taken[m.color].push(m.captured);
  for (const color of ['w', 'b']) {
    const victim = color === 'w' ? 'b' : 'w';
    $('captured-' + color).textContent = taken[color].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((p) => GLYPH[victim][p]).join('');
  }

  refreshHighlights();
}

// ---- wiring -------------------------------------------------------------

const canvas = $('board');
canvas.addEventListener('pointerdown', () => sound.unlock());
canvas.addEventListener('pointerup', (e) => {
  if (stage.rig.wasDrag) return;
  onSquare(stage.pickSquare(e.clientX, e.clientY, anim.meshes()));
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || e.pointerType !== 'mouse') return;
  const sq = stage.pickSquare(e.clientX, e.clientY, anim.meshes());
  if (sq !== state.hover) {
    state.hover = sq;
    refreshHighlights();
  }
});
canvas.addEventListener('pointerleave', () => {
  state.hover = null;
  refreshHighlights();
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.selected) select(null);
});
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });

$('btn-new').addEventListener('click', newGame);
$('btn-undo').addEventListener('click', undo);
$('btn-hint').addEventListener('click', hint);
$('btn-rotate').addEventListener('click', () => stage.rig.rotateHalf());
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
  const label = state.sound ? 'Mute sound' : 'Turn sound on';
  b.setAttribute('aria-label', label);
  b.title = label;
}
$('side').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-side]');
  if (b && b.dataset.side !== state.side) setSide(b.dataset.side);
});
$('side').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const sides = ['w', 'b', 'two'];
  const i = (sides.indexOf(state.side) + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
  setSide(sides[i]);
  $('side').querySelector(`[data-side="${sides[i]}"]`).focus();
});
$('elo').addEventListener('input', (e) => setElo(e.target.value));
$('elo').addEventListener('change', () => store.set('elo', state.elo));
$('cast').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!humanTurn()) return;
  const input = $('cast-input');
  const { move, error } = parseCast(input.value);
  if (error) {
    snackbar(error, 4000);
    return;
  }
  input.value = '';
  select(null);
  await playMove(chess().move(move));
});
$('result-close').addEventListener('click', () => $('result-dialog').close());
$('result-new').addEventListener('click', () => {
  $('result-dialog').close();
  newGame();
});

// ---- boot ---------------------------------------------------------------

async function start(data = {}) {
  const pgn = data.pgn ?? store.get('pgn', '');
  if (data.side) state.side = data.side;
  if (data.elo) state.elo = clampElo(data.elo);
  if (pgn) {
    try {
      chess().loadPgn(pgn);
    } catch {
      chess().reset();
    }
  }
  if (chess().isGameOver()) chess().reset();
  window.claude?.hot?.snapshot?.(() => ({ pgn: chess().pgn(), side: state.side, elo: state.elo }));
  renderPresets();
  syncSoundButton();
  if (state.side !== 'two') {
    stage.rig.faceSide(state.side);
    stage.rig.azimuth = stage.rig.goal.azimuth;
  }
  updateUI();
  requestAnimationFrame(frame);
  await anim.spawn(chess().board());
  state.busy = false;
  updateUI();
  maybeEngine();
}

window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});

// Handle for automated checks and the curious.
window.wizardsChess = { state, anim, engine, stage, fx, onSquare, parseCast };
