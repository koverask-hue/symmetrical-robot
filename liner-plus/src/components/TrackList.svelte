<script lang="ts">
  import Art from './Art.svelte';
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
  }: { tracks: Track[]; showArt?: boolean; showAlbum?: boolean; numbered?: boolean; playlistId?: string } = $props();

  const play = (i: number) => player.playTracks(tracks, i);
</script>

<div class="list" role="list">
  {#each tracks as t, i (t.id + ':' + i)}
    {@const current = player.current?.id === t.id}
    <div
      class="row"
      class:current
      class:noalbum={!showAlbum}
      role="listitem"
      ondblclick={() => play(i)}
      oncontextmenu={(e) => ui.openMenu(e, t, playlistId)}
    >
      <button class="lead" onclick={() => play(i)} aria-label={`Play ${t.title}`}>
        {#if numbered}<span class="num">{i + 1}</span>{/if}
        {#if showArt}<Art src={t.art} size={40} />{/if}
        <span class="playglyph">
          {#if current && player.playing}
            <span class="eq"><i></i><i></i><i></i></span>
          {:else}
            <Icon name="play" size={16} />
          {/if}
        </span>
      </button>
      <div class="main">
        <div class="title ellipsis">{t.title}</div>
        <div class="sub ellipsis muted">
          {#each t.artists as a, j}
            {#if j > 0}, {/if}
            {#if a.id}
              <span class="link" role="link" tabindex="-1" onclick={() => router.go({ name: 'artist', id: a.id! })} onkeydown={() => {}}>{a.name}</span>
            {:else}{a.name}{/if}
          {/each}
        </div>
      </div>
      {#if showAlbum}
        <div class="album ellipsis muted">
          {#if t.album?.id}
            <span class="link" role="link" tabindex="-1" onclick={() => router.go({ name: 'album', id: t.album!.id! })} onkeydown={() => {}}>{t.album.name}</span>
          {:else}{t.album?.name ?? ''}{/if}
        </div>
      {/if}
      <button class="icon-btn like" class:on={library.isLiked(t.id)} onclick={() => library.toggleLike(t)} aria-label="Like">
        <Icon name={library.isLiked(t.id) ? 'heart-filled' : 'heart'} size={17} />
      </button>
      <div class="dur muted">{t.duration ? time(t.duration) : ''}</div>
      <button class="icon-btn more" onclick={(e) => ui.openMenu(e, t, playlistId)} aria-label="More">
        <Icon name="more" size={18} />
      </button>
    </div>
  {/each}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) minmax(0, 0.7fr) 36px 48px 36px;
    align-items: center;
    gap: 14px;
    padding: 6px 10px;
    border-radius: 10px;
    transition: background 0.12s;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.current .title {
    color: var(--accent);
  }
  .lead {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .num {
    width: 22px;
    text-align: right;
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }
  .playglyph {
    position: absolute;
    right: 0;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.45);
    border-radius: 6px;
    opacity: 0;
    transition: opacity 0.12s;
  }
  .row:hover .playglyph,
  .row.current .playglyph {
    opacity: 1;
  }
  .row:not(:has(.art)) .playglyph {
    position: static;
    width: 24px;
    height: 24px;
    background: none;
  }
  .title {
    font-weight: 550;
  }
  .sub,
  .album {
    font-size: 13px;
  }
  .dur {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
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
    background: var(--accent);
    border-radius: 1px;
    animation: eq 0.9s infinite ease-in-out alternate;
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
  .row.noalbum {
    grid-template-columns: auto minmax(0, 1fr) 36px 48px 36px;
  }
  @container (max-width: 640px) {
    .row {
      grid-template-columns: auto minmax(0, 1fr) 36px 48px 36px;
    }
    .album {
      display: none;
    }
  }
</style>
