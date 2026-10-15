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
    <div class="empty">Play something to see its lyrics.</div>
  {:else if !result}
    <div class="loading">
      {#each [70, 55, 80, 45] as w, i (i)}<div class="skeleton" style:width="{w}%"></div>{/each}
    </div>
  {:else if result.kind === 'instrumental'}
    <div class="empty">♪ Instrumental</div>
  {:else if result.kind === 'none'}
    <div class="empty">No lyrics found for this one.</div>
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
        {result.lyrics.source} · {result.lyrics.timing === 'exact' ? 'word-synced' : 'line-synced, words estimated'}
      {:else}
        {result.source} · not synced
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
    --fs: calc(clamp(24px, 3.1vw, 44px) * var(--size, 1));
  }
  .compact {
    --fs: calc(22px * var(--size, 1));
  }
  .scroller {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: none;
    mask-image: linear-gradient(transparent, #000 14%, #000 80%, transparent);
    padding: 0 8px;
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
  .line {
    font: 800 var(--fs) / 1.22 var(--display);
    letter-spacing: -0.02em;
    padding: 10px 12px;
    margin: 2px 0;
    border-radius: 14px;
    cursor: pointer;
    color: rgb(255 255 255 / 0.32);
    transform-origin: left center;
    transform: scale(0.96);
    filter: blur(calc(var(--dist, 0) * 0.7px));
    transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.4s, filter 0.4s, opacity 0.4s;
    text-wrap: balance;
  }
  .compact .line {
    filter: none;
  }
  .line:hover {
    background: rgb(255 255 255 / 0.06);
    filter: none;
    color: rgb(255 255 255 / 0.55);
  }
  .line:global(.past) {
    color: rgb(255 255 255 / 0.42);
  }
  .line:global(.active) {
    transform: none;
    filter: none;
    color: rgb(255 255 255 / 0.35);
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
    /* Fill left to right with a soft edge; lift slightly while being sung. */
    background: linear-gradient(90deg, #fff calc(var(--p) * 100% - 8%), rgb(255 255 255 / 0.35) calc(var(--p) * 100% + 8%));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    display: inline-block;
    white-space: pre;
    transform: translateY(calc((1 - var(--p)) * 0px - min(var(--p), 1 - var(--p)) * 4px));
    text-shadow: 0 0 calc(var(--p) * 18px) rgb(255 255 255 / calc(var(--p) * 0.25));
    transition: transform 0.12s;
  }
  .line:global(.past) .w,
  .line:not(:global(.active)) .w {
    display: inline;
  }
  .roman {
    display: block;
    font-size: 0.5em;
    font-weight: 600;
    opacity: 0.7;
    margin-top: 4px;
    letter-spacing: 0;
  }
  .interlude {
    display: flex;
    gap: 10px;
    padding: 18px 14px;
    cursor: default;
  }
  .interlude:hover {
    background: none;
  }
  .dot {
    --p: 0;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgb(255 255 255 / calc(0.25 + var(--p) * 0.75));
    transform: scale(calc(0.8 + var(--p) * 0.35));
    transition: transform 0.2s;
  }
  .interlude:not(:global(.active)) .dot {
    opacity: 0.4;
  }
  .interlude:not(:global(.active)) {
    height: 0;
    padding: 0 14px;
    overflow: hidden;
    opacity: 0;
  }
  .interlude:global(.active) {
    animation: breathe 2.4s infinite ease-in-out;
  }
  @keyframes breathe {
    50% {
      transform: scale(1.06);
    }
  }
  .credit {
    position: absolute;
    bottom: 6px;
    left: 20px;
    font-size: 11px;
    color: var(--text-3);
  }
  .empty {
    margin: auto;
    font: 700 22px var(--display);
    color: var(--text-2);
  }
  .loading {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 30% 20px 0;
  }
  .loading .skeleton {
    height: calc(var(--fs) * 0.9);
  }
</style>
