// The contract every music source implements. The UI only ever talks to this,
// so adding a new source (local files, a different service) never touches the views.

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface Track {
  id: string;
  title: string;
  artists: ArtistRef[];
  album?: { id?: string; name: string };
  /** Seconds; 0 when unknown. */
  duration: number;
  /** Square-ish cover art, largest available. */
  art?: string;
  /** True for music videos, false for audio-only tracks. */
  video?: boolean;
}

export type CollectionKind = 'album' | 'playlist' | 'artist';

export interface CollectionRef {
  kind: CollectionKind;
  id: string;
  title: string;
  subtitle?: string;
  art?: string;
}

export type ShelfItem = { type: 'track'; track: Track } | { type: 'collection'; ref: CollectionRef };

export interface Shelf {
  title: string;
  items: ShelfItem[];
}

export interface Collection {
  kind: 'album' | 'playlist';
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  art?: string;
  tracks: Track[];
}

export interface ArtistPage {
  id: string;
  name: string;
  description?: string;
  art?: string;
  topTracks: Track[];
  shelves: Shelf[];
}

export interface SearchResults {
  top?: ShelfItem;
  tracks: Track[];
  albums: CollectionRef[];
  artists: CollectionRef[];
  playlists: CollectionRef[];
}

export interface PlainLyrics {
  text: string;
  source: string;
}

export interface MusicSource {
  readonly name: string;
  /** Offline sources never trigger network lookups (e.g. LRCLIB). */
  readonly offline?: boolean;
  home(): Promise<Shelf[]>;
  search(query: string): Promise<SearchResults>;
  suggest(query: string): Promise<string[]>;
  collection(kind: 'album' | 'playlist', id: string): Promise<Collection>;
  artist(id: string): Promise<ArtistPage>;
  /** Radio / autoplay continuation after a track. Excludes the seed track. */
  radio(seed: Track): Promise<Track[]>;
  /** Timed lyrics (LRC text) the source has itself. When absent, LRCLIB is asked. */
  timedLyrics?(track: Track): Promise<string | null>;
  /** Unsynced lyrics, used only when no timed lyrics exist. */
  lyrics(track: Track): Promise<PlainLyrics | null>;
  /** A URL the <audio> element can play with CORS enabled (needed for the visualizer). */
  streamUrl(track: Track): Promise<string>;
  /** Called a few seconds before a track is needed so the stream is ready on time. */
  prefetch?(track: Track): void;
}

export const artistLine = (t: Pick<Track, 'artists'>) => t.artists.map((a) => a.name).join(', ');
