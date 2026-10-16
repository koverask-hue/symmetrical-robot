<script lang="ts">
  import Header from '../components/Header.svelte';
  import Icon from '../components/Icon.svelte';
  import Mosaic from '../components/Mosaic.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { library } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { time } from '../lib/util/format';

  let { id }: { id: string } = $props();
  const mix = $derived((taste.version, taste.mixes, taste.mixById(id)));
  const total = $derived(mix ? mix.tracks.reduce((a, t) => a + t.duration, 0) : 0);

  function play() {
    if (mix) player.playTracks(mix.tracks, 0, { reasons: mix.reasons });
  }
  function shuffle() {
    if (!mix) return;
    player.playTracks(mix.tracks, 0, { reasons: mix.reasons });
    player.toggleShuffle();
  }
  function keep() {
    if (!mix) return;
    library.createPlaylist(mix.title, mix.tracks);
    toasts.show(`Kept “${mix.title}” as a playlist`);
  }
</script>

<div class="page">
  {#if !mix}
    <div class="gone">
      <span class="label">Mix</span>
      <p class="muted">This mix has been rebuilt since.</p>
      <button class="chip" onclick={() => history.back()}><Icon name="back" size={14} /> Go back</button>
    </div>
  {:else}
    <Header kind={mix.kind === 'world' ? 'World' : 'Made for you'} title={mix.title}
      subtitle={[mix.subtitle, `${mix.tracks.length} songs`, total ? time(total) : ''].filter(Boolean).join(' · ')}>
      {#snippet visual()}<Mosaic arts={mix.tracks.map((t) => t.art)} size={200} radius={10} />{/snippet}
      {#snippet actions()}
        <button class="round-play" aria-label="Play" onclick={play}><Icon name="play" size={22} /></button>
        <button class="btn" onclick={shuffle}><Icon name="shuffle" size={15} /> Shuffle</button>
        <button class="btn" onclick={keep}><Icon name="plus" size={15} /> Keep as playlist</button>
      {/snippet}
    </Header>
    <p class="why">Every song has a reason — it's in the right column.</p>
    <TrackList tracks={mix.tracks} reasons={mix.reasons} />
  {/if}
</div>

<style>
  .why {
    margin: -12px 10px 14px;
    font-size: 12.5px;
    color: var(--text-3);
  }
  .gone {
    padding: 80px 10px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .gone p {
    margin: 0;
  }
</style>
