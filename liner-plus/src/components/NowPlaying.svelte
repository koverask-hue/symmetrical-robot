<script lang="ts">
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import Slider from './Slider.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { router } from '../lib/router.svelte';
  import { ui } from '../lib/ui.svelte';
  import { time } from '../lib/util/format';

  const t = $derived(player.current);
</script>

<footer class="bar">
  <div class="left">
    {#if t}
      <button class="art-btn" onclick={() => (ui.lyricsOpen = true)} aria-label="Open lyrics">
        <Art src={t.art} size={56} />
      </button>
      <div class="meta">
        <div class="title ellipsis">{t.title}</div>
        <div class="sub ellipsis muted">
          {#each t.artists as a, j}
            {#if j > 0}, {/if}
            {#if a.id}<span class="link" role="link" tabindex="-1" onclick={() => router.go({ name: 'artist', id: a.id! })} onkeydown={() => {}}>{a.name}</span>{:else}{a.name}{/if}
          {/each}
        </div>
      </div>
      <button class="icon-btn" class:on={library.isLiked(t.id)} onclick={() => library.toggleLike(t)} aria-label="Like">
        <Icon name={library.isLiked(t.id) ? 'heart-filled' : 'heart'} size={18} />
      </button>
    {/if}
  </div>

  <div class="center">
    <div class="transport">
      <button class="icon-btn" class:on={player.shuffled} onclick={() => player.toggleShuffle()} aria-label="Shuffle" title="Shuffle (S)">
        <Icon name="shuffle" size={18} />
      </button>
      <button class="icon-btn" onclick={() => player.prev()} disabled={!t} aria-label="Previous"><Icon name="prev" /></button>
      <button class="play" class:loading={player.buffering && player.playing} onclick={() => player.toggle()} disabled={!t} aria-label={player.playing ? 'Pause' : 'Play'}>
        <Icon name={player.playing ? 'pause' : 'play'} size={22} />
      </button>
      <button class="icon-btn" onclick={() => player.next()} disabled={!t} aria-label="Next"><Icon name="next" /></button>
      <button class="icon-btn" class:on={player.repeat !== 'off'} onclick={() => player.cycleRepeat()} aria-label={`Repeat: ${player.repeat}`} title="Repeat (R)">
        <Icon name={player.repeat === 'one' ? 'repeat-one' : 'repeat'} size={18} />
      </button>
    </div>
    <div class="progress">
      <span class="time">{time(player.position)}</span>
      <Slider value={player.position} max={player.duration || 1} onchange={(v) => player.seek(v)} label="Seek" format={time} />
      <span class="time">{time(player.duration)}</span>
    </div>
  </div>

  <div class="right">
    <button class="icon-btn" class:on={ui.lyricsOpen} onclick={() => (ui.lyricsOpen = !ui.lyricsOpen)} aria-label="Lyrics" title="Lyrics (L)">
      <Icon name="lyrics" size={19} />
    </button>
    <button class="icon-btn" class:on={ui.queueOpen} onclick={() => (ui.queueOpen = !ui.queueOpen)} aria-label="Queue" title="Queue (Q)">
      <Icon name="queue" size={19} />
    </button>
    <button class="icon-btn" onclick={() => player.toggleMute()} aria-label="Mute" title="Mute (M)">
      <Icon name={player.muted || player.volume === 0 ? 'mute' : 'volume'} size={19} />
    </button>
    <div class="vol">
      <Slider value={player.muted ? 0 : player.volume} max={1} onchange={(v) => player.setVolume(v)} oninput={(v) => player.setVolume(v)} label="Volume" />
    </div>
  </div>
</footer>

<style>
  .bar {
    height: var(--bar-h);
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(320px, 2fr) minmax(180px, 1fr);
    align-items: center;
    gap: 16px;
    padding: 0 16px;
    background: var(--glass-strong);
    backdrop-filter: blur(30px) saturate(1.4);
    border-top: 1px solid var(--line);
  }
  .left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .art-btn {
    border-radius: 6px;
    transition: transform 0.15s;
  }
  .art-btn:hover {
    transform: scale(1.04);
  }
  .meta {
    min-width: 0;
  }
  .title {
    font-weight: 600;
  }
  .sub {
    font-size: 13px;
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .transport {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .play {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--text);
    color: #111;
    transition: transform 0.1s;
  }
  .play:hover {
    transform: scale(1.06);
  }
  .play:disabled {
    opacity: 0.4;
  }
  .play.loading {
    box-shadow: 0 0 0 3px rgb(255 255 255 / 0.15);
    animation: pulse 1s infinite alternate;
  }
  @keyframes pulse {
    to {
      box-shadow: 0 0 0 6px rgb(255 255 255 / 0.05);
    }
  }
  .progress {
    width: 100%;
    max-width: 640px;
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    align-items: center;
    gap: 8px;
  }
  .time {
    font-size: 12px;
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
  .vol {
    width: 110px;
    margin-left: 4px;
  }
</style>
