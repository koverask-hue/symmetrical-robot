<script lang="ts">
  // Covers fanned like a hand of cards, with their own light behind them.
  let { arts, size = 200, spread = 1 }: { arts: (string | undefined)[]; size?: number; spread?: number } = $props();
  const shown = $derived(arts.filter(Boolean).slice(0, 4) as string[]);
  const n = $derived(shown.length);
</script>

<div class="fan" style:--size="{size}px" style:--spread={spread}>
  {#if shown[0]}<img class="halo" src={shown[0]} alt="" aria-hidden="true" />{/if}
  {#each shown as src, i (src + i)}
    {@const k = i - (n - 1) / 2}
    <img class="card" {src} alt="" style:--k={k} style:z-index={10 - Math.abs(Math.round(k * 2))} loading="lazy" />
  {/each}
</div>

<style>
  .fan {
    position: relative;
    width: calc(var(--size) * 1.9);
    height: calc(var(--size) * 1.2);
    display: grid;
    place-items: center;
  }
  .halo {
    pointer-events: none;
    position: absolute;
    width: calc(var(--size) * 1.4);
    height: calc(var(--size) * 1.4);
    object-fit: cover;
    border-radius: 50%;
    filter: blur(50px) saturate(1.8);
    opacity: 0.55;
  }
  .card {
    position: absolute;
    width: var(--size);
    height: var(--size);
    object-fit: cover;
    border-radius: calc(var(--size) * 0.09);
    box-shadow: 0 30px 60px -18px rgb(0 0 0 / 0.75), inset 0 0 0 1px rgb(255 255 255 / 0.1);
    transform: translateX(calc(var(--k) * var(--size) * 0.3 * var(--spread))) translateY(calc(var(--k) * var(--k) * 6px))
      rotate(calc(var(--k) * 7deg * var(--spread)));
    transition: transform 0.8s var(--ease);
  }
  .fan:hover .card {
    transform: translateX(calc(var(--k) * var(--size) * 0.42 * var(--spread))) translateY(calc(var(--k) * var(--k) * 10px - 6px))
      rotate(calc(var(--k) * 10deg * var(--spread)));
  }
</style>
