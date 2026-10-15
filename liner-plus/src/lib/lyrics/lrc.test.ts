import { describe, expect, it } from 'vitest';
import { estimateWords, lineAt, parseLrc, splitWords, syllables, wordProgress, INTERLUDE_GAP } from './lrc';

describe('parseLrc', () => {
  it('parses plain LRC, skips metadata and estimates word timing', () => {
    const l = parseLrc('[ar:Someone]\n[ti:Song]\n[00:01.00]Hello there world\n[00:04.50]Second line', 'test', 10)!;
    expect(l.timing).toBe('estimated');
    expect(l.lines.map((x) => x.text)).toEqual(['Hello there world', 'Second line']);
    const [a] = l.lines;
    expect(a.start).toBe(1);
    expect(a.words.map((w) => w.text)).toEqual(['Hello ', 'there ', 'world']);
    // words are contiguous and finish before the next line starts
    expect(a.words[0].start).toBe(1);
    for (let i = 1; i < a.words.length; i++) expect(a.words[i].start).toBeCloseTo(a.words[i - 1].end);
    expect(a.end).toBeLessThan(4.5);
    expect(a.end).toBeGreaterThan(1 + 3.5 * 0.5);
  });

  it('expands repeated timestamps and sorts', () => {
    const l = parseLrc('[00:10.00][00:02.00]Chorus\n[00:05.00]Verse', 't', 20)!;
    expect(l.lines.filter((x) => !x.interlude).map((x) => [x.start, x.text])).toEqual([
      [2, 'Chorus'],
      [5, 'Verse'],
      [10, 'Chorus'],
    ]);
  });

  it('reads enhanced LRC word tags as exact timing', () => {
    const l = parseLrc('[00:01.00]<00:01.00>Never <00:01.40>gonna <00:02.10>give\n[00:05.00]x', 't', 8)!;
    expect(l.timing).toBe('exact');
    const w = l.lines[0].words;
    expect(w.map((x) => [x.text.trim(), x.start])).toEqual([['Never', 1], ['gonna', 1.4], ['give', 2.1]]);
    expect(w[0].end).toBe(1.4);
    expect(w[2].end).toBeGreaterThan(2.1);
    expect(w[2].end).toBeLessThanOrEqual(5);
  });

  it('applies the [offset] tag (positive offset = lyrics earlier)', () => {
    const l = parseLrc('[offset:+500]\n[00:02.00]Line', 't', 5)!;
    expect(l.lines[0].start).toBeCloseTo(1.5);
  });

  it('inserts intro and long-gap interludes', () => {
    const l = parseLrc(`[00:10.00]First\n[00:12.00]Second\n[00:40.00]Third`, 't', 60)!;
    expect(l.lines[0]).toMatchObject({ interlude: true, start: 0, end: 10 });
    const idx = l.lines.findIndex((x) => x.text === 'Second');
    expect(l.lines[idx + 1].interlude).toBe(true);
    expect(l.lines[idx + 1].end).toBe(40);
    expect(l.lines[idx + 1].end - l.lines[idx + 1].start).toBeGreaterThan(INTERLUDE_GAP);
  });

  it('turns explicit empty lines into interludes', () => {
    const l = parseLrc('[00:01.00]A\n[00:03.00]\n[00:20.00]B', 't', 30)!;
    expect(l.lines.map((x) => x.interlude ?? false)).toEqual([false, true, false]);
  });

  it('returns null for text without timestamps', () => {
    expect(parseLrc('just words\nno times')).toBeNull();
  });
});

describe('word helpers', () => {
  it('splits CJK per character and latin per word', () => {
    expect(splitWords('君の名は')).toEqual(['君', 'の', '名', 'は']);
    expect(splitWords('I love 東京')).toEqual(['I ', 'love ', '東', '京']);
    expect(splitWords('hello  world')).toEqual(['hello  ', 'world']);
  });

  it('counts syllables roughly', () => {
    expect(syllables('a')).toBe(1);
    expect(syllables('beautiful')).toBe(3);
    expect(syllables('привет')).toBe(2);
    expect(syllables('사랑해')).toBe(3);
    expect(syllables('rhythm')).toBe(1);
  });

  it('weights longer words with more time', () => {
    const w = estimateWords('I beautiful', 0, 4);
    expect(w[1].end - w[1].start).toBeGreaterThan(w[0].end - w[0].start);
  });

  it('finds the active line by binary search', () => {
    const l = parseLrc('[00:01.00]a\n[00:02.00]b\n[00:03.00]c', 't', 4)!.lines;
    expect(lineAt(l, 0.5)).toBe(-1);
    expect(lineAt(l, 1)).toBe(0);
    expect(lineAt(l, 2.5)).toBe(1);
    expect(lineAt(l, 99)).toBe(2);
  });

  it('computes word fill', () => {
    const w = { text: 'x', start: 1, end: 2 };
    expect(wordProgress(w, 0)).toBe(0);
    expect(wordProgress(w, 1.5)).toBe(0.5);
    expect(wordProgress(w, 3)).toBe(1);
  });
});
