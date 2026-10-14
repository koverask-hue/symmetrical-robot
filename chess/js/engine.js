// Opponent engine: Stockfish 18 (WebAssembly, single-threaded) in a Web Worker, with a small
// JavaScript searcher as a fallback when WebAssembly or workers are unavailable.
import { engineSettings } from './elo.js';
import { depthForElo } from './fallback-ai.js';
import { Chess } from '../vendor/chess.js';

const STOCKFISH_URL = new URL('../vendor/stockfish/stockfish-18-lite-single.js', import.meta.url);
const FALLBACK_URL = new URL('./fallback-worker.js', import.meta.url);
const BOOT_TIMEOUT_MS = 25000;

export class Engine extends EventTarget {
  constructor() {
    super();
    this.kind = 'loading'; // 'loading' | 'stockfish' | 'fallback'
    this.worker = null;
    this.lineHandlers = new Set();
    this.queue = Promise.resolve();
    this.generation = 0;
    this.ready = this.#boot();
  }

  async #boot() {
    try {
      await this.#bootStockfish();
      this.kind = 'stockfish';
    } catch (err) {
      console.warn('Stockfish unavailable, using fallback engine:', err);
      this.worker?.terminate();
      this.#bootFallback();
      this.kind = 'fallback';
    }
    this.dispatchEvent(new Event('ready'));
  }

  #bootStockfish() {
    return new Promise((resolve, reject) => {
      if (typeof WebAssembly !== 'object') return reject(new Error('WebAssembly not supported'));
      let worker;
      try {
        worker = new Worker(STOCKFISH_URL);
      } catch (err) {
        return reject(err);
      }
      this.worker = worker;
      const timer = setTimeout(() => reject(new Error('Stockfish did not answer "uci"')), BOOT_TIMEOUT_MS);
      worker.onerror = (e) => {
        clearTimeout(timer);
        reject(e instanceof ErrorEvent ? new Error(e.message) : e);
      };
      worker.onmessage = (e) => {
        const line = String(e.data);
        for (const fn of this.lineHandlers) fn(line);
      };
      const onLine = (line) => {
        if (line === 'uciok') {
          this.lineHandlers.delete(onLine);
          clearTimeout(timer);
          resolve();
        }
      };
      this.lineHandlers.add(onLine);
      worker.postMessage('uci');
    });
  }

  #bootFallback() {
    this.worker = new Worker(FALLBACK_URL, { type: 'module' });
    this.pending = new Map();
    this.nextId = 1;
    this.worker.onmessage = (e) => {
      const done = this.pending.get(e.data.id);
      this.pending.delete(e.data.id);
      done?.(e.data.move);
    };
  }

  #send(cmd) {
    this.worker.postMessage(cmd);
  }

  #waitFor(predicate) {
    return new Promise((resolve) => {
      const fn = (line) => {
        if (predicate(line)) {
          this.lineHandlers.delete(fn);
          resolve(line);
        }
      };
      this.lineHandlers.add(fn);
    });
  }

  // Cancels any search in flight; its result is discarded.
  cancel() {
    this.generation++;
    if (this.kind === 'stockfish') this.#send('stop');
  }

  newGame() {
    this.cancel();
    if (this.kind === 'stockfish') this.#send('ucinewgame');
  }

  // Resolves to a UCI move string, or null if the request was cancelled.
  bestMove(fen, elo, { analysis = false } = {}) {
    const gen = this.generation;
    const job = this.queue.then(async () => {
      await this.ready;
      if (gen !== this.generation) return null;
      const s = analysis ? { limitStrength: false, movetime: 900, randomMoveChance: 0, elo } : engineSettings(elo);
      const move = this.kind === 'stockfish' ? await this.#stockfishMove(fen, s) : await this.#fallbackMove(fen, s);
      return gen === this.generation ? move : null;
    });
    this.queue = job.catch(() => null);
    return job;
  }

  async #stockfishMove(fen, s) {
    this.#send(`setoption name UCI_LimitStrength value ${s.limitStrength}`);
    if (s.limitStrength) this.#send(`setoption name UCI_Elo value ${s.uciElo}`);
    this.#send('isready');
    await this.#waitFor((l) => l === 'readyok');
    this.#send(`position fen ${fen}`);
    this.#send(`go movetime ${s.movetime}`);
    const line = await this.#waitFor((l) => l.startsWith('bestmove'));
    const best = line.split(/\s+/)[1];
    if (!best || best === '(none)') return null;
    if (s.randomMoveChance > 0 && Math.random() < s.randomMoveChance) return randomMove(fen) ?? best;
    return best;
  }

  async #fallbackMove(fen, s) {
    const started = performance.now();
    const options = {
      depth: depthForElo(s.elo),
      randomMoveChance: s.randomMoveChance,
      noise: s.elo < 1300 ? 120 : s.elo < 1800 ? 40 : 0,
    };
    const id = this.nextId++;
    const move = await new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, fen, options });
    });
    // Keep a human-feeling pause even when the search is instant.
    const wait = 450 - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return move;
  }
}

function randomMove(fen) {
  const moves = new Chess(fen).moves({ verbose: true });
  if (!moves.length) return null;
  const m = moves[Math.floor(Math.random() * moves.length)];
  return m.from + m.to + (m.promotion || '');
}
