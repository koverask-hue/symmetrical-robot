<script lang="ts">
  // Moonbow: a crescent moon under an iridescent bow, the rare rainbow you only see at night.
  let { size = 40, wordmark = false }: { size?: number; wordmark?: boolean } = $props();
  const uid = Math.random().toString(36).slice(2, 8);
</script>

<span class="logo" style:--s="{size}px">
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="iris-{uid}" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#9fefff" />
        <stop offset=".35" stop-color="#b9a8ff" />
        <stop offset=".68" stop-color="#ffaee0" />
        <stop offset="1" stop-color="#ffd9a6" />
      </linearGradient>
      <radialGradient id="moon-{uid}" cx=".35" cy=".35" r=".8">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="1" stop-color="#d9d0ff" />
      </radialGradient>
      <mask id="cut-{uid}">
        <circle cx="31" cy="35" r="14" fill="#fff" />
        <circle cx="38.5" cy="29" r="12" fill="#000" />
      </mask>
      <filter id="glow-{uid}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
    </defs>
    <!-- the bow -->
    <path d="M8 50 A27 27 0 0 1 56 26" fill="none" stroke="url(#iris-{uid})" stroke-width="7" stroke-linecap="round" opacity=".35" filter="url(#glow-{uid})" />
    <path d="M8 50 A27 27 0 0 1 56 26" fill="none" stroke="url(#iris-{uid})" stroke-width="3.4" stroke-linecap="round" />
    <path d="M15 52 A21 21 0 0 1 52 34" fill="none" stroke="url(#iris-{uid})" stroke-width="1.3" stroke-linecap="round" opacity=".5" />
    <!-- the moon -->
    <circle cx="31" cy="35" r="14" fill="url(#moon-{uid})" mask="url(#cut-{uid})" />
    <!-- a star -->
    <path d="M48 9 L49.2 12.8 L53 14 L49.2 15.2 L48 19 L46.8 15.2 L43 14 L46.8 12.8 Z" fill="#fff" opacity=".9" />
  </svg>
  {#if wordmark}<span class="word">moonbow</span>{/if}
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--s) * 0.22);
  }
  svg {
    flex: none;
    overflow: visible;
  }
  .word {
    font: italic 400 calc(var(--s) * 0.78) / 1 var(--serif);
    letter-spacing: -0.02em;
  }
</style>
