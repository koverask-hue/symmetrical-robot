<script lang="ts">
  import Icon from './Icon.svelte';
  import { artistLine } from '../lib/sources/types';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { router } from '../lib/router.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { ui, type MenuState } from '../lib/ui.svelte';
  import { taste } from '../lib/taste/store.svelte';

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

<div class="menu" bind:this={el} style:left="{pos.x}px" style:top="{pos.y}px" role="menu" aria-label="Song options">
  <div class="head" role="none"><div class="ht ellipsis">{t.title}</div><div class="ha ellipsis">{artistLine(t)}</div></div>
  <button role="menuitem" onclick={act(() => player.playNext(t))}><Icon name="play-next" size={16} /> Play next</button>
  <button role="menuitem" onclick={act(() => player.addToQueue([t]))}><Icon name="queue-add" size={16} /> Add to queue</button>
  <button role="menuitem" onclick={act(() => player.playRadio(t))}><Icon name="radio" size={16} /> Start radio</button>
  <hr />
  <button role="menuitem" onclick={act(() => library.toggleLike(t))}>
    <Icon name={library.isLiked(t.id) ? 'heart-filled' : 'heart'} size={16} />
    {library.isLiked(t.id) ? 'Remove from liked' : 'Like'}
  </button>
  <div class="has-sub" class:open={sub} role="none" onpointerenter={() => (sub = true)} onpointerleave={() => (sub = false)}>
    <button role="menuitem" aria-haspopup="menu" onclick={() => (sub = !sub)}><Icon name="plus" size={16} /> Add to playlist <span class="chev"><Icon name="forward" size={14} /></span></button>
    {#if sub}
      <div class="submenu" role="menu">
        <button role="menuitem" onclick={addToNew}><Icon name="plus" size={16} /> New playlist</button>
        {#if library.playlists.length}<hr />{/if}
        {#each library.playlists as p (p.id)}
          <button role="menuitem" onclick={() => addTo(p.id, p.name)}><Icon name="library" size={16} /><span class="ellipsis">{p.name}</span><span class="n num">{p.tracks.length}</span></button>
        {/each}
      </div>
    {/if}
  </div>
  <hr />
  <button role="menuitem" onclick={act(() => { taste.feedback(t, 'more'); toasts.show(`More like “${t.title}”`); })}><Icon name="thumb-up" size={16} /> More like this</button>
  <button role="menuitem" onclick={act(() => { taste.feedback(t, 'less'); toasts.show(`Less like “${t.title}”`); })}><Icon name="thumb-down" size={16} /> Less like this</button>
  <button role="menuitem" onclick={act(() => { taste.mute(t); toasts.show(`Hidden ${t.artists[0]?.name ?? 'artist'} from your mixes`); })}><Icon name="eye-off" size={16} /> <span class="ellipsis">Hide {t.artists[0]?.name ?? 'this artist'}</span></button>
  {#if menu.playlistId}
    <button role="menuitem" onclick={act(() => library.removeFromPlaylist(menu.playlistId!, t.id))} class="danger"><Icon name="trash" size={16} /> Remove from this playlist</button>
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
    min-width: 232px;
    max-width: 300px;
    padding: 5px;
    border-radius: 12px;
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair-2), 0 18px 48px rgb(0 0 0 / 0.55);
    animation: pop 0.1s ease-out;
    transform-origin: top left;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
  }
  .head {
    padding: 7px 9px 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--hair);
  }
  .ht {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .ha {
    font: 11px var(--mono);
    color: var(--text-3);
  }
  .submenu {
    position: absolute;
    left: calc(100% - 2px);
    top: -5px;
    max-height: 320px;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .has-sub {
    position: relative;
  }
  .has-sub.open > button {
    background: var(--bg-3);
    color: var(--text);
  }
  button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 9px;
    border-radius: 7px;
    text-align: left;
    font-size: 13px;
    color: var(--text-2);
    white-space: nowrap;
  }
  button :global(svg) {
    flex: none;
    color: var(--text-3);
    transition: color 0.1s;
  }
  button:hover,
  button:focus-visible {
    background: var(--bg-3);
    color: var(--text);
    outline: none;
  }
  button:hover :global(svg) {
    color: var(--text);
  }
  button.danger:hover,
  button.danger:hover :global(svg) {
    color: #ff5d5d;
  }
  .chev,
  .n {
    margin-left: auto;
    color: var(--text-4);
  }
  .chev {
    display: flex;
  }
  .n {
    font-size: 11px;
  }
  hr {
    border: 0;
    border-top: 1px solid var(--hair);
    margin: 4px 4px;
  }
</style>
