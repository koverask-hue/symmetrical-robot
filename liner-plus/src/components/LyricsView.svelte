<script lang="ts">
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import Lyrics from './Lyrics.svelte';
  import Slider from './Slider.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { artistLine } from '../lib/sources/types';
  import { time } from '../lib/util/format';

  const t = $derived(player.current);
  const offset = $derived(t ? library.offset(t.id) : 0);
</script>

<div class="view">
  <button class="icon-btn close" onclick={() => (ui.lyricsOpen = false)} aria-label="Close lyrics (Esc)"><Icon name="collapse" /></button>
  <div class="side">
    {#if t}
      <div class="cover"><Art src={t.art} size="100%" alt={t.title} /></div>
      <div class="title">{t.title}</div>
      <div class="artist muted">{artistLine(t)}</div>
      <div class="progress">
        <Slider value={player.position} max={player.duration || 1} onchange={(v) => player.seek(v)} label="Seek" format={time} />
        <div class="times"><span>{time(player.position)}</span><span>-{time(player.duration - player.position)}</span></div>
      </div>
      <div class="transport">
        <button class="icon-btn" class:on={player.shuffled} onclick={() => player.toggleShuffle()} aria-label="Shuffle"><Icon name="shuffle" size={18} /></button>
        <button class="icon-btn big" onclick={() => player.prev()} aria-label="Previous"><Icon name="prev" size={24} /></button>
        <button class="play" onclick={() => player.toggle()} aria-label={player.playing ? 'Pause' : 'Play'}>
          <Icon name={player.playing ? 'pause' : 'play'} size={28} />
        </button>
        <button class="icon-btn big" onclick={() => player.next()} aria-label="Next"><Icon name="next" size={24} /></button>
        <button class="icon-btn" class:on={library.isLiked(t.id)} onclick={() => library.toggleLike(t)} aria-label="Like">
          <Icon name={library.isLiked(t.id) ? 'heart-filled' : 'heart'} size={18} />
        </button>
      </div>
      <div class="tools">
        <button class="chip" class:on={library.settings.romanize} onclick={() => library.updateSettings({ romanize: !library.settings.romanize })} title="Romanize (Cyrillic, Greek, Korean, kana)">
          <Icon name="translate" size={15} /> Romanize
        </button>
        <div class="sync" title="Shift lyric timing if they run early or late ([ and ])">
          <button class="chip" onclick={() => library.nudgeOffset(t.id, -0.1)} aria-label="Lyrics later">−</button>
          <span class="muted">{offset > 0 ? '+' : ''}{offset.toFixed(1)}s</span>
          <button class="chip" onclick={() => library.nudgeOffset(t.id, 0.1)} aria-label="Lyrics earlier">+</button>
        </div>
        <button class="chip" onclick={() => library.updateSettings({ lyricsSize: library.settings.lyricsSize >= 1.3 ? 0.8 : +(library.settings.lyricsSize + 0.1).toFixed(1) })} title="Text size">Aa</button>
      </div>
    {/if}
  </div>
  <div class="main"><Lyrics /></div>
</div>

<style>
  .view {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: minmax(280px, 0.8fr) 1.4fr;
    gap: 6vw;
    padding: 6vh 6vw 4vh;
    background: rgb(8 6 14 / 0.28);
    backdrop-filter: blur(4px);
    animation: rise 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(24px);
    }
  }
  .close {
    position: absolute;
    top: 16px;
    right: 16px;
  }
  .side {
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 420px;
    width: 100%;
    justify-self: end;
  }
  .cover {
    width: 100%;
    aspect-ratio: 1;
    margin-bottom: 18px;
    border-radius: 10px;
    box-shadow: 0 30px 80px rgb(0 0 0 / 0.5);
    transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .cover :global(.art) {
    border-radius: 10px;
  }
  .title {
    font: 800 24px/1.2 var(--display);
  }
  .artist {
    font-size: 16px;
  }
  .progress {
    margin-top: 14px;
  }
  .times {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .transport {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
  }
  .big {
    width: 48px;
    height: 48px;
    color: var(--text);
  }
  .play {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--text);
    color: #111;
    transition: transform 0.12s;
  }
  .play:hover {
    transform: scale(1.06);
  }
  .tools {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 16px;
    flex-wrap: wrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.08);
    color: var(--text-2);
    font-size: 13px;
    font-weight: 600;
  }
  .chip:hover {
    background: rgb(255 255 255 / 0.14);
    color: var(--text);
  }
  .chip.on {
    background: rgb(255 255 255 / 0.9);
    color: #111;
  }
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .sync .chip {
    width: 30px;
    padding: 0;
    justify-content: center;
  }
  .main {
    min-height: 0;
  }
  @media (max-width: 860px) {
    .view {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
      gap: 12px;
    }
    .side {
      justify-self: center;
      max-width: 360px;
    }
    .cover {
      display: none;
    }
  }
</style>
