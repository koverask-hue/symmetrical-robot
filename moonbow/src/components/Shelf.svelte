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
    /** Italic part of the title. */
    accent?: string;
    note?: string;
    reasons?: Record<string, string>;
    /** Called with the track index when a track card is played (e.g. to play a whole mix from there). */
    onplay?: (i: number) => void;
  } = $props();
  let row: HTMLDivElement;
  let canLeft = $state(false);
  let canRight = $state(true);

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

<section class="enter">
  <header>
    <div>
      <h2 class="section-title">{shelf.title}{#if accent}{' '}<em>{accent}</em>{/if}</h2>
      {#if note}<p class="note">{note}</p>{/if}
    </div>
    <div class="nav">
      <button class="icon-btn" disabled={!canLeft} onclick={() => page(-1)} aria-label="Scroll left"><Icon name="back" /></button>
      <button class="icon-btn" disabled={!canRight} onclick={() => page(1)} aria-label="Scroll right"><Icon name="forward" /></button>
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
  section {
    margin-bottom: 52px;
  }
  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 0 12px 10px;
  }
  .section-title em {
    font-style: italic;
    color: rgb(var(--tint));
  }
  .note {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--text-3);
  }
  .nav {
    display: flex;
    gap: 4px;
  }
  .row {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
    padding-bottom: 14px;
  }
  .row::-webkit-scrollbar {
    display: none;
  }
  .row > :global(*) {
    scroll-snap-align: start;
  }
</style>
