<script lang="ts">
  // The left column: where you go, what you keep, what was made for you.
  // Expanded (264px) or a 76px icon rail (B toggles; persisted in settings).
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import Mosaic from './Mosaic.svelte';
  import { library } from '../lib/library.svelte';
  import { router, type LibraryTab, type Route } from '../lib/router.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { ui } from '../lib/ui.svelte';
  import type { Mix } from '../lib/taste/recommend';
  import type { CollectionRef } from '../lib/sources/types';

  const mini = $derived(library.settings.sidebar === false);
  const r = $derived(router.current);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const searchKey = isMac ? '⌘K' : 'Ctrl K';

  $effect(() => {
    document.documentElement.dataset.side = mini ? 'mini' : 'full';
  });

  const toggle = () => library.updateSettings({ sidebar: mini });

  const mixes = $derived.by(() => {
    const m = taste.mixes;
    return [m.now, ...m.worlds, m.fresh, m.repeat, m.rotation].filter((x): x is Mix => !!x && x.tracks.length > 0);
  });
  const hasTaste = $derived((taste.version, taste.hasTaste));
  const albums = $derived(library.saved.filter((x) => x.kind === 'album').length);
  const saved = $derived(library.saved.filter((x) => x.kind === 'album' || x.kind === 'playlist'));

  const arts = (ts: { art?: string }[]) => ts.slice(0, 12).map((t) => t.art);

  const libTab = (tab?: LibraryTab) => r.name === 'library' && r.tab === tab;
  const isMix = (id: string) => r.name === 'mix' && r.id === id;
  const isLocal = (id: string) => r.name === 'local' && r.id === id;
  const isSaved = (ref: CollectionRef) => (r.name === 'album' || r.name === 'playlist') && r.name === ref.kind && r.id === ref.id;

  const go = (route: Route) => router.go(route);

  function newPlaylist() {
    const p = library.createPlaylist(`Playlist ${library.playlists.length + 1}`);
    router.go({ name: 'local', id: p.id });
  }

  const LIBRARY: { tab: LibraryTab; icon: string; label: string; count: () => number | null }[] = [
    { tab: 'liked', icon: 'heart', label: 'Liked songs', count: () => library.liked.length },
    { tab: 'history', icon: 'clock', label: 'Recently played', count: () => null },
    { tab: 'albums', icon: 'album', label: 'Albums', count: () => albums },
    { tab: 'artists', icon: 'user', label: 'Artists', count: () => library.following.length },
  ];

  // One floating tooltip for the collapsed rail (the list scrolls, so CSS ::after would clip).
  let tip = $state<{ text: string; key?: string; y: number } | null>(null);
  function over(e: PointerEvent) {
    if (!mini) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
    if (!el) return void (tip = null);
    const b = el.getBoundingClientRect();
    tip = { text: el.dataset.tip!, key: el.dataset.key, y: b.top + b.height / 2 };
  }
</script>

<aside class="side" class:mini onpointerover={over} onpointerleave={() => (tip = null)} aria-label="Sidebar">
  <div class="head">
    {#if mini}
      <button class="brand-toggle" onclick={toggle} aria-label="Expand sidebar" data-tip="Expand sidebar" data-key="B">
        <span class="b-logo"><Logo size={26} /></span>
        <span class="b-icon"><Icon name="sidebar" size={18} /></span>
      </button>
    {:else}
      <button class="brand" onclick={() => go({ name: 'home' })} aria-label="Moonbow home"><Logo size={26} wordmark /></button>
      <button class="icon-btn collapse" onclick={toggle} aria-label="Collapse sidebar" title="Collapse sidebar (B)"><Icon name="sidebar" size={18} /></button>
    {/if}
  </div>

  <nav class="group">
    <button class="row" class:on={r.name === 'home'} onclick={() => go({ name: 'home' })} aria-label={mini ? 'For you' : undefined} data-tip="For you">
      <Icon name="sparkles" size={18} />
      {#if !mini}<span class="t">For you</span>{/if}
    </button>
    <button class="row" class:on={r.name === 'search'} onclick={() => (ui.paletteOpen = true)} aria-label={mini ? 'Search' : undefined} data-tip="Search" data-key={searchKey}>
      <Icon name="search" size={18} />
      {#if !mini}<span class="t">Search</span><kbd>{searchKey}</kbd>{/if}
    </button>
    <button class="row" class:on={r.name === 'taste'} onclick={() => go({ name: 'taste' })} aria-label={mini ? 'Your sound' : undefined} data-tip="Your sound">
      <Icon name="wave" size={18} />
      {#if !mini}<span class="t">Your sound</span>{/if}
    </button>
  </nav>

  <div class="group">
    {#if mini}
      <div class="rule"></div>
    {:else}
      <button class="label sec-btn" class:on={libTab(undefined)} onclick={() => go({ name: 'library' })}>Library</button>
    {/if}
    {#each LIBRARY as it (it.tab)}
      {@const n = it.count()}
      <button class="row" class:on={libTab(it.tab)} onclick={() => go({ name: 'library', tab: it.tab })} aria-label={mini ? it.label : undefined} data-tip={it.label}>
        <Icon name={it.icon} size={18} />
        {#if !mini}
          <span class="t">{it.label}</span>
          {#if n}<span class="n num">{n}</span>{/if}
        {/if}
      </button>
    {/each}
  </div>

  <div class="pane scroll" onscroll={() => (tip = null)}>
    <section>
      {#if mini}
        {#if mixes.length}<div class="rule"></div>{/if}
      {:else}
        <div class="sec"><span class="label">Made for you</span>{#if taste.building}<span class="dot" title="Updating your mixes"></span>{/if}</div>
      {/if}
      {#each mixes as m (m.id)}
        <button class="row thumb" class:on={isMix(m.id)} onclick={() => go({ name: 'mix', id: m.id })} aria-label={mini ? m.title : undefined} data-tip={m.title}>
          <Mosaic arts={arts(m.tracks)} size={mini ? 36 : 32} radius={mini ? 7 : 5} />
          {#if !mini}
            <span class="two">
              <span class="t ellipsis">{m.title}</span>
              <span class="s num">Mix · {m.tracks.length}</span>
            </span>
          {/if}
        </button>
      {:else}
        {#if !mini && !hasTaste}<p class="hint">Play a few songs and your mixes appear here.</p>{/if}
      {/each}
    </section>

    <section>
      {#if mini}
        <div class="rule"></div>
        <button class="row" onclick={newPlaylist} aria-label="New playlist" data-tip="New playlist"><Icon name="plus" size={18} /></button>
      {:else}
        <div class="sec">
          <span class="label">Playlists</span>
          <button class="add" onclick={newPlaylist} aria-label="New playlist" title="New playlist"><Icon name="plus" size={15} /></button>
        </div>
      {/if}
      {#each library.playlists as p (p.id)}
        <button class="row thumb" class:on={isLocal(p.id)} onclick={() => go({ name: 'local', id: p.id })} aria-label={mini ? p.name : undefined} data-tip={p.name}>
          {#if p.tracks.length}
            <Mosaic arts={arts(p.tracks)} size={mini ? 36 : 32} radius={mini ? 7 : 5} />
          {:else}
            <span class="empty" style:--d="{mini ? 36 : 32}px"><Icon name="lyrics" size={15} /></span>
          {/if}
          {#if !mini}
            <span class="two">
              <span class="t ellipsis">{p.name}</span>
              <span class="s num">Playlist · {p.tracks.length}</span>
            </span>
          {/if}
        </button>
      {/each}
      {#each saved as ref (ref.id)}
        <button class="row thumb" class:on={isSaved(ref)} onclick={() => go({ name: ref.kind as 'album' | 'playlist', id: ref.id })} aria-label={mini ? ref.title : undefined} data-tip={ref.title}>
          <Art src={ref.art} size={mini ? 36 : 32} radius={mini ? 7 : 5} />
          {#if !mini}
            <span class="two">
              <span class="t ellipsis">{ref.title}</span>
              <span class="s ellipsis"><span class="mono">{ref.kind === 'album' ? 'Album' : 'Playlist'}</span>{#if ref.subtitle}&ensp;·&ensp;{ref.subtitle}{/if}</span>
            </span>
          {/if}
        </button>
      {/each}
      {#if !mini && !library.playlists.length && !saved.length}
        <p class="hint">Make a playlist with +, or save albums you find.</p>
      {/if}
    </section>
  </div>

  <div class="foot">
    <button class="row" onclick={() => (ui.settingsOpen = true)} aria-label={mini ? 'Settings' : undefined} data-tip="Settings">
      <Icon name="settings" size={18} />
      {#if !mini}<span class="t">Settings</span>{/if}
    </button>
    <button class="icon-btn keys" onclick={() => (ui.helpOpen = true)} aria-label="Keyboard shortcuts" title={mini ? undefined : 'Keyboard shortcuts (?)'} data-tip="Keyboard shortcuts" data-key="?">
      <Icon name="keyboard" size={18} />
    </button>
  </div>
</aside>

{#if mini && tip}
  <div class="tip" style:top="{tip.y}px" role="tooltip">{tip.text}{#if tip.key}<kbd>{tip.key}</kbd>{/if}</div>
{/if}

<style>
  .side {
    position: fixed;
    left: 0;
    top: 0;
    bottom: var(--bar);
    width: var(--side);
    z-index: 35;
    display: flex;
    flex-direction: column;
    background: var(--bg-1);
    border-right: 1px solid var(--hair);
    padding: 0 10px;
  }

  .head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
    padding: 0 2px 0 10px;
  }
  .brand {
    display: inline-flex;
    padding: 4px 2px;
    border-radius: 8px;
  }
  .collapse {
    width: 32px;
    height: 32px;
    color: var(--text-3);
  }
  .mini .head {
    justify-content: center;
    padding: 0;
  }
  .brand-toggle {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    color: var(--text-2);
    transition: background 0.15s;
  }
  .brand-toggle > span {
    grid-area: 1 / 1;
    display: grid;
    transition: opacity 0.15s, transform 0.2s var(--ease);
  }
  .b-icon {
    opacity: 0;
    transform: scale(0.8);
  }
  .brand-toggle:hover {
    background: var(--bg-3);
  }
  .brand-toggle:hover .b-logo {
    opacity: 0;
    transform: scale(0.8);
  }
  .brand-toggle:hover .b-icon {
    opacity: 1;
    transform: none;
  }

  .group {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-bottom: 10px;
  }

  /* ---- rows ---- */
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
    border-radius: 8px;
    font-size: 13.5px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--text-2);
    text-align: left;
    transition: background 0.12s, color 0.12s;
  }
  .row :global(svg) {
    flex: none;
  }
  .row:hover {
    color: var(--text);
    background: var(--bg-2);
  }
  .row:active {
    background: var(--bg-3);
  }
  .row.on {
    color: var(--text);
    background: var(--bg-3);
  }
  .row.on::before {
    content: '';
    position: absolute;
    left: 0;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
  }
  .row.on > :global(svg) {
    color: var(--accent);
  }
  .t {
    flex: 1;
    min-width: 0;
  }
  .row kbd {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .row:hover kbd {
    opacity: 1;
  }
  .n {
    font-size: 11px;
    color: var(--text-3);
  }

  .row.thumb {
    min-height: 44px;
    padding: 0 8px 0 6px;
    gap: 11px;
  }
  .row.thumb.on::before {
    top: 13px;
    bottom: 13px;
  }
  .two {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .two .t {
    font-size: 13.5px;
  }
  .row.on .two .t {
    color: var(--text);
  }
  .s {
    font-size: 11px;
    color: var(--text-3);
    letter-spacing: -0.01em;
    margin-top: 1px;
  }
  .s .mono {
    font-size: 10.5px;
  }
  .empty {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--d);
    height: var(--d);
    border-radius: 5px;
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--hair);
    color: var(--text-4);
  }

  /* ---- section headers ---- */
  .sec,
  .sec-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 10px;
  }
  .sec-btn {
    width: 100%;
    margin-top: 2px;
    border-radius: 8px;
    text-align: left;
    transition: color 0.15s;
  }
  .sec-btn:hover,
  .sec-btn.on {
    color: var(--text);
  }
  .sec {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-1);
    justify-content: space-between;
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    margin-right: auto;
    animation: pulse 1.2s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to {
      opacity: 0.25;
    }
  }
  .add {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    margin-right: -4px;
    border-radius: 7px;
    color: var(--text-3);
    transition: color 0.15s, background 0.15s;
  }
  .add:hover {
    color: var(--text);
    background: var(--bg-3);
  }
  .hint {
    margin: 2px 10px 10px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-4);
  }
  .rule {
    height: 1px;
    margin: 6px 14px 8px;
    background: var(--hair);
  }

  /* ---- the scrolling part ---- */
  .pane {
    flex: 1;
    min-height: 0;
    margin: 0 -10px;
    padding: 0 10px 10px;
    border-top: 1px solid var(--hair);
  }
  .pane section {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-top: 8px;
  }
  .mini .pane {
    border-top: 0;
  }
  .mini .pane section {
    padding-top: 0;
  }

  .foot {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 54px;
    margin: 0 -10px;
    padding: 0 10px;
    border-top: 1px solid var(--hair);
  }
  .foot .row {
    flex: 1;
  }
  .keys {
    width: 34px;
    height: 34px;
    color: var(--text-3);
  }

  /* ---- collapsed rail ---- */
  .mini .row {
    justify-content: center;
    padding: 0;
    min-height: 40px;
  }
  .mini .row.thumb {
    min-height: 46px;
    padding: 0;
  }
  .mini .row.on::before {
    left: -10px;
    top: 12px;
    bottom: 12px;
  }
  .mini .row.thumb.on {
    background: none;
  }
  .mini .row.thumb.on :global(.mosaic),
  .mini .row.thumb.on :global(.art) {
    box-shadow: 0 0 0 1.5px var(--accent);
  }
  .mini .foot {
    flex-direction: column;
    height: auto;
    padding: 6px 10px 8px;
    gap: 2px;
  }
  .mini .foot .row {
    flex: none;
  }
  .mini .keys {
    width: 100%;
    height: 40px;
  }

  .tip {
    position: fixed;
    left: calc(var(--side) + 8px);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    transform: translateY(-50%);
    border-radius: 8px;
    background: var(--bg-4);
    box-shadow: inset 0 0 0 1px var(--hair-2), 0 8px 24px rgb(0 0 0 / 0.5);
    font-size: 12.5px;
    font-weight: 520;
    white-space: nowrap;
    pointer-events: none;
    animation: tip 0.14s var(--ease) both;
  }
  .tip kbd {
    background: var(--bg-2);
  }
  @keyframes tip {
    from {
      opacity: 0;
      transform: translate(-4px, -50%);
    }
  }
</style>
