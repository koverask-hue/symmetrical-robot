<script lang="ts">
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import { router } from '../lib/router.svelte';
  import { player } from '../lib/player/player.svelte';
  import { source } from '../lib/sources';
  import { toasts } from '../lib/toasts.svelte';
  import { ui } from '../lib/ui.svelte';
  import { artistLine, type ShelfItem } from '../lib/sources/types';

  let { item }: { item: ShelfItem } = $props();

  const title = $derived(item.type === 'track' ? item.track.title : item.ref.title);
  const subtitle = $derived(item.type === 'track' ? artistLine(item.track) : item.ref.subtitle ?? '');
  const art = $derived(item.type === 'track' ? item.track.art : item.ref.art);
  const round = $derived(item.type === 'collection' && item.ref.kind === 'artist');

  function open() {
    if (item.type === 'track') return player.playRadio(item.track);
    const { kind, id } = item.ref;
    router.go({ name: kind, id });
  }

  async function quickPlay(e: MouseEvent) {
    e.stopPropagation();
    if (item.type === 'track') return player.playRadio(item.track);
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
  role="button"
  tabindex="0"
  onclick={open}
  onkeydown={(e) => e.key === 'Enter' && open()}
  oncontextmenu={(e) => item.type === 'track' && ui.openMenu(e, item.track)}
>
  <div class="cover">
    <Art src={art} size="100%" {round} alt={title} />
    <button class="play" onclick={quickPlay} aria-label={`Play ${title}`}><Icon name="play" size={20} /></button>
  </div>
  <div class="title ellipsis" class:center={round}>{title}</div>
  <div class="sub ellipsis muted" class:center={round}>{subtitle}</div>
</div>

<style>
  .card {
    width: 172px;
    flex: none;
    padding: 10px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: background 0.15s;
  }
  .card:hover {
    background: var(--hover);
  }
  .cover {
    position: relative;
    aspect-ratio: 1;
    margin-bottom: 10px;
  }
  .play {
    position: absolute;
    right: 8px;
    bottom: 8px;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--text);
    color: #111;
    box-shadow: 0 8px 22px rgb(0 0 0 / 0.4);
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.15s, transform 0.15s;
  }
  .card:hover .play,
  .play:focus-visible {
    opacity: 1;
    transform: none;
  }
  .title {
    font-weight: 600;
  }
  .sub {
    font-size: 13px;
  }
  .center {
    text-align: center;
  }
</style>
