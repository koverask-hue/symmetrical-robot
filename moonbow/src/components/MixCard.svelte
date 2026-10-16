<script lang="ts">
  // A mix as a card: 2×2 cover mosaic with a tiny kind tag, title, song count, play on hover.
  import Icon from './Icon.svelte';
  import Mosaic from './Mosaic.svelte';
  import { player } from '../lib/player/player.svelte';
  import { router } from '../lib/router.svelte';
  import type { Mix } from '../lib/taste/recommend';

  let { mix }: { mix: Mix } = $props();

  const tag = $derived(mix.kind === 'world' ? 'WORLD' : mix.kind === 'fresh' ? 'NEW' : 'MIX');
  const arts = $derived(mix.tracks.map((t) => t.art));
  const playing = $derived(!!player.current && mix.tracks.some((t) => t.id === player.current!.id) && player.reasons[player.current.id] === mix.reasons[player.current.id]);

  const open = () => router.go({ name: 'mix', id: mix.id });
  function play(e: MouseEvent) {
    e.stopPropagation();
    player.playTracks(mix.tracks, 0, { reasons: mix.reasons });
  }
</script>

<div class="mixcard" class:playing role="button" tabindex="0" onclick={open} onkeydown={(e) => e.key === 'Enter' && open()}>
  <div class="cover">
    <Mosaic {arts} size={180} radius={8} label={tag} />
    <button class="play" aria-label={`Play ${mix.title}`} onclick={play}><Icon name="play" size={17} /></button>
  </div>
  <div class="title ellipsis">{mix.title}</div>
  <div class="sub ellipsis">{mix.tracks.length} songs</div>
</div>

<style>
  .mixcard {
    width: 200px;
    flex: none;
    padding: 10px;
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.18s var(--ease);
  }
  .mixcard:hover {
    background: var(--bg-2);
  }
  .cover {
    position: relative;
    width: 180px;
    height: 180px;
    margin-bottom: 11px;
    transition: transform 0.22s var(--ease);
  }
  .mixcard:hover .cover {
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
  .mixcard:hover .play,
  .play:focus-visible {
    opacity: 1;
    transform: none;
  }
  .play:hover {
    transform: scale(1.06);
  }
  .title {
    font-size: 14px;
    font-weight: 560;
    letter-spacing: -0.015em;
  }
  .playing .title {
    color: var(--accent);
  }
  .sub {
    margin-top: 1px;
    font: 450 11px/1.4 var(--mono);
    letter-spacing: 0.01em;
    color: var(--text-3);
  }
</style>
