<script lang="ts">
  import Card from './Card.svelte';
  import Icon from './Icon.svelte';
  import type { Shelf } from '../lib/sources/types';

  let {
    shelf,
    accent,
    note,
    reasons,
    onplay,
  }: {
    shelf: Shelf;
    /** Quieter second part of the title (rendered in text-2). */
    accent?: string;
    note?: string;
    reasons?: Record<string, string>;
    /** Called with the track index when a track card is played (e.g. to play a whole mix from there). */
    onplay?: (i: number) => void;
  } = $props();
  let row: HTMLDivElement;
  let canLeft = $state(false);
  let canRight = $state(false);

  function update() {
    if (!row) return;
    canLeft = row.scrollLeft > 4;
    canRight = row.scrollLeft + row.clientWidth < row.scrollWidth - 4;
  }
  const page = (dir: number) => row.scrollBy({ left: dir * row.clientWidth * 0.85, behavior: 'smooth' });
  $effect(() => {
    shelf;
    queueMicrotask(update);
  });
</script>

<svelte:window onresize={update} />

<section class="shelf enter">
  <header>
    <div class="head">
      <h2 class="h2">{shelf.title}{#if accent}{' '}<span class="soft">{accent}</span>{/if}</h2>
      {#if note}<p class="note">{note}</p>{/if}
    </div>
    <div class="nav">
      <span class="count num">{shelf.items.length}</span>
      <button class="icon-btn" disabled={!canLeft} onclick={() => page(-1)} aria-label="Scroll left"><Icon name="back" size={18} /></button>
      <button class="icon-btn" disabled={!canRight} onclick={() => page(1)} aria-label="Scroll right"><Icon name="forward" size={18} /></button>
    </div>
  </header>
  <div class="row" bind:this={row} onscroll={update}>
    {#each shelf.items as item, i (i)}
      <Card
        {item}
        reason={item.type === 'track' ? reasons?.[item.track.id] : undefined}
        onplay={onplay && item.type === 'track' ? () => onplay(i) : undefined}
      />
    {/each}
  </div>
</section>

<style>
  .shelf {
    margin-bottom: 40px;
  }
  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    padding: 0 10px 8px;
  }
  .head {
    min-width: 0;
  }
  .soft {
    color: var(--text-2);
  }
  .note {
    margin: 3px 0 0;
    font-size: 12.5px;
    color: var(--text-3);
  }
  .nav {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
  .count {
    font-size: 11px;
    color: var(--text-4);
    margin-right: 8px;
  }
  .nav .icon-btn {
    width: 30px;
    height: 30px;
    border-radius: 8px;
  }
  .row {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
    scroll-padding: 0 10px;
  }
  .row::-webkit-scrollbar {
    display: none;
  }
  .row > :global(*) {
    scroll-snap-align: start;
  }
</style>
