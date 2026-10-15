<script lang="ts">
  import Header from '../components/Header.svelte';
  import Icon from '../components/Icon.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { library } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { router } from '../lib/router.svelte';

  let { id }: { id: string } = $props();
  const p = $derived(library.playlists.find((x) => x.id === id));
  let editing = $state(false);
  let name = $state('');

  function startRename() {
    name = p?.name ?? '';
    editing = true;
  }
  function commit() {
    if (p && name.trim()) library.renamePlaylist(p.id, name.trim());
    editing = false;
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
    <p class="muted">This playlist no longer exists.</p>
  {:else}
    {#if editing}
      <!-- svelte-ignore a11y_autofocus -->
      <input class="rename" bind:value={name} autofocus onblur={commit} onkeydown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') editing = false; e.stopPropagation(); }} />
    {/if}
    <Header kind="Your playlist" title={p.name} subtitle={`${p.tracks.length} songs`} art={p.tracks[0]?.art}>
      {#snippet actions()}
        <button class="btn primary" onclick={() => player.playTracks(p.tracks)} disabled={!p.tracks.length}><Icon name="play" size={16} /> Play</button>
        <button class="btn" onclick={startRename}>Rename</button>
        <button class="btn" onclick={remove}><Icon name="trash" size={16} /> {armed ? 'Click again to delete' : 'Delete'}</button>
      {/snippet}
    </Header>
    {#if p.tracks.length}
      <TrackList tracks={p.tracks} playlistId={p.id} />
    {:else}
      <p class="muted empty">Empty for now. Right-click any song → Add to playlist.</p>
    {/if}
  {/if}
</div>

<style>
  .rename {
    width: 100%;
    font: 800 28px var(--serif);
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--hair);
    background: var(--glass-strong);
    outline: none;
  }
  .empty {
    padding: 40px 10px;
  }
</style>
