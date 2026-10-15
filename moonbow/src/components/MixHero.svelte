<script lang="ts">
  import Fan from './Fan.svelte';
  import Icon from './Icon.svelte';
  import { player } from '../lib/player/player.svelte';
  import { router } from '../lib/router.svelte';
  import type { Mix } from '../lib/taste/recommend';

  let { mix, kicker = 'Right now · made for you' }: { mix: Mix; kicker?: string } = $props();
  const words = $derived(mix.title.split(' '));
  const play = (shuffle = false) => {
    player.playTracks(mix.tracks, 0, { reasons: mix.reasons });
    if (shuffle) player.toggleShuffle();
  };
</script>

<section class="hero enter" style:--h={mix.hue}>
  <div class="text">
    <div class="kicker">{kicker}</div>
    <h2 class="display title">
      {words.slice(0, -1).join(' ')} <em>{words[words.length - 1]}</em>
    </h2>
    <p class="sub">{mix.subtitle}</p>
    <div class="first">
      <span class="faint">Opens with</span> <span class="ellipsis">{mix.tracks[0]?.title}</span>
      <span class="reason">· {mix.reasons[mix.tracks[0]?.id]}</span>
    </div>
    <div class="actions">
      <button class="btn primary" onclick={() => play()}><Icon name="play" size={16} /> Play</button>
      <button class="btn" onclick={() => play(true)}><Icon name="shuffle" size={16} /> Shuffle</button>
      <button class="btn ghost" onclick={() => router.go({ name: 'mix', id: mix.id })}>{mix.tracks.length} songs · see why</button>
    </div>
  </div>
  <button class="art" onclick={() => router.go({ name: 'mix', id: mix.id })} aria-label="Open {mix.title}">
    <Fan arts={mix.tracks.map((t) => t.art)} size={190} />
  </button>
</section>

<style>
  .hero {
    position: relative;
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    align-items: center;
    min-height: 380px;
    padding: 44px 48px;
    border-radius: 40px;
    overflow: hidden;
    background:
      radial-gradient(70% 90% at 85% 50%, hsl(var(--h) 70% 55% / 0.28), transparent 70%),
      radial-gradient(60% 80% at 10% 100%, rgb(var(--tint) / 0.18), transparent 70%),
      rgb(14 10 26 / 0.45);
    backdrop-filter: blur(30px) saturate(160%);
    box-shadow: var(--glass-edge), var(--lift);
    margin-bottom: 64px;
  }
  .title {
    margin: 16px 0 14px;
    font-size: clamp(52px, 6vw, 96px);
  }
  .title em {
    background: var(--iris);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    padding-right: 0.08em;
  }
  .sub {
    max-width: 440px;
    margin: 0 0 18px;
    font-size: 15.5px;
    color: var(--text-2);
  }
  .first {
    display: flex;
    gap: 6px;
    align-items: baseline;
    max-width: 520px;
    font-size: 13px;
    margin-bottom: 26px;
    white-space: nowrap;
    overflow: hidden;
  }
  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .ghost {
    background: none;
    box-shadow: none;
    color: var(--text-2);
  }
  .ghost:hover {
    color: var(--text);
  }
  .art {
    justify-self: center;
  }
  @media (max-width: 1050px) {
    .hero {
      grid-template-columns: 1fr;
    }
    .art {
      display: none;
    }
  }
</style>
