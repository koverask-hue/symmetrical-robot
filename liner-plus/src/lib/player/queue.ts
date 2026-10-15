// Pure queue operations, kept free of Svelte/DOM so they can be unit tested.

import type { Track } from '../sources/types';

export type Repeat = 'off' | 'all' | 'one';

export interface QueueState {
  tracks: Track[];
  index: number;
}

/** Index to play after the current track ends naturally; -1 to stop. */
export function nextIndex(q: QueueState, repeat: Repeat, manual: boolean): number {
  if (!q.tracks.length) return -1;
  if (repeat === 'one' && !manual) return q.index;
  if (q.index + 1 < q.tracks.length) return q.index + 1;
  return repeat === 'all' ? 0 : -1;
}

export function prevIndex(q: QueueState, repeat: Repeat): number {
  if (q.index > 0) return q.index - 1;
  return repeat === 'all' && q.tracks.length ? q.tracks.length - 1 : 0;
}

/** Fisher–Yates over everything after the current track. Deterministic when given a random source. */
export function shuffleUpcoming<T>(items: T[], from: number, rand: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > from + 1; i--) {
    const j = from + 1 + Math.floor(rand() * (i - from));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Appends radio tracks that are not already queued. */
export function appendUnique(queue: Track[], more: Track[]): Track[] {
  const seen = new Set(queue.map((t) => t.id));
  const add = more.filter((t) => !seen.has(t.id) && seen.add(t.id));
  return add.length ? [...queue, ...add] : queue;
}

export function move<T>(items: T[], from: number, to: number): T[] {
  const out = items.slice();
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return out;
}

/** Where the current track ends up after moving another item. */
export function indexAfterMove(current: number, from: number, to: number): number {
  if (from === current) return to;
  if (from < current && to >= current) return current - 1;
  if (from > current && to <= current) return current + 1;
  return current;
}
