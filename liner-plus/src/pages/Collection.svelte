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
  import { time } from '../lib/util/format';

  let { kind, id }: { kind: 'album' | 'playlist'; id: string } = $props();
  const res = loader(() => source.collection(kind, id));
  $effect(() => {
    kind;
    id;
    res.run();
  });
  const c = $derived(res.state.data);
  const total = $derived(c ? c.tracks.reduce((s, t) => s + t.duration, 0) : 0);

  function save() {
    if (!c) return;
    library.createPlaylist(c.title, c.tracks);
    toasts.show(`Saved “${c.title}” to your playlists`);
  }
</script>

<div class="page">
  {#if res.state.loading && !c}
    <Loading />
  {:else if res.state.error}
    <Loading error={res.state.error} retry={res.run} />
  {:else if c}
    <Header art={c.art} kind={kind === 'album' ? 'Album' : 'Playlist'} title={c.title}
      subtitle={[c.subtitle, `${c.tracks.length} songs`, total ? time(total) : ''].filter(Boolean).join(' · ')} description={c.description}>
      {#snippet actions()}
        <button class="pill primary" onclick={() => player.playTracks(c.tracks)} disabled={!c.tracks.length}><Icon name="play" size={16} /> Play</button>
        <button class="pill" onclick={() => { player.playTracks(c.tracks); player.toggleShuffle(); }} disabled={!c.tracks.length}><Icon name="shuffle" size={16} /> Shuffle</button>
        <button class="pill" onclick={save} title="Copy into your local playlists"><Icon name="plus" size={16} /> Save</button>
      {/snippet}
    </Header>
    <TrackList tracks={c.tracks} numbered={kind === 'album'} showArt={kind !== 'album'} showAlbum={kind !== 'album'} />
  {/if}
</div>
