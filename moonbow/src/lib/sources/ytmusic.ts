// YouTube Music through youtubei.js (unofficial InnerTube client). Metadata is
// fetched from the webview with requests tunnelled through Rust; audio streams
// are resolved by yt-dlp on the Rust side and served from a local proxy.

import type { Innertube } from 'youtubei.js/web';
import { audioProxyBase, invoke, ytFetch } from '../platform';
import type { ArtistPage, Collection, MusicSource, PlainLyrics, SearchResults, Shelf, Track } from './types';
import { bestArt, fromAny, fromListItem, fromPanelVideo, onlyRefs, onlyTracks, text, type ListItemLike, type PanelVideoLike } from './ytmap';

type AnyNode = { type?: string; [k: string]: any };

const MAX_PLAYLIST_PAGES = 6;

export class YTMusicSource implements MusicSource {
  readonly name = 'YouTube Music';
  #yt?: Promise<Innertube>;

  #client(): Promise<Innertube> {
    this.#yt ??= (async () => {
      const { Innertube } = await import('youtubei.js/web');
      return Innertube.create({
        fetch: (input, init) => ytFetch(input, init),
        // Streams come from yt-dlp, so the (large, slow) player script is never needed.
        retrieve_player: false,
        generate_session_locally: true,
        lang: navigator.language?.split('-')[0] || 'en',
      });
    })();
    this.#yt.catch(() => (this.#yt = undefined));
    return this.#yt;
  }

  async home(): Promise<Shelf[]> {
    const yt = await this.#client();
    const feed = await yt.music.getHomeFeed();
    return (feed.sections ?? []).flatMap((s: AnyNode) => {
      if (s.type !== 'MusicCarouselShelf') return [];
      const items = (s.contents ?? []).map(fromAny).filter(Boolean);
      return items.length ? [{ title: text(s.header?.title), items }] : [];
    }) as Shelf[];
  }

  async search(query: string): Promise<SearchResults> {
    const yt = await this.#client();
    const [all, songs] = await Promise.all([yt.music.search(query), yt.music.search(query, { type: 'song' }).catch(() => undefined)]);
    const rows = (shelf?: { contents?: unknown[] }) => (shelf?.contents ?? []).map((n) => fromListItem(n as ListItemLike));

    const card = all.contents?.find((c: AnyNode) => c.type === 'MusicCardShelf') as AnyNode | undefined;
    let top = undefined;
    if (card) {
      const p = card.on_tap?.payload ?? {};
      const pageType: string | undefined = p.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;
      const art = bestArt(card.thumbnail?.contents);
      if (p.videoId) {
        top = { type: 'track' as const, track: { id: p.videoId, title: text(card.title), artists: [{ name: text(card.subtitle).split(' • ').slice(1, 2).join('') }].filter((a) => a.name), duration: 0, art } };
      } else if (p.browseId) {
        const kind = pageType?.includes('ARTIST') ? 'artist' : pageType?.includes('ALBUM') ? 'album' : 'playlist';
        top = { type: 'collection' as const, ref: { kind, id: p.browseId, title: text(card.title), subtitle: text(card.subtitle), art } as const };
      }
    }

    const tracks = onlyTracks(rows(songs?.songs ?? songs?.contents?.[0] as any));
    return {
      top,
      tracks: tracks.length ? tracks : onlyTracks(rows(all.songs)),
      albums: onlyRefs(rows(all.albums)),
      artists: onlyRefs(rows(all.artists)),
      playlists: onlyRefs(rows(all.playlists)),
    };
  }

  async suggest(query: string): Promise<string[]> {
    if (!query.trim()) return [];
    const yt = await this.#client();
    const sections = await yt.music.getSearchSuggestions(query);
    return sections
      .flatMap((s: AnyNode) => s.contents ?? [])
      .map((n: AnyNode) => text(n.suggestion))
      .filter(Boolean)
      .slice(0, 8);
  }

  async collection(kind: 'album' | 'playlist', id: string): Promise<Collection> {
    const yt = await this.#client();
    if (kind === 'album') {
      const album = await yt.music.getAlbum(id);
      const h = album.header as AnyNode | undefined;
      const art = bestArt(h?.thumbnail?.contents ?? h?.thumbnails);
      const title = text(h?.title);
      const artistName = text(h?.strapline_text_one) || h?.author?.name || '';
      const tracks = onlyTracks(album.contents.map((n) => fromListItem(n as unknown as ListItemLike))).map((t) => ({
        ...t,
        // Album rows omit art and often the artist; inherit them from the header.
        art: t.art ?? art,
        artists: t.artists.length ? t.artists : artistName ? [{ name: artistName }] : [],
        album: { id, name: title },
      }));
      return {
        kind, id, title, art, tracks,
        subtitle: [artistName, text(h?.subtitle)].filter(Boolean).join(' · '),
        description: text(h?.description?.description) || undefined,
      };
    }

    let page = await yt.music.getPlaylist(id);
    const h = page.header as AnyNode | undefined;
    const items: unknown[] = [...(page.items ?? [])];
    for (let i = 0; i < MAX_PLAYLIST_PAGES && page.has_continuation; i++) {
      page = await page.getContinuation();
      items.push(...(page.items ?? []));
    }
    return {
      kind, id,
      title: text(h?.title),
      subtitle: [text(h?.subtitle), text(h?.second_subtitle)].filter(Boolean).join(' · '),
      description: text(h?.description?.description) || undefined,
      art: bestArt(h?.thumbnail?.contents ?? h?.thumbnails),
      tracks: onlyTracks(items.map((n) => fromListItem(n as ListItemLike))),
    };
  }

  async artist(id: string): Promise<ArtistPage> {
    const yt = await this.#client();
    const a = await yt.music.getArtist(id);
    const h = a.header as AnyNode | undefined;
    let topTracks: Track[] = [];
    const shelves: Shelf[] = [];
    for (const s of a.sections as AnyNode[]) {
      if (s.type === 'MusicShelf' && !topTracks.length) {
        topTracks = onlyTracks((s.contents ?? []).map((n: unknown) => fromListItem(n as ListItemLike)));
      } else if (s.type === 'MusicCarouselShelf') {
        const items = (s.contents ?? []).map(fromAny).filter(Boolean);
        if (items.length) shelves.push({ title: text(s.header?.title), items });
      }
    }
    return {
      id,
      name: text(h?.title),
      description: text(h?.description) || undefined,
      art: bestArt(h?.thumbnail?.contents ?? h?.thumbnail, 1200),
      topTracks,
      shelves,
    };
  }

  async radio(seed: Track): Promise<Track[]> {
    const yt = await this.#client();
    const panel = await yt.music.getUpNext(seed.id, true);
    return (panel.contents as AnyNode[])
      .map((n) => (n.type === 'PlaylistPanelVideoWrapper' ? n.primary : n))
      .filter((n) => n?.type === 'PlaylistPanelVideo')
      .map((n) => fromPanelVideo(n as PanelVideoLike))
      .filter((t): t is Track => !!t && t.id !== seed.id);
  }

  async lyrics(track: Track): Promise<PlainLyrics | null> {
    const yt = await this.#client();
    const shelf = await yt.music.getLyrics(track.id).catch(() => undefined);
    const body = text(shelf?.description);
    return body ? { text: body, source: text(shelf?.footer) || 'YouTube Music' } : null;
  }

  async streamUrl(track: Track): Promise<string> {
    return `${await audioProxyBase()}/stream/${encodeURIComponent(track.id)}`;
  }

  prefetch(track: Track): void {
    invoke('prefetch_stream', { id: track.id }).catch(() => {});
  }
}
