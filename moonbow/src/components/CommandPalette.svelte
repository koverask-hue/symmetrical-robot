<script lang="ts">
  // One box for everything: search suggestions, instant matches from your own
  // library/history, playlists and player commands.
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import { router } from '../lib/router.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { source } from '../lib/sources';
  import { ui } from '../lib/ui.svelte';
  import { artistLine, type Track } from '../lib/sources/types';
  import { debounce } from '../lib/util/format';

  type Item =
    | { kind: 'search'; label: string }
    | { kind: 'track'; track: Track; note: string }
    | { kind: 'action'; label: string; icon: string; run: () => void; keys?: string }
    | { kind: 'playlist'; label: string; id: string };

  let q = $state(router.current.name === 'search' ? router.current.q : '');
  let suggestions = $state<string[]>([]);
  let sel = $state(0);
  let input: HTMLInputElement;

  const ACTIONS: Extract<Item, { kind: 'action' }>[] = [
    { kind: 'action', label: 'Play / pause', icon: 'play', run: () => player.toggle(), keys: 'Space' },
    { kind: 'action', label: 'Next track', icon: 'next', run: () => player.next(), keys: 'Shift →' },
    { kind: 'action', label: 'Previous track', icon: 'prev', run: () => player.prev(), keys: 'Shift ←' },
    { kind: 'action', label: 'Show lyrics', icon: 'lyrics', run: () => (ui.lyricsOpen = true), keys: 'L' },
    { kind: 'action', label: 'Show queue', icon: 'queue', run: () => (ui.queueOpen = true), keys: 'Q' },
    { kind: 'action', label: 'Toggle shuffle', icon: 'shuffle', run: () => player.toggleShuffle(), keys: 'S' },
    { kind: 'action', label: 'Cycle repeat', icon: 'repeat', run: () => player.cycleRepeat(), keys: 'R' },
    { kind: 'action', label: 'Like current song', icon: 'heart', run: () => player.current && library.toggleLike(player.current), keys: 'F' },
    { kind: 'action', label: 'Go to library', icon: 'library', run: () => router.go({ name: 'library' }) },
    { kind: 'action', label: 'Go home', icon: 'home', run: () => router.go({ name: 'home' }) },
    { kind: 'action', label: 'Settings', icon: 'settings', run: () => (ui.settingsOpen = true) },
    { kind: 'action', label: 'Keyboard shortcuts', icon: 'keyboard', run: () => (ui.helpOpen = true), keys: '?' },
  ];

  const fetchSuggest = debounce(async (text: string) => {
    try {
      const s = await source.suggest(text);
      if (text === q) suggestions = s;
    } catch {
      suggestions = [];
    }
  }, 120);

  $effect(() => {
    const text = q;
    if (text.trim()) fetchSuggest(text);
    else suggestions = [];
  });

  const items = $derived.by<Item[]>(() => {
    const text = q.trim().toLowerCase();
    if (!text) {
      const recent = library.history.slice(0, 5).map((track) => ({ kind: 'track' as const, track, note: 'Recently played' }));
      return [...recent, ...ACTIONS.slice(0, 5)];
    }
    const out: Item[] = [{ kind: 'search', label: q.trim() }];
    for (const s of suggestions) if (s.toLowerCase() !== text) out.push({ kind: 'search', label: s });
    const seen = new Set<string>();
    const local = [...library.liked.map((t) => [t, 'Liked'] as const), ...library.history.map((t) => [t, 'Played'] as const)];
    for (const [t, note] of local) {
      if (seen.has(t.id) || seen.size >= 5) continue;
      if ((t.title + ' ' + artistLine(t)).toLowerCase().includes(text)) {
        seen.add(t.id);
        out.push({ kind: 'track', track: t, note });
      }
    }
    for (const p of library.playlists) if (p.name.toLowerCase().includes(text)) out.push({ kind: 'playlist', label: p.name, id: p.id });
    for (const a of ACTIONS) if (a.label.toLowerCase().includes(text)) out.push(a);
    return out;
  });

  $effect(() => {
    items;
    sel = 0;
  });

  $effect(() => {
    input?.focus();
    input?.select();
  });

  function run(it: Item | undefined) {
    if (!it) return;
    ui.paletteOpen = false;
    if (it.kind === 'search') router.go({ name: 'search', q: it.label });
    else if (it.kind === 'track') player.playRadio(it.track);
    else if (it.kind === 'playlist') router.go({ name: 'local', id: it.id });
    else it.run();
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') sel = (sel + 1) % items.length;
    else if (e.key === 'ArrowUp') sel = (sel - 1 + items.length) % items.length;
    else if (e.key === 'Enter') run(items[sel]);
    else if (e.key === 'Escape') ui.paletteOpen = false;
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={() => (ui.paletteOpen = false)}>
  <div class="palette" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1" aria-label="Search and commands">
    <div class="field">
      <Icon name="search" size={18} />
      <input bind:this={input} bind:value={q} onkeydown={key} placeholder="Search songs, artists, or type a command…" spellcheck="false" aria-label="Search" />
      <kbd>Esc</kbd>
    </div>
    <div class="results scroll" role="listbox">
      {#each items as it, i (i)}
        <button class="item" class:sel={i === sel} role="option" aria-selected={i === sel} onmouseenter={() => (sel = i)} onclick={() => run(it)}>
          {#if it.kind === 'search'}
            <span class="ic"><Icon name="search" size={16} /></span><span class="label ellipsis">{it.label}</span><span class="note">Search</span>
          {:else if it.kind === 'track'}
            <Art src={it.track.art} size={32} />
            <span class="label ellipsis">{it.track.title} <span class="muted">· {artistLine(it.track)}</span></span><span class="note">{it.note}</span>
          {:else if it.kind === 'playlist'}
            <span class="ic"><Icon name="library" size={16} /></span><span class="label ellipsis">{it.label}</span><span class="note">Playlist</span>
          {:else}
            <span class="ic"><Icon name={it.icon} size={16} /></span><span class="label ellipsis">{it.label}</span>
            {#if it.keys}<kbd>{it.keys}</kbd>{:else}<span class="note">Command</span>{/if}
          {/if}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
    background: rgb(0 0 0 / 0.35);
    animation: fade 0.12s;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .palette {
    width: min(620px, calc(100vw - 32px));
    max-height: 64vh;
    display: flex;
    flex-direction: column;
    border-radius: 28px;
    background: rgb(16 12 28 / 0.82);
    backdrop-filter: blur(40px) saturate(1.4);
    box-shadow: var(--glass-edge), 0 40px 100px rgb(0 0 0 / 0.6);
    box-shadow: 0 40px 100px rgb(0 0 0 / 0.6);
    overflow: hidden;
    animation: pop 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes pop {
    from {
      transform: scale(0.97) translateY(-6px);
      opacity: 0;
    }
  }
  .field {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    height: 64px;
    border-bottom: 1px solid var(--hair);
    color: var(--text-3);
  }
  input:focus-visible {
    outline: none;
  }
  input {
    flex: 1;
    background: none;
    border: 0;
    outline: none;
    font: italic 400 24px var(--serif);
    color: var(--text);
  }
  .results {
    padding: 6px;
  }
  .item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 44px;
    padding: 0 10px;
    border-radius: 10px;
    text-align: left;
  }
  .item.sel {
    background: rgb(var(--tint) / 0.14);
  }
  .ic {
    width: 32px;
    display: grid;
    place-items: center;
    color: var(--text-2);
  }
  .label {
    flex: 1;
  }
  .note {
    font-size: 12px;
    color: var(--text-3);
  }
</style>
