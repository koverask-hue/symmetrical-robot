<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import TrackList from '../components/TrackList.svelte';
  import { library } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { router } from '../lib/router.svelte';

  let tab = $state<'liked' | 'history'>('liked');
  const tracks = $derived(tab === 'liked' ? library.liked : library.history);

  function newPlaylist() {
    const p = library.createPlaylist(`Playlist ${library.playlists.length + 1}`);
    router.go({ name: 'local', id: p.id });
  }
</script>

<div class="page">
  <header class="hello enter">
    <div class="kicker">Library</div>
    <h1 class="display">Everything you <em class="iris-text">keep</em>.</h1>
    <p class="line">Stored on this computer, nowhere else.</p>
  </header>

  <section class="shelves enter">
    <button class="pl liked" onclick={() => (tab = 'liked')} class:on={tab === 'liked'}>
      <span class="pic"><Icon name="heart-filled" size={30} /></span>
      <span class="nm serif">Loved songs</span>
      <span class="ct">{library.liked.length} songs</span>
    </button>
    <button class="pl hist" onclick={() => (tab = 'history')} class:on={tab === 'history'}>
      <span class="pic"><Icon name="clock" size={30} /></span>
      <span class="nm serif">Recently played</span>
      <span class="ct">{library.history.length} songs</span>
    </button>
    {#each library.playlists as p (p.id)}
      <button class="pl" onclick={() => router.go({ name: 'local', id: p.id })}>
        <span class="pic mosaic">
          {#each p.tracks.slice(0, 4) as t (t.id)}{#if t.art}<img src={t.art} alt="" loading="lazy" />{/if}{/each}
        </span>
        <span class="nm serif ellipsis">{p.name}</span>
        <span class="ct">{p.tracks.length} songs</span>
      </button>
    {/each}
    <button class="pl new" onclick={newPlaylist}>
      <span class="pic"><Icon name="plus" size={28} /></span>
      <span class="nm serif">New playlist</span>
      <span class="ct">&nbsp;</span>
    </button>
  </section>

  <div class="listhead">
    <h2 class="section-title">{tab === 'liked' ? 'Loved' : 'Recently'} <em>{tab === 'liked' ? 'songs' : 'played'}</em></h2>
    <button class="btn primary" onclick={() => player.playTracks(tracks)} disabled={!tracks.length}><Icon name="play" size={15} /> Play</button>
  </div>
  {#if tracks.length}
    <TrackList {tracks} />
  {:else}
    <p class="empty serif">{tab === 'liked' ? 'Songs you love (♥ or F) live here.' : 'Nothing played yet.'}</p>
  {/if}
</div>

<style>
  .hello {
    padding: 34px 12px 36px;
  }
  .hello .display {
    margin: 14px 0 12px;
  }
  .line {
    margin: 0;
    font: italic 400 22px var(--serif);
    color: var(--text-2);
  }
  .shelves {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
    gap: 8px;
    margin-bottom: 44px;
  }
  .pl {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
    border-radius: 26px;
    text-align: left;
    transition: background 0.4s var(--ease);
  }
  .pl:hover,
  .pl.on {
    background: rgb(255 255 255 / 0.05);
  }
  .pic {
    position: relative;
    aspect-ratio: 1;
    width: 100%;
    margin-bottom: 12px;
    border-radius: 20px;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: rgb(255 255 255 / 0.05);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.07);
  }
  .liked .pic {
    background: radial-gradient(circle at 30% 20%, #ffaee0, #b9a8ff 55%, #5b46c9);
    color: #fff;
  }
  .hist .pic {
    background: radial-gradient(circle at 30% 20%, #9fefff, #5a8bd6 55%, #23305e);
    color: #fff;
  }
  .new .pic {
    color: var(--text-3);
    background: none;
    box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / 0.12);
  }
  .mosaic {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .mosaic img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .nm {
    font-size: 21px;
    line-height: 1.15;
    max-width: 100%;
  }
  .ct {
    font-size: 12.5px;
    color: var(--text-3);
  }
  .listhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px 14px;
  }
  .listhead em {
    color: rgb(var(--tint));
  }
  .empty {
    padding: 40px 12px;
    font-size: 22px;
    color: var(--text-3);
  }
</style>
