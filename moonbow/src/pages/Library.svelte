<script lang="ts">
  import Card from '../components/Card.svelte';
  import Icon from '../components/Icon.svelte';
  import Mosaic from '../components/Mosaic.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { library } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { router, type LibraryTab } from '../lib/router.svelte';
  import type { CollectionRef, ShelfItem, Track } from '../lib/sources/types';

  let { tab = 'playlists' }: { tab?: LibraryTab } = $props();

  const TABS: { id: LibraryTab; label: string }[] = [
    { id: 'playlists', label: 'Playlists' },
    { id: 'liked', label: 'Liked songs' },
    { id: 'albums', label: 'Albums' },
    { id: 'artists', label: 'Artists' },
    { id: 'history', label: 'History' },
  ];

  const albums = $derived(library.saved.filter((x) => x.kind === 'album'));
  const ytPlaylists = $derived(library.saved.filter((x) => x.kind === 'playlist'));
  const playlistCount = $derived(library.playlists.length + ytPlaylists.length);
  const count = (id: LibraryTab) =>
    id === 'playlists' ? playlistCount : id === 'liked' ? library.liked.length : id === 'albums' ? albums.length : id === 'artists' ? library.following.length : library.history.length;

  const asItem = (ref: CollectionRef): ShelfItem => ({ type: 'collection', ref });
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 'S'}`;

  function setTab(t: LibraryTab) {
    router.go({ name: 'library', tab: t });
  }

  function newPlaylist() {
    const p = library.createPlaylist(`Playlist ${library.playlists.length + 1}`);
    router.go({ name: 'local', id: p.id });
  }

  function shuffle(tracks: Track[]) {
    if (!tracks.length) return;
    player.playTracks(tracks, Math.floor(Math.random() * tracks.length));
    player.toggleShuffle();
  }
</script>

<div class="page lib">
  <header class="top enter">
    <div class="label">Library</div>
    <h1 class="h1">Your library</h1>
    <div class="counts mono">
      <span><b class="num">{playlistCount}</b> playlists</span>
      <span class="sep"></span>
      <span><b class="num">{library.liked.length}</b> liked</span>
      <span class="sep"></span>
      <span><b class="num">{albums.length}</b> albums</span>
      <span class="sep"></span>
      <span><b class="num">{library.following.length}</b> artists</span>
      <span class="stored">Stored on this computer</span>
    </div>
  </header>

  <div class="tabs" role="tablist" aria-label="Library sections">
    {#each TABS as t (t.id)}
      <button class="chip" class:on={tab === t.id} role="tab" aria-selected={tab === t.id} onclick={() => setTab(t.id)}>
        {t.label}<span class="ct num">{count(t.id)}</span>
      </button>
    {/each}
  </div>

  {#if tab === 'playlists'}
    <div class="grid enter">
      <button class="tile" onclick={() => setTab('liked')}>
        <span class="sq liked"><Icon name="heart-filled" size={34} /></span>
        <span class="nm ellipsis">Liked songs</span>
        <span class="meta label">{plural(library.liked.length, 'SONG')}</span>
      </button>
      {#each library.playlists as p (p.id)}
        <button class="tile" onclick={() => router.go({ name: 'local', id: p.id })}>
          <span class="sq">
            {#if p.tracks.length}
              <Mosaic arts={p.tracks.slice(0, 8).map((t) => t.art)} size="100%" radius={10} />
            {:else}
              <span class="blank"><Icon name="queue" size={28} /></span>
            {/if}
          </span>
          <span class="nm ellipsis">{p.name}</span>
          <span class="meta label">{plural(p.tracks.length, 'SONG')}</span>
        </button>
      {/each}
      {#each ytPlaylists as p (p.id)}
        <button class="tile" onclick={() => router.go({ name: 'playlist', id: p.id })}>
          <span class="sq"><Mosaic arts={[p.art]} size="100%" radius={10} /></span>
          <span class="nm ellipsis">{p.title}</span>
          <span class="meta label ellipsis">{p.subtitle ?? 'Saved playlist'}</span>
        </button>
      {/each}
      <button class="tile new" onclick={newPlaylist}>
        <span class="sq dashed"><Icon name="plus" size={28} /></span>
        <span class="nm">New playlist</span>
        <span class="meta label">Empty</span>
      </button>
    </div>
  {:else if tab === 'liked'}
    <div class="listhead enter">
      <button class="round-play" aria-label="Play" onclick={() => player.playTracks(library.liked)} disabled={!library.liked.length}>
        <Icon name="play" size={22} />
      </button>
      <button class="icon-btn" aria-label="Shuffle" title="Shuffle" onclick={() => shuffle(library.liked)} disabled={!library.liked.length}>
        <Icon name="shuffle" size={18} />
      </button>
      <div class="lh-text">
        <h2 class="h2">Liked songs</h2>
        <div class="label">{plural(library.liked.length, 'SONG')} · <kbd>F</kbd> likes the playing song</div>
      </div>
    </div>
    {#if library.liked.length}
      <TrackList tracks={library.liked} />
    {:else}
      <p class="empty">Songs you like live here. Press <kbd>F</kbd> or tap the heart while something plays.</p>
    {/if}
  {:else if tab === 'albums'}
    {#if albums.length}
      <div class="grid cards enter">
        {#each albums as a (a.id)}<Card item={asItem(a)} />{/each}
      </div>
    {:else}
      <p class="empty">Save albums with the bookmark on any album page.</p>
    {/if}
  {:else if tab === 'artists'}
    {#if library.following.length}
      <div class="grid cards enter">
        {#each library.following as a (a.id)}<Card item={asItem(a)} />{/each}
      </div>
    {:else}
      <p class="empty">Follow artists from their page.</p>
    {/if}
  {:else if tab === 'history'}
    <div class="listhead enter">
      <button class="round-play" aria-label="Play" onclick={() => player.playTracks(library.history)} disabled={!library.history.length}>
        <Icon name="play" size={22} />
      </button>
      <div class="lh-text">
        <h2 class="h2">Recently played</h2>
        <div class="label">{plural(library.history.length, 'SONG')} · newest first</div>
      </div>
    </div>
    {#if library.history.length}
      <TrackList tracks={library.history} />
    {:else}
      <p class="empty">Nothing played yet.</p>
    {/if}
  {/if}
</div>

<style>
  .top {
    padding: 36px 0 22px;
  }
  .top .h1 {
    margin: 10px 0 12px;
  }
  .counts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-size: 11.5px;
    color: var(--text-3);
  }
  .counts b {
    font-weight: 500;
    color: var(--text-2);
  }
  .sep {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--text-4);
  }
  .stored {
    margin-left: auto;
    color: var(--text-4);
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-bottom: 22px;
    margin-bottom: 26px;
    border-bottom: 1px solid var(--hair);
  }
  .ct {
    font-size: 10.5px;
    opacity: 0.6;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
    gap: 22px 18px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    text-align: left;
  }
  .sq {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1;
    margin-bottom: 9px;
    border-radius: 10px;
    overflow: hidden;
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair);
    transition: transform 0.2s var(--ease), box-shadow 0.2s;
  }
  .sq :global(.mosaic) {
    position: absolute;
    inset: 0;
  }
  .tile:hover .sq {
    transform: translateY(-2px);
    box-shadow: inset 0 0 0 1px var(--hair-2);
  }
  .sq.liked {
    color: var(--accent);
    background: rgb(var(--accent-rgb) / 0.1);
    box-shadow: inset 0 0 0 1px rgb(var(--accent-rgb) / 0.22);
  }
  .blank {
    color: var(--text-4);
  }
  .sq.dashed {
    color: var(--text-3);
    background: none;
    box-shadow: none;
    outline: 1px dashed var(--hair-2);
    outline-offset: -1px;
  }
  .tile.new:hover .sq {
    color: var(--accent);
  }
  .nm {
    max-width: 100%;
    font-weight: 560;
    font-size: 14px;
    letter-spacing: -0.012em;
  }
  .meta {
    max-width: 100%;
  }
  .listhead {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 18px;
  }
  .lh-text {
    margin-left: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .round-play:disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  .empty {
    padding: 48px 0;
    margin: 0;
    color: var(--text-3);
  }
</style>
