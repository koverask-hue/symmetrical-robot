<script lang="ts">
  // Your taste as a night sky: each star is an artist (size = how much you love
  // them), colour = which world they belong to, lines = how YouTube's listeners
  // connect them. Laid out with a small force simulation.
  import { onDestroy, onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { artistGraph, clusterArtists } from '../lib/taste/graph';
  import { artistAffinities } from '../lib/taste/model';

  let { height = 460 }: { height?: number } = $props();

  interface Star {
    key: string;
    name: string;
    id?: string;
    aff: number;
    r: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    hue: number;
    phase: number;
  }

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let stars: Star[] = [];
  let links: [Star, Star, number][] = [];
  let hover = $state<Star | null>(null);
  let tip = $state({ x: 0, y: 0 });
  let raf = 0;
  let empty = $state(false);
  const HUES = [265, 190, 325, 35, 150, 215];

  function build() {
    const now = Date.now();
    const arts = artistAffinities(taste.state, now);
    const mine = [...arts.entries()].filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 70);
    empty = mine.length < 2;
    const ag = artistGraph(taste.graph);
    const clusters = clusterArtists(ag, mine.map(([k]) => k));
    const hueOf = new Map<string, number>();
    clusters.sort((a, b) => b.length - a.length).forEach((cl, i) => cl.forEach((k) => hueOf.set(k, HUES[i % HUES.length])));
    const w = wrap.clientWidth;
    const prev = new Map(stars.map((s) => [s.key, s]));
    stars = mine.map(([key, aff], i) => {
      const a = taste.state.artists[key];
      const old = prev.get(key);
      const angle = i * 2.4;
      const dist = 40 + Math.sqrt(i) * 34;
      return {
        key, aff, name: a?.name ?? key, id: a?.id,
        r: 3 + aff * 15,
        x: old?.x ?? w / 2 + Math.cos(angle) * dist,
        y: old?.y ?? height / 2 + Math.sin(angle) * dist * 0.7,
        vx: 0, vy: 0,
        hue: hueOf.get(key) ?? 265,
        phase: Math.random() * 6.28,
      };
    });
    const idx = new Map(stars.map((s) => [s.key, s]));
    links = [];
    for (const s of stars)
      for (const [k, wgt] of ag.get(s.key) ?? []) {
        const o = idx.get(k);
        if (o && s.key < k) links.push([s, o, wgt]);
      }
  }

  function step() {
    const w = wrap.clientWidth;
    const cx = w / 2;
    const cy = height / 2;
    for (let i = 0; i < stars.length; i++) {
      const a = stars[i];
      for (let j = i + 1; j < stars.length; j++) {
        const b = stars[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const d2 = Math.max(60, dx * dx + dy * dy);
        const f = (900 + (a.r + b.r) * 60) / d2;
        dx *= f / Math.sqrt(d2);
        dy *= f / Math.sqrt(d2);
        a.vx += dx;
        a.vy += dy;
        b.vx -= dx;
        b.vy -= dy;
      }
      a.vx += (cx - a.x) * 0.0016;
      a.vy += (cy - a.y) * 0.0028;
    }
    for (const [a, b, wgt] of links) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = (d - 70) * 0.0018 * Math.min(3, wgt);
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f;
      b.vy -= (dy / d) * f;
    }
    for (const s of stars) {
      s.vx *= 0.82;
      s.vy *= 0.82;
      s.x = Math.max(s.r + 8, Math.min(w - s.r - 8, s.x + s.vx));
      s.y = Math.max(s.r + 8, Math.min(height - s.r - 8, s.y + s.vy));
    }
  }

  function draw(t: number) {
    const g = canvas.getContext('2d')!;
    const dpr = devicePixelRatio || 1;
    const w = wrap.clientWidth;
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr;
      canvas.height = height * dpr;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, height);
    g.lineWidth = 1;
    for (const [a, b, wgt] of links) {
      const lit = hover && (hover === a || hover === b);
      g.strokeStyle = `hsl(${a.hue} 80% 75% / ${lit ? 0.5 : Math.min(0.18, 0.05 + wgt * 0.03)})`;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    for (const s of stars) {
      const tw = 0.85 + 0.15 * Math.sin(t / 900 + s.phase);
      const r = s.r * tw * (hover === s ? 1.25 : 1);
      const glow = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4);
      glow.addColorStop(0, `hsl(${s.hue} 90% 72% / 0.55)`);
      glow.addColorStop(1, `hsl(${s.hue} 90% 60% / 0)`);
      g.fillStyle = glow;
      g.beginPath();
      g.arc(s.x, s.y, r * 4, 0, 6.29);
      g.fill();
      g.fillStyle = `hsl(${s.hue} 100% 92%)`;
      g.beginPath();
      g.arc(s.x, s.y, r * 0.55, 0, 6.29);
      g.fill();
    }
    g.textAlign = 'center';
    stars.slice(0, 14).forEach((s) => {
      g.font = `italic ${Math.round(13 + s.aff * 6)}px "Instrument Serif", serif`;
      g.fillStyle = `rgb(246 243 255 / ${hover && hover !== s ? 0.35 : 0.85})`;
      g.fillText(s.name, s.x, s.y + s.r * 2.2 + 12);
    });
  }

  onMount(() => {
    build();
    let settle = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (settle < 400) {
        step();
        settle++;
      }
      draw(t);
    };
    raf = requestAnimationFrame(loop);
  });
  onDestroy(() => cancelAnimationFrame(raf));

  function pick(e: PointerEvent): Star | null {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best: Star | null = null;
    let bd = 24;
    for (const s of stars) {
      const d = Math.hypot(s.x - x, s.y - y) - s.r;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    tip = { x, y };
    return best;
  }
</script>

<div class="sky" bind:this={wrap} style:height="{height}px">
  <canvas
    bind:this={canvas}
    style:width="100%"
    style:height="{height}px"
    onpointermove={(e) => (hover = pick(e))}
    onpointerleave={() => (hover = null)}
    onclick={(e) => {
      const s = pick(e as unknown as PointerEvent);
      if (s?.id) router.go({ name: 'artist', id: s.id });
    }}
    class:pointer={!!hover?.id}
  ></canvas>
  {#if hover}
    <div class="tip glass" style:left="{tip.x}px" style:top="{tip.y}px">
      <div class="serif nm">{hover.name}</div>
      <div class="faint">{Math.round(hover.aff * 100)}% affinity</div>
    </div>
  {/if}
  {#if empty}
    <div class="empty serif">Your sky is still dark. <em>Every song you love adds a star.</em></div>
  {/if}
</div>

<style>
  .sky {
    position: relative;
    border-radius: 40px;
    overflow: hidden;
    background: radial-gradient(70% 80% at 50% 50%, rgb(var(--tint) / 0.08), transparent 70%), rgb(8 6 16 / 0.45);
    box-shadow: var(--glass-edge);
  }
  canvas.pointer {
    cursor: pointer;
  }
  .tip {
    position: absolute;
    transform: translate(-50%, calc(-100% - 18px));
    padding: 8px 14px;
    border-radius: 14px;
    pointer-events: none;
    white-space: nowrap;
    font-size: 12px;
  }
  .nm {
    font-size: 19px;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 24px;
    color: var(--text-2);
    text-align: center;
    padding: 20px;
  }
</style>
