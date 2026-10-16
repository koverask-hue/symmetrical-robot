<script lang="ts">
  // Moonbow: a crescent under a single bow of light, in the accent colour.
  let { size = 28, wordmark = false }: { size?: number; wordmark?: boolean } = $props();
  const uid = Math.random().toString(36).slice(2, 8);
</script>

<span class="logo" style:--s="{size}px">
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <mask id="cut-{uid}">
        <circle cx="30" cy="36" r="15" fill="#fff" />
        <circle cx="38" cy="29.5" r="12.5" fill="#000" />
      </mask>
    </defs>
    <path d="M7 51 A28 28 0 0 1 57 25" fill="none" stroke="var(--accent)" stroke-width="4.4" stroke-linecap="round" />
    <circle cx="30" cy="36" r="15" fill="#f4f4f5" mask="url(#cut-{uid})" />
    <circle cx="50" cy="12" r="2.6" fill="#f4f4f5" />
  </svg>
  {#if wordmark}<span class="word">moonbow</span>{/if}
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--s) * 0.32);
  }
  svg {
    flex: none;
  }
  .word {
    font: 650 calc(var(--s) * 0.66) / 1 var(--sans);
    letter-spacing: -0.045em;
  }
</style>
