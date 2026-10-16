<script lang="ts">
  import Header from '../components/Header.svelte';
  import Icon from '../components/Icon.svelte';
  import Loading from '../components/Loading.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { source } from '../lib/sources';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { loader } from '../lib/util/load.svelte';

  let { kind, id }: { kind: 'album' | 'playlist'; id: string } = $props();
  const res = loader(() => source.collection(kind, id));
  $effect(() => {
    kind;
    id;
    res.run();
  });
  const c = $derived(res.state.data);
  const total = $derived(c ? c.tracks.reduce((s, t) => s + t.duration, 0) : 0);
  const saved = $derived(library.isSaved(id));

  function length(sec: number) {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`;
  }

  function toggleSave() {
    if (!c) return;
    const on = !saved;
    library.toggleSave({ kind, id, title: c.title, subtitle: c.subtitle, art: c.art });
    toasts.show(on ? `Saved to your library` : `Removed from your library`);
  }

  function copy() {
    if (!c) return;
    library.createPlaylist(c.title, c.tracks);
    toasts.show(`Copied “${c.title}” to your playlists`);
  }

  function shuffle() {
    if (!c?.tracks.length) return;
    player.playTracks(c.tracks, Math.floor(Math.random() * c.tracks.length));
    player.toggleShuffle();
  }
</script>

<div class="page">
  {#if res.state.loading && !c}
    <Loading />
  {:else if res.state.error}
    <Loading error={res.state.error} retry={res.run} />
  {:else if c}
    <Header art={c.art} kind={kind === 'album' ? 'Album' : 'Playlist'} title={c.title}
      subtitle={[c.subtitle, `${c.tracks.length} ${c.tracks.length === 1 ? 'song' : 'songs'}`, total ? length(total) : ''].filter(Boolean).join(' · ')}
      description={c.description}>
      {#snippet actions()}
        <button class="round-play" aria-label="Play" onclick={() => player.playTracks(c.tracks)} disabled={!c.tracks.length}>
          <Icon name="play" size={22} />
        </button>
        <button class="icon-btn" aria-label="Shuffle" title="Shuffle" onclick={shuffle} disabled={!c.tracks.length}>
          <Icon name="shuffle" size={19} />
        </button>
        <button class="icon-btn" class:on={saved} aria-label={saved ? 'Remove from library' : 'Save to library'} aria-pressed={saved}
          title={saved ? 'Saved to your library' : 'Save to your library'} onclick={toggleSave}>
          <Icon name={saved ? 'check' : 'bookmark'} size={19} />
        </button>
        <button class="btn" onclick={copy} title="Copy into a local playlist you can edit" disabled={!c.tracks.length}>
          <Icon name="plus" size={15} /> Copy to my playlists
        </button>
      {/snippet}
    </Header>
    {#if c.tracks.length}
      <TrackList tracks={c.tracks} numbered={kind === 'album'} showArt={kind !== 'album'} showAlbum={kind !== 'album'} />
    {:else}
      <p class="empty">No songs here.</p>
    {/if}
  {/if}
</div>

<style>
  .round-play:disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  .empty {
    padding: 40px 0;
    color: var(--text-3);
  }
</style>
