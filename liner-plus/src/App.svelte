<script lang="ts">
  import Backdrop from './components/Backdrop.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import Help from './components/Help.svelte';
  import LyricsView from './components/LyricsView.svelte';
  import NowPlaying from './components/NowPlaying.svelte';
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
  import Search from './pages/Search.svelte';
  import { onKey } from './lib/keys';
  import { router } from './lib/router.svelte';
  import { ui } from './lib/ui.svelte';
  import { player } from './lib/player/player.svelte';
  import { artistLine } from './lib/sources/types';

  const r = $derived(router.current);
  let main: HTMLElement;

  // Each navigation starts at the top of the page.
  $effect(() => {
    r;
    main?.scrollTo({ top: 0 });
  });

  $effect(() => {
    const t = player.current;
    document.title = t ? `${t.title} · ${artistLine(t)}` : 'Verse';
  });
</script>

<svelte:window onkeydown={onKey} onmouseup={(e) => (e.button === 3 ? router.back() : e.button === 4 ? router.forward() : null)} />

<Backdrop />

<div class="shell">
  <Sidebar />
  <div class="content">
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
          {/if}
        {/key}
      </div>
    </main>
    {#if ui.lyricsOpen}<LyricsView />{/if}
    {#if ui.queueOpen}<Queue />{/if}
  </div>
  <div class="bar"><NowPlaying /></div>
</div>

{#if ui.paletteOpen}<CommandPalette />{/if}
{#if ui.helpOpen}<Help />{/if}
{#if ui.settingsOpen}<Settings />{/if}
{#if ui.menu}<TrackMenu menu={ui.menu} />{/if}
<Toasts />

<style>
  .shell {
    height: 100%;
    display: grid;
    grid-template-columns: var(--side-w) 1fr;
    grid-template-rows: 1fr var(--bar-h);
  }
  .content {
    position: relative;
    min-width: 0;
    min-height: 0;
    container-type: inline-size;
    background: rgb(10 8 16 / 0.35);
  }
  main {
    height: 100%;
    transition: opacity 0.3s, filter 0.3s;
  }
  main.dimmed {
    opacity: 0;
    pointer-events: none;
  }
  .pages {
    padding: 0 24px 40px;
    max-width: 1400px;
  }
  .bar {
    grid-column: 1 / -1;
  }
  @media (max-width: 760px) {
    .shell {
      grid-template-columns: 1fr;
    }
    .shell > :global(nav) {
      display: none;
    }
  }
</style>
