<script lang="ts">
  // The stage: cover, title and lyrics over the main area. No transport here;
  // the player bar below is the only player.
  import { onDestroy } from 'svelte';
  import Icon from './Icon.svelte';
  import Lyrics from './Lyrics.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { ui } from '../lib/ui.svelte';
  import { artistLine } from '../lib/sources/types';

  const t = $derived(player.current);
  const offset = $derived(t ? library.offset(t.id) : 0);
  const liked = $derived(t ? library.isLiked(t.id) : false);
  const size = $derived(library.settings.lyricsSize);

  let failed = $state(false);
  $effect(() => {
    t?.art;
    failed = false;
  });

  function more() {
    if (!t) return;
    taste.feedback(t, 'more');
    toasts.show(`More like “${t.title}”, coming up.`);
  }

  function nextSize() {
    library.updateSettings({ lyricsSize: size >= 1.3 ? 0.8 : +(size + 0.1).toFixed(1) });
  }

  // ---- bass glow: ~30fps, written straight to the DOM, never through state ----
  let glow = $state.raw<HTMLDivElement>();
  let raf = 0;
  let last = 0;
  let level = 0;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const glowOn = $derived(library.settings.visuals !== 'off');
  const calm = $derived(library.settings.visuals === 'calm');

  function paint(v: number) {
    if (!glow) return;
    glow.style.transform = `translate3d(-50%, -50%, 0) scale(${(0.9 + v * (calm ? 0.12 : 0.3)).toFixed(3)})`;
    glow.style.opacity = (0.22 + v * (calm ? 0.18 : 0.4)).toFixed(3);
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;
    last = now;
    const bins = player.spectrum();
    if (!bins) return;
    // Bins 1–4 ≈ 170–860 Hz: kick and bass.
    const v = (bins[1] + bins[2] + bins[3] + bins[4]) / (4 * 255);
    const target = Math.max(0, (v - 0.35) / 0.65);
    level += (target - level) * (target > level ? 0.5 : 0.12);
    paint(level);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  $effect(() => {
    const run = player.playing && glowOn && !reduced && !!glow;
    stop();
    if (run) raf = requestAnimationFrame(frame);
    else {
      level = 0;
      paint(0);
    }
    return stop;
  });

  onDestroy(stop);
</script>

<div class="stage" class:no-cover={!t?.art || failed}>
  <div class="bg" aria-hidden="true">
    {#if t?.art && !failed}<img class="wash" src={t.art} alt="" decoding="async" />{/if}
    <div class="shade"></div>
    {#if glowOn}<div class="glow" bind:this={glow}></div>{/if}
  </div>

  <button class="icon-btn close" onclick={() => (ui.lyricsOpen = false)} aria-label="Close (Esc)" title="Close (Esc)">
    <Icon name="collapse" size={18} />
  </button>

  <div class="side">
    {#if t}
      <div class="cover" class:paused={!player.playing}>
        {#if t.art && !failed}
          <img src={t.art} alt={t.title} draggable="false" onerror={() => (failed = true)} />
        {/if}
      </div>
      <div class="meta">
        <div class="title">{t.title}</div>
        <div class="artist ellipsis">{artistLine(t)}</div>
        {#if player.reason}<div class="reason">{player.reason}</div>{/if}
      </div>
      <div class="tools">
        <button class="chip" class:on={liked} onclick={() => library.toggleLike(t)} aria-pressed={liked}>
          <Icon name={liked ? 'heart-filled' : 'heart'} size={13} /> Love
        </button>
        <button class="chip sq" onclick={more} aria-label="More like this" title="More like this">
          <Icon name="thumb-up" size={13} />
        </button>
        <button
          class="chip"
          class:on={library.settings.romanize}
          onclick={() => library.updateSettings({ romanize: !library.settings.romanize })}
          aria-pressed={library.settings.romanize}
          title="Romanize (Cyrillic, Greek, Korean, kana)"
        >
          <Icon name="translate" size={13} /> Romanize
        </button>
        <span class="sync" title="Shift lyric timing if they run early or late ([ and ])">
          <button class="chip sq" onclick={() => library.nudgeOffset(t.id, -0.1)} aria-label="Lyrics later">−</button>
          <span class="num" class:set={offset !== 0}>{offset > 0 ? '+' : ''}{offset.toFixed(1)}s</span>
          <button class="chip sq" onclick={() => library.nudgeOffset(t.id, 0.1)} aria-label="Lyrics earlier">+</button>
        </span>
        <button class="chip sq aa" onclick={nextSize} title="Text size ({Math.round(size * 100)}%)" aria-label="Text size">Aa</button>
      </div>
    {/if}
  </div>
  <div class="main"><Lyrics /></div>
</div>

<style>
  .stage {
    position: fixed;
    left: var(--side);
    right: 0;
    top: 0;
    bottom: var(--bar);
    z-index: 25;
    overflow: hidden;
    background: #000;
    display: grid;
    grid-template-columns: minmax(260px, 380px) minmax(0, 1fr);
    gap: clamp(32px, 5vw, 88px);
    padding: 6vh clamp(28px, 5vw, 72px) 3vh;
    animation: stage-in 0.25s var(--ease) both;
  }
  @keyframes stage-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }

  /* ---- background: one static wash, a shade, and the bass glow ---- */
  .bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .wash {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* Static layer: blurred once, never animated except by transform. */
    filter: blur(90px);
    opacity: 0.28;
    transform: scale(1.4) translateZ(0);
  }
  .shade {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.75) 55%, rgb(0 0 0 / 0.88)),
      linear-gradient(180deg, rgb(0 0 0 / 0.2), rgb(0 0 0 / 0.6));
  }
  .glow {
    position: absolute;
    left: 22%;
    top: 55%;
    width: 900px;
    height: 900px;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgb(var(--tint) / 0.38), rgb(var(--tint) / 0.12) 55%, transparent);
    transform: translate3d(-50%, -50%, 0) scale(0.9);
    opacity: 0.22;
    will-change: transform, opacity;
  }

  .close {
    position: absolute;
    top: 16px;
    right: 18px;
    z-index: 2;
  }

  /* ---- left column ---- */
  .side {
    position: relative;
    z-index: 1;
    align-self: center;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 380px;
    min-width: 0;
  }
  .cover {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    background: var(--bg-3);
    box-shadow:
      inset 0 0 0 1px var(--hair),
      0 24px 60px -24px rgb(0 0 0 / 0.85);
    transition: transform 0.25s var(--ease);
  }
  .cover.paused {
    transform: scale(0.94);
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 24px;
    min-width: 0;
  }
  .title {
    font: 620 26px/1.12 var(--sans);
    letter-spacing: -0.035em;
    color: var(--text);
    text-wrap: balance;
  }
  .artist {
    font-size: 14.5px;
    color: var(--text-2);
  }
  .reason {
    margin-top: 8px;
  }
  .tools {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 22px;
  }
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sync .num {
    min-width: 40px;
    text-align: center;
    font-size: 11.5px;
    color: var(--text-3);
  }
  .sync .num.set {
    color: var(--accent);
  }
  .sq {
    width: 28px;
    padding: 0;
    justify-content: center;
  }
  .aa {
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  /* ---- right column ---- */
  .main {
    position: relative;
    z-index: 1;
    min-height: 0;
    min-width: 0;
  }

  .no-cover .shade {
    background: none;
  }

  @media (max-width: 900px) {
    .stage {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      gap: 12px;
      padding: 56px 24px 2vh;
    }
    .side {
      max-width: none;
      align-self: start;
    }
    .cover {
      display: none;
    }
    .meta {
      margin-top: 0;
    }
    .tools {
      margin-top: 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glow {
      display: none;
    }
  }
</style>
