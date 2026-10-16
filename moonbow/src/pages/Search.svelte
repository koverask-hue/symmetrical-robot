<script lang="ts">
  import Art from '../components/Art.svelte';
  import Icon from '../components/Icon.svelte';
  import Loading from '../components/Loading.svelte';
  import Shelf from '../components/Shelf.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { source } from '../lib/sources';
  import { player } from '../lib/player/player.svelte';
  import { router } from '../lib/router.svelte';
  import { loader } from '../lib/util/load.svelte';
  import { artistLine } from '../lib/sources/types';

  let { q }: { q: string } = $props();
  const res = loader(() => source.search(q));
  $effect(() => {
    q;
    res.run();
  });

  const r = $derived(res.state.data);
  const top = $derived(r?.top);
  const total = $derived(r ? r.tracks.length + r.albums.length + r.artists.length + r.playlists.length : 0);
  const KIND: Record<string, string> = { album: 'Album', playlist: 'Playlist', artist: 'Artist' };

  function openTop() {
    if (!top) return;
    if (top.type === 'track') player.playRadio(top.track);
    else router.go({ name: top.ref.kind, id: top.ref.id });
  }
</script>

<div class="page">
  {#if q}
    <header class="sh enter">
      <div class="label">Search{#if r && total} · <span class="num">{total}</span> results{/if}</div>
      <h1 class="h1 ellipsis">{q}</h1>
    </header>
  {/if}
  {#if res.state.loading && !r}
    <Loading />
  {:else if res.state.error}
    <Loading error={res.state.error} retry={res.run} />
  {:else if r}
    {#if !total}
      <div class="none">
        <div class="label">No results</div>
        <h2 class="h2">Nothing for “{q}”</h2>
        <p>Check the spelling or try fewer words.</p>
      </div>
    {:else}
      <div class="topgrid enter">
        {#if top}
          <section class="tr">
            <h2 class="h2 sec">Top result</h2>
            <div class="top-result" role="button" tabindex="0" onclick={openTop}
              onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openTop())}
              onmouseenter={() => top.type === 'track' && player.warm(top.track)}>
              {#if top.type === 'track'}
                <Art src={top.track.art} size={96} radius={8} />
                <div class="ttl ellipsis">{top.track.title}</div>
                <div class="label type"><span class="pill">Song</span>{artistLine(top.track)}</div>
              {:else}
                <Art src={top.ref.art} size={96} radius={8} round={top.ref.kind === 'artist'} />
                <div class="ttl ellipsis">{top.ref.title}</div>
                <div class="label type"><span class="pill">{KIND[top.ref.kind] ?? top.ref.kind}</span>{top.ref.subtitle ?? ''}</div>
              {/if}
              <span class="go" aria-hidden="true"><Icon name="play" size={20} /></span>
            </div>
          </section>
        {/if}
        {#if r.tracks.length}
          <section class="songs">
            <h2 class="h2 sec">Songs</h2>
            <TrackList tracks={r.tracks.slice(0, 4)} showAlbum={false} />
          </section>
        {/if}
      </div>
      {#if r.tracks.length > 4}
        <section class="more">
          <h2 class="h2 sec">More songs</h2>
          <TrackList tracks={r.tracks.slice(4, 20)} />
        </section>
      {/if}
      {#if r.artists.length}<Shelf shelf={{ title: 'Artists', items: r.artists.map((ref) => ({ type: 'collection', ref })) }} />{/if}
      {#if r.albums.length}<Shelf shelf={{ title: 'Albums', items: r.albums.map((ref) => ({ type: 'collection', ref })) }} />{/if}
      {#if r.playlists.length}<Shelf shelf={{ title: 'Playlists', items: r.playlists.map((ref) => ({ type: 'collection', ref })) }} />{/if}
    {/if}
  {:else if !q}
    <div class="none">
      <div class="label">Search</div>
      <h2 class="h2">Find songs, albums and artists</h2>
      <p>Press <kbd>Ctrl</kbd> <kbd>K</kbd> anywhere to search.</p>
    </div>
  {/if}
</div>

<style>
  .sh {
    padding: 36px 0 28px;
  }
  .sh .h1 {
    margin-top: 10px;
  }
  section {
    margin-bottom: 40px;
    min-width: 0;
  }
  .sec {
    padding-bottom: 14px;
  }
  .topgrid {
    display: grid;
    grid-template-columns: minmax(280px, 0.85fr) 1.4fr;
    gap: 28px;
  }
  .top-result {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 22px;
    border-radius: 14px;
    background: var(--bg-1);
    box-shadow: inset 0 0 0 1px var(--hair);
    cursor: pointer;
    transition: background 0.15s, box-shadow 0.15s;
  }
  .top-result:hover {
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair-2);
  }
  .ttl {
    margin-top: 18px;
    font: 650 28px/1.12 var(--sans);
    letter-spacing: -0.035em;
    padding-right: 60px;
  }
  .type {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    padding-right: 60px;
    color: var(--text-2);
    text-transform: none;
    letter-spacing: 0;
    font-size: 12px;
  }
  .pill {
    flex: none;
    padding: 3px 7px;
    border-radius: 5px;
    font-size: 9.5px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-2);
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  .go {
    position: absolute;
    right: 20px;
    bottom: 20px;
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.18s var(--ease), transform 0.18s var(--ease);
  }
  .top-result:hover .go,
  .top-result:focus-visible .go {
    opacity: 1;
    transform: none;
  }
  .none {
    padding: 72px 0;
    color: var(--text-3);
  }
  .none .h2 {
    margin: 10px 0 8px;
    color: var(--text);
  }
  .none p {
    margin: 0;
  }
  @media (max-width: 900px) {
    .topgrid {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
</style>
