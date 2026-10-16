<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Loading from '../components/Loading.svelte';
  import Shelf from '../components/Shelf.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { source } from '../lib/sources';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { loader } from '../lib/util/load.svelte';

  let { id }: { id: string } = $props();
  const res = loader(() => source.artist(id));
  $effect(() => {
    id;
    res.run();
  });
  const a = $derived(res.state.data);
  const top = $derived(a?.topTracks ?? []);
  const following = $derived(library.isFollowing(id));
  let expanded = $state(false);
  let failed = $state(false);

  function follow() {
    if (!a) return;
    library.toggleFollow({ kind: 'artist', id, title: a.name, art: a.art });
  }
</script>

<div class="page">
  {#if res.state.loading && !a}
    <Loading />
  {:else if res.state.error}
    <Loading error={res.state.error} retry={res.run} />
  {:else if a}
    <header class="ahero enter">
      <div class="banner">
        {#if a.art && !failed}
          <img src={a.art} alt="" draggable="false" decoding="async" onerror={() => (failed = true)} />
        {/if}
        <div class="shade"></div>
      </div>
      <div class="info">
        <div class="label kind"><span class="dot"></span>Artist</div>
        <h1 class="name">{a.name}</h1>
        <div class="label facts">
          Artist · {top.length} top {top.length === 1 ? 'song' : 'songs'}{#if a.shelves.length} · {a.shelves.length} {a.shelves.length === 1 ? 'section' : 'sections'}{/if}
        </div>
      </div>
    </header>

    <div class="actions">
      <button class="round-play" aria-label="Play" onclick={() => player.playTracks(top)} disabled={!top.length}>
        <Icon name="play" size={22} />
      </button>
      <button class="btn" onclick={() => top[0] && player.playRadio(top[0])} disabled={!top.length}>
        <Icon name="radio" size={16} /> Radio
      </button>
      <button class="btn" class:on={following} onclick={follow} aria-pressed={following}>
        <Icon name={following ? 'check' : 'plus'} size={16} />
        {following ? 'Following' : 'Follow'}
      </button>
    </div>

    {#if top.length}
      <section class="popular">
        <div class="sec-head">
          <h2 class="h2">Popular</h2>
          <span class="label">{Math.min(top.length, expanded ? 20 : 5)} / {top.length}</span>
        </div>
        <TrackList tracks={top.slice(0, expanded ? 20 : 5)} numbered showAlbum />
        {#if top.length > 5}
          <button class="more label" onclick={() => (expanded = !expanded)}>{expanded ? 'Show less' : 'Show all'}</button>
        {/if}
      </section>
    {/if}

    {#each a.shelves as shelf, i (i)}<Shelf {shelf} />{/each}

    {#if a.description}
      <section class="about">
        <div class="sec-head"><h2 class="h2">About</h2></div>
        <p>{a.description}</p>
      </section>
    {/if}
  {/if}
</div>

<style>
  .ahero {
    position: relative;
    margin-top: 12px;
    height: 320px;
    border-radius: 16px;
    overflow: hidden;
    display: flex;
    align-items: flex-end;
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  .banner {
    position: absolute;
    inset: 0;
  }
  .banner img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 28%;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgb(7 7 8 / 0) 30%, rgb(7 7 8 / 0.55) 62%, rgb(7 7 8 / 0.94));
  }
  .info {
    position: relative;
    padding: 0 30px 26px;
    min-width: 0;
  }
  .kind {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-2);
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
  }
  .name {
    margin: 10px 0 10px;
    font: 700 clamp(44px, 5.4vw, 72px) / 0.95 var(--sans);
    letter-spacing: -0.045em;
    overflow-wrap: anywhere;
  }
  .facts {
    color: var(--text-2);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 22px 0 30px;
  }
  .actions .round-play {
    margin-right: 6px;
  }
  .round-play:disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  section {
    margin-bottom: 40px;
  }
  .sec-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 12px;
  }
  .more {
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    color: var(--text-2);
    transition: color 0.15s, background 0.15s;
  }
  .more:hover {
    color: var(--text);
    background: var(--bg-2);
  }
  .about p {
    max-width: 720px;
    margin: 0;
    color: var(--text-2);
    line-height: 1.65;
    white-space: pre-line;
    user-select: text;
  }
</style>
