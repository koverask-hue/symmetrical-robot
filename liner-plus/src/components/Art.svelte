<script lang="ts">
  let { src, size = 48, round = false, alt = '' }: { src?: string; size?: number | string; round?: boolean; alt?: string } = $props();
  let failed = $state(false);
  const dim = $derived(typeof size === 'number' ? `${size}px` : size);
  $effect(() => {
    src;
    failed = false;
  });
</script>

<div class="art" class:round style:width={dim} style:height={dim}>
  {#if src && !failed}
    <img {src} {alt} loading="lazy" decoding="async" draggable="false" onerror={() => (failed = true)} />
  {/if}
</div>

<style>
  .art {
    flex: none;
    border-radius: 6px;
    overflow: hidden;
    background: linear-gradient(135deg, rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.03));
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
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
