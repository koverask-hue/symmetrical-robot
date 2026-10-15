<script lang="ts">
  import Icon from './Icon.svelte';
  import { router } from '../lib/router.svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { source } from '../lib/sources';

  const cur = $derived(router.current);

  function newPlaylist() {
    const p = library.createPlaylist(`Playlist ${library.playlists.length + 1}`);
    router.go({ name: 'local', id: p.id });
  }
</script>

<nav class="side">
  <div class="brand">
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb36b" /><stop offset="1" stop-color="#ff5d8f" /></linearGradient></defs>
      <rect width="32" height="32" rx="9" fill="url(#lg)" />
      <path d="M9 11h14M9 16h10M9 21h6" stroke="#1a0f1a" stroke-width="2.6" stroke-linecap="round" />
    </svg>
    <span>Verse</span>
  </div>

  <button class="nav" class:on={cur.name === 'home'} onclick={() => router.go({ name: 'home' })}><Icon name="home" /> Home</button>
  <button class="nav" class:on={cur.name === 'search'} onclick={() => (ui.paletteOpen = true)}>
    <Icon name="search" /> Search <kbd class="k">Ctrl K</kbd>
  </button>
  <button class="nav" class:on={cur.name === 'library'} onclick={() => router.go({ name: 'library' })}><Icon name="library" /> Library</button>

  <div class="section">
    <span>Playlists</span>
    <button class="icon-btn small" onclick={newPlaylist} aria-label="New playlist" title="New playlist"><Icon name="plus" size={16} /></button>
  </div>
  <div class="lists scroll">
    <button class="pl" class:on={cur.name === 'library'} onclick={() => router.go({ name: 'library' })}>
      <span class="liked"><Icon name="heart-filled" size={14} /></span>
      <span class="ellipsis">Liked songs</span><span class="count">{library.liked.length}</span>
    </button>
    {#each library.playlists as p (p.id)}
      <button class="pl" class:on={cur.name === 'local' && cur.id === p.id} onclick={() => router.go({ name: 'local', id: p.id })}>
        <span class="dot"></span><span class="ellipsis">{p.name}</span><span class="count">{p.tracks.length}</span>
      </button>
    {/each}
  </div>

  <div class="foot">
    <button class="icon-btn" onclick={() => (ui.settingsOpen = true)} aria-label="Settings" title="Settings"><Icon name="settings" size={18} /></button>
    <button class="icon-btn" onclick={() => (ui.helpOpen = true)} aria-label="Keyboard shortcuts" title="Shortcuts (?)"><Icon name="keyboard" size={18} /></button>
    <span class="src">{source.name}</span>
  </div>
</nav>

<style>
  .side {
    width: var(--side-w);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 18px 10px 10px;
    background: var(--glass);
    backdrop-filter: blur(30px) saturate(1.3);
    border-right: 1px solid var(--line);
    min-height: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px 18px;
    font: 800 20px var(--display);
    letter-spacing: -0.03em;
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    color: var(--text-2);
    font-weight: 600;
    text-align: left;
  }
  .nav:hover {
    color: var(--text);
    background: var(--hover);
  }
  .nav.on {
    color: var(--text);
    background: var(--active);
  }
  .k {
    margin-left: auto;
  }
  .section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 6px 4px 12px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .small {
    width: 28px;
    height: 28px;
  }
  .lists {
    flex: 1;
    min-height: 0;
  }
  .pl {
    width: 100%;
    display: grid;
    grid-template-columns: 22px 1fr auto;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    color: var(--text-2);
    text-align: left;
  }
  .pl:hover {
    background: var(--hover);
    color: var(--text);
  }
  .pl.on {
    color: var(--text);
    background: var(--active);
  }
  .liked {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: linear-gradient(135deg, #ffb36b, #ff5d8f);
    color: #fff;
  }
  .dot {
    width: 8px;
    height: 8px;
    margin-left: 7px;
    border-radius: 50%;
    background: var(--text-3);
  }
  .count {
    font-size: 12px;
    color: var(--text-3);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .src {
    margin-left: auto;
    padding-right: 8px;
    font-size: 11px;
    color: var(--text-3);
  }
</style>
