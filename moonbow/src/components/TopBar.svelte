<script lang="ts">
  import Icon from './Icon.svelte';
  import { router } from '../lib/router.svelte';
  import { ui } from '../lib/ui.svelte';
</script>

<div class="top">
  <div class="nav">
    <button class="icon-btn" onclick={() => router.back()} disabled={router.stack.length < 2} aria-label="Back"><Icon name="back" /></button>
    <button class="icon-btn" onclick={() => router.forward()} disabled={!router.forwardStack.length} aria-label="Forward"><Icon name="forward" /></button>
  </div>
  <button class="search glass" onclick={() => (ui.paletteOpen = true)}>
    <Icon name="search" size={16} />
    <span>{router.current.name === 'search' && router.current.q ? router.current.q : 'Search, or ask for anything'}</span>
    <kbd>Ctrl K</kbd>
  </button>
</div>

<style>
  .top {
    position: relative;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 1320px;
    margin: 0 auto;
    padding: 18px 40px 6px;
  }
  .nav {
    display: flex;
    gap: 2px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 12px;
    width: min(380px, 50%);
    height: 44px;
    padding: 0 10px 0 18px;
    border-radius: 999px;
    color: var(--text-3);
    text-align: left;
    box-shadow: var(--glass-edge);
    transition: color 0.3s var(--ease), box-shadow 0.3s var(--ease);
  }
  .search span {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .search:hover {
    color: var(--text-2);
    box-shadow: var(--glass-edge), 0 0 0 1px rgb(var(--tint) / 0.3);
  }
</style>
