<script lang="ts">
  import Icon from './Icon.svelte';
  import Lyrics from './Lyrics.svelte';
  import Slider from './Slider.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { ui } from '../lib/ui.svelte';
  import { artistLine } from '../lib/sources/types';
  import { time } from '../lib/util/format';

  const t = $derived(player.current);
  const offset = $derived(t ? library.offset(t.id) : 0);

  function less() {
    if (!t) return;
    taste.feedback(t, 'less');
    toasts.show(`Noted. Less like “${t.title}”.`);
    player.next();
  }
  function more() {
    if (!t) return;
    taste.feedback(t, 'more');
    toasts.show(`More like “${t.title}”, coming up.`);
  }
</script>

<div class="stage">
  <button class="icon-btn close" onclick={() => (ui.lyricsOpen = false)} aria-label="Close (Esc)"><Icon name="collapse" /></button>
  <div class="side">
    {#if t}
      <div class="cover">
        {#if t.art}
          <img class="glow" src={t.art} alt="" aria-hidden="true" />
          <img class="img" class:paused={!player.playing} src={t.art} alt={t.title} />
        {/if}
      </div>
      <div class="title serif">{t.title}</div>
      <div class="artist">{artistLine(t)}</div>
      {#if player.reason}<div class="reason why">{player.reason}</div>{/if}
      <div class="progress">
        <Slider value={player.position} max={player.duration || 1} onchange={(v) => player.seek(v)} label="Seek" format={time} />
        <div class="times"><span>{time(player.position)}</span><span>-{time(player.duration - player.position)}</span></div>
      </div>
      <div class="transport">
        <button class="icon-btn" onclick={less} aria-label="Less like this" title="Less like this"><Icon name="thumb-down" size={17} /></button>
        <button class="icon-btn big" onclick={() => player.prev()} aria-label="Previous"><Icon name="prev" size={24} /></button>
        <button class="play" onclick={() => player.toggle()} aria-label={player.playing ? 'Pause' : 'Play'}>
          <Icon name={player.playing ? 'pause' : 'play'} size={28} />
        </button>
        <button class="icon-btn big" onclick={() => player.next()} aria-label="Next"><Icon name="next" size={24} /></button>
        <button class="icon-btn" onclick={more} aria-label="More like this" title="More like this"><Icon name="thumb-up" size={17} /></button>
      </div>
      <div class="tools">
        <button class="chip" class:on={library.isLiked(t.id)} onclick={() => library.toggleLike(t)}>
          <Icon name={library.isLiked(t.id) ? 'heart-filled' : 'heart'} size={14} /> Love
        </button>
        <button class="chip" class:on={library.settings.romanize} onclick={() => library.updateSettings({ romanize: !library.settings.romanize })} title="Romanize (Cyrillic, Greek, Korean, kana)">
          <Icon name="translate" size={14} /> Romanize
        </button>
        <span class="sync" title="Shift lyric timing if they run early or late ([ and ])">
          <button class="chip sq" onclick={() => library.nudgeOffset(t.id, -0.1)} aria-label="Lyrics later">−</button>
          <span>{offset > 0 ? '+' : ''}{offset.toFixed(1)}s</span>
          <button class="chip sq" onclick={() => library.nudgeOffset(t.id, 0.1)} aria-label="Lyrics earlier">+</button>
        </span>
        <button class="chip sq" onclick={() => library.updateSettings({ lyricsSize: library.settings.lyricsSize >= 1.3 ? 0.8 : +(library.settings.lyricsSize + 0.1).toFixed(1) })} title="Text size">Aa</button>
      </div>
    {/if}
  </div>
  <div class="main"><Lyrics /></div>
</div>

<style>
  .stage {
    position: fixed;
    inset: 0 0 calc(var(--capsule) + 14px) var(--rail);
    z-index: 25;
    display: grid;
    grid-template-columns: minmax(300px, 0.8fr) 1.4fr;
    gap: 6vw;
    padding: 5vh 5vw 3vh;
    animation: rise 0.7s var(--ease);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(30px);
      filter: blur(10px);
    }
  }
  .close {
    position: absolute;
    top: 18px;
    right: 24px;
  }
  .side {
    align-self: center;
    justify-self: end;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    max-width: 400px;
  }
  .cover {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    margin-bottom: 26px;
  }
  .cover img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 26px;
  }
  .img {
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1), 0 50px 100px -30px rgb(0 0 0 / 0.9);
    transition: transform 0.9s var(--ease);
  }
  .img.paused {
    transform: scale(0.9);
  }
  .glow {
    pointer-events: none;
    filter: blur(60px) saturate(2);
    opacity: 0.75;
    transform: scale(1.05) translateY(30px);
  }
  .title {
    font-size: 34px;
    line-height: 1.05;
  }
  .artist {
    font-size: 15px;
    color: var(--text-2);
  }
  .why {
    margin-top: 6px;
    font-size: 16px;
  }
  .progress {
    margin-top: 16px;
  }
  .times {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .transport {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }
  .big {
    width: 52px;
    height: 52px;
    color: var(--text);
  }
  .play {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--text);
    color: #0b0814;
    box-shadow: 0 14px 50px -8px rgb(var(--tint) / 0.9);
    transition: transform 0.3s var(--ease);
  }
  .play:hover {
    transform: scale(1.06);
  }
  .tools {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
  }
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .sq {
    width: 30px;
    padding: 0;
    justify-content: center;
  }
  .main {
    min-height: 0;
  }
  @media (max-width: 900px) {
    .stage {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
    .side {
      justify-self: center;
    }
    .cover {
      display: none;
    }
  }
</style>
