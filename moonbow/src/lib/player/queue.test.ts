import { describe, expect, it } from 'vitest';
import type { Track } from '../sources/types';
import { appendUnique, indexAfterMove, move, nextIndex, prevIndex, shuffleUpcoming } from './queue';

const t = (id: string): Track => ({ id, title: id, artists: [], duration: 0 });
const q = (n: number, index: number) => ({ tracks: Array.from({ length: n }, (_, i) => t(String(i))), index });

describe('queue', () => {
  it('advances, wraps and stops per repeat mode', () => {
    expect(nextIndex(q(3, 0), 'off', false)).toBe(1);
    expect(nextIndex(q(3, 2), 'off', false)).toBe(-1);
    expect(nextIndex(q(3, 2), 'all', false)).toBe(0);
    expect(nextIndex(q(3, 1), 'one', false)).toBe(1);
    expect(nextIndex(q(3, 1), 'one', true)).toBe(2);
    expect(nextIndex(q(0, -1), 'all', false)).toBe(-1);
  });

  it('goes back', () => {
    expect(prevIndex(q(3, 2), 'off')).toBe(1);
    expect(prevIndex(q(3, 0), 'off')).toBe(0);
    expect(prevIndex(q(3, 0), 'all')).toBe(2);
  });

  it('shuffles only upcoming items and keeps all of them', () => {
    const items = [0, 1, 2, 3, 4, 5, 6];
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const s = shuffleUpcoming(items, 2, rand);
    expect(s.slice(0, 3)).toEqual([0, 1, 2]);
    expect([...s].sort()).toEqual(items);
    expect(s).not.toEqual(items);
  });

  it('appends radio tracks without duplicates', () => {
    const out = appendUnique([t('a'), t('b')], [t('b'), t('c'), t('c'), t('d')]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('moves items and tracks the current index', () => {
    expect(move([0, 1, 2, 3], 0, 2)).toEqual([1, 2, 0, 3]);
    expect(indexAfterMove(2, 2, 0)).toBe(0);
    expect(indexAfterMove(2, 0, 3)).toBe(1);
    expect(indexAfterMove(2, 3, 0)).toBe(3);
    expect(indexAfterMove(2, 3, 4)).toBe(2);
  });
});
