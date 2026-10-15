<script lang="ts">
  // A tiny live spectrum, drawn straight to canvas each frame.
  import { onDestroy, onMount } from 'svelte';
  import { player } from '../lib/player/player.svelte';

  let { bars = 12, width = 54, height = 22 }: { bars?: number; width?: number; height?: number } = $props();
  let canvas: HTMLCanvasElement;
  let raf = 0;
  const level = new Float32Array(32);

  onMount(() => {
    const dpr = devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const g = canvas.getContext('2d')!;
    g.scale(dpr, dpr);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const bins = player.playing ? player.spectrum() : null;
      const tint = getComputedStyle(document.documentElement).getPropertyValue('--tint').trim() || '182 160 255';
      g.clearRect(0, 0, width, height);
      const w = width / bars;
      for (let i = 0; i < bars; i++) {
        // Log-ish spacing so the bass doesn't take every bar.
        const a = Math.floor(2 ** ((i / bars) * 6.2)) + 1;
        const b = Math.floor(2 ** (((i + 1) / bars) * 6.2)) + 1;
        let v = 0;
        if (bins) {
          for (let k = a; k <= b; k++) v += bins[k] ?? 0;
          v /= (b - a + 1) * 255;
        }
        level[i] += ((bins ? v : 0.06) - level[i]) * (v > level[i] ? 0.5 : 0.12);
        const h = Math.max(2, level[i] * height);
        g.fillStyle = `rgb(${tint.split(' ').join(',')} / ${0.45 + level[i] * 0.55})`;
        g.beginPath();
        g.roundRect(i * w + 1, height - h, w - 2.5, h, 1.5);
        g.fill();
      }
    };
    loop();
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>

<canvas bind:this={canvas} style:width="{width}px" style:height="{height}px" aria-hidden="true"></canvas>
