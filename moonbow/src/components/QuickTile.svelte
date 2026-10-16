<script lang="ts">
  // A compact "jump back in" tile: 64px cover, title, a play button on hover.
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import Mosaic from './Mosaic.svelte';

  let {
    title,
    arts = [],
    icon,
    round = false,
    active = false,
    onopen,
    onplay,
    onwarm,
  }: {
    title: string;
    /** One cover, or several for a 2×2 mosaic. */
    arts?: (string | undefined)[];
    /** Show an icon tile instead of art (e.g. 'heart' for Liked songs). */
    icon?: string;
    round?: boolean;
    /** True when this is what's playing. */
    active?: boolean;
    onopen: () => void;
    onplay?: () => void;
    /** Called after hovering for a moment (prefetch). */
    onwarm?: () => void;
  } = $props();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const enter = () => {
    if (!onwarm) return;
    clearTimeout(timer);
    timer = setTimeout(onwarm, 200);
  };
  const leave = () => clearTimeout(timer);
</script>

<div
  class="tile"
  class:active
  role="button"
  tabindex="0"
  onclick={onopen}
  onkeydown={(e) => e.key === 'Enter' && onopen()}
  onpointerenter={enter}
  onpointerleave={leave}
>
  <div class="cover" class:round>
    {#if icon}
      <span class="ico"><Icon name={icon} size={24} /></span>
    {:else if arts.filter(Boolean).length >= 4}
      <Mosaic {arts} size={64} radius={0} />
    {:else}
      <Art src={arts.find(Boolean)} size={64} {round} radius={0} />
    {/if}
  </div>
  <span class="title">{title}</span>
  {#if active}<span class="dot" aria-hidden="true"></span>{/if}
  {#if onplay}
    <button
      class="play"
      aria-label={`Play ${title}`}
      onclick={(e) => {
        e.stopPropagation();
        onplay();
      }}><Icon name="play" size={15} /></button
    >
  {/if}
</div>

<style>
  .tile {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    height: 64px;
    min-width: 0;
    padding-right: 12px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair);
    cursor: pointer;
    transition: background 0.15s;
  }
  .tile:hover {
    background: var(--bg-3);
  }
  .cover {
    flex: none;
    width: 64px;
    height: 64px;
    overflow: hidden;
  }
  .cover :global(.art),
  .cover :global(.mosaic) {
    box-shadow: none;
  }
  .cover.round {
    padding: 6px;
  }
  .cover.round :global(.art) {
    width: 52px !important;
    height: 52px !important;
  }
  .ico {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--accent);
    background: var(--bg-4);
  }
  .title {
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -0.012em;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .active .title {
    color: var(--accent);
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }
  .play {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--accent-ink);
    box-shadow: 0 6px 14px -6px rgb(0 0 0 / 0.8);
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 0.15s, transform 0.18s var(--ease);
  }
  .tile:hover .play,
  .play:focus-visible {
    opacity: 1;
    transform: none;
  }
  .play:hover {
    transform: scale(1.07);
  }
  .tile:hover .dot,
  .tile:focus-within .dot {
    display: none;
  }
</style>
