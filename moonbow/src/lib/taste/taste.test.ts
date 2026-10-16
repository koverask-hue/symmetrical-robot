import { describe, expect, it } from 'vitest';
import type { Track } from '../sources/types';
import { FeatureMeter } from './features';
import { addRadio, artistGraph, clusterArtists, emptyGraph, personalizedPageRank } from './graph';
import {
  artistAffinities, classify, contextBoost, contextOf, emptyState, explore, recordFeedback, recordListen, seedArtist,
  setMuted, trackAffinity,
} from './model';
import { diversify, flow, freshFinds, insights, personalLine, rightNow, worlds } from './recommend';

const T = (id: string, artist: string): Track => ({ id, title: `Song ${id}`, artists: [{ id: artist, name: artist.toUpperCase() }], duration: 200 });
const NIGHT = new Date(2026, 9, 14, 23, 30); // Wednesday 23:30
const MORNING = new Date(2026, 9, 14, 8, 0);
const listen = (s: ReturnType<typeof emptyState>, t: Track, listened: number, at: Date, chosen = false) =>
  recordListen(s, { track: t, listened, duration: t.duration, ended: listened >= t.duration, chosen, at });

describe('model', () => {
  it('maps time to listening contexts', () => {
    expect(contextOf(NIGHT)).toBe(3);
    expect(contextOf(MORNING)).toBe(1);
    expect(contextOf(new Date(2026, 9, 18, 2, 0))).toBe(4); // Sunday 2am
  });

  it('classifies listens', () => {
    expect(classify(5, 200, false)).toBe('early-skip');
    expect(classify(40, 200, false)).toBe('skip');
    expect(classify(100, 200, false)).toBe('partial');
    expect(classify(170, 200, false)).toBe('complete');
    expect(classify(30, 200, true)).toBe('complete');
  });

  it('learns from completes, skips and replays', () => {
    const s = emptyState();
    const a = T('a', 'x');
    const b = T('b', 'y');
    listen(s, a, 200, NIGHT);
    listen(s, b, 4, NIGHT);
    const now = NIGHT.getTime();
    expect(trackAffinity(s.tracks.a, now)).toBeGreaterThan(0);
    expect(trackAffinity(s.tracks.b, now)).toBeLessThan(0);
    const before = trackAffinity(s.tracks.a, now);
    listen(s, a, 200, new Date(now + 3600_000), true); // chose it again within 3 days
    expect(trackAffinity(s.tracks.a, now + 3600_000)).toBeGreaterThan(before);
  });

  it('forgets slowly (decay) and tracks novelty appetite', () => {
    const s = emptyState();
    listen(s, T('a', 'x'), 200, NIGHT);
    const later = NIGHT.getTime() + 90 * 86_400_000;
    expect(trackAffinity(s.tracks.a, later)).toBeLessThan(trackAffinity(s.tracks.a, NIGHT.getTime()) / 2);
    const s2 = emptyState();
    for (let i = 0; i < 10; i++) listen(s2, T(`n${i}`, `z${i}`), 3, NIGHT);
    expect(explore(s2)).toBeLessThan(0.35);
    s2.exploreOverride = 0.8;
    expect(explore(s2)).toBe(0.8);
  });

  it('learns when you play an artist', () => {
    const s = emptyState();
    for (let i = 0; i < 4; i++) listen(s, T(`n${i}`, 'night'), 200, NIGHT);
    for (let i = 0; i < 4; i++) listen(s, T(`m${i}`, 'morning'), 200, MORNING);
    const atNight = contextBoost(s, contextOf(NIGHT));
    expect(atNight.get('night')!).toBeGreaterThan(atNight.get('morning')!);
  });

  it('honours feedback and mutes', () => {
    const s = emptyState();
    const t = T('a', 'x');
    listen(s, t, 200, NIGHT);
    recordFeedback(s, t, 'less', NIGHT.getTime());
    expect(trackAffinity(s.tracks.a, NIGHT.getTime())).toBeLessThan(0);
    setMuted(s, 'x', true);
    expect(artistAffinities(s, NIGHT.getTime()).get('x')).toBe(-Infinity);
  });
});

describe('graph', () => {
  it('ranks neighbours of seeds with personalised PageRank', () => {
    const g = emptyGraph();
    addRadio(g, T('s', 'a'), [T('n1', 'b'), T('n2', 'c'), T('n3', 'd')]);
    addRadio(g, T('far', 'z'), [T('f1', 'y')]);
    const r = personalizedPageRank(g, new Map([['s', 1]]));
    expect(r.get('n1')!).toBeGreaterThan(r.get('n3')!);
    expect(r.get('f1') ?? 0).toBe(0);
  });

  it('clusters artists into worlds', () => {
    const g = emptyGraph();
    addRadio(g, T('a1', 'a'), [T('b1', 'b'), T('b2', 'b')]);
    addRadio(g, T('b3', 'b'), [T('a2', 'a')]);
    addRadio(g, T('x1', 'x'), [T('y1', 'y'), T('y2', 'y')]);
    const cl = clusterArtists(artistGraph(g), ['a', 'b', 'x', 'y']).map((c) => c.sort().join()).sort();
    expect(cl).toEqual(['a,b', 'x,y']);
  });
});

describe('recommend', () => {
  function world() {
    const s = emptyState();
    const g = emptyGraph();
    const a = [T('a1', 'a'), T('a2', 'a'), T('a3', 'a')];
    const b = [T('b1', 'b'), T('b2', 'b')];
    const c = [T('c1', 'c'), T('c2', 'c')];
    const d = [T('d1', 'd'), T('d2', 'd')];
    for (const t of [...a, ...b]) listen(s, t, 200, NIGHT, true);
    for (const t of c) listen(s, t, 200, MORNING, true);
    listen(s, T('z1', 'z'), 3, NIGHT);
    addRadio(g, a[0], [b[0], T('new1', 'e'), T('new2', 'e'), a[1], T('z1', 'z')]);
    addRadio(g, b[0], [a[2], T('new3', 'f'), b[1]]);
    addRadio(g, c[0], [d[0], d[1], c[1], T('new4', 'g')]);
    addRadio(g, d[0], [c[1], T('new5', 'g')]);
    return { s, g, c: { now: NIGHT.getTime() + 6 * 3600_000, ctx: contextOf(NIGHT) } };
  }

  it('builds a right-now mix with reasons, without skipped artists dominating', () => {
    const { s, g, c } = world();
    const mix = rightNow(s, g, c)!;
    expect(mix).toBeTruthy();
    expect(mix.tracks.length).toBeGreaterThanOrEqual(5);
    expect(mix.tracks.every((t) => mix.reasons[t.id])).toBe(true);
    expect(mix.tracks.findIndex((t) => t.id === 'z1')).toBe(-1);
    // Night favourites come before morning ones at night.
    const pos = (artist: string) => mix.tracks.findIndex((t) => t.artists[0].id === artist);
    expect(pos('a')).toBeLessThan(pos('c') < 0 ? 99 : pos('c'));
  });

  it('fresh finds are only new songs and explain themselves', () => {
    const { s, g, c } = world();
    const f = freshFinds(s, g, c);
    expect(f).toBeTruthy();
    expect(f!.tracks.every((t) => !s.tracks[t.id])).toBe(true);
    expect(Object.values(f!.reasons).some((r) => r.startsWith('New to you'))).toBe(true);
  });

  it('finds separate worlds', () => {
    const { s, g, c } = world();
    const w = worlds(s, g, c);
    expect(w.length).toBe(2);
    expect(new Set(w.map((m) => m.id)).size).toBe(2);
  });

  it('flow stays next to the current song and avoids what you skipped', () => {
    const { s, g, c } = world();
    // c1 (morning artist C) is a favourite but lives in another corner of the graph.
    const next = flow(s, g, c, s.tracks.a1.track, { recent: [s.tracks.b1.track], skipped: [T('new1', 'e')], steer: 'similar' }, 4);
    const ids = next.map((x) => x.track.id);
    expect(ids).not.toContain('a1');
    expect(ids).not.toContain('b1');
    expect(ids.some((id) => id.startsWith('c') || id.startsWith('d'))).toBe(false);
    expect(next.findIndex((x) => x.track.artists[0].id === 'e')).toBe(-1);
    expect(next.every((x) => x.reason.length > 0)).toBe(true);
  });

  it('flow steers: discover is all new, favorites all heard, artist leans on the artist', () => {
    const { s, g, c } = world();
    const base = { recent: [], skipped: [] };
    const disc = flow(s, g, c, s.tracks.a1.track, { ...base, steer: 'discover' }, 5);
    expect(disc.length).toBeGreaterThan(0);
    expect(disc.every((x) => !s.tracks[x.track.id] || s.tracks[x.track.id].plays === 0)).toBe(true);
    const fav = flow(s, g, c, s.tracks.a1.track, { ...base, steer: 'favorites' }, 5);
    expect(fav.every((x) => s.tracks[x.track.id]?.plays > 0)).toBe(true);
    const art = flow(s, g, c, s.tracks.a1.track, { ...base, steer: 'artist' }, 5);
    expect(art[0].track.artists[0].id).toBe('a');
  });

  it('spreads artists out', () => {
    const items = ['a', 'a', 'a', 'a', 'b', 'c'].map((ar, i) => ({ track: T(`t${i}`, ar), score: 1 - i * 0.01, reason: '' }));
    const out = diversify(items, 6, 2).map((x) => x.track.artists[0].id);
    expect(out.filter((x) => x === 'a').length).toBe(2);
    expect(out[0]).not.toBe(out[1]);
  });

  it('writes personal lines and insights', () => {
    const { s, c } = world();
    expect(personalLine(emptyState(), c)).toMatch(/learning/);
    expect(personalLine(s, c)).toMatch(/A|B|C/);
    expect(Array.isArray(insights(s, c.now))).toBe(true);
  });

  it('seeds from onboarding', () => {
    const s = emptyState();
    seedArtist(s, [T('a1', 'a'), T('a2', 'a')]);
    expect(trackAffinity(s.tracks.a1, Date.now())).toBeGreaterThan(0.3);
    expect(s.tracks.a1.plays).toBe(0);
  });
});

describe('FeatureMeter', () => {
  it('measures loud-bright-busy vs quiet-dark-calm', () => {
    const loud = new FeatureMeter();
    const calm = new FeatureMeter();
    for (let f = 0; f < 400; f++) {
      const hit = f % 6 === 0;
      loud.add(Uint8Array.from({ length: 128 }, (_, i) => (hit ? 230 : 120) - (i < 64 ? 0 : 20)), 0.05);
      calm.add(Uint8Array.from({ length: 128 }, (_, i) => (i < 16 ? 90 : 4)), 0.05);
    }
    const L = loud.result()!;
    const C = calm.result()!;
    expect(L.energy).toBeGreaterThan(C.energy);
    expect(L.bright).toBeGreaterThan(C.bright);
    expect(L.pulse).toBeGreaterThan(C.pulse);
    expect(new FeatureMeter().result()).toBeNull();
  });
});
