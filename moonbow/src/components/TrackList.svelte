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
</script>

<div class="list" role="list">
  {#each tracks as t, i (t.id + ':' + i)}
    {@const current = player.current?.id === t.id}
    <div class="row" class:current class:narrow={!wide} role="listitem" ondblclick={() => play(i)} oncontextmenu={(e) => ui.openMenu(e, t, playlistId)}>
      <button class="lead" onclick={() => play(i)} aria-label={`Play ${t.title}`}>
        {#if numbered}<span class="num serif">{i + 1}</span>{/if}
        {#if showArt}
          <span class="art">
            {#if t.art}<img src={t.art} alt="" loading="lazy" />{/if}
          </span>
        {/if}
        <span class="glyph" class:solo={!showArt}>
          {#if current && player.playing}
            <span class="eq"><i></i><i></i><i></i></span>
          {:else}
            <Icon name="play" size={15} />
          {/if}
        </span>
      </button>
      <div class="main">
        <div class="title ellipsis">{t.title}</div>
        <div class="sub ellipsis">
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
      <button class="icon-btn like" class:on={library.isLiked(t.id)} onclick={() => library.toggleLike(t)} aria-label="Love it">
        <Icon name={library.isLiked(t.id) ? 'heart-filled' : 'heart'} size={16} />
      </button>
      <div class="dur">{t.duration ? time(t.duration) : ''}</div>
      <button class="icon-btn more" onclick={(e) => ui.openMenu(e, t, playlistId)} aria-label="More">
        <Icon name="more" size={18} />
      </button>
    </div>
  {/each}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 0.9fr) 36px 48px 36px;
    align-items: center;
    gap: 16px;
    padding: 8px 12px;
    border-radius: 18px;
    transition: background 0.3s var(--ease);
  }
  .row.narrow {
    grid-template-columns: auto minmax(0, 1fr) 36px 48px 36px;
  }
  .row:hover {
    background: rgb(255 255 255 / 0.045);
  }
  .row.current {
    background: rgb(var(--tint) / 0.08);
  }
  .row.current .title {
    color: rgb(var(--tint));
  }
  .lead {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .num {
    width: 26px;
    text-align: right;
    font-size: 19px;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .art {
    position: relative;
    width: 46px;
    height: 46px;
    border-radius: 12px;
    overflow: hidden;
    background: rgb(255 255 255 / 0.05);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
  }
  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .glyph {
    position: absolute;
    right: 0;
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    background: rgb(8 6 16 / 0.55);
    border-radius: 12px;
    opacity: 0;
    transition: opacity 0.25s var(--ease);
  }
  .glyph.solo {
    position: static;
    width: 22px;
    height: 22px;
    background: none;
  }
  .row:hover .glyph,
  .row.current .glyph {
    opacity: 1;
  }
  .row:not(:hover):not(.current) .glyph.solo {
    opacity: 0;
  }
  .title {
    font-weight: 540;
  }
  .sub {
    font-size: 13px;
    color: var(--text-3);
  }
  .third {
    font-size: 13px;
    color: var(--text-3);
  }
  .dur {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 12.5px;
    color: var(--text-3);
  }
  .like,
  .more {
    opacity: 0;
  }
  .row:hover .like,
  .row:hover .more,
  .like.on {
    opacity: 1;
  }
  .eq {
    display: flex;
    gap: 2px;
    align-items: flex-end;
    height: 14px;
  }
  .eq i {
    width: 3px;
    background: rgb(var(--tint));
    border-radius: 2px;
    box-shadow: 0 0 8px rgb(var(--tint));
    animation: eq 0.9s infinite var(--ease) alternate;
  }
  .eq i:nth-child(2) {
    animation-delay: -0.3s;
  }
  .eq i:nth-child(3) {
    animation-delay: -0.6s;
  }
  @keyframes eq {
    from {
      height: 3px;
    }
    to {
      height: 14px;
    }
  }
  @container (max-width: 680px) {
    .row {
      grid-template-columns: auto minmax(0, 1fr) 36px 48px 36px;
    }
    .third {
      display: none;
    }
  }
</style>
