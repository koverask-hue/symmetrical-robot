// A fully offline source: synthesized songs, generated cover art and original
// lyrics. Used in the browser dev server and the automated smoke test.

import { audioProxyBase } from '../platform';
import type { ArtistPage, Collection, CollectionRef, MusicSource, PlainLyrics, SearchResults, Shelf, Track } from './types';

const ARTISTS = [
  { id: 'mock-artist-1', name: 'Pale Harbor', hue: 210 },
  { id: 'mock-artist-2', name: 'Neon Orchard', hue: 320 },
  { id: 'mock-artist-3', name: 'Slow Comet', hue: 35 },
];

const ALBUMS = [
  { id: 'mock-album-1', title: 'Low Tide Radio', artist: 0, hue: 205 },
  { id: 'mock-album-2', title: 'Afterglow Machines', artist: 1, hue: 300 },
  { id: 'mock-album-3', title: 'Long Way Round', artist: 2, hue: 25 },
];

const TITLES = [
  ['Signal Fire', 'Paper Lanterns', 'Undertow'],
  ['Chrome Bloom', 'Night Bus', 'Velvet Static'],
  ['Desert Mile', 'Slow Comet', 'Porch Light'],
];

const BPM = [92, 118, 84];
const ROOTS = [57, 52, 55]; // MIDI notes: A3, E3, G3
const LENGTH = 48; // seconds

function art(hue: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="544" height="544" viewBox="0 0 544 544">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue} 70% 55%)"/><stop offset=".55" stop-color="hsl(${(hue + 40) % 360} 60% 35%)"/>
<stop offset="1" stop-color="hsl(${(hue + 180) % 360} 55% 18%)"/></linearGradient>
<radialGradient id="r" cx=".7" cy=".3" r=".6"><stop offset="0" stop-color="hsl(${(hue + 90) % 360} 90% 70%)" stop-opacity=".9"/>
<stop offset="1" stop-color="hsl(${hue} 90% 60%)" stop-opacity="0"/></radialGradient></defs>
<rect width="544" height="544" fill="url(#g)"/><rect width="544" height="544" fill="url(#r)"/>
<circle cx="150" cy="390" r="90" fill="hsl(${(hue + 200) % 360} 80% 60%)" opacity=".55"/>
<text x="36" y="500" font-family="system-ui,sans-serif" font-size="34" font-weight="700" fill="white" opacity=".9">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const TRACKS: Track[] = ALBUMS.flatMap((al, ai) =>
  TITLES[ai].map((title, ti) => ({
    id: `mock-${ai}-${ti}`,
    title,
    artists: [{ id: ARTISTS[al.artist].id, name: ARTISTS[al.artist].name }],
    album: { id: al.id, name: al.title },
    duration: LENGTH,
    art: art(al.hue, al.title),
  })),
);

const albumRef = (i: number): CollectionRef => ({
  kind: 'album', id: ALBUMS[i].id, title: ALBUMS[i].title, subtitle: `Album • ${ARTISTS[ALBUMS[i].artist].name}`, art: art(ALBUMS[i].hue, ALBUMS[i].title),
});
const artistRef = (i: number): CollectionRef => ({
  kind: 'artist', id: ARTISTS[i].id, title: ARTISTS[i].name, subtitle: 'Artist', art: art(ARTISTS[i].hue, ARTISTS[i].name),
});
const PLAYLISTS: { ref: CollectionRef; ids: string[] }[] = [
  { ref: { kind: 'playlist', id: 'mock-pl-1', title: 'Late Night Drive', subtitle: 'Playlist • Verse', art: art(260, 'Late Night') }, ids: ['mock-1-1', 'mock-0-2', 'mock-1-2', 'mock-2-0'] },
  { ref: { kind: 'playlist', id: 'mock-pl-2', title: 'Sunday Slow', subtitle: 'Playlist • Verse', art: art(40, 'Sunday') }, ids: ['mock-2-2', 'mock-0-1', 'mock-2-1'] },
];

// Original lyrics written for the demo tracks.
const LYRICS: Record<string, string> = {
  'mock-0-0': `[00:04.00]Light a signal on the hill tonight
[00:08.50]Every window burning gold and white
[00:13.00]If you see it from the other side
[00:17.50]Follow it home, follow it home
[00:22.00]
[00:28.00]Harbor bells are ringing out of time
[00:32.50]Saltwater letters in a crooked line
[00:37.00]I kept the fire going all this while
[00:41.50]Follow it home`,
  'mock-1-0': `[00:03.00]<00:03.00>Chrome <00:03.60>flowers <00:04.30>open <00:05.10>in <00:05.40>the <00:05.70>rain
[00:07.00]<00:07.00>Petals <00:07.70>made <00:08.10>of <00:08.40>neon <00:09.20>light
[00:11.00]<00:11.00>Every <00:11.60>street <00:12.10>a <00:12.30>silver <00:13.00>vein
[00:15.00]<00:15.00>Bloom <00:15.80>for <00:16.20>me <00:16.60>tonight
[00:19.00]
[00:26.00]<00:26.00>Static <00:26.70>hum <00:27.20>and <00:27.50>a <00:27.70>heartbeat <00:28.60>drum
[00:30.00]<00:30.00>Bloom <00:30.80>for <00:31.20>me <00:31.60>tonight`,
  'mock-2-0': `[00:05.00]Desert mile and a radio
[00:10.00]Playing songs that I used to know
[00:15.00]Dust on the dashboard, sun getting low
[00:20.00]One more mile, then I'll let it go
[00:30.00]Один километр, и я дома
[00:35.00]사막의 길 위에서
[00:40.00]砂の道をゆく`,
};

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

// ---- audio synthesis ----

const audioCache = new Map<string, Promise<string>>();

function midi(n: number) {
  return 440 * 2 ** ((n - 69) / 12);
}

async function synth(trackIndex: number, albumIndex: number): Promise<string> {
  const rate = 22050;
  const ctx = new OfflineAudioContext(2, rate * LENGTH, rate);
  const bpm = BPM[albumIndex];
  const beat = 60 / bpm;
  const root = ROOTS[albumIndex] + trackIndex * 2;
  const prog = [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]];
  const master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);

  for (let bar = 0; bar * beat * 4 < LENGTH; bar++) {
    const t0 = bar * beat * 4;
    const chord = prog[bar % prog.length];
    // Pad
    for (const iv of chord) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = midi(root + iv);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.12, t0 + 0.3);
      g.gain.linearRampToValueAtTime(0.0, t0 + beat * 4);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + beat * 4);
    }
    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * beat;
      if (tb >= LENGTH) break;
      // Kick
      const k = ctx.createOscillator();
      const kg = ctx.createGain();
      k.frequency.setValueAtTime(120, tb);
      k.frequency.exponentialRampToValueAtTime(40, tb + 0.15);
      kg.gain.setValueAtTime(0.9, tb);
      kg.gain.exponentialRampToValueAtTime(0.001, tb + 0.3);
      k.connect(kg).connect(master);
      k.start(tb);
      k.stop(tb + 0.3);
      // Bass
      const bs = ctx.createOscillator();
      const bg = ctx.createGain();
      bs.type = 'sawtooth';
      bs.frequency.value = midi(root - 12 + chord[0]);
      bg.gain.setValueAtTime(0.15, tb);
      bg.gain.exponentialRampToValueAtTime(0.001, tb + beat * 0.9);
      bs.connect(bg).connect(master);
      bs.start(tb);
      bs.stop(tb + beat);
      // Melody pluck
      const m = ctx.createOscillator();
      const mg = ctx.createGain();
      m.type = 'sine';
      m.frequency.value = midi(root + 12 + chord[(b + bar) % 3] + (b === 3 ? 2 : 0));
      mg.gain.setValueAtTime(0.18, tb + beat / 2);
      mg.gain.exponentialRampToValueAtTime(0.001, tb + beat * 1.4);
      m.connect(mg).connect(master);
      m.start(tb + beat / 2);
      m.stop(tb + beat * 1.5);
    }
  }
  const buf = await ctx.startRendering();
  return URL.createObjectURL(wav(buf));
}

function wav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const len = buf.length * ch * 2;
  const view = new DataView(new ArrayBuffer(44 + len));
  const w = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  view.setUint32(4, 36 + len, true);
  w(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, len, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

// ---- source ----

export class MockSource implements MusicSource {
  readonly name = 'Demo';
  readonly offline = true;

  /** `proxied`: stream through the native audio proxy (exercises the desktop playback path). */
  constructor(private opts: { proxied?: boolean } = {}) {}

  async home(): Promise<Shelf[]> {
    await delay();
    return [
      { title: 'Quick picks', items: TRACKS.slice(0, 6).map((track) => ({ type: 'track', track })) },
      { title: 'Albums for you', items: ALBUMS.map((_, i) => ({ type: 'collection', ref: albumRef(i) })) },
      { title: 'Mixed for you', items: PLAYLISTS.map((p) => ({ type: 'collection', ref: p.ref })) },
      { title: 'Artists', items: ARTISTS.map((_, i) => ({ type: 'collection', ref: artistRef(i) })) },
    ];
  }

  async search(query: string): Promise<SearchResults> {
    await delay();
    const q = query.toLowerCase();
    const has = (s: string) => s.toLowerCase().includes(q);
    const tracks = TRACKS.filter((t) => has(t.title) || has(t.artists[0].name) || has(t.album?.name ?? ''));
    const albums = ALBUMS.map((_, i) => albumRef(i)).filter((r) => has(r.title) || has(r.subtitle ?? ''));
    const artists = ARTISTS.map((_, i) => artistRef(i)).filter((r) => has(r.title));
    const playlists = PLAYLISTS.map((p) => p.ref).filter((r) => has(r.title));
    const top = artists[0] ? { type: 'collection' as const, ref: artists[0] } : tracks[0] ? { type: 'track' as const, track: tracks[0] } : undefined;
    return { top, tracks, albums, artists, playlists };
  }

  async suggest(query: string): Promise<string[]> {
    const q = query.toLowerCase();
    if (!q) return [];
    return [...new Set([...TRACKS.map((t) => t.title), ...ARTISTS.map((a) => a.name), ...ALBUMS.map((a) => a.title)])]
      .filter((s) => s.toLowerCase().startsWith(q))
      .slice(0, 6);
  }

  async collection(kind: 'album' | 'playlist', id: string): Promise<Collection> {
    await delay();
    if (kind === 'album') {
      const i = ALBUMS.findIndex((a) => a.id === id);
      if (i < 0) throw new Error('Album not found');
      const ref = albumRef(i);
      return { kind, id, title: ref.title, subtitle: `${ARTISTS[ALBUMS[i].artist].name} · 2026`, art: ref.art, tracks: TRACKS.filter((t) => t.album?.id === id) };
    }
    const p = PLAYLISTS.find((x) => x.ref.id === id);
    if (!p) throw new Error('Playlist not found');
    return { kind, id, title: p.ref.title, subtitle: `${p.ids.length} songs`, art: p.ref.art, tracks: p.ids.map((tid) => TRACKS.find((t) => t.id === tid)!) };
  }

  async artist(id: string): Promise<ArtistPage> {
    await delay();
    const i = ARTISTS.findIndex((a) => a.id === id);
    if (i < 0) throw new Error('Artist not found');
    return {
      id,
      name: ARTISTS[i].name,
      description: `${ARTISTS[i].name} is a demo artist. Every sound you hear is synthesized in your browser.`,
      art: art(ARTISTS[i].hue, ''),
      topTracks: TRACKS.filter((t) => t.artists[0].id === id),
      shelves: [
        { title: 'Albums', items: ALBUMS.flatMap((a, ai) => (a.artist === i ? [{ type: 'collection' as const, ref: albumRef(ai) }] : [])) },
        { title: 'Fans also like', items: ARTISTS.flatMap((_, ai) => (ai !== i ? [{ type: 'collection' as const, ref: artistRef(ai) }] : [])) },
      ],
    };
  }

  async radio(seed: Track): Promise<Track[]> {
    await delay();
    return TRACKS.filter((t) => t.id !== seed.id);
  }

  async timedLyrics(track: Track): Promise<string | null> {
    return LYRICS[track.id] ?? null;
  }

  async lyrics(track: Track): Promise<PlainLyrics | null> {
    if (track.id === 'mock-0-1') return { text: 'Paper lanterns on the water\nCarry every name we lost\nLet them drift, let them drift\nPast the harbor, past the frost', source: 'Demo' };
    return null;
  }

  async streamUrl(track: Track): Promise<string> {
    if (this.opts.proxied) return `${await audioProxyBase()}/stream/${encodeURIComponent(track.id)}`;
    let p = audioCache.get(track.id);
    if (!p) {
      const [, a, t] = track.id.split('-').map(Number);
      p = synth(t, a);
      audioCache.set(track.id, p);
    }
    return p;
  }

  prefetch(track: Track) {
    void this.streamUrl(track);
  }
}
