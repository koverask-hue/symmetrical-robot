<script lang="ts">
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import { router } from '../lib/router.svelte';
  import { player } from '../lib/player/player.svelte';
  import { source } from '../lib/sources';
  import { toasts } from '../lib/toasts.svelte';
  import { ui } from '../lib/ui.svelte';
  import { artistLine, type ShelfItem } from '../lib/sources/types';

  let { item, reason, onplay }: { item: ShelfItem; reason?: string; onplay?: () => void } = $props();

  const title = $derived(item.type === 'track' ? item.track.title : item.ref.title);
  const subtitle = $derived(item.type === 'track' ? artistLine(item.track) : (item.ref.subtitle ?? ''));
  const art = $derived(item.type === 'track' ? item.track.art : item.ref.art);
  const round = $derived(item.type === 'collection' && item.ref.kind === 'artist');
  const playing = $derived(item.type === 'track' && player.current?.id === item.track.id);

  let warmTimer: ReturnType<typeof setTimeout> | undefined;
  function warmSoon() {
    if (item.type !== 'track') return;
    const t = item.track;
    clearTimeout(warmTimer);
    warmTimer = setTimeout(() => player.warm(t), 200);
  }
  const cancelWarm = () => clearTimeout(warmTimer);

  function open() {
    if (item.type === 'track') return onplay ? onplay() : player.playRadio(item.track);
    router.go({ name: item.ref.kind, id: item.ref.id });
  }

  async function quickPlay(e: MouseEvent) {
    e.stopPropagation();
    if (item.type === 'track') return onplay ? onplay() : player.playRadio(item.track);
    const { kind, id } = item.ref;
    try {
      const tracks = kind === 'artist' ? (await source.artist(id)).topTracks : (await source.collection(kind, id)).tracks;
      player.playTracks(tracks);
    } catch (err) {
      toasts.error(`Couldn't load: ${(err as Error).message}`);
    }
  }
</script>

<div
  class="card"
  class:round
  class:playing
  role="button"
  tabindex="0"
  onclick={open}
  onkeydown={(e) => e.key === 'Enter' && open()}
  onpointerenter={warmSoon}
  onpointerleave={cancelWarm}
  oncontextmenu={(e) => item.type === 'track' && ui.openMenu(e, item.track)}
>
  <div class="cover">
    <Art src={art} size="100%" {round} radius={8} alt={title} />
    <button class="play" onclick={quickPlay} aria-label={`Play ${title}`}><Icon name="play" size={17} /></button>
  </div>
  <div class="title ellipsis">
    {#if playing}<span class="dot" aria-hidden="true"></span>{/if}{title}
  </div>
  {#if reason}
    <div class="reason two">{reason}</div>
  {:else}
    <div class="sub ellipsis">{subtitle}</div>
  {/if}
</div>

<style>
  .card {
    width: 176px;
    flex: none;
    padding: 10px;
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.18s var(--ease);
  }
  .card:hover {
    background: var(--bg-2);
  }
  .cover {
    position: relative;
    aspect-ratio: 1;
    margin-bottom: 11px;
    transition: transform 0.22s var(--ease);
  }
  .card:hover .cover {
    transform: translateY(-2px);
  }
  .play {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--accent-ink);
    box-shadow: 0 8px 18px -6px rgb(0 0 0 / 0.7);
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.18s var(--ease), transform 0.22s var(--ease);
  }
  .round .play {
    right: 4px;
    bottom: 4px;
  }
  .card:hover .play,
  .play:focus-visible {
    opacity: 1;
    transform: none;
  }
  .play:hover {
    transform: scale(1.06);
  }
  .play:active {
    transform: scale(0.94);
  }
  .title {
    font-size: 13.5px;
    font-weight: 550;
    letter-spacing: -0.012em;
    line-height: 1.35;
  }
  .playing .title {
    color: var(--accent);
  }
  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin: 0 7px 1px 0;
    border-radius: 50%;
    background: var(--accent);
    vertical-align: middle;
  }
  .sub {
    margin-top: 1px;
    font-size: 12.5px;
    color: var(--text-3);
  }
  .round .title,
  .round .sub {
    text-align: center;
  }
  .two {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: 3px;
  }
</style>
