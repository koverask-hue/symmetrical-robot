// Finds the best lyrics for a track: timed lyrics from LRCLIB first (free, open,
// community-synced), then the source's own unsynced lyrics.

import { nativeFetch } from '../platform';
import type { MusicSource, Track } from '../sources/types';
import { parseLrc, type TimedLyrics } from './lrc';

export type LyricsResult =
  | { kind: 'timed'; lyrics: TimedLyrics }
  | { kind: 'plain'; text: string; source: string }
  | { kind: 'instrumental' }
  | { kind: 'none' };

const LRCLIB = 'https://lrclib.net/api';
const HEADERS = { 'Lrclib-Client': 'Moonbow 0.3.0 (https://github.com/koverask-hue/symmetrical-robot)' };

/** Strips the decorations YouTube titles carry, which make lyric lookups miss. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([](?:official|lyric|lyrics|audio|video|music video|visuali[sz]er|mv|hd|hq|4k|remaster(?:ed)?(?: \d{4})?|explicit|clean)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([](?:feat|ft|with)\.?\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+(?:feat|ft)\.?\s.*$/i, '')
    .replace(/\s*-\s*(?:official|lyric|audio).*$/i, '')
    .trim();
}

export function cleanArtist(name: string): string {
  return name.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
}

interface LrclibRecord {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

async function lrclib(path: string, params: Record<string, string>): Promise<Response> {
  return nativeFetch(`${LRCLIB}/${path}?${new URLSearchParams(params)}`, { headers: HEADERS });
}

/** Pick the closest-duration result that has synced lyrics, or failing that any lyrics. */
export function pickBest(results: LrclibRecord[], duration: number): LrclibRecord | undefined {
  // YouTube's upload of a song often runs a few seconds longer (silence, intro);
  // 12 s still rules out a different song or a remix, and the closest match wins.
  const near = (r: LrclibRecord) => !duration || !r.duration || Math.abs(r.duration - duration) <= 12;
  const score = (r: LrclibRecord) => (r.syncedLyrics ? 0 : 10) + (duration && r.duration ? Math.abs(r.duration - duration) : 2);
  return results.filter(near).sort((a, b) => score(a) - score(b))[0];
}

const cache = new Map<string, Promise<LyricsResult>>();

export function findLyrics(track: Track, source: MusicSource): Promise<LyricsResult> {
  let p = cache.get(track.id);
  if (!p) {
    p = lookup(track, source);
    cache.set(track.id, p);
    // Don't cache transient failures forever.
    p.then((r) => r.kind === 'none' && setTimeout(() => cache.delete(track.id), 60_000));
  }
  return p;
}

async function fromLrclib(title: string, artist: string, track: Track): Promise<LrclibRecord | undefined> {
  let rec: LrclibRecord | undefined;
  try {
    const params: Record<string, string> = { track_name: title, artist_name: artist };
    if (track.album?.name) params.album_name = track.album.name;
    if (track.duration) params.duration = String(Math.round(track.duration));
    const res = await lrclib('get', params);
    if (res.ok) rec = (await res.json()) as LrclibRecord;
    if (!rec?.syncedLyrics) {
      const s = await lrclib('search', { track_name: title, artist_name: artist });
      if (s.ok) rec = pickBest((await s.json()) as LrclibRecord[], track.duration) ?? rec;
    }
  } catch {
    // Offline or LRCLIB down; the caller falls back to the source's lyrics.
  }
  return rec;
}

async function lookup(track: Track, source: MusicSource): Promise<LyricsResult> {
  const title = cleanTitle(track.title);
  const artist = cleanArtist(track.artists[0]?.name ?? '');
  const own = await source.timedLyrics?.(track).catch(() => null);
  const ownParsed = own ? parseLrc(own, source.name, track.duration) : null;
  if (ownParsed) return { kind: 'timed', lyrics: ownParsed };

  const rec = source.offline ? undefined : await fromLrclib(title, artist, track);

  if (rec?.instrumental) return { kind: 'instrumental' };
  if (rec?.syncedLyrics) {
    const lyrics = parseLrc(rec.syncedLyrics, 'LRCLIB', track.duration);
    if (lyrics) return { kind: 'timed', lyrics };
  }

  const plain = await source.lyrics(track).catch(() => null);
  if (plain) return { kind: 'plain', text: plain.text, source: plain.source };
  if (rec?.plainLyrics) return { kind: 'plain', text: rec.plainLyrics, source: 'LRCLIB' };
  return { kind: 'none' };
}
