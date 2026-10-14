// Maps the Elo slider to concrete engine settings. Pure and DOM-free so it can be unit tested.
//
// Stockfish's own strength limiter (UCI_LimitStrength + UCI_Elo) is calibrated between 1320 and 3190.
// Outside that window we have to be explicit about what we do instead:
//   below 1320  -> Stockfish at its 1320 floor, mixed with a growing share of random legal moves
//   above 3190  -> Stockfish with the limiter off; the extra Elo is bought with longer thinking time

export const ELO_MIN = 100;
export const ELO_MAX = 3500;
export const ELO_STEP = 10;
export const SF_ELO_MIN = 1320;
export const SF_ELO_MAX = 3190;

export const PRESETS = [
  { label: 'Novice', elo: 400 },
  { label: 'Club', elo: 1500 },
  { label: 'Master', elo: 2300 },
  { label: 'Grandmaster', elo: 2700 },
  { label: 'Full strength', elo: ELO_MAX },
];

export function clampElo(elo) {
  const n = Math.round(Number(elo) / ELO_STEP) * ELO_STEP;
  if (!Number.isFinite(n)) return 1500;
  return Math.min(ELO_MAX, Math.max(ELO_MIN, n));
}

export function tierName(elo) {
  elo = clampElo(elo);
  if (elo >= ELO_MAX) return 'Full strength';
  if (elo > SF_ELO_MAX) return 'Engine';
  if (elo >= 2700) return 'Super grandmaster';
  if (elo >= 2500) return 'Grandmaster';
  if (elo >= 2200) return 'Master';
  if (elo >= 1800) return 'Expert';
  if (elo >= 1400) return 'Club player';
  if (elo >= 1000) return 'Casual';
  if (elo >= 600) return 'Beginner';
  return 'Novice';
}

export function engineSettings(elo) {
  elo = clampElo(elo);
  if (elo > SF_ELO_MAX) {
    const t = (elo - SF_ELO_MAX) / (ELO_MAX - SF_ELO_MAX);
    return {
      elo,
      limitStrength: false,
      uciElo: null,
      movetime: Math.round(800 * Math.pow(7.5, t)), // 0.8 s at 3200 up to 6 s at 3500
      randomMoveChance: 0,
    };
  }
  if (elo >= SF_ELO_MIN) {
    const t = (elo - SF_ELO_MIN) / (SF_ELO_MAX - SF_ELO_MIN);
    return { elo, limitStrength: true, uciElo: elo, movetime: Math.round(350 + t * 550), randomMoveChance: 0 };
  }
  const t = (SF_ELO_MIN - elo) / (SF_ELO_MIN - ELO_MIN);
  return {
    elo,
    limitStrength: true,
    uciElo: SF_ELO_MIN,
    movetime: 250,
    randomMoveChance: Math.round(0.85 * Math.pow(t, 0.8) * 100) / 100,
  };
}

// Plain-language description of what the engine will actually do at this setting.
export function describeSettings(s) {
  if (!s.limitStrength) return `Stockfish 18 unrestricted, ${(s.movetime / 1000).toFixed(1)} s per move`;
  if (s.randomMoveChance > 0) {
    return `Stockfish at its ${SF_ELO_MIN} floor, ${Math.round(s.randomMoveChance * 100)}% random moves`;
  }
  return `Stockfish 18 limited to ${s.uciElo} Elo`;
}
