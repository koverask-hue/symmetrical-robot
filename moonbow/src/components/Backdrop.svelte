<script lang="ts">
  // Ambient light from the playing cover: one static radial glow, recoloured on
  // track change. No canvas, no per-frame work.
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { FALLBACK, paletteFor, type RGB } from '../lib/visuals/palette';

  let palette = $state<RGB[]>(FALLBACK);
  const css = (c: RGB) => c.map((v) => Math.round(v * 255)).join(' ');

  $effect(() => {
    const art = player.current?.art;
    let alive = true;
    paletteFor(art).then((p) => alive && (palette = p));
    return () => {
      alive = false;
    };
  });

  $effect(() => {
    document.documentElement.style.setProperty('--tint', css(palette[0]));
  });

  $effect(() => {
    document.documentElement.dataset.accent = library.settings.accent;
  });
</script>

<div class="ambient" class:off={library.settings.visuals === 'off'} aria-hidden="true"></div>

<style>
  .ambient {
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(60% 46% at 62% -6%, rgb(var(--tint) / 0.2), transparent 70%),
      radial-gradient(40% 30% at 100% 0%, rgb(var(--tint) / 0.08), transparent 70%);
    transition: background 1.2s;
  }
  .off {
    display: none;
  }
</style>
