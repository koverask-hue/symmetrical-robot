<script lang="ts">
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
  oncontextmenu={(e) => item.type === 'track' && ui.openMenu(e, item.track)}
>
  <div class="cover">
    {#if art}
      <img class="glow" src={art} alt="" aria-hidden="true" loading="lazy" />
      <img class="img" src={art} alt={title} loading="lazy" draggable="false" />
    {:else}
      <div class="img empty"></div>
    {/if}
    <button class="play" onclick={quickPlay} aria-label={`Play ${title}`}><Icon name="play" size={18} /></button>
  </div>
  <div class="title ellipsis">{title}</div>
  {#if reason}
    <div class="reason two">{reason}</div>
  {:else}
    <div class="sub ellipsis">{subtitle}</div>
  {/if}
</div>

<style>
  .card {
    width: 184px;
    flex: none;
    padding: 12px;
    border-radius: 24px;
    cursor: pointer;
    transition: background 0.4s var(--ease);
  }
  .card:hover {
    background: rgb(255 255 255 / 0.045);
  }
  .cover {
    position: relative;
    aspect-ratio: 1;
    margin-bottom: 14px;
  }
  .img,
  .glow {
    pointer-events: none;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 18px;
  }
  .round .img,
  .round .glow {
    border-radius: 50%;
  }
  .img {
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08), 0 20px 40px -20px rgb(0 0 0 / 0.8);
    transition: transform 0.6s var(--ease);
  }
  .empty {
    background: linear-gradient(135deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.02));
  }
  .glow {
    filter: blur(26px) saturate(1.7);
    opacity: 0;
    transform: translateY(12px) scale(0.92);
    transition: opacity 0.6s var(--ease), transform 0.6s var(--ease);
  }
  .card:hover .glow,
  .playing .glow {
    opacity: 0.75;
    transform: translateY(14px) scale(0.98);
  }
  .card:hover .img {
    transform: translateY(-4px);
  }
  .play {
    position: absolute;
    right: 10px;
    bottom: 10px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--text);
    color: #0b0814;
    box-shadow: 0 10px 30px -6px rgb(0 0 0 / 0.6);
    opacity: 0;
    transform: translateY(8px) scale(0.9);
    transition: 0.35s var(--ease);
  }
  .card:hover .play,
  .play:focus-visible {
    opacity: 1;
    transform: translateY(-4px);
  }
  .title {
    font-weight: 550;
    font-size: 14px;
  }
  .playing .title {
    color: rgb(var(--tint));
  }
  .sub {
    font-size: 13px;
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
    margin-top: 2px;
  }
</style>
