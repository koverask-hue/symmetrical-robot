<script lang="ts">
  // Cover image with a quiet fallback. No glow, no blur: just the art.
  let { src, size = 48, round = false, radius = 8, alt = '' }: { src?: string; size?: number | string; round?: boolean; radius?: number; alt?: string } = $props();
  let failed = $state(false);
  const dim = $derived(typeof size === 'number' ? `${size}px` : size);
  $effect(() => {
    src;
    failed = false;
  });
</script>

<div class="art" class:round style:width={dim} style:height={dim} style:--r="{radius}px">
  {#if src && !failed}
    <img {src} {alt} loading="lazy" decoding="async" draggable="false" onerror={() => (failed = true)} />
  {/if}
</div>

<style>
  .art {
    flex: none;
    border-radius: var(--r);
    overflow: hidden;
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  .round {
    border-radius: 50%;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
