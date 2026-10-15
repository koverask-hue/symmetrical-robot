<script lang="ts">
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import { router, type Route } from '../lib/router.svelte';
  import { ui } from '../lib/ui.svelte';

  const ITEMS: { route: Route; icon: string; label: string; match: Route['name'][] }[] = [
    { route: { name: 'home' }, icon: 'sparkle', label: 'For you', match: ['home', 'mix'] },
    { route: { name: 'search', q: '' }, icon: 'search', label: 'Search', match: ['search'] },
    { route: { name: 'library' }, icon: 'stack', label: 'Library', match: ['library', 'local'] },
    { route: { name: 'taste' }, icon: 'constellation', label: 'Your sound', match: ['taste'] },
  ];

  function go(r: Route) {
    if (r.name === 'search') ui.paletteOpen = true;
    else router.go(r);
  }
</script>

<nav class="rail glass" aria-label="Main">
  <button class="mark" onclick={() => router.go({ name: 'home' })} aria-label="Moonbow home"><Logo size={36} /></button>
  <div class="items">
    {#each ITEMS as it (it.label)}
      {@const on = it.match.includes(router.current.name)}
      <button class="item" class:on onclick={() => go(it.route)} aria-label={it.label} aria-current={on ? 'page' : undefined}>
        <Icon name={it.icon} size={21} />
        <span class="tip">{it.label}</span>
      </button>
    {/each}
  </div>
  <button class="item" onclick={() => (ui.settingsOpen = true)} aria-label="Settings">
    <Icon name="settings" size={20} />
    <span class="tip">Settings</span>
  </button>
</nav>

<style>
  .rail {
    position: fixed;
    z-index: 30;
    left: 14px;
    top: 14px;
    bottom: calc(var(--capsule) + 28px);
    width: calc(var(--rail) - 14px);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 14px 0;
    border-radius: 28px;
  }
  .mark {
    margin-bottom: 22px;
    transition: transform 0.6s var(--ease);
  }
  .mark:hover {
    transform: rotate(-10deg) scale(1.06);
  }
  .items {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .item {
    position: relative;
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 16px;
    color: var(--text-3);
    transition: color 0.3s var(--ease), background 0.3s var(--ease);
  }
  .item:hover {
    color: var(--text);
    background: var(--hover);
  }
  .item.on {
    color: var(--text);
    background: rgb(255 255 255 / 0.09);
  }
  .item.on::before {
    content: '';
    position: absolute;
    left: -9px;
    width: 3px;
    height: 18px;
    border-radius: 3px;
    background: var(--iris);
    box-shadow: 0 0 12px rgb(var(--tint));
  }
  .tip {
    position: absolute;
    left: calc(100% + 14px);
    padding: 7px 12px;
    border-radius: 10px;
    white-space: nowrap;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text);
    background: var(--glass-strong);
    backdrop-filter: blur(20px);
    box-shadow: var(--glass-edge);
    opacity: 0;
    transform: translateX(-6px);
    pointer-events: none;
    transition: 0.25s var(--ease);
  }
  .item:hover .tip {
    opacity: 1;
    transform: none;
  }
</style>
