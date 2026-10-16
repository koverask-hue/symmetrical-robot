<script lang="ts">
  import Icon from './Icon.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { router } from '../lib/router.svelte';
  import { ui } from '../lib/ui.svelte';
  import type { Track } from '../lib/sources/types';
  import { time } from '../lib/util/format';

  let {
    tracks,
    showArt = true,
    showAlbum = true,
    numbered = false,
    playlistId,
    reasons,
  }: {
    tracks: Track[];
    showArt?: boolean;
    showAlbum?: boolean;
    numbered?: boolean;
    playlistId?: string;
    /** Why each track is here; shown instead of the album column. */
    reasons?: Record<string, string>;
  } = $props();

  const play = (i: number) => player.playTracks(tracks, i, { reasons });
  const wide = $derived(showAlbum || !!reasons);
  const showIdx = $derived(numbered || !showArt);
  const leadW = $derived((showIdx ? 24 : 0) + (showArt ? 40 : 0) + (showIdx && showArt ? 12 : 0));
  const hasReasons = $derived(!!reasons && tracks.some((t) => reasons![t.id]));

  // Prefetch the stream of the row you're hovering, once you've settled on it.
  let warmTimer: ReturnType<typeof setTimeout> | undefined;
  function warmSoon(t: Track) {
    clearTimeout(warmTimer);
    warmTimer = setTimeout(() => player.warm(t), 200);
  }
  const cancelWarm = () => clearTimeout(warmTimer);
</script>

<div class="list" role="list">
  {#if tracks.length > 3}
    <div class="thead" class:narrow={!wide} aria-hidden="true">
      <span class="label lead-h" style:width="{leadW}px">{numbered ? '#' : ''}</span>
      <span class="label">Title</span>
      {#if wide}<span class="label third-h">{hasReasons ? 'Why' : 'Album'}</span>{/if}
      <span></span>
      <span class="label dur-h"><Icon name="clock" size={13} /></span>
      <span></span>
    </div>
  {/if}
  {#each tracks as t, i (t.id + ':' + i)}
    {@const current = player.current?.id === t.id}
    {@const liked = library.isLiked(t.id)}
    <div
      class="row"
      class:current
      class:narrow={!wide}
      role="listitem"
      ondblclick={() => play(i)}
      oncontextmenu={(e) => ui.openMenu(e, t, playlistId)}
      onpointerenter={() => warmSoon(t)}
      onpointerleave={cancelWarm}
    >
      <button class="lead" onclick={() => play(i)} aria-label={`Play ${t.title}`}>
        {#if showIdx}
          <span class="idx">
            {#if current && player.playing}
              <span class="eq"><i></i><i></i><i></i></span>
            {:else}
              <span class="n num">{numbered ? i + 1 : ''}</span>
              <span class="g"><Icon name="play" size={13} /></span>
            {/if}
          </span>
        {/if}
        {#if showArt}
          <span class="art">
            {#if t.art}<img src={t.art} alt="" loading="lazy" decoding="async" draggable="false" />{/if}
            <span class="ov" class:show={current && player.playing && !numbered}>
              {#if current && player.playing && !numbered}
                <span class="eq"><i></i><i></i><i></i></span>
              {:else}
                <Icon name="play" size={14} />
              {/if}
            </span>
          </span>
        {/if}
      </button>
      <div class="main">
        <div class="title ellipsis">{t.title}</div>
        <div class="sub ellipsis">
          {#if t.video}<span class="tag">MV</span>{/if}
          {#each t.artists as a, j}
            {#if j > 0}, {/if}
            {#if a.id}
              <span class="link" role="link" tabindex="-1" onclick={() => router.go({ name: 'artist', id: a.id! })} onkeydown={() => {}}>{a.name}</span>
            {:else}{a.name}{/if}
          {/each}
        </div>
      </div>
      {#if wide}
        <div class="third ellipsis">
          {#if reasons?.[t.id]}
            <span class="reason">{reasons[t.id]}</span>
          {:else if t.album?.id}
            <span class="link" role="link" tabindex="-1" onclick={() => router.go({ name: 'album', id: t.album!.id! })} onkeydown={() => {}}>{t.album.name}</span>
          {:else}{t.album?.name ?? ''}{/if}
        </div>
      {/if}
      <button class="icon-btn like" class:on={liked} onclick={() => library.toggleLike(t)} aria-label={liked ? 'Remove from liked' : 'Love it'} aria-pressed={liked}>
        <Icon name={liked ? 'heart-filled' : 'heart'} size={15} />
      </button>
      <div class="dur num">{t.duration ? time(t.duration) : ''}</div>
      <button class="icon-btn more" onclick={(e) => ui.openMenu(e, t, playlistId)} aria-label="More">
        <Icon name="more" size={17} />
      </button>
    </div>
  {/each}
</div>

<style>
  .list {
    container-type: inline-size;
  }
  .row,
  .thead {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 0.85fr) 32px 52px 32px;
    align-items: center;
    gap: 14px;
    padding: 0 10px;
  }
  .row.narrow,
  .thead.narrow {
    grid-template-columns: auto minmax(0, 1fr) 32px 52px 32px;
  }
  .thead {
    height: 34px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--hair);
    border-radius: 0;
  }
  .thead .label {
    color: var(--text-4);
  }
  .lead-h {
    padding-left: 14px;
  }
  .dur-h {
    display: flex;
    justify-content: flex-end;
  }
  .row {
    height: 56px;
    border-radius: 8px;
    transition: background 0.12s;
  }
  .row:hover {
    background: var(--bg-2);
  }
  .row.current {
    background: rgb(var(--accent-rgb) / 0.05);
  }
  .row.current .title {
    color: var(--accent);
  }
  .lead {
    display: flex;
    align-items: center;
    gap: 12px;
    border-radius: 6px;
  }
  .idx {
    position: relative;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center end;
  }
  .n {
    font-size: 12.5px;
    color: var(--text-4);
  }
  .row.current .n {
    color: var(--accent);
  }
  .g {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center end;
    color: var(--text);
    opacity: 0;
  }
  .row:hover .n {
    opacity: 0;
  }
  .row:hover .g {
    opacity: 1;
  }
  .art {
    position: relative;
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: 4px;
    overflow: hidden;
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .ov {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    background: rgb(0 0 0 / 0.55);
    opacity: 0;
    transition: opacity 0.12s;
  }
  .row:hover .ov,
  .ov.show {
    opacity: 1;
  }
  .main {
    min-width: 0;
  }
  .title {
    font-size: 13.5px;
    font-weight: 540;
    letter-spacing: -0.01em;
    line-height: 1.3;
  }
  .sub {
    font-size: 12.5px;
    color: var(--text-3);
    line-height: 1.35;
  }
  .row:hover .sub {
    color: var(--text-2);
  }
  .tag {
    display: inline-block;
    margin-right: 6px;
    padding: 1px 4px;
    border-radius: 3px;
    font: 600 9px/1.3 var(--mono);
    letter-spacing: 0.06em;
    color: var(--text-3);
    background: var(--bg-3);
    vertical-align: 1px;
  }
  .third {
    font-size: 12.5px;
    color: var(--text-3);
  }
  .dur {
    text-align: right;
    font-size: 12px;
    color: var(--text-3);
  }
  .icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }
  .like,
  .more {
    opacity: 0;
  }
  .row:hover .like,
  .row:hover .more,
  .like:focus-visible,
  .more:focus-visible,
  .like.on {
    opacity: 1;
  }
  .eq {
    display: flex;
    gap: 2px;
    align-items: flex-end;
    height: 13px;
  }
  .eq i {
    width: 3px;
    height: 13px;
    background: var(--accent);
    border-radius: 1px;
    transform-origin: bottom;
    animation: eq 0.85s infinite var(--ease) alternate;
  }
  .eq i:nth-child(2) {
    animation-delay: -0.3s;
  }
  .eq i:nth-child(3) {
    animation-delay: -0.55s;
  }
  @keyframes eq {
    from {
      transform: scaleY(0.25);
    }
    to {
      transform: scaleY(1);
    }
  }
  @container (max-width: 640px) {
    .row,
    .thead {
      grid-template-columns: auto minmax(0, 1fr) 32px 52px 32px;
    }
    .third,
    .third-h {
      display: none;
    }
  }
</style>
