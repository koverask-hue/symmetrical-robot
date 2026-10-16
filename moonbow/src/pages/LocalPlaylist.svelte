<script lang="ts">
  import Header from '../components/Header.svelte';
  import Icon from '../components/Icon.svelte';
  import Mosaic from '../components/Mosaic.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { library } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { router } from '../lib/router.svelte';

  let { id }: { id: string } = $props();
  const p = $derived(library.playlists.find((x) => x.id === id));
  const total = $derived(p ? p.tracks.reduce((s, t) => s + t.duration, 0) : 0);
  let editing = $state(false);
  let name = $state('');

  function length(sec: number) {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`;
  }

  function startRename() {
    name = p?.name ?? '';
    editing = true;
  }
  function commit() {
    if (p && name.trim()) library.renamePlaylist(p.id, name.trim());
    editing = false;
  }
  function shuffle() {
    if (!p?.tracks.length) return;
    player.playTracks(p.tracks, Math.floor(Math.random() * p.tracks.length));
    player.toggleShuffle();
  }
  // Two-step delete instead of confirm(), which some webviews don't implement.
  let armed = $state(false);
  function remove() {
    if (!p) return;
    if (!armed) {
      armed = true;
      setTimeout(() => (armed = false), 3000);
      return;
    }
    library.deletePlaylist(p.id);
    router.back();
  }
</script>

<div class="page">
  {#if !p}
    <div class="gone">
      <div class="label">Playlist</div>
      <p>This playlist no longer exists.</p>
      <button class="btn" onclick={() => router.go({ name: 'library', tab: 'playlists' })}>Back to your library</button>
    </div>
  {:else}
    <Header kind="Your playlist" title={p.name}
      subtitle={[`${p.tracks.length} ${p.tracks.length === 1 ? 'song' : 'songs'}`, total ? length(total) : '', 'Stored locally'].filter(Boolean).join(' · ')}>
      {#snippet visual()}
        {#if p.tracks.length}
          <Mosaic arts={p.tracks.slice(0, 8).map((t) => t.art)} size="100%" radius={12} />
        {:else}
          <div class="blank"><Icon name="queue" size={44} /></div>
        {/if}
      {/snippet}
      {#snippet actions()}
        <button class="round-play" aria-label="Play" onclick={() => player.playTracks(p.tracks)} disabled={!p.tracks.length}>
          <Icon name="play" size={22} />
        </button>
        <button class="icon-btn" aria-label="Shuffle" title="Shuffle" onclick={shuffle} disabled={!p.tracks.length}>
          <Icon name="shuffle" size={19} />
        </button>
        {#if editing}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="rename" aria-label="Playlist name" bind:value={name} autofocus onblur={commit}
            onkeydown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') editing = false; e.stopPropagation(); }} />
        {:else}
          <button class="btn" onclick={startRename}>Rename</button>
        {/if}
        <button class="btn" class:danger={armed} onclick={remove}>
          <Icon name="trash" size={15} /> {armed ? 'Click again to delete' : 'Delete'}
        </button>
      {/snippet}
    </Header>
    {#if p.tracks.length}
      <TrackList tracks={p.tracks} playlistId={p.id} />
    {:else}
      <div class="empty">
        <div class="label">Empty for now</div>
        <p>Right-click any song → <b>Add to playlist</b>, or use <kbd>⋯</kbd> on a row.</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .blank {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    color: var(--text-4);
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair);
  }
  .round-play:disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  .rename {
    height: 38px;
    width: 260px;
    padding: 0 14px;
    border-radius: 999px;
    border: 0;
    outline: none;
    font-size: 13.5px;
    font-weight: 560;
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px rgb(var(--accent-rgb) / 0.5);
  }
  .danger {
    color: #ff6b5b;
    box-shadow: inset 0 0 0 1px rgb(255 107 91 / 0.45);
  }
  .empty,
  .gone {
    padding: 48px 0;
    color: var(--text-3);
  }
  .empty p,
  .gone p {
    margin: 8px 0 16px;
  }
  .empty b {
    color: var(--text-2);
    font-weight: 560;
  }
</style>
