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

  function openTop() {
    if (!top) return;
    if (top.type === 'track') player.playRadio(top.track);
    else router.go({ name: top.ref.kind, id: top.ref.id });
  }
</script>

<div class="page">
  {#if q}<header class="sh enter"><div class="kicker">Search</div><h1 class="display">{q}</h1></header>{/if}
  {#if res.state.loading && !r}
    <Loading />
  {:else if res.state.error}
    <Loading error={res.state.error} retry={res.run} />
  {:else if r}
    {#if !r.tracks.length && !r.albums.length && !r.artists.length && !r.playlists.length}
      <div class="none"><h2>Nothing for <em>“{q}”</em></h2><p class="muted">Check the spelling or try fewer words.</p></div>
    {:else}
      <div class="topgrid">
        {#if top}
          <section>
            <h2>Top result</h2>
            <div class="top-result" role="button" tabindex="0" onclick={openTop} onkeydown={(e) => e.key === 'Enter' && openTop()}>
              {#if top.type === 'track'}
                <Art src={top.track.art} size={104} />
                <div class="ttl">{top.track.title}</div>
                <div class="muted">Song · {artistLine(top.track)}</div>
              {:else}
                <Art src={top.ref.art} size={104} round={top.ref.kind === 'artist'} />
                <div class="ttl">{top.ref.title}</div>
                <div class="muted">{top.ref.subtitle ?? top.ref.kind}</div>
              {/if}
              <span class="go"><Icon name="play" size={20} /></span>
            </div>
          </section>
        {/if}
        {#if r.tracks.length}
          <section class="songs">
            <h2>Songs</h2>
            <TrackList tracks={r.tracks.slice(0, 4)} showAlbum={false} />
          </section>
        {/if}
      </div>
      {#if r.tracks.length > 4}
        <section><h2>More songs</h2><TrackList tracks={r.tracks.slice(4, 20)} /></section>
      {/if}
      {#if r.artists.length}<Shelf shelf={{ title: 'Artists', items: r.artists.map((ref) => ({ type: 'collection', ref })) }} />{/if}
      {#if r.albums.length}<Shelf shelf={{ title: 'Albums', items: r.albums.map((ref) => ({ type: 'collection', ref })) }} />{/if}
      {#if r.playlists.length}<Shelf shelf={{ title: 'Playlists', items: r.playlists.map((ref) => ({ type: 'collection', ref })) }} />{/if}
    {/if}
  {/if}
</div>

<style>
  h2 {
    font: 400 30px/1.1 var(--serif);
    padding: 0 12px 12px;
  }
  section {
    margin-bottom: 40px;
  }
  .sh {
    padding: 30px 12px 34px;
  }
  .sh .display {
    margin-top: 12px;
    font-style: italic;
  }
  .topgrid {
    display: grid;
    grid-template-columns: minmax(260px, 0.8fr) 1.4fr;
    gap: 16px;
  }
  .top-result {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 20px;
    border-radius: 34px;
    background: rgb(14 10 26 / 0.42);
    backdrop-filter: blur(24px);
    box-shadow: var(--glass-edge);
    cursor: pointer;
    transition: background 0.15s;
  }
  .top-result:hover {
    background: var(--active);
  }
  .ttl {
    margin-top: 16px;
    font: 400 40px/1.05 var(--serif);
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
    background: var(--text);
    color: #111;
    opacity: 0;
    transform: translateY(6px);
    transition: 0.15s;
  }
  .top-result:hover .go {
    opacity: 1;
    transform: none;
  }
  .none {
    padding: 80px 10px;
    text-align: center;
  }
  @media (max-width: 900px) {
    .topgrid {
      grid-template-columns: 1fr;
    }
  }
</style>
