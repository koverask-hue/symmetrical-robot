<script lang="ts">
  import Icon from './Icon.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { router } from '../lib/router.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { ui, type MenuState } from '../lib/ui.svelte';

  let { menu }: { menu: MenuState } = $props();
  let el: HTMLDivElement;
  let sub = $state(false);
  let pos = $state({ x: 0, y: 0 });
  const t = $derived(menu.track);

  // Keep the menu inside the window.
  $effect(() => {
    const r = el.getBoundingClientRect();
    pos = { x: Math.min(menu.x, innerWidth - r.width - 8), y: Math.min(menu.y, innerHeight - r.height - 8) };
  });

  const close = () => (ui.menu = null);
  const act = (fn: () => void) => () => {
    fn();
    close();
  };

  function addTo(id: string, name: string) {
    library.addToPlaylist(id, [t]);
    toasts.show(`Added to ${name}`);
    close();
  }
  function addToNew() {
    const p = library.createPlaylist(`Playlist ${library.playlists.length + 1}`, [t]);
    toasts.show(`Created ${p.name}`);
    close();
  }
</script>

<svelte:window onpointerdown={(e) => !el.contains(e.target as Node) && close()} onblur={close} />

<div class="menu" bind:this={el} style:left="{pos.x}px" style:top="{pos.y}px" role="menu">
  <button role="menuitem" onclick={act(() => player.playNext(t))}><Icon name="next" size={16} /> Play next</button>
  <button role="menuitem" onclick={act(() => player.addToQueue([t]))}><Icon name="queue" size={16} /> Add to queue</button>
  <button role="menuitem" onclick={act(() => player.playRadio(t))}><Icon name="radio" size={16} /> Start radio</button>
  <hr />
  <button role="menuitem" onclick={act(() => library.toggleLike(t))}>
    <Icon name={library.isLiked(t.id) ? 'heart-filled' : 'heart'} size={16} />
    {library.isLiked(t.id) ? 'Remove from liked' : 'Like'}
  </button>
  <div class="has-sub" role="none" onpointerenter={() => (sub = true)} onpointerleave={() => (sub = false)}>
    <button role="menuitem" aria-haspopup="menu" onclick={() => (sub = !sub)}><Icon name="plus" size={16} /> Add to playlist <span class="chev">›</span></button>
    {#if sub}
      <div class="submenu" role="menu">
        <button role="menuitem" onclick={addToNew}><Icon name="plus" size={16} /> New playlist</button>
        {#each library.playlists as p (p.id)}
          <button role="menuitem" onclick={() => addTo(p.id, p.name)}><span class="ellipsis">{p.name}</span></button>
        {/each}
      </div>
    {/if}
  </div>
  {#if menu.playlistId}
    <button role="menuitem" onclick={act(() => library.removeFromPlaylist(menu.playlistId!, t.id))}><Icon name="trash" size={16} /> Remove from this playlist</button>
  {/if}
  {#if t.artists[0]?.id || t.album?.id}<hr />{/if}
  {#if t.artists[0]?.id}
    <button role="menuitem" onclick={act(() => router.go({ name: 'artist', id: t.artists[0].id! }))}><Icon name="user" size={16} /> Go to artist</button>
  {/if}
  {#if t.album?.id}
    <button role="menuitem" onclick={act(() => router.go({ name: 'album', id: t.album!.id! }))}><Icon name="album" size={16} /> Go to album</button>
  {/if}
</div>

<style>
  .menu,
  .submenu {
    position: fixed;
    z-index: 60;
    min-width: 220px;
    padding: 6px;
    border-radius: 12px;
    background: rgb(26 22 34 / 0.96);
    backdrop-filter: blur(30px);
    border: 1px solid rgb(255 255 255 / 0.1);
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.55);
    animation: pop 0.1s ease-out;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
  }
  .submenu {
    position: absolute;
    left: calc(100% - 4px);
    top: -6px;
    max-height: 320px;
    overflow-y: auto;
  }
  .has-sub {
    position: relative;
  }
  button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 36px;
    padding: 0 10px;
    border-radius: 8px;
    text-align: left;
    color: var(--text-2);
  }
  button:hover {
    background: var(--hover);
    color: var(--text);
  }
  .chev {
    margin-left: auto;
  }
  hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 5px 4px;
  }
</style>
