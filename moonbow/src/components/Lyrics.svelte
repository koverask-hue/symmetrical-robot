<script lang="ts">
  // Karaoke lyrics. Svelte renders the lines once per song; a requestAnimationFrame
  // loop then writes word fill and scroll position straight to the DOM so 60fps
  // updates never go through reactive state.
  import { onDestroy } from 'svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { source } from '../lib/sources';
  import { findLyrics, type LyricsResult } from '../lib/lyrics/provider';
  import { lineAt, wordProgress, type Line } from '../lib/lyrics/lrc';
  import { canRomanize, romanize } from '../lib/lyrics/romanize';

  let { compact = false }: { compact?: boolean } = $props();

  let result = $state<LyricsResult | null>(null);
  let container: HTMLDivElement;
  // Raw state: written by bind:this, read by the frame loop; never drives rendering.
  let scroller = $state.raw<HTMLDivElement>();
  let lineEls = $state.raw<HTMLElement[]>([]);
  let wordEls = $state.raw<HTMLElement[][]>([]);
  let dotEls = $state.raw<HTMLElement[][]>([]);
  let active = -2;
  let raf = 0;
  /** After the user scrolls by hand, stop auto-scrolling for a moment. */
  let userScrollUntil = 0;

  const track = $derived(player.current);
  const lines = $derived(result?.kind === 'timed' ? result.lyrics.lines : []);
  const plainLines = $derived(result?.kind === 'plain' ? result.text.split('\n') : []);
  const offset = $derived(track ? library.offset(track.id) : 0);
  const showRoman = $derived(library.settings.romanize);

  $effect(() => {
    const t = track;
    result = null;
    active = -2;
    lineEls = [];
    wordEls = [];
    dotEls = [];
    if (!t) return;
    let alive = true;
    findLyrics(t, source).then((r) => {
      if (!alive || player.current?.id !== t.id) return;
      const n = r.kind === 'timed' ? r.lyrics.lines.length : 0;
      wordEls = Array.from({ length: n }, () => []);
      dotEls = Array.from({ length: n }, () => []);
      result = r;
    });
    return () => {
      alive = false;
    };
  });

  function setActive(i: number) {
    if (i === active) return;
    const prev = active;
    active = i;
    lineEls.forEach((el, j) => {
      if (!el) return;
      const d = i < 0 ? j + 1 : j - i;
      el.classList.toggle('active', d === 0);
      el.classList.toggle('past', d < 0);
      el.style.setProperty('--dist', String(Math.min(4, Math.abs(d))));
    });
    // Reset the fill of the line we just left (to full) so it doesn't stay half-lit.
    if (prev >= 0) wordEls[prev]?.forEach((w) => w?.style.setProperty('--p', '1'));
    scrollTo(i);
  }

  function scrollTo(i: number, force = false) {
    if (!scroller || (!force && performance.now() < userScrollUntil)) return;
    const el = lineEls[Math.max(0, i)];
    if (!el) return;
    const target = el.offsetTop - scroller.clientHeight * (compact ? 0.3 : 0.36) + el.offsetHeight / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!lines.length) {
      if (plainLines.length && player.duration > 0) {
        // Unsynced: drift through the text proportionally so it roughly follows along.
        const i = Math.floor((player.time() / player.duration) * plainLines.length * 0.95);
        setActive(Math.min(plainLines.length - 1, i));
      }
      return;
    }
    const t = player.time() + offset;
    const i = lineAt(lines, t);
    setActive(i);
    const line = lines[i];
    if (!line) return;
    if (line.interlude) {
      const p = (t - line.start) / Math.max(0.1, line.end - line.start);
      dotEls[i]?.forEach((d, k) => d?.style.setProperty('--p', String(Math.max(0, Math.min(1, p * 3 - k)))));
      return;
    }
    const words = wordEls[i];
    line.words.forEach((w, k) => words?.[k]?.style.setProperty('--p', wordProgress(w, t).toFixed(3)));
  }

  $effect(() => {
    // Restart the loop whenever the lyrics change; DOM refs are bound by then.
    lines;
    plainLines;
    cancelAnimationFrame(raf);
    queueMicrotask(() => {
      active = -2;
      raf = requestAnimationFrame(frame);
    });
  });

  onDestroy(() => cancelAnimationFrame(raf));

  function seekLine(l: Line) {
    player.seek(Math.max(0, l.start - offset));
    userScrollUntil = 0;
    if (!player.playing) player.toggle();
  }

  function onWheel() {
    userScrollUntil = performance.now() + 2500;
  }
</script>

<div class="lyrics" class:compact bind:this={container} style:--size={library.settings.lyricsSize}>
  {#if !track}
    <div class="empty"><span class="label">Lyrics</span>Play something to see its lyrics.</div>
  {:else if !result}
    <div class="loading">
      {#each [70, 55, 80, 45] as w, i (i)}<div class="skeleton" style:width="{w}%"></div>{/each}
    </div>
  {:else if result.kind === 'instrumental'}
    <div class="empty"><span class="label">Instrumental</span>No words on this one. Just listen.</div>
  {:else if result.kind === 'none'}
    <div class="empty"><span class="label">Lyrics</span>No lyrics found for this one.</div>
  {:else}
    <div class="scroller" role="presentation" bind:this={scroller} onwheel={onWheel} ontouchmove={onWheel}>
      <div class="pad-top"></div>
      {#if result.kind === 'timed'}
        {#each lines as l, i (i)}
          {#if l.interlude}
            <div class="line interlude" bind:this={lineEls[i]} aria-hidden="true">
              {#each [0, 1, 2] as k (k)}<span class="dot" bind:this={dotEls[i][k]}></span>{/each}
            </div>
          {:else}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div class="line" bind:this={lineEls[i]} role="button" tabindex="-1" onclick={() => seekLine(l)}>
              <span class="words">
                {#each l.words as w, k (k)}<span class="w" bind:this={wordEls[i][k]}>{w.text}</span>{/each}
              </span>
              {#if showRoman && canRomanize(l.text)}
                <span class="roman">{romanize(l.text)}</span>
              {/if}
            </div>
          {/if}
        {/each}
      {:else}
        {#each plainLines as text, i (i)}
          <div class="line plain" bind:this={lineEls[i]}>
            <span class="words">{text || ' '}</span>
            {#if showRoman && canRomanize(text)}<span class="roman">{romanize(text)}</span>{/if}
          </div>
        {/each}
      {/if}
      <div class="pad-bottom"></div>
    </div>
    <div class="credit">
      {#if result.kind === 'timed'}
        Lyrics · {result.lyrics.source} · {result.lyrics.timing === 'exact' ? 'word-synced' : 'line-synced · words estimated'}
      {:else}
        Lyrics · {result.source} · not synced
      {/if}
    </div>
  {/if}
</div>

<style>
  .lyrics {
    position: relative;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    --fs: calc(clamp(26px, 2.9vw, 44px) * var(--size, 1));
  }
  .compact {
    --fs: calc(24px * var(--size, 1));
  }
  .scroller {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    mask-image: linear-gradient(transparent, #000 14%, #000 80%, transparent);
    -webkit-mask-image: linear-gradient(transparent, #000 14%, #000 80%, transparent);
    padding: 0 4px;
  }
  .scroller::-webkit-scrollbar {
    display: none;
  }
  .pad-top {
    height: 30%;
  }
  .pad-bottom {
    height: 60%;
  }

  /* ---- lines: crisp Geist, no blur; only colour and transform move ---- */
  .line {
    font: 700 var(--fs) / 1.15 var(--sans);
    letter-spacing: -0.03em;
    padding: 10px 14px;
    margin: 2px 0;
    border-radius: 10px;
    cursor: pointer;
    color: rgb(255 255 255 / 0.22);
    transform-origin: left center;
    transform: scale(0.97);
    transition:
      transform 0.3s var(--ease),
      color 0.25s var(--ease),
      background 0.15s;
    text-wrap: balance;
  }
  .line:hover {
    background: rgb(255 255 255 / 0.035);
    color: rgb(255 255 255 / 0.5);
  }
  .line:global(.past) {
    color: rgb(255 255 255 / 0.35);
  }
  .line:global(.past):hover {
    color: rgb(255 255 255 / 0.5);
  }
  .line:global(.active) {
    transform: none;
    color: rgb(255 255 255 / 0.32);
  }
  .line:global(.active):hover {
    background: none;
  }
  .line.plain {
    cursor: default;
  }
  .line.plain:global(.active) {
    color: #fff;
  }

  .w {
    --p: 0;
  }
  .line:global(.past) .w {
    --p: 1;
  }
  .line:global(.active) .w {
    /* Sung part pure white, unsung dim; a soft edge travels through the word. */
    background: linear-gradient(
      90deg,
      #fff calc(var(--p) * 100% - 8%),
      rgb(255 255 255 / 0.32) calc(var(--p) * 100% + 8%)
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    display: inline-block;
    white-space: pre;
    transform: translateY(calc(min(var(--p), 1 - var(--p)) * -3px));
    /* Only the word being sung (0 < p < 1) gets a faint accent halo. */
    text-shadow: 0 0 18px rgb(var(--accent-rgb) / calc(min(var(--p), 1 - var(--p)) * 0.7));
    transition: transform 0.14s;
  }
  .line:global(.past) .w,
  .line:not(:global(.active)) .w {
    display: inline;
  }
  .roman {
    display: block;
    font: 500 0.4em/1.35 var(--sans);
    letter-spacing: -0.005em;
    color: rgb(255 255 255 / 0.4);
    margin-top: 4px;
  }
  .line:global(.active) .roman {
    color: rgb(255 255 255 / 0.62);
  }

  /* ---- interludes: three accent dots ---- */
  .interlude {
    display: flex;
    gap: 10px;
    padding: 20px 14px;
    cursor: default;
  }
  .interlude:hover {
    background: none;
  }
  .dot {
    --p: 0;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: rgb(var(--accent-rgb) / calc(0.2 + var(--p) * 0.8));
    transform: scale(calc(0.8 + var(--p) * 0.35));
    transition: transform 0.2s;
  }
  .interlude:not(:global(.active)) {
    height: 0;
    padding: 0 14px;
    overflow: hidden;
    opacity: 0;
  }
  .interlude:global(.active) {
    animation: breathe 2.4s infinite var(--ease);
  }
  @keyframes breathe {
    50% {
      transform: scale(1.06);
    }
  }

  /* ---- credit & states ---- */
  .credit {
    position: absolute;
    bottom: 4px;
    left: 18px;
    font: 500 10.5px/1 var(--mono);
    font-feature-settings: 'zero', 'ss01';
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-4);
    pointer-events: none;
  }
  .empty {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    font: 600 22px/1.2 var(--sans);
    letter-spacing: -0.03em;
    color: var(--text-2);
    text-align: center;
  }
  .loading {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 30% 14px 0;
  }
  .loading .skeleton {
    height: calc(var(--fs) * 0.8);
  }
</style>
