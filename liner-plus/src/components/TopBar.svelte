<script lang="ts">
  import Icon from './Icon.svelte';
  import { router } from '../lib/router.svelte';
  import { ui } from '../lib/ui.svelte';
</script>

<div class="top">
  <button class="icon-btn" onclick={() => router.back()} disabled={router.stack.length < 2} aria-label="Back"><Icon name="back" /></button>
  <button class="icon-btn" onclick={() => router.forward()} disabled={!router.forwardStack.length} aria-label="Forward"><Icon name="forward" /></button>
  <button class="search" onclick={() => (ui.paletteOpen = true)}>
    <Icon name="search" size={17} />
    <span>{router.current.name === 'search' ? router.current.q : 'Search songs, albums, artists'}</span>
    <kbd>Ctrl K</kbd>
  </button>
</div>

<style>
  .top {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 24px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    width: min(440px, 100%);
    height: 40px;
    margin-left: 10px;
    padding: 0 10px 0 14px;
    border-radius: 999px;
    background: var(--glass-strong);
    backdrop-filter: blur(20px);
    border: 1px solid var(--line);
    color: var(--text-3);
    text-align: left;
  }
  .search span {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .search:hover {
    border-color: rgb(255 255 255 / 0.18);
    color: var(--text-2);
  }
</style>
