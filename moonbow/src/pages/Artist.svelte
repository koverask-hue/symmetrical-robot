<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Loading from '../components/Loading.svelte';
  import Shelf from '../components/Shelf.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { source } from '../lib/sources';
  import { player } from '../lib/player/player.svelte';
  import { loader } from '../lib/util/load.svelte';

  let { id }: { id: string } = $props();
  const res = loader(() => source.artist(id));
  $effect(() => {
    id;
    res.run();
  });
  const a = $derived(res.state.data);
  let expanded = $state(false);
</script>

<div class="page">
  {#if res.state.loading && !a}
    <Loading />
  {:else if res.state.error}
    <Loading error={res.state.error} retry={res.run} />
  {:else if a}
    <header class="hero" style:--img={a.art ? `url("${a.art}")` : 'none'}>
      <div class="shade"></div>
      <div class="info">
        <div class="kind">Artist</div>
        <h1>{a.name}</h1>
        <div class="actions">
          <button class="btn primary" onclick={() => player.playTracks(a.topTracks)} disabled={!a.topTracks.length}><Icon name="play" size={16} /> Play</button>
          <button class="btn" onclick={() => a.topTracks[0] && player.playRadio(a.topTracks[0])} disabled={!a.topTracks.length}><Icon name="radio" size={16} /> Radio</button>
        </div>
      </div>
    </header>
    {#if a.topTracks.length}
      <section><h2>Popular</h2><TrackList tracks={a.topTracks.slice(0, expanded ? 20 : 5)} numbered />
        {#if a.topTracks.length > 5}<button class="more muted" onclick={() => (expanded = !expanded)}>{expanded ? 'Show less' : 'Show more'}</button>{/if}
      </section>
    {/if}
    {#each a.shelves as shelf, i (i)}<Shelf {shelf} />{/each}
    {#if a.description}<section class="about"><h2>About</h2><p class="muted">{a.description}</p></section>{/if}
  {/if}
</div>

<style>
  .hero {
    position: relative;
    height: 420px;
    margin: -70px -40px 40px;
    border-radius: 0 0 48px 48px;
    display: flex;
    align-items: flex-end;
    padding: 0 34px 28px;
    background: var(--img) center 25% / cover no-repeat;
    overflow: hidden;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(transparent 25%, rgb(6 5 11 / 0.9));
  }
  .info {
    position: relative;
  }
  .kind {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-2);
  }
  h1 {
    font: 400 clamp(56px, 8vw, 128px) / 0.92 var(--serif);
    letter-spacing: -0.03em;
    margin: 6px 0 16px;
    text-shadow: 0 4px 30px rgb(0 0 0 / 0.4);
  }
  .actions {
    display: flex;
    gap: 10px;
  }
  h2 {
    font: 400 30px/1.1 var(--serif);
    padding: 0 12px 12px;
  }
  section {
    margin-bottom: 28px;
  }
  .more {
    padding: 8px 10px;
    font-weight: 700;
    font-size: 13px;
  }
  .about p {
    max-width: 760px;
    padding: 0 10px;
    white-space: pre-line;
    user-select: text;
  }
</style>
