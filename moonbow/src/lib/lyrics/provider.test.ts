import { describe, expect, it } from 'vitest';
import { cleanArtist, cleanTitle, pickBest } from './provider';

describe('cleanTitle', () => {
  it.each([
    ['Song (Official Video)', 'Song'],
    ['Song [Official Music Video]', 'Song'],
    ['Song (feat. Someone)', 'Song'],
    ['Song ft. Someone Else', 'Song'],
    ['Song (Remastered 2011)', 'Song'],
    ['Song - Official Audio', 'Song'],
    ['Song (Live)', 'Song (Live)'],
  ])('%s → %s', (input, out) => expect(cleanTitle(input)).toBe(out));

  it('cleans artist channel suffixes', () => {
    expect(cleanArtist('Queen - Topic')).toBe('Queen');
    expect(cleanArtist('RickAstleyVEVO')).toBe('RickAstley');
  });
});

describe('pickBest', () => {
  const rec = (duration: number, synced: boolean) => ({
    trackName: 't', artistName: 'a', duration, instrumental: false, plainLyrics: 'p', syncedLyrics: synced ? '[00:01.00]x' : null,
  });
  it('prefers synced lyrics with a matching duration', () => {
    const best = pickBest([rec(200, false), rec(240, true), rec(201, true)], 200);
    expect(best?.duration).toBe(201);
  });
  it('rejects results whose duration is far off', () => {
    expect(pickBest([rec(300, true)], 200)).toBeUndefined();
  });
});
