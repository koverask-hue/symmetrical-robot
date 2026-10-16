<script lang="ts">
  // Sticky strip at the top of the page: history, a search field that opens the palette, you.
  import Icon from './Icon.svelte';
  import { router } from '../lib/router.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { ui } from '../lib/ui.svelte';

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const q = $derived(router.current.name === 'search' ? router.current.q : '');
  const name = $derived((taste.version, taste.state.name.trim()));
  const initial = $derived(name ? name[0].toUpperCase() : '');
</script>

<div class="top">
  <div class="inner">
    <div class="nav">
      <button class="icon-btn" onclick={() => router.back()} disabled={router.stack.length < 2} aria-label="Back" title="Back (Alt ←)"><Icon name="back" size={18} /></button>
      <button class="icon-btn" onclick={() => router.forward()} disabled={!router.forwardStack.length} aria-label="Forward" title="Forward (Alt →)"><Icon name="forward" size={18} /></button>
    </div>

    <button class="search" onclick={() => (ui.paletteOpen = true)} aria-label="Search songs, artists, albums">
      <Icon name="search" size={16} />
      <span class="ph" class:q={!!q}>{q || 'Search songs, artists, albums'}</span>
      <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>

    <div class="me">
      <button class="avatar" class:on={router.current.name === 'taste'} onclick={() => router.go({ name: 'taste' })} aria-label="Taste profile" title={name ? `${name} · taste profile` : 'Taste profile'}>
        {#if initial}{initial}{:else}<Icon name="user" size={15} />{/if}
      </button>
    </div>
  </div>
</div>

<style>
  .top {
    position: sticky;
    top: 0;
    z-index: 20;
    background: linear-gradient(var(--bg) 0%, rgb(7 7 8 / 0.92) 55%, transparent);
    pointer-events: none;
  }
  .inner {
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: 1280px;
    height: 68px;
    margin: 0 auto;
    padding: 0 32px;
  }
  .inner > * {
    pointer-events: auto;
  }
  .nav {
    display: flex;
    gap: 2px;
  }
  .nav .icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--bg-2);
  }
  .nav .icon-btn:hover {
    background: var(--bg-3);
  }
  .nav .icon-btn:disabled {
    opacity: 0.35;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    width: min(420px, 100%);
    height: 40px;
    padding: 0 8px 0 14px;
    border-radius: 999px;
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair);
    color: var(--text-3);
    font-size: 13.5px;
    text-align: left;
    transition: background 0.15s, box-shadow 0.15s, color 0.15s;
  }
  .search:hover {
    color: var(--text-2);
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--hair-2);
  }
  .ph {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .ph.q {
    color: var(--text);
  }
  .search kbd {
    flex: none;
  }

  .me {
    margin-left: auto;
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--hair-2);
    font: 600 13px/1 var(--sans);
    color: var(--text);
    transition: box-shadow 0.15s, transform 0.12s;
  }
  .avatar:hover {
    box-shadow: inset 0 0 0 1px rgb(var(--accent-rgb) / 0.5);
  }
  .avatar:active {
    transform: scale(0.94);
  }
  .avatar.on {
    color: var(--accent-ink);
    background: var(--accent);
    box-shadow: none;
  }
</style>
