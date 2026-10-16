<script lang="ts">
  // Your taste as a night sky: each star is an artist (size = how much you love
  // them), the accent stars are your main world, lines = how YouTube's listeners
  // connect them. Laid out with a small force simulation that stops once it
  // settles; after that the canvas only redraws on hover or resize.
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
    /** Index into the colour palette: 0 = accent (top world), then greys. */
    col: number;
  }

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let stars: Star[] = [];
  let links: [Star, Star, number][] = [];
  let hover = $state<Star | null>(null);
  let tip = $state({ x: 0, y: 0 });
  let raf = 0;
  let ticks = 0;
  let empty = $state(false);
  let count = $state(0);
  let ro: ResizeObserver | undefined;

  // Accent first (read from CSS once on mount), then neutral whites/greys.
  let palette: string[] = ['212 255 63', '236 236 240', '176 176 184', '128 128 138', '96 96 106'];
  let sprites: HTMLCanvasElement[] = [];
  const SPRITE = 64;

  function makeSprites() {
    sprites = palette.map((rgb, i) => {
      const c = document.createElement('canvas');
      c.width = c.height = SPRITE;
      const g = c.getContext('2d')!;
      const h = SPRITE / 2;
      const grad = g.createRadialGradient(h, h, 0, h, h, h);
      const a = i === 0 ? 0.5 : 0.28;
      grad.addColorStop(0, `rgb(${rgb} / ${a})`);
      grad.addColorStop(0.35, `rgb(${rgb} / ${a * 0.35})`);
      grad.addColorStop(1, `rgb(${rgb} / 0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, SPRITE, SPRITE);
      return c;
    });
  }

  function build() {
    const now = Date.now();
    const arts = artistAffinities(taste.state, now);
    const mine = [...arts.entries()].filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 70);
    empty = mine.length < 2;
    count = mine.length;
    const ag = artistGraph(taste.graph);
    const clusters = clusterArtists(ag, mine.map(([k]) => k));
    const colOf = new Map<string, number>();
    clusters
      .sort((a, b) => b.length - a.length)
      .forEach((cl, i) => cl.forEach((k) => colOf.set(k, i === 0 ? 0 : 1 + ((i - 1) % (palette.length - 1)))));
    const w = wrap.clientWidth;
    const prev = new Map(stars.map((s) => [s.key, s]));
    stars = mine.map(([key, aff], i) => {
      const a = taste.state.artists[key];
      const old = prev.get(key);
      const angle = i * 2.4;
      const dist = 40 + Math.sqrt(i) * 34;
      return {
        key, aff, name: a?.name ?? key, id: a?.id,
        r: 2.5 + aff * 11,
        x: old?.x ?? w / 2 + Math.cos(angle) * dist,
        y: old?.y ?? height / 2 + Math.sin(angle) * dist * 0.7,
        vx: 0, vy: 0,
        col: colOf.get(key) ?? 1,
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

  /** One simulation step; returns the mean speed so the loop knows when to stop. */
  function step(): number {
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
        const f = (900 + (a.r + b.r) * 60) / d2 / Math.sqrt(d2);
        dx *= f;
        dy *= f;
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
    let speed = 0;
    for (const s of stars) {
      s.vx *= 0.82;
      s.vy *= 0.82;
      speed += Math.abs(s.vx) + Math.abs(s.vy);
      s.x = Math.max(s.r + 8, Math.min(w - s.r - 8, s.x + s.vx));
      s.y = Math.max(s.r + 8, Math.min(height - s.r - 8, s.y + s.vy));
    }
    return stars.length ? speed / stars.length : 0;
  }

  function draw() {
    if (!canvas || !wrap) return;
    const g = canvas.getContext('2d')!;
    const dpr = devicePixelRatio || 1;
    const w = wrap.clientWidth;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, height);

    // Links: quiet hairlines; the hovered star's links light up in the accent.
    g.lineWidth = 1;
    for (const [a, b, wgt] of links) {
      const lit = hover && (hover === a || hover === b);
      g.strokeStyle = lit ? `rgb(${palette[0]} / 0.55)` : `rgb(255 255 255 / ${Math.min(0.1, 0.03 + wgt * 0.02)})`;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }

    for (const s of stars) {
      const r = s.r * (hover === s ? 1.2 : 1);
      const dim = hover && hover !== s ? 0.55 : 1;
      g.globalAlpha = dim;
      const gr = r * 3;
      g.drawImage(sprites[s.col], s.x - gr, s.y - gr, gr * 2, gr * 2);
      g.fillStyle = s.col === 0 ? `rgb(${palette[0]})` : `rgb(${palette[s.col]})`;
      g.beginPath();
      g.arc(s.x, s.y, Math.max(1.5, r * 0.6), 0, 6.29);
      g.fill();
      if (hover === s) {
        g.globalAlpha = 1;
        g.strokeStyle = `rgb(${palette[0]} / 0.8)`;
        g.beginPath();
        g.arc(s.x, s.y, r + 5, 0, 6.29);
        g.stroke();
      }
    }
    g.globalAlpha = 1;

    g.textAlign = 'center';
    g.font = '500 12px "Geist Variable", ui-sans-serif, system-ui, sans-serif';
    const labelled = stars.slice(0, 14);
    if (hover && !labelled.includes(hover)) labelled.push(hover);
    for (const s of labelled) {
      g.fillStyle = hover === s ? 'rgb(244 244 245)' : `rgb(161 161 170 / ${hover ? 0.45 : 0.9})`;
      g.fillText(s.name, s.x, s.y + s.r * 1.6 + 16);
    }
  }

  /** Run the simulation until it settles, drawing each frame; then stop. */
  function kick(budget = 600) {
    ticks = Math.max(ticks, budget);
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function loop() {
    raf = 0;
    const speed = step();
    ticks--;
    draw();
    if (ticks > 0 && (speed > 0.015 || ticks > 560)) raf = requestAnimationFrame(loop);
    else ticks = 0;
  }
  /** One redraw on the next frame (hover changes), unless the loop is already running. */
  function redraw() {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), draw()));
  }

  onMount(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
    if (accent) palette = [accent, ...palette.slice(1)];
    makeSprites();
    build();
    kick();
    let lastW = wrap.clientWidth;
    ro = new ResizeObserver(() => {
      if (wrap.clientWidth === lastW) return;
      lastW = wrap.clientWidth;
      kick(160);
    });
    ro.observe(wrap);
    document.fonts?.ready.then(redraw).catch(() => {});
  });
  onDestroy(() => {
    cancelAnimationFrame(raf);
    raf = 0;
    ro?.disconnect();
  });

  function pick(e: PointerEvent | MouseEvent): Star | null {
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
  function move(e: PointerEvent) {
    const h = pick(e);
    if (h !== hover) {
      hover = h;
      redraw();
    }
  }
</script>

<div class="sky" bind:this={wrap} style:height="{height}px">
  <canvas
    bind:this={canvas}
    style:width="100%"
    style:height="{height}px"
    onpointermove={move}
    onpointerleave={() => {
      if (hover) {
        hover = null;
        redraw();
      }
    }}
    onclick={(e) => {
      const s = pick(e);
      if (s?.id) router.go({ name: 'artist', id: s.id });
    }}
    class:pointer={!!hover?.id}
  ></canvas>
  {#if hover}
    <div class="tip" style:left="{tip.x}px" style:top="{tip.y}px">
      <div class="nm">{hover.name}</div>
      <div class="aff num">{Math.round(hover.aff * 100)}% affinity</div>
    </div>
  {/if}
  {#if empty}
    <div class="empty">
      <span class="label">No stars yet</span>
      <span>Your sky is still dark. Every song you love adds a star.</span>
    </div>
  {/if}
  <span class="corner label">{count ? `${count} artists` : ''}</span>
</div>

<style>
  .sky {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    background: var(--bg-1);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  canvas {
    display: block;
  }
  canvas.pointer {
    cursor: pointer;
  }
  .tip {
    position: absolute;
    transform: translate(-50%, calc(-100% - 16px));
    padding: 7px 11px;
    border-radius: 9px;
    pointer-events: none;
    white-space: nowrap;
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--hair-2), 0 8px 24px rgb(0 0 0 / 0.5);
  }
  .nm {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .aff {
    font-size: 11px;
    color: var(--text-3);
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 15px;
    color: var(--text-2);
    text-align: center;
    padding: 20px;
  }
  .corner {
    position: absolute;
    left: 16px;
    top: 14px;
    color: var(--text-4);
    pointer-events: none;
  }
</style>
