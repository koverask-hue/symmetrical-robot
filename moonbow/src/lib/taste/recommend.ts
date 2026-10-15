// Ranking and mixes. Candidates come from the song graph (YouTube's crowd signal)
// and your own history; the score is personal: your artist affinities, what you
// play at this time of day, the sound you favour, how adventurous you are, and
// what you've had enough of lately. Every pick carries a human-readable reason.

import { artistLine, type Track } from '../sources/types';
import { artistGraph, clusterArtists, personalizedPageRank, strongestLink, type SongGraph } from './graph';
import {
  artistAffinities, artistKey, CONTEXT_NAMES, contextBoost, decayed, explore, featureMatch, partOfDay,
  preferredFeatures, trackAffinity, type TasteState,
} from './model';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type MixKind = 'now' | 'world' | 'fresh' | 'rotation' | 'repeat' | 'flow';

export interface Mix {
  id: string;
  kind: MixKind;
  title: string;
  subtitle: string;
  tracks: Track[];
  reasons: Record<string, string>;
  /** Stable hue for the mix's artwork. */
  hue: number;
}

export interface Ctx {
  now: number;
  ctx: number;
}

interface Scored {
  track: Track;
  score: number;
  reason: string;
}

const WHEN = ['late at night', 'in the morning', 'in the afternoon', 'in the evening'];

export function hueOf(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

/** Your strongest tracks for this moment: affinity weighted by when you play them. */
export function topSeeds(s: TasteState, c: Ctx, n = 6, filter?: (t: Track) => boolean): Map<string, number> {
  const boost = contextBoost(s, c.ctx);
  const arts = artistAffinities(s, c.now);
  const scored = Object.values(s.tracks)
    .filter((st) => !filter || filter(st.track))
    .map((st) => {
      const k = artistKey(st.track);
      if (arts.get(k) === -Infinity) return [st.track.id, -1] as const;
      const aff = trackAffinity(st, c.now);
      return [st.track.id, aff * Math.min(2, boost.get(k) ?? 1)] as const;
    })
    .filter(([, v]) => v > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
  return new Map(scored);
}

interface RankOpts {
  seeds: Map<string, number>;
  onlyNew?: boolean;
  /** Extra weight for these artists (a world). */
  favour?: Set<string>;
  /** Exclude recently played harder (used by flow / autoplay). */
  freshness?: number;
  /** Session steering: artists you just skipped. */
  avoid?: Set<string>;
}

export function rank(s: TasteState, g: SongGraph, c: Ctx, o: RankOpts): Scored[] {
  const ppr = personalizedPageRank(g, o.seeds);
  const maxPpr = Math.max(1e-9, ...ppr.values());
  const arts = artistAffinities(s, c.now);
  const boost = contextBoost(s, c.ctx);
  const pref = preferredFeatures(s, c.ctx, c.now);
  const adventurous = explore(s);
  const seedIds = [...o.seeds.keys()];

  const pool = new Map<string, Track>();
  for (const id of ppr.keys()) if (g.nodes[id]) pool.set(id, g.nodes[id]);
  if (!o.onlyNew) for (const id of seedIds) if (s.tracks[id]) pool.set(id, s.tracks[id].track);
  if (!o.onlyNew) for (const st of Object.values(s.tracks)) if (trackAffinity(st, c.now) > 0.4) pool.set(st.track.id, st.track);

  const out: Scored[] = [];
  for (const [id, track] of pool) {
    const st = s.tracks[id];
    const k = artistKey(track);
    const aAff = arts.get(k) ?? 0;
    if (aAff === -Infinity) continue;
    const tAff = trackAffinity(st, c.now);
    if (tAff < -0.35) continue;
    const played = !!st && st.plays > 0;
    if (o.onlyNew && (played || st?.seeded)) continue;

    const p = (ppr.get(id) ?? 0) / maxPpr;
    const ctxB = Math.max(-1, Math.min(1, Math.log(boost.get(k) ?? 1)));
    const fm = featureMatch(st?.feat, pref);
    let score = 0.42 * Math.sqrt(p) + 0.22 * aAff + 0.12 * ctxB + 0.1 * fm;
    score += played || st?.seeded ? 0.28 * (1 - adventurous) * Math.max(0, tAff) : 0.22 * adventurous;
    if (o.favour?.has(k)) score += 0.25;
    if (o.avoid?.has(k)) score -= 0.6;
    if (st?.last) {
      const since = c.now - st.last;
      const f = o.freshness ?? 1;
      if (since < 3 * HOUR) score -= 0.6 * f;
      else if (since < DAY) score -= 0.22 * f;
    }
    out.push({ track, score, reason: explain(s, g, c, track, seedIds, { p, aAff, ctxB, played, tAff, seeded: !!st?.seeded }) });
  }
  return out.sort((a, b) => b.score - a.score);
}

function explain(
  s: TasteState, g: SongGraph, c: Ctx, t: Track, seedIds: string[],
  f: { p: number; aAff: number; ctxB: number; played: boolean; tAff: number; seeded: boolean },
): string {
  const link = strongestLink(g, t.id, seedIds.filter((x) => x !== t.id));
  const linked = link ? (s.tracks[link]?.track ?? g.nodes[link]) : undefined;
  const artist = t.artists[0]?.name ?? 'this artist';
  if (!f.played && f.seeded) return `${artist}, who you told me you love`;
  if (!f.played) {
    if (linked) return `New to you · close to “${linked.title}”`;
    return `New to you · from your corner of ${artist}`;
  }
  if (f.ctxB > 0.45) return `You play ${artist} ${WHEN[partOfDay(c.ctx)]}`;
  if (f.tAff > 0.7) return 'One you keep finishing';
  if (f.aAff > 0.5) return `You keep coming back to ${artist}`;
  if (linked) return `Because you played “${linked.title}”`;
  return `From your ${artist} listening`;
}

/** Greedy pick that spreads artists out (no artist twice in a row, capped per mix). */
export function diversify(items: Scored[], n: number, perArtist = 3): Scored[] {
  const picked: Scored[] = [];
  const count = new Map<string, number>();
  const rest = items.slice(0, n * 6);
  while (picked.length < n && rest.length) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      const k = artistKey(rest[i].track);
      const c = count.get(k) ?? 0;
      if (c >= perArtist) continue;
      const recent = picked.slice(-2).filter((p) => artistKey(p.track) === k).length;
      const adj = rest[i].score - 0.35 * recent - 0.12 * c;
      if (adj > bestScore) {
        bestScore = adj;
        best = i;
      }
    }
    if (best < 0) break;
    const [p] = rest.splice(best, 1);
    picked.push(p);
    const k = artistKey(p.track);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  return picked;
}

function toMix(id: string, kind: MixKind, title: string, subtitle: string, picks: Scored[]): Mix {
  return {
    id, kind, title, subtitle,
    tracks: picks.map((p) => p.track),
    reasons: Object.fromEntries(picks.map((p) => [p.track.id, p.reason])),
    hue: hueOf(id + title),
  };
}

// ---- the mixes ----

export function momentTitle(c: Ctx): string {
  const d = new Date(c.now);
  const h = d.getHours();
  const day = d.toLocaleDateString('en', { weekday: 'long' });
  if (h < 5) return 'Night shift';
  if (h < 9) return 'First light';
  if (h < 12) return `${day} morning`;
  if (h < 15) return 'Midday drift';
  if (h < 18) return 'Golden hour';
  if (h < 22) return `${day} evening`;
  return 'After dark';
}

export function rightNow(s: TasteState, g: SongGraph, c: Ctx): Mix | null {
  const seeds = topSeeds(s, c, 6);
  if (!seeds.size) return null;
  const picks = diversify(rank(s, g, c, { seeds }), 30);
  if (picks.length < 5) return null;
  const mood = explore(s) > 0.6 ? 'leaning adventurous' : explore(s) < 0.35 ? 'close to home' : 'old loves and new finds';
  return toMix('now', 'now', momentTitle(c), `Built from what you play ${WHEN[partOfDay(c.ctx)]}, ${mood}`, picks);
}

export function freshFinds(s: TasteState, g: SongGraph, c: Ctx): Mix | null {
  const seeds = topSeeds(s, c, 12);
  if (!seeds.size) return null;
  const picks = diversify(rank(s, g, c, { seeds, onlyNew: true }), 25, 2);
  return picks.length >= 5 ? toMix('fresh', 'fresh', 'Fresh finds', 'Songs you haven’t heard, close to the ones you love', picks) : null;
}

export function worlds(s: TasteState, g: SongGraph, c: Ctx, max = 4): Mix[] {
  const arts = artistAffinities(s, c.now);
  const mine = [...arts.entries()].filter(([, v]) => v > 0.15).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k]) => k);
  if (mine.length < 3) return [];
  const clusters = clusterArtists(artistGraph(g), mine)
    // A lone artist is a world of its own when you're devoted enough to them.
    .filter((cl) => cl.length >= 2 || (arts.get(cl[0]) ?? 0) > 0.4)
    .map((cl) => ({ cl, weight: cl.reduce((a, k) => a + (arts.get(k) ?? 0), 0) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, max);
  return clusters.flatMap(({ cl }, i) => {
    const favour = new Set(cl);
    const seeds = topSeeds(s, c, 6, (t) => favour.has(artistKey(t)));
    if (!seeds.size) return [];
    const picks = diversify(rank(s, g, c, { seeds, favour }), 25, 4);
    if (picks.length < 5) return [];
    const names = cl.slice(0, 3).map((k) => s.artists[k]?.name).filter(Boolean);
    const title = cl.length === 1 ? `${names[0]} & beyond` : names.slice(0, 2).join(' & ') + (cl.length > 2 ? ' & more' : '');
    return [toMix(`world-${cl.slice().sort()[0]}`, 'world', title, `World ${i + 1} · ${names.join(', ')}`, picks)];
  });
}

export function backInRotation(s: TasteState, c: Ctx): Mix | null {
  const picks = Object.values(s.tracks)
    .filter((st) => st.completes >= 2 && c.now - st.last > 21 * DAY && st.completes > st.skips)
    .map((st) => ({ track: st.track, score: st.completes - st.skips, reason: `Last played ${Math.round((c.now - st.last) / DAY)} days ago` }))
    .sort((a, b) => b.score - a.score);
  const d = diversify(picks, 25, 3);
  return d.length >= 5 ? toMix('rotation', 'rotation', 'Back in rotation', 'Songs you loved and drifted away from', d) : null;
}

export function onRepeat(s: TasteState, c: Ctx): Mix | null {
  const picks = Object.values(s.tracks)
    .filter((st) => st.plays > 0 && c.now - st.last < 14 * DAY && decayed(st.score, st.at, c.now) > 0.8)
    .map((st) => ({ track: st.track, score: decayed(st.score, st.at, c.now), reason: `${st.completes} full plays recently` }))
    .sort((a, b) => b.score - a.score);
  const d = diversify(picks, 25, 4);
  return d.length >= 5 ? toMix('repeat', 'repeat', 'On repeat', 'What you can’t stop playing', d) : null;
}

/**
 * Next tracks for autoplay, steered by this session: what you're playing now and
 * what you've skipped in the last few songs.
 */
export function flow(s: TasteState, g: SongGraph, c: Ctx, current: Track, recent: Track[], skippedArtists: Set<string>, n = 10): Scored[] {
  const seeds = new Map<string, number>([[current.id, 1]]);
  recent.slice(-4).forEach((t, i) => seeds.set(t.id, (seeds.get(t.id) ?? 0) + 0.25 * (i + 1)));
  for (const [id, v] of topSeeds(s, c, 3)) seeds.set(id, (seeds.get(id) ?? 0) + v * 0.3);
  const exclude = new Set([current.id, ...recent.map((t) => t.id)]);
  const ranked = rank(s, g, c, { seeds, avoid: skippedArtists, freshness: 1.5 }).filter((x) => !exclude.has(x.track.id));
  return diversify(ranked, n, 2);
}

// ---- insights ----

export interface Insight {
  text: string;
  weight: number;
}

export function insights(s: TasteState, now: number): Insight[] {
  const out: Insight[] = [];
  const tracks = Object.values(s.tracks).filter((t) => t.plays > 0);
  if (!tracks.length) return out;

  const parts = [0, 0, 0, 0];
  for (const t of tracks) t.ctx.forEach((v, i) => (parts[i % 4] += v));
  const top = parts.indexOf(Math.max(...parts));
  const share = parts[top] / Math.max(1e-9, parts.reduce((a, b) => a + b, 0));
  if (share > 0.4) out.push({ text: `Most of your listening happens ${WHEN[top]}`, weight: share });

  const plays = tracks.reduce((a, t) => a + t.plays, 0);
  const skips = tracks.reduce((a, t) => a + t.skips, 0);
  if (plays >= 20) {
    const rate = skips / plays;
    out.push({ text: rate > 0.45 ? 'You skip fast; recommendations get stricter for you' : rate < 0.15 ? 'You let songs play out; you get longer, deeper mixes' : 'You skip about as much as most people', weight: 0.5 });
  }

  const ex = explore(s);
  if (s.novelty.hits + s.novelty.misses > 8) {
    out.push({ text: ex > 0.6 ? 'You love hearing new things; about half your mixes are new to you' : ex < 0.35 ? 'You know what you like; mixes stay close to your favourites' : 'You like a balance of new finds and favourites', weight: 0.6 });
  }

  const night = tracks.filter((t) => t.feat && (t.ctx[0] + t.ctx[3] + t.ctx[4] + t.ctx[7]) > (t.ctx[1] + t.ctx[2] + t.ctx[5] + t.ctx[6]));
  const day = tracks.filter((t) => t.feat && !night.includes(t));
  if (night.length >= 5 && day.length >= 5) {
    const avg = (xs: typeof tracks) => xs.reduce((a, t) => a + t.feat!.energy, 0) / xs.length;
    const diff = avg(day) - avg(night);
    if (Math.abs(diff) > 0.06) out.push({ text: diff > 0 ? 'Your music gets softer as the day ends' : 'Your music gets louder after dark', weight: 0.7 });
  }

  const weekAgo = now - 7 * DAY;
  const recent = new Map<string, number>();
  for (const t of tracks) if (t.last > weekAgo) recent.set(t.track.artists[0]?.name ?? '', (recent.get(t.track.artists[0]?.name ?? '') ?? 0) + t.listenSec);
  const topArtist = [...recent.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topArtist && topArtist[1] > 600) out.push({ text: `${topArtist[0]} owned your week`, weight: 0.9 });

  return out.sort((a, b) => b.weight - a.weight);
}

/** One line under the greeting, written from what the model knows. */
export function personalLine(s: TasteState, c: Ctx): string {
  const tracks = Object.values(s.tracks).filter((t) => t.plays > 0 || t.seeded);
  if (!tracks.length) return 'Play anything. I’ll start learning from the first song.';
  const recent = tracks.filter((t) => c.now - (t.last || t.first) < 7 * DAY);
  const byArtist = new Map<string, number>();
  for (const t of recent) byArtist.set(t.track.artists[0]?.name ?? '', (byArtist.get(t.track.artists[0]?.name ?? '') ?? 0) + Math.max(1, t.listenSec));
  const tops = [...byArtist.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).filter(Boolean).slice(0, 2);
  const when = CONTEXT_NAMES[partOfDay(c.ctx)].toLowerCase();
  if (tops.length === 2) return `Lately it’s been ${tops[0]} and ${tops[1]}. Here’s your ${when}, tuned to that.`;
  if (tops.length === 1) return `You’ve had ${tops[0]} on your mind. This ${when} starts there.`;
  return `Welcome back. Your ${when} mix is ready.`;
}

export const describeTrack = (t: Track) => `${t.title} · ${artistLine(t)}`;
