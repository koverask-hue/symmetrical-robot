<script lang="ts">
  import Icon from './Icon.svelte';
  import Slider from './Slider.svelte';
  import Spectrum from './Spectrum.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { router } from '../lib/router.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { ui } from '../lib/ui.svelte';
  import { time } from '../lib/util/format';

  const t = $derived(player.current);
  let volOpen = $state(false);

  function notForMe() {
    if (!t) return;
    taste.feedback(t, 'less');
    toasts.show(`Noted. Less like “${t.title}”.`);
    player.next();
  }
</script>

<footer class="capsule glass" class:idle={!t}>
  <div class="left">
    {#if t}
      <button class="cover" onclick={() => (ui.lyricsOpen = true)} aria-label="Open the stage">
        {#if t.art}
          <img class="glow" src={t.art} alt="" aria-hidden="true" />
          <img class="img" src={t.art} alt={t.title} />
        {/if}
      </button>
      <div class="meta">
        <div class="title ellipsis">{t.title}</div>
        {#if player.reason}
          <div class="reason ellipsis" title={player.reason}>{player.reason}</div>
        {:else}
          <div class="sub ellipsis">
            {#each t.artists as a, j}
              {#if j > 0}, {/if}
              {#if a.id}<span class="link" role="link" tabindex="-1" onclick={() => router.go({ name: 'artist', id: a.id! })} onkeydown={() => {}}>{a.name}</span>{:else}{a.name}{/if}
            {/each}
          </div>
        {/if}
      </div>
      <div class="react">
        <button class="icon-btn small" class:on={library.isLiked(t.id)} onclick={() => library.toggleLike(t)} aria-label="Love it" title="Love it (F)">
          <Icon name={library.isLiked(t.id) ? 'heart-filled' : 'heart'} size={17} />
        </button>
        <button class="icon-btn small" onclick={notForMe} aria-label="Not for me" title="Not for me: skip and learn">
          <Icon name="thumb-down" size={16} />
        </button>
      </div>
    {:else}
      <div class="hint serif">Nothing playing. <em>Pick something beautiful.</em></div>
    {/if}
  </div>

  <div class="center">
    <div class="transport">
      <button class="icon-btn" class:on={player.shuffled} onclick={() => player.toggleShuffle()} aria-label="Shuffle" title="Shuffle (S)"><Icon name="shuffle" size={17} /></button>
      <button class="icon-btn" onclick={() => player.prev()} disabled={!t} aria-label="Previous"><Icon name="prev" size={19} /></button>
      <button class="play" class:loading={player.buffering && player.playing} onclick={() => player.toggle()} disabled={!t} aria-label={player.playing ? 'Pause' : 'Play'}>
        <Icon name={player.playing ? 'pause' : 'play'} size={20} />
      </button>
      <button class="icon-btn" onclick={() => player.next()} disabled={!t} aria-label="Next"><Icon name="next" size={19} /></button>
      <button class="icon-btn" class:on={player.repeat !== 'off'} onclick={() => player.cycleRepeat()} aria-label={`Repeat: ${player.repeat}`} title="Repeat (R)">
        <Icon name={player.repeat === 'one' ? 'repeat-one' : 'repeat'} size={17} />
      </button>
    </div>
    <div class="progress">
      <span class="time">{time(player.position)}</span>
      <Slider value={player.position} max={player.duration || 1} onchange={(v) => player.seek(v)} label="Seek" format={time} />
      <span class="time">{time(player.duration)}</span>
    </div>
  </div>

  <div class="right">
    <div class="spec"><Spectrum /></div>
    <button class="icon-btn" class:on={ui.lyricsOpen} onclick={() => (ui.lyricsOpen = !ui.lyricsOpen)} aria-label="Lyrics" title="Lyrics (L)"><Icon name="lyrics" size={19} /></button>
    <button class="icon-btn" class:on={ui.queueOpen} onclick={() => (ui.queueOpen = !ui.queueOpen)} aria-label="Queue" title="Queue (Q)"><Icon name="queue" size={19} /></button>
    <div class="vol" role="group" onpointerenter={() => (volOpen = true)} onpointerleave={() => (volOpen = false)}>
      <button class="icon-btn" onclick={() => player.toggleMute()} aria-label="Mute" title="Mute (M)">
        <Icon name={player.muted || player.volume === 0 ? 'mute' : 'volume'} size={19} />
      </button>
      <div class="vol-slider" class:open={volOpen}>
        <Slider value={player.muted ? 0 : player.volume} max={1} onchange={(v) => player.setVolume(v)} oninput={(v) => player.setVolume(v)} label="Volume" />
      </div>
    </div>
  </div>
</footer>

<style>
  .capsule {
    position: fixed;
    z-index: 40;
    left: calc(var(--rail) + 14px);
    right: 14px;
    bottom: 14px;
    height: var(--capsule);
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(300px, 1.5fr) minmax(220px, 1fr);
    align-items: center;
    gap: 18px;
    padding: 0 14px 0 12px;
    border-radius: 30px;
    background: rgb(14 10 26 / 0.58);
  }
  .left {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }
  .cover {
    position: relative;
    flex: none;
    width: 60px;
    height: 60px;
    border-radius: 16px;
    transition: transform 0.5s var(--ease);
  }
  .cover:hover {
    transform: scale(1.06) rotate(-2deg);
  }
  .cover img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 16px;
  }
  .cover .glow {
    pointer-events: none;
    filter: blur(18px) saturate(1.6);
    opacity: 0.85;
    transform: scale(1.05) translateY(6px);
  }
  .meta {
    min-width: 0;
  }
  .title {
    font-weight: 560;
    font-size: 14.5px;
  }
  .sub {
    font-size: 13px;
    color: var(--text-2);
  }
  .react {
    display: flex;
    flex: none;
    margin-left: auto;
  }
  .small {
    width: 32px;
    height: 32px;
  }
  .hint {
    font-size: 19px;
    color: var(--text-2);
    padding-left: 10px;
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .transport {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .play {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--text);
    color: #0b0814;
    box-shadow: 0 0 0 0 rgb(var(--tint) / 0.5), 0 8px 30px -6px rgb(var(--tint) / 0.8);
    transition: transform 0.25s var(--ease), box-shadow 0.4s var(--ease);
  }
  .play:hover {
    transform: scale(1.07);
    box-shadow: 0 0 0 6px rgb(var(--tint) / 0.12), 0 10px 40px -4px rgb(var(--tint) / 0.9);
  }
  .play:disabled {
    opacity: 0.35;
  }
  .play.loading {
    animation: breathe 1.2s infinite alternate var(--ease);
  }
  @keyframes breathe {
    to {
      box-shadow: 0 0 0 9px rgb(var(--tint) / 0.08), 0 8px 30px -6px rgb(var(--tint) / 0.8);
    }
  }
  .progress {
    width: 100%;
    max-width: 560px;
    display: grid;
    grid-template-columns: 40px 1fr 40px;
    align-items: center;
    gap: 8px;
  }
  .time {
    font-size: 11px;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
  }
  .spec {
    margin-right: 10px;
    opacity: 0.9;
  }
  .vol {
    display: flex;
    align-items: center;
  }
  .vol-slider {
    width: 0;
    overflow: hidden;
    transition: width 0.4s var(--ease), margin 0.4s var(--ease);
  }
  .vol-slider.open {
    width: 96px;
    margin: 0 8px 0 2px;
  }
  @media (max-width: 1100px) {
    .spec {
      display: none;
    }
  }
</style>
