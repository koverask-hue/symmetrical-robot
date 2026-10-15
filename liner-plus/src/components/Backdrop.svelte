<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { Background } from '../lib/visuals/background';
  import { FALLBACK, paletteFor, type RGB } from '../lib/visuals/palette';

  let canvas: HTMLCanvasElement;
  let bg: Background | null = null;
  let palette = $state<RGB[]>(FALLBACK);
  let failed = $state(false);

  const mode = $derived(library.settings.visuals);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = $derived(palette.map((c) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`));

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

  onMount(() => {
    try {
      bg = new Background(canvas, palette, {
        spectrum: () => (player.playing ? player.spectrum() : null),
        reactive: () => mode === 'reactive' && !reduced,
        fps: () => (mode === 'reactive' && !reduced ? 60 : 24),
      });
      bg.start();
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

<div class="backdrop" style:--c0={css[0]} style:--c1={css[1]} style:--c2={css[2]} style:--c3={css[3]}>
  <canvas bind:this={canvas} class:hidden={failed || mode === 'off'}></canvas>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    /* Static fallback, also shown while visuals are off. */
    background:
      radial-gradient(60% 70% at 15% 20%, var(--c0), transparent 70%),
      radial-gradient(60% 70% at 85% 80%, var(--c1), transparent 70%),
      radial-gradient(50% 60% at 80% 15%, var(--c2), transparent 70%),
      #0d0b14;
    transition: background 1s;
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
