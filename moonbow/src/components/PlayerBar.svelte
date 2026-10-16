<script lang="ts">
  // The one now-playing control in the app: a calm, full-width bar at the bottom.
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import Slider from './Slider.svelte';
  import Spectrum from './Spectrum.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { router } from '../lib/router.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { STEERS } from '../lib/taste/recommend';
  import { toasts } from '../lib/toasts.svelte';
  import { ui } from '../lib/ui.svelte';
  import { invoke, isTauri } from '../lib/platform';
  import { time } from '../lib/util/format';
  import { artistLine } from '../lib/sources/types';

  interface StreamInfo {
    codec: string;
    kbps: number;
    khz: number;
  }

  const t = $derived(player.current);
  const next = $derived(player.upNext[0]);
  const liked = $derived(t ? library.isLiked(t.id) : false);
  const steer = $derived(STEERS.find((s) => s.id === player.steer) ?? STEERS[0]);

  let pop = $state<'steer' | 'sleep' | null>(null);
  let steerWrap = $state<HTMLElement>();
  let sleepWrap = $state<HTMLElement>();

  // ---- stream format badge ----
  let info = $state<StreamInfo | null>(null);
  $effect(() => {
    const id = t?.id;
    info = null;
    if (!isTauri || !id) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const ask = () => invoke<StreamInfo | null>('stream_info', { id }).catch(() => null);
    void ask().then((r) => {
      if (!alive) return;
      if (r) info = r;
      else retry = setTimeout(() => void ask().then((r2) => alive && r2 && (info = r2)), 4000);
    });
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  });
  const badge = $derived(info && info.codec ? `${info.codec.toUpperCase()}${info.kbps ? ` · ${info.kbps}` : ''}` : '');
  const badgeTitle = $derived(info ? `${info.codec}${info.kbps ? `, ${info.kbps} kbps` : ''}${info.khz ? `, ${info.khz} kHz` : ''}` : '');

  // ---- sleep timer ----
  let now = $state(Date.now());
  $effect(() => {
    if (typeof player.sleepAt !== 'number') return;
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 10_000);
    return () => clearInterval(id);
  });
  const sleepLeft = $derived(
    player.sleepAt === 'end' ? 'end' : typeof player.sleepAt === 'number' ? `${Math.max(1, Math.ceil((player.sleepAt - now) / 60_000))}m` : '',
  );
  const SLEEP: { label: string; v: number | 'end' | null }[] = [
    { label: '15 minutes', v: 15 },
    { label: '30 minutes', v: 30 },
    { label: '45 minutes', v: 45 },
    { label: '60 minutes', v: 60 },
    { label: 'End of song', v: 'end' },
    { label: 'Off', v: null },
  ];

  // ---- popovers: close on outside press and Escape ----
  $effect(() => {
    if (!pop) return;
    const wrap = pop === 'steer' ? steerWrap : sleepWrap;
    const down = (e: PointerEvent) => {
      if (wrap && !wrap.contains(e.target as Node)) pop = null;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        pop = null;
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  });

  function notForMe() {
    if (!t) return;
    taste.feedback(t, 'less');
    toasts.show(`Noted. Less like “${t.title}”.`);
    player.next();
  }
</script>

<footer class="bar capsule" class:idle={!t}>
  <div class="left">
    {#if t}
      <button class="cover" class:on={ui.lyricsOpen} onclick={() => (ui.lyricsOpen = !ui.lyricsOpen)} aria-label={ui.lyricsOpen ? 'Close the stage' : 'Open the stage'} title="Stage (L)">
        <Art src={t.art} size={56} radius={6} alt={t.title} />
      </button>
      <div class="meta">
        <div class="title ellipsis" title={t.title}>{t.title}</div>
        <div class="sub ellipsis">
          {#each t.artists as a, j}
            {#if j > 0}<span class="sep">, </span>{/if}
            {#if a.id}<span class="link" role="link" tabindex="-1" onclick={() => router.go({ name: 'artist', id: a.id! })} onkeydown={() => {}}>{a.name}</span>{:else}{a.name}{/if}
          {/each}
        </div>
        {#if player.reason}
          <div class="reason ellipsis" title={player.reason}>{player.reason}</div>
        {/if}
      </div>
      <div class="react">
        <button class="icon-btn sm" class:on={liked} onclick={() => library.toggleLike(t)} aria-label={liked ? 'Remove from Liked' : 'Love it'} title="Love it (F)">
          <Icon name={liked ? 'heart-filled' : 'heart'} size={16} />
        </button>
        <button class="icon-btn sm" onclick={notForMe} aria-label="Not for me" title="Not for me: skip and learn">
          <Icon name="thumb-down" size={15} />
        </button>
      </div>
    {:else}
      <div class="cover ghost"><Art size={56} radius={6} /></div>
      <div class="meta">
        <div class="title faint">Nothing playing</div>
        <div class="hint mono"><kbd>⌘K</kbd> to search</div>
      </div>
    {/if}
  </div>

  <div class="center">
    <div class="transport">
      <button class="icon-btn sm" class:on={player.shuffled} onclick={() => player.toggleShuffle()} disabled={!t} aria-label="Shuffle" aria-pressed={player.shuffled} title="Shuffle (S)">
        <Icon name="shuffle" size={16} />
      </button>
      <button class="icon-btn" onclick={() => player.prev()} disabled={!t} aria-label="Previous" title="Previous"><Icon name="prev" size={18} /></button>
      <button class="play" class:loading={player.buffering && player.playing} onclick={() => player.toggle()} disabled={!t} aria-label={player.playing ? 'Pause' : 'Play'} title="Play / pause (Space)">
        <Icon name={player.playing ? 'pause' : 'play'} size={18} />
      </button>
      <button class="icon-btn" onclick={() => player.next()} disabled={!t} aria-label="Next" title="Next"><Icon name="next" size={18} /></button>
      <button class="icon-btn sm" class:on={player.repeat !== 'off'} onclick={() => player.cycleRepeat()} disabled={!t} aria-label={`Repeat: ${player.repeat}`} title="Repeat (R)">
        <Icon name={player.repeat === 'one' ? 'repeat-one' : 'repeat'} size={16} />
      </button>
    </div>
    <div class="progress" class:off={!t}>
      <span class="time num">{time(player.position)}</span>
      <Slider value={player.position} max={player.duration || 1} onchange={(v) => player.seek(v)} label="Seek" format={time} />
      <span class="time num">{time(player.duration)}</span>
    </div>
    {#if next}
      <button class="upnext mono ellipsis" onclick={() => player.next()} onpointerenter={() => player.warm(next)} title="Skip to next">
        <span class="k">NEXT</span> · {next.title} — {artistLine(next)}
      </button>
    {/if}
  </div>

  <div class="right">
    {#if t}
      <div class="spec"><Spectrum bars={10} width={40} height={16} /></div>
    {/if}
    {#if badge}
      <span class="badge mono" title={badgeTitle}>{badge}</span>
    {/if}

    <div class="pop-wrap" bind:this={steerWrap}>
      <button class="steer mono" class:open={pop === 'steer'} onclick={() => (pop = pop === 'steer' ? null : 'steer')} aria-haspopup="menu" aria-expanded={pop === 'steer'} title="Steer autoplay: how the next songs are picked">
        <Icon name="steer" size={14} />
        <span>{steer.label}</span>
      </button>
      {#if pop === 'steer'}
        <div class="pop steer-pop" role="menu">
          <div class="label head">Autoplay steer</div>
          {#each STEERS as s (s.id)}
            <button class="item" role="menuitemradio" aria-checked={player.steer === s.id} onclick={() => { player.setSteer(s.id); pop = null; }}>
              <span class="txt">
                <span class="nm" class:active={player.steer === s.id}>{s.label}</span>
                <span class="hint2">{s.hint}</span>
              </span>
              {#if player.steer === s.id}<span class="chk"><Icon name="check" size={14} /></span>{/if}
            </button>
          {/each}
          <div class="div"></div>
          <button class="item" role="menuitem" disabled={!t} onclick={() => { player.moreLikeThis(); pop = null; }}>
            <span class="ic"><Icon name="wand" size={15} /></span>
            <span class="txt"><span class="nm">More like this</span><span class="hint2">Rebuild up next around this song</span></span>
            <kbd>⇧M</kbd>
          </button>
        </div>
      {/if}
    </div>

    <button class="icon-btn sm" onclick={() => player.moreLikeThis()} disabled={!t} aria-label="More like this" title="More like this (Shift+M)">
      <Icon name="wand" size={16} />
    </button>
    <button class="icon-btn sm" class:on={ui.lyricsOpen} onclick={() => (ui.lyricsOpen = !ui.lyricsOpen)} aria-label="Lyrics" aria-pressed={ui.lyricsOpen} title="Lyrics (L)">
      <Icon name="lyrics" size={17} />
    </button>
    <button class="icon-btn sm" class:on={ui.queueOpen} onclick={() => (ui.queueOpen = !ui.queueOpen)} aria-label="Queue" aria-pressed={ui.queueOpen} title="Queue (Q)">
      <Icon name="queue" size={17} />
    </button>

    <div class="pop-wrap" bind:this={sleepWrap}>
      <button class="icon-btn sm sleep" class:on={!!player.sleepAt} onclick={() => (pop = pop === 'sleep' ? null : 'sleep')} aria-label="Sleep timer" aria-haspopup="menu" aria-expanded={pop === 'sleep'} title="Sleep timer">
        <Icon name="moon" size={16} />
        {#if sleepLeft}<span class="left-min num">{sleepLeft}</span>{/if}
      </button>
      {#if pop === 'sleep'}
        <div class="pop sleep-pop" role="menu">
          <div class="label head">
            Sleep timer
            {#if sleepLeft}<span class="accent">· {sleepLeft === 'end' ? 'end of song' : `${sleepLeft} left`}</span>{/if}
          </div>
          {#each SLEEP as o (o.label)}
            {@const active = o.v === null ? !player.sleepAt : o.v === 'end' ? player.sleepAt === 'end' : false}
            <button class="item" role="menuitem" onclick={() => { player.setSleep(o.v); pop = null; }}>
              <span class="txt"><span class="nm" class:active>{o.label}</span></span>
              {#if active}<span class="chk"><Icon name="check" size={14} /></span>{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="vol">
      <button class="icon-btn sm" onclick={() => player.toggleMute()} aria-label={player.muted ? 'Unmute' : 'Mute'} title="Mute (M)">
        <Icon name={player.muted || player.volume === 0 ? 'mute' : 'volume'} size={17} />
      </button>
      <div class="vol-slider">
        <Slider value={player.muted ? 0 : player.volume} max={1} onchange={(v) => player.setVolume(v)} oninput={(v) => player.setVolume(v)} label="Volume" format={(v) => `${Math.round(v * 100)}`} />
      </div>
    </div>
  </div>
</footer>

<style>
  .bar {
    position: fixed;
    z-index: 40;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--bar);
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(320px, 600px) minmax(260px, 1fr);
    align-items: center;
    gap: 20px;
    padding: 0 16px 0 16px;
    background: var(--bg-1);
    box-shadow: inset 0 1px 0 var(--hair);
  }

  /* ---- left ---- */
  .left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .cover {
    position: relative;
    flex: none;
    border-radius: 6px;
    transition: transform 0.2s var(--ease);
  }
  .cover:hover {
    transform: scale(1.03);
  }
  .cover::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1.5px var(--accent);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .cover.on::after {
    opacity: 1;
  }
  .cover.ghost {
    opacity: 0.5;
  }
  .cover.ghost:hover {
    transform: none;
  }
  .meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .title {
    font: 560 14px/1.3 var(--sans);
    letter-spacing: -0.012em;
  }
  .sub {
    font-size: 12.5px;
    line-height: 1.35;
    color: var(--text-2);
  }
  .reason {
    margin-top: 2px;
    font-size: 10.5px;
  }
  .hint {
    font-size: 11px;
    color: var(--text-4);
    margin-top: 2px;
  }
  .hint kbd {
    font-size: 10px;
    padding: 2px 4px;
    margin-right: 2px;
  }
  .react {
    display: flex;
    flex: none;
    gap: 0;
    margin-left: 4px;
  }
  .sm {
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }

  /* ---- center ---- */
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    width: 100%;
    max-width: 600px;
    justify-self: center;
  }
  .transport {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 40px;
  }
  .play {
    width: 40px;
    height: 40px;
    margin: 0 6px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--text);
    color: var(--bg);
    transition: transform 0.15s var(--ease), opacity 0.15s;
  }
  .play:hover {
    transform: scale(1.06);
  }
  .play:active {
    transform: scale(0.95);
  }
  .play:disabled {
    opacity: 0.25;
    pointer-events: none;
  }
  .play.loading {
    animation: breathe 0.9s infinite alternate var(--ease);
  }
  @keyframes breathe {
    to {
      opacity: 0.6;
    }
  }
  .progress {
    width: 100%;
    display: grid;
    grid-template-columns: 40px 1fr 40px;
    align-items: center;
    gap: 10px;
    margin-top: 2px;
  }
  .progress.off {
    opacity: 0.35;
    pointer-events: none;
  }
  .time {
    font-size: 11px;
    color: var(--text-3);
    text-align: center;
  }
  .time:first-child {
    text-align: right;
  }
  .time:last-child {
    text-align: left;
  }
  .upnext {
    max-width: 100%;
    margin-top: 1px;
    font-size: 10.5px;
    line-height: 1.3;
    color: var(--text-4);
    transition: color 0.15s;
  }
  .upnext .k {
    letter-spacing: 0.08em;
  }
  .upnext:hover {
    color: var(--text-2);
  }

  /* ---- right ---- */
  .right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    min-width: 0;
  }
  .spec {
    margin-right: 8px;
    opacity: 0.85;
  }
  .badge {
    flex: none;
    margin-right: 8px;
    height: 20px;
    padding: 0 7px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    font-size: 10px;
    letter-spacing: 0.04em;
    color: var(--text-3);
    box-shadow: inset 0 0 0 1px var(--hair-2);
    white-space: nowrap;
  }
  .steer {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    margin-right: 4px;
    border-radius: 999px;
    font-size: 11px;
    color: var(--text-2);
    box-shadow: inset 0 0 0 1px var(--hair);
    white-space: nowrap;
    transition: color 0.15s, background 0.15s;
  }
  .steer:hover,
  .steer.open {
    color: var(--text);
    background: var(--bg-3);
  }
  .steer :global(svg) {
    color: var(--accent);
  }
  .sleep {
    position: relative;
    width: auto;
    min-width: 32px;
    padding: 0 6px;
    gap: 4px;
    display: inline-flex;
  }
  .left-min {
    font-size: 10.5px;
  }
  .vol {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 2px;
  }
  .vol-slider {
    width: 96px;
    display: flex;
  }

  /* ---- popovers ---- */
  .pop-wrap {
    position: relative;
  }
  .pop {
    position: absolute;
    right: 0;
    bottom: calc(100% + 8px);
    z-index: 50;
    padding: 6px;
    border-radius: 12px;
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair-2), 0 16px 40px -12px rgb(0 0 0 / 0.7);
    animation: pop 0.16s var(--ease) both;
    transform-origin: bottom right;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.98);
    }
  }
  .steer-pop {
    width: 280px;
  }
  .sleep-pop {
    width: 200px;
  }
  .head {
    padding: 6px 10px 6px;
  }
  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 8px;
    text-align: left;
    transition: background 0.12s;
  }
  .item:hover {
    background: var(--bg-3);
  }
  .item:disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  .txt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .nm {
    font-size: 13px;
    font-weight: 520;
    color: var(--text);
  }
  .nm.active {
    color: var(--accent);
  }
  .hint2 {
    font-size: 11.5px;
    color: var(--text-3);
    line-height: 1.35;
  }
  .chk {
    color: var(--accent);
    display: grid;
  }
  .ic {
    color: var(--text-2);
    display: grid;
  }
  .div {
    height: 1px;
    margin: 5px 4px;
    background: var(--hair);
  }

  @media (max-width: 1200px) {
    .spec {
      display: none;
    }
  }
  @media (max-width: 1080px) {
    .badge,
    .steer span {
      display: none;
    }
    .vol-slider {
      width: 72px;
    }
    .bar {
      grid-template-columns: minmax(220px, 1fr) minmax(280px, 1.4fr) auto;
      gap: 14px;
    }
  }
</style>
