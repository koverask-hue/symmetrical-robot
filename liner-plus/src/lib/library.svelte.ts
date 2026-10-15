// Everything the user owns lives locally: likes, history, playlists, settings.
// No account, no server.

import type { Track } from './sources/types';
import { load, save } from './util/persist';

export interface LocalPlaylist {
  id: string;
  name: string;
  tracks: Track[];
  created: number;
}

export type VisualsMode = 'reactive' | 'calm' | 'off';

export interface Settings {
  crossfade: number;
  visuals: VisualsMode;
  romanize: boolean;
  autoplay: boolean;
  lyricsSize: number;
}

const DEFAULT_SETTINGS: Settings = { crossfade: 0, visuals: 'reactive', romanize: false, autoplay: true, lyricsSize: 1 };
const HISTORY_MAX = 200;

class Library {
  liked = $state<Track[]>(load('liked', []));
  history = $state<Track[]>(load('history', []));
  playlists = $state<LocalPlaylist[]>(load('playlists', []));
  settings = $state<Settings>({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>('settings', {}) });
  /** Per-track lyric offset in seconds, for tracks whose synced lyrics drift. */
  offsets = $state<Record<string, number>>(load('offsets', {}));

  #likedIds = $derived(new Set(this.liked.map((t) => t.id)));

  isLiked = (id: string) => this.#likedIds.has(id);

  toggleLike(t: Track) {
    this.liked = this.isLiked(t.id) ? this.liked.filter((x) => x.id !== t.id) : [strip(t), ...this.liked];
    save('liked', this.liked);
  }

  recordPlay(t: Track) {
    this.history = [strip(t), ...this.history.filter((x) => x.id !== t.id)].slice(0, HISTORY_MAX);
    save('history', this.history);
  }

  createPlaylist(name: string, tracks: Track[] = []): LocalPlaylist {
    const p = { id: crypto.randomUUID(), name: name.trim() || 'New playlist', tracks: tracks.map(strip), created: Date.now() };
    this.playlists = [p, ...this.playlists];
    save('playlists', this.playlists);
    return p;
  }

  addToPlaylist(id: string, tracks: Track[]) {
    this.playlists = this.playlists.map((p) => {
      if (p.id !== id) return p;
      const have = new Set(p.tracks.map((t) => t.id));
      return { ...p, tracks: [...p.tracks, ...tracks.filter((t) => !have.has(t.id)).map(strip)] };
    });
    save('playlists', this.playlists);
  }

  removeFromPlaylist(id: string, trackId: string) {
    this.playlists = this.playlists.map((p) => (p.id === id ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p));
    save('playlists', this.playlists);
  }

  deletePlaylist(id: string) {
    this.playlists = this.playlists.filter((p) => p.id !== id);
    save('playlists', this.playlists);
  }

  renamePlaylist(id: string, name: string) {
    this.playlists = this.playlists.map((p) => (p.id === id ? { ...p, name } : p));
    save('playlists', this.playlists);
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    save('settings', this.settings);
  }

  offset = (id: string) => this.offsets[id] ?? 0;

  nudgeOffset(id: string, delta: number) {
    const v = Math.round((this.offset(id) + delta) * 10) / 10;
    this.offsets = { ...this.offsets, [id]: v };
    if (v === 0) delete this.offsets[id];
    save('offsets', this.offsets);
  }
}

/** Keeps stored tracks small and free of Svelte proxies. */
function strip(t: Track): Track {
  return { id: t.id, title: t.title, artists: t.artists.map((a) => ({ ...a })), album: t.album ? { ...t.album } : undefined, duration: t.duration, art: t.art, video: t.video };
}

export const library = new Library();
