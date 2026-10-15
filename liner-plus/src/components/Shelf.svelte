<script lang="ts">
  import Card from './Card.svelte';
  import Icon from './Icon.svelte';
  import type { Shelf } from '../lib/sources/types';

  let { shelf }: { shelf: Shelf } = $props();
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

<section>
  <header>
    <h2>{shelf.title}</h2>
    <div class="nav">
      <button class="icon-btn" disabled={!canLeft} onclick={() => page(-1)} aria-label="Scroll left"><Icon name="back" /></button>
      <button class="icon-btn" disabled={!canRight} onclick={() => page(1)} aria-label="Scroll right"><Icon name="forward" /></button>
    </div>
  </header>
  <div class="row" bind:this={row} onscroll={update}>
    {#each shelf.items as item, i (i)}
      <Card {item} />
    {/each}
  </div>
</section>

<style>
  section {
    margin-bottom: 28px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px 6px;
  }
  h2 {
    font-size: 22px;
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
  }
  .row::-webkit-scrollbar {
    display: none;
  }
  .row > :global(*) {
    scroll-snap-align: start;
  }
</style>
