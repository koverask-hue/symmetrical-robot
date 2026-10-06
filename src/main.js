import { Renderer } from './render/renderer.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('breakpoint.' + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('breakpoint.' + k, JSON.stringify(v));
    } catch {
      /* storage unavailable: settings just won't persist */
    }
  },
};

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id);
}

function fail(msg) {
  $('err-text').textContent = msg;
  show('screen-error');
}

// Apple GPUs get "high" (MSAA is cheap on tile-based GPUs); others start at
// "medium" and dynamic resolution takes it from there.
function autoQuality(renderer) {
  try {
    const gl = renderer.r.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (/apple|m\d/i.test(name)) return 'high';
    if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
  } catch {
    /* fall through */
  }
  return 'medium';
}

async function boot() {
  const canvas = $('game');
  // Probe on a throwaway canvas: probing the real one would fix its context
  // attributes (e.g. a wasted multisampled default framebuffer).
  if (!document.createElement('canvas').getContext('webgl2')) {
    fail('This game needs WebGL 2. Update macOS / your browser, or enable hardware acceleration.');
    return;
  }
  let qualitySetting = store.get('quality', 'auto');
  const renderer = new Renderer(canvas, 'high');
  const quality = () => (qualitySetting === 'auto' ? autoQuality(renderer) : qualitySetting);
  renderer.applyQuality(quality());
  const input = new Input(canvas);
  input.forceLocked = TEST;
  if (TEST) renderer.adaptive = false; // screenshots at full resolution
  const hud = new Hud();
  const audio = new Audio();
  let seed = Number(params.get('seed')) || store.get('seed', 1);
  let pendingEnd = null;

  const game = new Game({
    renderer, input, hud, audio,
    onEnd: (r) => {
      pendingEnd = r;
    },
  });
  game.sensitivity = 0.0022 * store.get('sens', 1);
  window.__game = game; // handy in the devtools console, and for the smoke test

  const progress = (f, text) => {
    $('load-fill').style.width = `${Math.round(f * 100)}%`;
    $('load-text').textContent = text;
  };

  async function load(s) {
    show('screen-loading');
    seed = s;
    store.set('seed', seed);
    $('seed-label').textContent = seed === 1 ? 'Harrow Street' : `Town #${seed}`;
    await game.load(seed, progress);
  }

  function updateBest() {
    const b = store.get('best', null);
    $('best').textContent = b ? `Best getaway: ${b.time.toFixed(1)} s with $${b.loot.toLocaleString()}` : '';
  }

  async function play() {
    audio.start();
    if (game.state !== 'ready') await load(seed);
    show(null);
    input.lock();
    game.start();
  }

  function toMenu() {
    input.unlock();
    hud.show(false);
    updateBest();
    show('screen-menu');
  }

  $('btn-play').onclick = play;
  $('btn-new').onclick = async () => {
    await load(1 + Math.floor(Math.random() * 1e6));
    toMenu();
  };
  $('btn-resume').onclick = () => {
    audio.start();
    input.lock();
    if (TEST) {
      game.pause(false);
      show(null);
    }
  };
  $('btn-restart').onclick = async () => {
    await load(seed);
    play();
  };
  $('btn-menu').onclick = async () => {
    await load(seed);
    toMenu();
  };
  $('btn-retry').onclick = async () => {
    await load(seed);
    play();
  };
  $('btn-res-new').onclick = async () => {
    await load(1 + Math.floor(Math.random() * 1e6));
    play();
  };
  $('btn-res-menu').onclick = async () => {
    await load(seed);
    toMenu();
  };
  const qSel = $('opt-quality');
  qSel.value = qualitySetting;
  qSel.onchange = () => {
    qualitySetting = qSel.value;
    store.set('quality', qualitySetting);
    renderer.applyQuality(quality());
  };
  const sens = $('opt-sens');
  sens.value = store.get('sens', 1);
  sens.oninput = () => {
    store.set('sens', Number(sens.value));
    game.sensitivity = 0.0022 * Number(sens.value);
  };

  input.onLockChange = (locked) => {
    if (!locked && game.state === 'playing') {
      game.pause(true);
      show('screen-pause');
    } else if (locked && game.state === 'paused') {
      game.pause(false);
      show(null);
    }
  };

  function results(r) {
    input.unlock();
    $('res-title').textContent = r.won ? 'ESCAPED' : 'BUSTED';
    $('res-reason').textContent = r.reason;
    const rows = [
      ['Time', `${r.time.toFixed(1)} s`],
      ['Loot', `$${r.loot.toLocaleString()} (${r.collected}/${r.total})`],
      ['Voxels destroyed', r.destroyed.toLocaleString()],
      ['Biggest collapse', `${r.collapse.toLocaleString()} voxels`],
    ];
    $('res-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    if (r.won) {
      const b = store.get('best', null);
      if (!b || r.time < b.time) store.set('best', { time: r.time, loot: r.loot });
    }
    show('screen-results');
  }

  // Main loop.
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dtMs = now - last;
    last = now;
    const dt = Math.min(0.05, dtMs / 1000);
    if (game.world && game.state !== 'idle' && game.state !== 'loading') {
      try {
        game.frame(dt);
      } catch (err) {
        console.error(err);
        fail(`Something broke: ${err.message}`);
        game.state = 'idle';
      }
      renderer.adapt(dtMs, now);
    }
    input.endFrame();
    if (pendingEnd) {
      const r = pendingEnd;
      pendingEnd = null;
      results(r);
    }
  }
  requestAnimationFrame(loop);

  try {
    await load(seed);
  } catch (err) {
    console.error(err);
    fail(`Could not load: ${err.message}`);
    return;
  }
  toMenu();
  if (TEST) window.__ready = true;
}

boot();
