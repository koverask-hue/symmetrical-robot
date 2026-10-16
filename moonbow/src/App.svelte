<script lang="ts">
  import { onMount } from 'svelte';
  import Backdrop from './components/Backdrop.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import Help from './components/Help.svelte';
  import LyricsView from './components/LyricsView.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import PlayerBar from './components/PlayerBar.svelte';
  import Queue from './components/Queue.svelte';
  import Settings from './components/Settings.svelte';
  import Sidebar from './components/Sidebar.svelte';
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

  // New page: start at the top, and step out of the stage so you can see it.
  let first = true;
  $effect(() => {
    r;
    main?.scrollTo({ top: 0 });
    if (first) first = false;
    else ui.lyricsOpen = false;
  });

  $effect(() => {
    const t = player.current;
    document.title = t ? `${t.title} · ${artistLine(t)}` : 'Moonbow';
  });
</script>

<svelte:window onkeydown={onKey} onmouseup={(e) => (e.button === 3 ? router.back() : e.button === 4 ? router.forward() : null)} />

<Backdrop />
<div class="app" inert={onboarding}>
  <Sidebar />

  <main class="scroll" bind:this={main} class:away={ui.lyricsOpen} inert={ui.lyricsOpen}>
    <TopBar />
    <div class="pages">
      {#key JSON.stringify(r)}
        {#if r.name === 'home'}<Home />
        {:else if r.name === 'search'}<Search q={r.q} />
        {:else if r.name === 'album'}<Collection kind="album" id={r.id} />
        {:else if r.name === 'playlist'}<Collection kind="playlist" id={r.id} />
        {:else if r.name === 'artist'}<Artist id={r.id} />
        {:else if r.name === 'library'}<Library tab={r.tab} />
        {:else if r.name === 'local'}<LocalPlaylist id={r.id} />
        {:else if r.name === 'mix'}<MixPage id={r.id} />
        {:else if r.name === 'taste'}<Taste />
        {/if}
      {/key}
    </div>
  </main>

  {#if ui.lyricsOpen}<LyricsView />{/if}
  {#if ui.queueOpen}<Queue />{/if}
  <PlayerBar />
</div>

{#if onboarding}<Onboarding />{/if}
{#if ui.paletteOpen}<CommandPalette />{/if}
{#if ui.helpOpen}<Help />{/if}
{#if ui.settingsOpen}<Settings />{/if}
{#if ui.menu}<TrackMenu menu={ui.menu} />{/if}
<Toasts />

<style>
  :global(:root[data-side='mini']) {
    --side: 76px;
  }
  main {
    position: fixed;
    top: 0;
    right: 0;
    bottom: var(--bar);
    left: var(--side);
    container-type: inline-size;
    transition: opacity 0.2s var(--ease);
  }
  main.away {
    opacity: 0;
    pointer-events: none;
  }
  .pages {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 32px 40px;
  }
</style>
