<script lang="ts">
  import Fan from '../components/Fan.svelte';
  import Header from '../components/Header.svelte';
  import Icon from '../components/Icon.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { library } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { time } from '../lib/util/format';

  let { id }: { id: string } = $props();
  const mix = $derived((taste.version, taste.mixes, taste.mixById(id)));
  const total = $derived(mix ? mix.tracks.reduce((a, t) => a + t.duration, 0) : 0);

  function keep() {
    if (!mix) return;
    library.createPlaylist(mix.title, mix.tracks);
    toasts.show(`Kept “${mix.title}” as a playlist`);
  }
</script>

<div class="page">
  {#if !mix}
    <p class="muted gone">This mix has been rebuilt since. <button class="chip" onclick={() => history.back()}>Go back</button></p>
  {:else}
    <Header kind={mix.kind === 'world' ? 'A world in your taste' : 'Made for you'} title={mix.title}
      subtitle={[mix.subtitle, `${mix.tracks.length} songs`, total ? time(total) : ''].filter(Boolean).join(' · ')}>
      {#snippet visual()}<Fan arts={mix.tracks.map((t) => t.art)} size={160} />{/snippet}
      {#snippet actions()}
        <button class="btn primary" onclick={() => player.playTracks(mix.tracks, 0, { reasons: mix.reasons })}><Icon name="play" size={16} /> Play</button>
        <button class="btn" onclick={() => { player.playTracks(mix.tracks, 0, { reasons: mix.reasons }); player.toggleShuffle(); }}><Icon name="shuffle" size={16} /> Shuffle</button>
        <button class="btn" onclick={keep}><Icon name="plus" size={16} /> Keep it</button>
      {/snippet}
    </Header>
    <p class="why serif">Every song here has a reason. <em>It's written next to each one.</em></p>
    <TrackList tracks={mix.tracks} reasons={mix.reasons} />
  {/if}
</div>

<style>
  .why {
    margin: -20px 12px 18px;
    font-size: 18px;
    color: var(--text-3);
  }
  .why em {
    color: var(--text-2);
  }
  .gone {
    padding: 80px 12px;
  }
</style>
