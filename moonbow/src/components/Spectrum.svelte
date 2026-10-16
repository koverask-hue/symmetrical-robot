<script lang="ts">
  // A tiny live spectrum in the accent colour. The loop runs only while there is
  // something to draw: it stops once the bars have settled after a pause.
  import { onDestroy, onMount } from 'svelte';
  import { player } from '../lib/player/player.svelte';

  let { bars = 12, width = 54, height = 22 }: { bars?: number; width?: number; height?: number } = $props();
  let canvas: HTMLCanvasElement;
  let g: CanvasRenderingContext2D | null = null;
  let raf = 0;
  let rgb = '212,255,63';
  let poll: ReturnType<typeof setInterval> | undefined;
  const level = new Float32Array(32);

  function readAccent() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
    if (v) rgb = v.split(/[\s,]+/).join(',');
  }

  function frame() {
    raf = 0;
    if (!g) return;
    const bins = player.playing ? player.spectrum() : null;
    g.clearRect(0, 0, width, height);
    const w = width / bars;
    let energy = 0;
    for (let i = 0; i < bars; i++) {
      // Log-ish spacing so the bass doesn't take every bar.
      const a = Math.floor(2 ** ((i / bars) * 6.2)) + 1;
      const b = Math.floor(2 ** (((i + 1) / bars) * 6.2)) + 1;
      let v = 0;
      if (bins) {
        for (let k = a; k <= b; k++) v += bins[k] ?? 0;
        v /= (b - a + 1) * 255;
      } else if (player.playing) v = 0.06; // no analyser (cross-origin): a quiet idle pulse
      level[i] += (v - level[i]) * (v > level[i] ? 0.5 : 0.12);
      energy += level[i];
      const h = Math.max(2, level[i] * height);
      g.fillStyle = `rgba(${rgb},${0.4 + level[i] * 0.6})`;
      g.beginPath();
      g.roundRect(i * w + 1, height - h, w - 2.5, h, 1.5);
      g.fill();
    }
    // Paused and settled: stop until playback resumes.
    if (!player.playing && energy < 0.01 * bars) return;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (!raf && g) raf = requestAnimationFrame(frame);
  }

  onMount(() => {
    const dpr = devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    g = canvas.getContext('2d');
    g?.scale(dpr, dpr);
    readAccent();
    poll = setInterval(readAccent, 2000);
    start();
  });

  $effect(() => {
    // Restart the loop when playback (re)starts; the loop stops itself when idle.
    if (player.playing) start();
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    clearInterval(poll);
    g = null;
  });
</script>

<canvas bind:this={canvas} style:width="{width}px" style:height="{height}px" aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
  }
</style>
