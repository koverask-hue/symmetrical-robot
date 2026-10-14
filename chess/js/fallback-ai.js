// Small alpha-beta searcher used only when Stockfish cannot start (no WebAssembly, blocked worker).
// It plays roughly club strength at depth 3; the Elo slider maps onto depth plus random moves.
import { Chess } from '../vendor/chess.js';

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables from white's point of view, a8 first (index = rank8..rank1 * 8 + file).
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

const MATE = 100000;

function evaluate(chess) {
  // Score from the side to move's perspective.
  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p) continue;
      const idx = p.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      const v = VALUE[p.type] + PST[p.type][idx];
      score += p.color === 'w' ? v : -v;
    }
  }
  return chess.turn() === 'w' ? score : -score;
}

function ordered(moves) {
  return moves.sort((a, b) => {
    const av = (a.captured ? 10 * VALUE[a.captured] - VALUE[a.piece] : 0) + (a.promotion ? 800 : 0);
    const bv = (b.captured ? 10 * VALUE[b.captured] - VALUE[b.piece] : 0) + (b.promotion ? 800 : 0);
    return bv - av;
  });
}

function negamax(chess, depth, alpha, beta, ply) {
  if (chess.isCheckmate()) return -MATE + ply;
  if (chess.isDraw()) return 0;
  if (depth === 0) return evaluate(chess);
  let best = -Infinity;
  for (const m of ordered(chess.moves({ verbose: true }))) {
    chess.move(m);
    const v = -negamax(chess, depth - 1, -beta, -alpha, ply + 1);
    chess.undo();
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export function depthForElo(elo) {
  if (elo < 700) return 1;
  if (elo < 1200) return 2;
  return 3;
}

// Returns a UCI move string such as "e2e4" or "e7e8q".
export function chooseMove(fen, { depth = 3, randomMoveChance = 0, noise = 0, random = Math.random } = {}) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  const uci = (m) => m.from + m.to + (m.promotion || '');
  if (random() < randomMoveChance) return uci(moves[Math.floor(random() * moves.length)]);
  let best = null;
  let bestScore = -Infinity;
  for (const m of ordered(moves)) {
    chess.move(m);
    const v = -negamax(chess, depth - 1, -Infinity, Infinity, 1) + (random() - 0.5) * noise;
    chess.undo();
    if (v > bestScore) {
      bestScore = v;
      best = m;
    }
  }
  return uci(best);
}
