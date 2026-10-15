<script lang="ts">
  import Icon from './Icon.svelte';
  import { player } from '../lib/player/player.svelte';
  import { router } from '../lib/router.svelte';
  import type { Mix } from '../lib/taste/recommend';

  let { mix }: { mix: Mix } = $props();
  // Three covers from different artists, orbiting a glow in the world's colour.
  const arts = $derived.by(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of mix.tracks) {
      const a = t.artists[0]?.name ?? '';
      if (t.art && !seen.has(a)) {
        seen.add(a);
        out.push(t.art);
      }
      if (out.length === 3) break;
    }
    return out;
  });
  function play(e: MouseEvent) {
    e.stopPropagation();
    player.playTracks(mix.tracks, 0, { reasons: mix.reasons });
  }
</script>

<div class="world" role="button" tabindex="0" style:--h={mix.hue} onclick={() => router.go({ name: 'mix', id: mix.id })} onkeydown={(e) => e.key === 'Enter' && router.go({ name: 'mix', id: mix.id })}>
  <div class="orb">
    <div class="ring"></div>
    {#each arts as src, i (src)}
      <img {src} alt="" class="p{i}" loading="lazy" />
    {/each}
    <button class="play" onclick={play} aria-label="Play {mix.title}"><Icon name="play" size={18} /></button>
  </div>
  <div class="title serif">{mix.title}</div>
  <div class="sub ellipsis">{mix.tracks.length} songs · your {mix.subtitle.split(' · ')[0].toLowerCase()}</div>
</div>

<style>
  .world {
    flex: none;
    width: 250px;
    padding: 18px 18px 20px;
    border-radius: 32px;
    cursor: pointer;
    transition: background 0.4s var(--ease), transform 0.5s var(--ease);
  }
  .world:hover {
    background: rgb(255 255 255 / 0.04);
    transform: translateY(-4px);
  }
  .orb {
    position: relative;
    aspect-ratio: 1;
    border-radius: 50%;
    margin-bottom: 18px;
    background: radial-gradient(circle at 50% 45%, hsl(var(--h) 80% 60% / 0.55), hsl(var(--h) 70% 30% / 0.15) 55%, transparent 72%);
  }
  .ring {
    position: absolute;
    inset: 4%;
    border-radius: 50%;
    background: conic-gradient(from calc(var(--h) * 1deg), #9fefff, #b9a8ff, #ffaee0, #ffd9a6, #9fefff);
    mask: radial-gradient(circle, transparent 67.5%, #000 68%, #000 69.2%, transparent 69.7%);
    opacity: 0.7;
    animation: spin 40s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }
  img {
    position: absolute;
    width: 46%;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 50%;
    box-shadow: 0 18px 40px -10px rgb(0 0 0 / 0.7), 0 0 0 3px rgb(10 8 18 / 0.6);
    transition: transform 0.7s var(--ease);
  }
  .p0 {
    left: 27%;
    top: 12%;
    z-index: 3;
  }
  .p1 {
    left: 9%;
    top: 46%;
    width: 38%;
    z-index: 2;
  }
  .p2 {
    right: 9%;
    top: 46%;
    width: 38%;
    z-index: 1;
  }
  .world:hover .p0 {
    transform: translateY(-6px) scale(1.04);
  }
  .world:hover .p1 {
    transform: translate(-6px, 4px);
  }
  .world:hover .p2 {
    transform: translate(6px, 4px);
  }
  .play {
    position: absolute;
    right: 8%;
    bottom: 8%;
    z-index: 4;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--text);
    color: #0b0814;
    box-shadow: 0 10px 30px -6px hsl(var(--h) 80% 60%);
    opacity: 0;
    transform: scale(0.8);
    transition: 0.35s var(--ease);
  }
  .world:hover .play,
  .play:focus-visible {
    opacity: 1;
    transform: none;
  }
  .title {
    font-size: 24px;
    line-height: 1.1;
    margin-bottom: 4px;
  }
  .sub {
    font-size: 12.5px;
    color: var(--text-3);
  }
</style>
