import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../chess/vendor/chess.js';
import { clampElo, engineSettings, describeSettings, tierName, ELO_MIN, ELO_MAX, SF_ELO_MIN, SF_ELO_MAX } from '../chess/js/elo.js';
import { chooseMove } from '../chess/js/fallback-ai.js';

test('clampElo keeps values on the slider grid', () => {
  assert.equal(clampElo(-50), ELO_MIN);
  assert.equal(clampElo(99999), ELO_MAX);
  assert.equal(clampElo(1504), 1500);
  assert.equal(clampElo('nonsense'), 1500);
});

test('engine settings use the Stockfish limiter inside its calibrated range', () => {
  for (const elo of [SF_ELO_MIN, 1800, 2500, SF_ELO_MAX]) {
    const s = engineSettings(elo);
    assert.equal(s.limitStrength, true);
    assert.equal(s.uciElo, elo);
    assert.equal(s.randomMoveChance, 0);
  }
});

test('below the Stockfish floor the random-move share grows as Elo drops', () => {
  const a = engineSettings(1200).randomMoveChance;
  const b = engineSettings(600).randomMoveChance;
  const c = engineSettings(ELO_MIN).randomMoveChance;
  assert.ok(a > 0 && a < b && b < c && c <= 0.85);
  assert.equal(engineSettings(600).uciElo, SF_ELO_MIN);
});

test('above the limiter Stockfish runs unrestricted and thinks longer', () => {
  const lo = engineSettings(SF_ELO_MAX + 10);
  const hi = engineSettings(ELO_MAX);
  assert.equal(lo.limitStrength, false);
  assert.ok(hi.movetime > lo.movetime);
  assert.match(describeSettings(hi), /unrestricted/);
  assert.equal(tierName(ELO_MAX), 'Full strength');
});

test('fallback engine returns a legal move and finds mate in one', () => {
  const start = new Chess();
  const move = chooseMove(start.fen(), { depth: 2 });
  assert.ok(start.moves({ verbose: true }).some((m) => m.from + m.to === move));

  // Back-rank mate: Ra1-a8#.
  const mateFen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
  assert.equal(chooseMove(mateFen, { depth: 2 }), 'a1a8');
});
