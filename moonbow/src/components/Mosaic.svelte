<script lang="ts">
  // 2×2 cover grid for mixes and playlists (falls back to one cover, then a tile).
  let { arts, size = 160, radius = 10, label }: { arts: (string | undefined)[]; size?: number | string; radius?: number; label?: string } = $props();
  const shown = $derived([...new Set(arts.filter(Boolean) as string[])].slice(0, 4));
  const dim = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<div class="mosaic" class:grid={shown.length >= 4} style:width={dim} style:height={dim} style:--r="{radius}px">
  {#if shown.length >= 4}
    {#each shown as src (src)}<img {src} alt="" loading="lazy" draggable="false" />{/each}
  {:else if shown[0]}
    <img src={shown[0]} alt="" loading="lazy" draggable="false" />
  {/if}
  {#if label}<span class="tag">{label}</span>{/if}
</div>

<style>
  .mosaic {
    position: relative;
    flex: none;
    overflow: hidden;
    border-radius: var(--r);
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .tag {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 3px 6px;
    border-radius: 5px;
    font: 600 9.5px/1 var(--mono);
    letter-spacing: 0.08em;
    color: var(--accent-ink);
    background: var(--accent);
  }
</style>
