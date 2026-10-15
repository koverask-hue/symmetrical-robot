<script lang="ts">
  import Header from '../components/Header.svelte';
  import Icon from '../components/Icon.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { library } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';

  let tab = $state<'liked' | 'history'>('liked');
  const tracks = $derived(tab === 'liked' ? library.liked : library.history);
</script>

<div class="page">
  <Header kind="Library" title={tab === 'liked' ? 'Liked songs' : 'Recently played'} subtitle={`${tracks.length} songs · stored on this computer`}
    art={tracks[0]?.art}>
    {#snippet actions()}
      <button class="pill primary" onclick={() => player.playTracks(tracks)} disabled={!tracks.length}><Icon name="play" size={16} /> Play</button>
      <div class="tabs">
        <button class:on={tab === 'liked'} onclick={() => (tab = 'liked')}>Liked</button>
        <button class:on={tab === 'history'} onclick={() => (tab = 'history')}>History</button>
      </div>
    {/snippet}
  </Header>
  {#if tracks.length}
    <TrackList {tracks} />
  {:else}
    <p class="empty muted">{tab === 'liked' ? 'Songs you like (♥ or F) show up here.' : 'Nothing played yet.'}</p>
  {/if}
</div>

<style>
  .tabs {
    display: flex;
    padding: 3px;
    border-radius: 999px;
    background: var(--hover);
  }
  .tabs button {
    padding: 0 14px;
    border-radius: 999px;
    font-weight: 600;
    color: var(--text-2);
  }
  .tabs button.on {
    background: var(--active);
    color: var(--text);
  }
  .empty {
    padding: 40px 10px;
  }
</style>
