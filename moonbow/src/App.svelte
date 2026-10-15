<script lang="ts">
  import { onMount } from 'svelte';
  import Backdrop from './components/Backdrop.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import Help from './components/Help.svelte';
  import LyricsView from './components/LyricsView.svelte';
  import NowPlaying from './components/NowPlaying.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import Queue from './components/Queue.svelte';
  import Rail from './components/Rail.svelte';
  import Settings from './components/Settings.svelte';
  import Toasts from './components/Toasts.svelte';
  import TopBar from './components/TopBar.svelte';
  import TrackMenu from './components/TrackMenu.svelte';
  import Artist from './pages/Artist.svelte';
  import Collection from './pages/Collection.svelte';
  import Home from './pages/Home.svelte';
  import Library from './pages/Library.svelte';
  import LocalPlaylist from './pages/LocalPlaylist.svelte';
  import MixPage from './pages/MixPage.svelte';
  import Search from './pages/Search.svelte';
  import Taste from './pages/Taste.svelte';
  import { onKey } from './lib/keys';
  import { router } from './lib/router.svelte';
  import { ui } from './lib/ui.svelte';
  import { player } from './lib/player/player.svelte';
  import { taste } from './lib/taste/store.svelte';
  import { artistLine } from './lib/sources/types';

  const r = $derived(router.current);
  const onboarding = $derived(taste.loaded && (taste.version, !taste.state.onboarded));
  let main: HTMLElement;

  onMount(() => void taste.load());

  $effect(() => {
    r;
    main?.scrollTo({ top: 0 });
  });

  $effect(() => {
    const t = player.current;
    document.title = t ? `${t.title} · ${artistLine(t)}` : 'Moonbow';
  });
</script>

<svelte:window onkeydown={onKey} onmouseup={(e) => (e.button === 3 ? router.back() : e.button === 4 ? router.forward() : null)} />

<Backdrop />
<div class="app" inert={onboarding}>
<Rail />

<main class="scroll" bind:this={main} class:dimmed={ui.lyricsOpen}>
  <TopBar />
  <div class="pages">
    {#key JSON.stringify(r)}
      {#if r.name === 'home'}<Home />
      {:else if r.name === 'search'}<Search q={r.q} />
      {:else if r.name === 'album'}<Collection kind="album" id={r.id} />
      {:else if r.name === 'playlist'}<Collection kind="playlist" id={r.id} />
      {:else if r.name === 'artist'}<Artist id={r.id} />
      {:else if r.name === 'library'}<Library />
      {:else if r.name === 'local'}<LocalPlaylist id={r.id} />
      {:else if r.name === 'mix'}<MixPage id={r.id} />
      {:else if r.name === 'taste'}<Taste />
      {/if}
    {/key}
  </div>
</main>

{#if ui.lyricsOpen}<LyricsView />{/if}
{#if ui.queueOpen}<Queue />{/if}
<NowPlaying />
</div>

{#if onboarding}<Onboarding />{/if}
{#if ui.paletteOpen}<CommandPalette />{/if}
{#if ui.helpOpen}<Help />{/if}
{#if ui.settingsOpen}<Settings />{/if}
{#if ui.menu}<TrackMenu menu={ui.menu} />{/if}
<Toasts />

<style>
  main {
    position: fixed;
    inset: 0;
    padding-left: var(--rail);
    container-type: inline-size;
    transition: opacity 0.5s var(--ease), filter 0.5s var(--ease), transform 0.6s var(--ease);
  }
  main.dimmed {
    opacity: 0;
    filter: blur(12px);
    transform: scale(0.98);
    pointer-events: none;
  }
  .pages {
    max-width: 1320px;
    margin: 0 auto;
    padding: 0 40px calc(var(--capsule) + 70px);
  }
</style>
