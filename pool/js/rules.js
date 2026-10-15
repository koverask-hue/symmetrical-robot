// 8-ball rules, simplified from the WPA rules for casual play (no called pockets). Pure, so it is
// shared by the page, the AI worker and the tests.

export const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
export const STRIPES = [9, 10, 11, 12, 13, 14, 15];

export function groupOf(id) {
  if (id === 0) return 'cue';
  if (id === 8) return 'eight';
  return id < 8 ? 'solids' : 'stripes';
}

export function newGame(breaker = 0) {
  return {
    turn: breaker,
    groups: [null, null], // 'solids' | 'stripes' per player
    breakShot: true,
    ballInHand: 'kitchen', // null | 'kitchen' | 'anywhere'
    winner: null,
    over: false,
    lastFoul: null,
    message: 'Break',
  };
}

function remaining(group, onTable) {
  const ids = group === 'solids' ? SOLIDS : STRIPES;
  return ids.filter((id) => onTable.has(id));
}

// Which balls the shooter may hit first.
export function legalTargets(game, onTable) {
  if (game.breakShot) return [...onTable].filter((id) => id !== 0);
  const g = game.groups[game.turn];
  if (!g) return [...onTable].filter((id) => id !== 0 && id !== 8);
  const mine = remaining(g, onTable);
  return mine.length ? mine : [8];
}

export function onTableSet(balls) {
  return new Set(balls.filter((b) => b.on).map((b) => b.id));
}

// Judge a finished shot.
//   before: set of ball ids on the table before the shot
//   events: physics events from the shot (in time order)
// Returns the next game state plus a description of what happened.
export function judge(game, before, events) {
  const p = game.turn;
  const opp = 1 - p;
  const next = { ...game, groups: [...game.groups], lastFoul: null };
  let firstHit = null;
  let railAfterContact = false;
  const pocketed = [];
  const offTable = [];
  for (const e of events) {
    if (e.type === 'offtable') {
      offTable.push(e.ball);
      continue;
    }
    if (e.type === 'ball' && firstHit === null && (e.a === 0 || e.b === 0)) firstHit = e.a === 0 ? e.b : e.a;
    else if ((e.type === 'rail' || e.type === 'jaw') && firstHit !== null) railAfterContact = true;
    else if (e.type === 'pocket') {
      pocketed.push(e.ball);
      if (firstHit !== null) railAfterContact = true; // a pocketed ball counts as reaching a rail
    }
  }
  const scratch = pocketed.includes(0);
  const cueOff = offTable.includes(0);
  const objects = pocketed.filter((id) => id !== 0);
  const eight = objects.includes(8);
  const legal = legalTargets(game, before);

  let foul = null;
  if (scratch) foul = 'Scratch';
  else if (cueOff) foul = 'Cue ball jumped off the table';
  else if (offTable.length) foul = 'Ball jumped off the table';
  else if (firstHit === null) foul = 'No ball hit';
  else if (!legal.includes(firstHit)) foul = 'Wrong ball hit first';
  else if (!game.breakShot && !objects.length && !railAfterContact) foul = 'No rail after contact';

  // Object balls that leave the table are spotted (all but the 8, which loses the game).
  const result = { foul, pocketed: objects, scratch: scratch || cueOff, firstHit, respotEight: false, assigned: null, respot: offTable.filter((id) => id !== 0 && id !== 8) };
  if (offTable.includes(8) && !game.breakShot) {
    next.over = true;
    next.winner = opp;
    next.message = 'The 8 jumped off the table';
    next.ballInHand = null;
    next.breakShot = false;
    return { game: next, result };
  }
  if (offTable.includes(8)) result.respotEight = true;
  next.breakShot = false;

  // The 8-ball
  if (eight) {
    if (game.breakShot) {
      result.respotEight = true; // 8 on the break is spotted and play goes on
    } else {
      const myGroup = game.groups[p];
      const clearedBefore = myGroup && remaining(myGroup, before).length === 0;
      next.over = true;
      if (clearedBefore && !foul) {
        next.winner = p;
        next.message = 'Pocketed the 8';
      } else {
        next.winner = opp;
        next.message = foul ? `Pocketed the 8 on a foul (${foul.toLowerCase()})` : 'Pocketed the 8 too early';
      }
      next.ballInHand = null;
      result.foul = foul;
      return { game: next, result };
    }
  }

  // Group assignment: the first legally pocketed ball after the break decides.
  if (!game.breakShot && !game.groups[p] && !foul) {
    const first = objects.find((id) => id !== 8);
    if (first !== undefined) {
      const g = groupOf(first);
      next.groups[p] = g;
      next.groups[opp] = g === 'solids' ? 'stripes' : 'solids';
      result.assigned = g;
    }
  }

  let keepTurn;
  if (foul) keepTurn = false;
  else if (game.breakShot) keepTurn = objects.some((id) => id !== 8);
  else {
    const g = next.groups[p];
    keepTurn = g ? objects.some((id) => groupOf(id) === g) : false;
  }

  if (foul) {
    next.turn = opp;
    next.ballInHand = game.breakShot && scratch ? 'kitchen' : 'anywhere';
    next.lastFoul = foul;
    next.message = `Foul: ${foul.toLowerCase()}`;
  } else {
    next.ballInHand = null;
    next.turn = keepTurn ? p : opp;
    next.message = keepTurn ? 'Shoot again' : objects.length ? 'No ball of your group' : 'Miss';
  }
  return { game: next, result };
}
