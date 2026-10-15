// Maps youtubei.js parser nodes onto our own small types. Written against the
// node *shapes* (duck typing) rather than the classes so it can be unit tested
// with plain objects and survives minor youtubei.js refactors.

import type { ArtistRef, CollectionKind, CollectionRef, ShelfItem, Track } from './types';

type TextLike = { toString(): string } | string | undefined | null;
type Thumb = { url: string; width?: number; height?: number };
type Author = { name: string; channel_id?: string };

export const text = (t: TextLike) => (t == null ? '' : String(t).trim());

/** Largest thumbnail, upscaled when the URL is a googleusercontent one that accepts a size suffix. */
export function bestArt(thumbs: Thumb[] | undefined | null, size = 544): string | undefined {
  if (!thumbs?.length) return undefined;
  const best = [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  let url = best.url;
  if (url.startsWith('//')) url = `https:${url}`;
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    url = url.replace(/=w\d+-h\d+[^&?#]*$/, `=w${size}-h${size}-l90-rj`);
  }
  return url;
}

export function parseDuration(s: string | undefined): number {
  if (!s) return 0;
  const parts = s.trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

const artistsOf = (list: Author[] | undefined, fallback?: Author): ArtistRef[] => {
  const src = list?.length ? list : fallback ? [fallback] : [];
  return src.filter((a) => a.name).map((a) => ({ id: a.channel_id || undefined, name: a.name }));
};

const TRACK_TYPES = new Set(['song', 'video', 'non_music_track']);
const KINDS: Record<string, CollectionKind> = { album: 'album', playlist: 'playlist', artist: 'artist', library_artist: 'artist' };

/** MusicResponsiveListItem: the row used in search results, playlists and albums. */
export interface ListItemLike {
  item_type?: string;
  id?: string;
  title?: string;
  name?: string;
  duration?: { seconds: number };
  album?: { id?: string; name: string };
  artists?: Author[];
  authors?: Author[];
  author?: Author;
  subtitle?: TextLike;
  thumbnails?: Thumb[];
  thumbnail?: { contents?: Thumb[] } | null;
}

export function fromListItem(it: ListItemLike): ShelfItem | null {
  if (!it.id || !it.item_type) return null;
  const thumbs = it.thumbnails ?? it.thumbnail?.contents;
  if (TRACK_TYPES.has(it.item_type)) {
    return {
      type: 'track',
      track: {
        id: it.id,
        title: it.title ?? it.name ?? '',
        artists: artistsOf(it.artists ?? it.authors, it.author),
        album: it.album?.name ? { id: it.album.id, name: it.album.name } : undefined,
        duration: it.duration?.seconds ?? 0,
        art: bestArt(thumbs),
        video: it.item_type === 'video',
      },
    };
  }
  const kind = KINDS[it.item_type];
  if (!kind) return null;
  return {
    type: 'collection',
    ref: { kind, id: it.id, title: it.title ?? it.name ?? '', subtitle: text(it.subtitle) || undefined, art: bestArt(thumbs) },
  };
}

/** MusicTwoRowItem: the square card used in home and artist carousels. */
export interface TwoRowLike {
  item_type?: string;
  id?: string;
  title: TextLike;
  subtitle?: TextLike;
  artists?: Author[];
  author?: Author;
  thumbnail?: Thumb[];
}

export function fromTwoRow(it: TwoRowLike): ShelfItem | null {
  if (!it.id || !it.item_type) return null;
  if (it.item_type === 'song' || it.item_type === 'video') {
    return {
      type: 'track',
      track: {
        id: it.id,
        title: text(it.title),
        artists: artistsOf(it.artists, it.author),
        duration: 0,
        art: bestArt(it.thumbnail),
        video: it.item_type === 'video',
      },
    };
  }
  const kind = KINDS[it.item_type];
  if (!kind) return null;
  return { type: 'collection', ref: { kind, id: it.id, title: text(it.title), subtitle: text(it.subtitle) || undefined, art: bestArt(it.thumbnail) } };
}

/** Either card shape; carousels mix both. */
export function fromAny(node: unknown): ShelfItem | null {
  const n = node as { type?: string };
  if (n?.type === 'MusicTwoRowItem') return fromTwoRow(node as TwoRowLike);
  if (n?.type === 'MusicResponsiveListItem') return fromListItem(node as ListItemLike);
  return null;
}

/** PlaylistPanelVideo: the rows of the "up next" radio queue. */
export interface PanelVideoLike {
  video_id?: string;
  title: TextLike;
  author?: string;
  artists?: Author[];
  album?: { id?: string; name: string };
  duration?: { seconds: number };
  thumbnail?: Thumb[];
}

export function fromPanelVideo(v: PanelVideoLike): Track | null {
  if (!v.video_id) return null;
  return {
    id: v.video_id,
    title: text(v.title),
    artists: v.artists?.length ? artistsOf(v.artists) : v.author ? [{ name: v.author }] : [],
    album: v.album?.name ? { id: v.album.id, name: v.album.name } : undefined,
    duration: v.duration?.seconds ?? 0,
    art: bestArt(v.thumbnail),
  };
}

export const onlyTracks = (items: (ShelfItem | null)[]): Track[] =>
  items.flatMap((i) => (i?.type === 'track' ? [i.track] : []));

export const onlyRefs = (items: (ShelfItem | null)[]): CollectionRef[] =>
  items.flatMap((i) => (i?.type === 'collection' ? [i.ref] : []));
