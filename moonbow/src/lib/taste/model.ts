// The taste model. Everything here is pure data + functions so it can be unit
// tested and reasoned about; persistence and fetching live in store.svelte.ts.
//
// Scores decay exponentially (half-life HALF_LIFE_DAYS) so the model follows how
// your taste moves instead of being anchored to what you played a year ago.

import type { Track } from '../sources/types';

export const HALF_LIFE_DAYS = 45;
const DAY = 86_400_000;

// ---- context: when you listen ----

/** 0 late night (0–5h), 1 morning (5–12h), 2 afternoon (12–18h), 3 evening (18–24h); +4 on weekends. */
export function contextOf(d: Date): number {
  const h = d.getHours();
  const part = h < 5 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3;
  const weekend = d.getDay() === 0 || d.getDay() === 6 || (d.getDay() === 5 && h >= 18);
  return part + (weekend ? 4 : 0);
}

export const CONTEXT_NAMES = ['Late night', 'Morning', 'Afternoon', 'Evening'];
export const partOfDay = (ctx: number) => ctx % 4;

// ---- per-track and per-artist state ----

export interface Features {
  /** 0..1 loudness/density. */
  energy: number;
  /** 0..1 spectral centroid: dark/warm → bright/airy. */
  bright: number;
  /** 0..1 how busy the rhythm is (onsets per second, normalised). */
  pulse: number;
}

export interface TrackStat {
  track: Track;
  /** Decayed outcome score and when it was last updated (ms). */
  score: number;
  at: number;
  plays: number;
  completes: number;
  skips: number;
  /** Plays you started yourself (search, click), as opposed to autoplay. */
  chosen: number;
  first: number;
  last: number;
  lastComplete: number;
  listenSec: number;
  /** Positive listening weight per context bucket (8). */
  ctx: number[];
  /** Explicit "more/less like this". */
  fb: number;
  feat?: Features;
  /** Seeded from onboarding rather than listening. */
  seeded?: boolean;
}

export interface ArtistStat {
  name: string;
  id?: string;
  fb: number;
  muted?: boolean;
}

export interface TasteState {
  version: 1;
  tracks: Record<string, TrackStat>;
  artists: Record<string, ArtistStat>;
  /** How new-to-you plays went: Beta(α, β) of completes vs skips. */
  novelty: { hits: number; misses: number };
  /** User override for explore/familiar, 0..1; null = learn it. */
  exploreOverride: number | null;
  name: string;
  onboarded: boolean;
}

export const emptyState = (): TasteState => ({
  version: 1,
  tracks: {},
  artists: {},
  novelty: { hits: 2, misses: 2 },
  exploreOverride: null,
  name: '',
  onboarded: false,
});

export const artistKey = (t: Pick<Track, 'artists'>) => {
  const a = t.artists[0];
  return a ? (a.id ?? `name:${a.name.toLowerCase()}`) : 'unknown';
};

export function decayed(score: number, at: number, now: number): number {
  return score * 2 ** (-(now - at) / (HALF_LIFE_DAYS * DAY));
}

function stat(s: TasteState, t: Track, now: number): TrackStat {
  let st = s.tracks[t.id];
  if (!st) {
    st = s.tracks[t.id] = {
      track: t, score: 0, at: now, plays: 0, completes: 0, skips: 0, chosen: 0,
      first: now, last: 0, lastComplete: 0, listenSec: 0, ctx: new Array(8).fill(0), fb: 0,
    };
  } else if (!st.track.art && t.art) st.track = t;
  const key = artistKey(t);
  if (!s.artists[key]) s.artists[key] = { name: t.artists[0]?.name ?? 'Unknown', id: t.artists[0]?.id, fb: 0 };
  return st;
}

function bump(st: TrackStat, delta: number, now: number) {
  st.score = decayed(st.score, st.at, now) + delta;
  st.at = now;
}

// ---- recording what happened ----

export type Outcome = 'complete' | 'partial' | 'skip' | 'early-skip';

/** Classifies a finished listen. `ended` = the song ran out on its own. */
export function classify(listened: number, duration: number, ended: boolean): Outcome {
  if (ended || (duration > 0 && listened / duration >= 0.8)) return 'complete';
  if (listened < 10) return 'early-skip';
  if (duration > 0 && listened / duration < 0.3) return 'skip';
  return 'partial';
}

const OUTCOME_DELTA: Record<Outcome, number> = { complete: 1, partial: 0.35, skip: -0.8, 'early-skip': -1.3 };

export interface Listen {
  track: Track;
  listened: number;
  duration: number;
  ended: boolean;
  /** You picked it (vs. autoplay/queue). */
  chosen: boolean;
  at: Date;
  feat?: Features;
}

export function recordListen(s: TasteState, l: Listen): Outcome {
  const now = l.at.getTime();
  const st = stat(s, l.track, now);
  const outcome = classify(l.listened, l.duration, l.ended);
  const isNew = st.plays === 0 && !st.seeded;
  const replay = l.chosen && st.lastComplete > 0 && now - st.lastComplete < 3 * DAY;

  let delta = OUTCOME_DELTA[outcome];
  // Skipping something you deliberately picked says less about the song than skipping autoplay.
  if (delta < 0 && l.chosen) delta *= 0.5;
  if (l.chosen) delta += 0.4;
  if (replay) delta += 1.2;
  bump(st, delta, now);

  st.plays++;
  if (l.chosen) st.chosen++;
  if (outcome === 'complete') {
    st.completes++;
    st.lastComplete = now;
  }
  if (outcome === 'skip' || outcome === 'early-skip') st.skips++;
  st.last = now;
  st.listenSec += l.listened;
  if (delta > 0) st.ctx[contextOf(l.at)] += Math.min(1, l.listened / Math.max(60, l.duration || 180));

  if (l.feat && l.listened >= 20) {
    st.feat = st.feat
      ? { energy: (st.feat.energy + l.feat.energy) / 2, bright: (st.feat.bright + l.feat.bright) / 2, pulse: (st.feat.pulse + l.feat.pulse) / 2 }
      : l.feat;
  }

  // How you treat songs you've never heard teaches the model how adventurous to be.
  if (isNew && !l.chosen) {
    if (outcome === 'complete' || outcome === 'partial') s.novelty.hits++;
    else s.novelty.misses++;
  }
  return outcome;
}

export function recordLike(s: TasteState, t: Track, liked: boolean, now = Date.now()) {
  bump(stat(s, t, now), liked ? 2.5 : -1, now);
}

export function recordFeedback(s: TasteState, t: Track, dir: 'more' | 'less', now = Date.now()) {
  const st = stat(s, t, now);
  st.fb += dir === 'more' ? 1 : -1;
  bump(st, dir === 'more' ? 1.5 : -2.5, now);
  s.artists[artistKey(t)].fb += dir === 'more' ? 0.5 : -0.75;
}

export function recordAddedToPlaylist(s: TasteState, t: Track, now = Date.now()) {
  bump(stat(s, t, now), 1.2, now);
}

export function setMuted(s: TasteState, key: string, muted: boolean) {
  if (s.artists[key]) s.artists[key].muted = muted;
}

/** Onboarding: an artist you said you love, with a few of their tracks. */
export function seedArtist(s: TasteState, tracks: Track[], now = Date.now()) {
  tracks.forEach((t, i) => {
    const st = stat(s, t, now);
    st.seeded = true;
    bump(st, 2 - i * 0.25, now);
  });
  if (tracks[0]) s.artists[artistKey(tracks[0])].fb += 2;
}

// ---- reading the model ----

export function trackAffinity(st: TrackStat | undefined, now: number): number {
  if (!st) return 0;
  return Math.tanh((decayed(st.score, st.at, now) + st.fb) / 3);
}

/** −1..1 per artist, or −Infinity when muted. */
export function artistAffinities(s: TasteState, now: number): Map<string, number> {
  const raw = new Map<string, number>();
  for (const st of Object.values(s.tracks)) {
    const k = artistKey(st.track);
    raw.set(k, (raw.get(k) ?? 0) + decayed(st.score, st.at, now));
  }
  const out = new Map<string, number>();
  for (const [k, a] of Object.entries(s.artists)) {
    out.set(k, a.muted ? -Infinity : Math.tanh(((raw.get(k) ?? 0) + a.fb * 2) / 5));
  }
  return out;
}

/** Listening weight per context for each artist, smoothed; ratio > 1 means "more than usual right now". */
export function contextBoost(s: TasteState, ctx: number): Map<string, number> {
  const per = new Map<string, number[]>();
  for (const st of Object.values(s.tracks)) {
    const k = artistKey(st.track);
    const v = per.get(k) ?? new Array(8).fill(0);
    st.ctx.forEach((x, i) => (v[i] += x));
    per.set(k, v);
  }
  const out = new Map<string, number>();
  for (const [k, v] of per) {
    // Weekday/weekend share the same part of day as a softer signal.
    const sum = v.reduce((a, b) => a + b, 0);
    const here = v[ctx] + 0.5 * v[(ctx + 4) % 8];
    out.set(k, (here + 0.5) / ((sum * 1.5) / 8 + 0.5));
  }
  return out;
}

/** 0..1: how adventurous recommendations should be. */
export function explore(s: TasteState): number {
  if (s.exploreOverride != null) return s.exploreOverride;
  const { hits, misses } = s.novelty;
  return Math.max(0.1, Math.min(0.9, hits / (hits + misses)));
}

/** Sound you favour in this part of the day, learned from tracks you finish. */
export function preferredFeatures(s: TasteState, ctx: number, now: number): Features | null {
  let w = 0;
  const acc = { energy: 0, bright: 0, pulse: 0 };
  for (const st of Object.values(s.tracks)) {
    if (!st.feat) continue;
    const aff = trackAffinity(st, now);
    if (aff <= 0) continue;
    const weight = aff * (1 + st.ctx[ctx] + 0.5 * st.ctx[(ctx + 4) % 8]);
    acc.energy += st.feat.energy * weight;
    acc.bright += st.feat.bright * weight;
    acc.pulse += st.feat.pulse * weight;
    w += weight;
  }
  return w > 0 ? { energy: acc.energy / w, bright: acc.bright / w, pulse: acc.pulse / w } : null;
}

export function featureMatch(a: Features | undefined, b: Features | null): number {
  if (!a || !b) return 0;
  const d = Math.hypot(a.energy - b.energy, a.bright - b.bright, (a.pulse - b.pulse) * 0.7);
  return 1 - Math.min(1, d / 0.6);
}
