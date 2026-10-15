<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { Background } from '../lib/visuals/background';
  import { accent, FALLBACK, paletteFor, type RGB } from '../lib/visuals/palette';

  let canvas: HTMLCanvasElement;
  let bg: Background | null = null;
  let palette = $state<RGB[]>(FALLBACK);
  let failed = $state(false);

  const mode = $derived(library.settings.visuals);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = (c: RGB) => c.map((v) => Math.round(v * 255)).join(' ');

  $effect(() => {
    const art = player.current?.art;
    let alive = true;
    paletteFor(art).then((p) => {
      if (!alive) return;
      palette = p;
      bg?.setPalette(p);
    });
    return () => {
      alive = false;
    };
  });

  // The whole interface takes its accent from the song: --tint for highlights, --tint-2 for glows.
  $effect(() => {
    const root = document.documentElement.style;
    root.setProperty('--tint', css(accent(palette[0])));
    root.setProperty('--tint-2', css(accent(palette[2] ?? palette[1])));
  });

  onMount(() => {
    try {
      bg = new Background(canvas, palette, {
        spectrum: () => (player.playing ? player.spectrum() : null),
        reactive: () => mode === 'reactive' && !reduced,
        fps: () => (mode === 'reactive' && !reduced ? 60 : 24),
      });
      if (mode !== 'off') bg.start();
    } catch {
      failed = true;
    }
  });

  $effect(() => {
    if (!bg) return;
    if (mode === 'off') bg.stop();
    else bg.start();
  });

  onDestroy(() => bg?.stop());
</script>

<div class="sky" style:--c0={`rgb(${css(palette[0])})`} style:--c1={`rgb(${css(palette[1])})`} style:--c3={`rgb(${css(palette[3])})`}>
  <canvas bind:this={canvas} class:hidden={failed || mode === 'off'}></canvas>
</div>

<style>
  .sky {
    position: fixed;
    inset: 0;
    z-index: -1;
    /* Still image of the same idea, for when the shader is off or unavailable. */
    background:
      radial-gradient(80% 40% at 30% 30%, color-mix(in srgb, var(--c0) 45%, transparent), transparent 70%),
      radial-gradient(70% 35% at 75% 45%, color-mix(in srgb, var(--c1) 35%, transparent), transparent 70%),
      linear-gradient(to top, color-mix(in srgb, var(--c3) 60%, #06050b), #06050b 70%);
    transition: background 1.2s;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
  .hidden {
    display: none;
  }
</style>
