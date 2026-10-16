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
  import { STEERS } from '../lib/taste/recommend';
  import { toasts } from '../lib/toasts.svelte';

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
    { kind: 'action', label: 'Next track', icon: 'next', run: () => player.next(), keys: '⇧ →' },
    { kind: 'action', label: 'Previous track', icon: 'prev', run: () => player.prev(), keys: '⇧ ←' },
    { kind: 'action', label: 'Show lyrics', icon: 'lyrics', run: () => (ui.lyricsOpen = true), keys: 'L' },
    { kind: 'action', label: 'Show queue', icon: 'queue', run: () => (ui.queueOpen = true), keys: 'Q' },
    { kind: 'action', label: 'Toggle shuffle', icon: 'shuffle', run: () => player.toggleShuffle(), keys: 'S' },
    { kind: 'action', label: 'Cycle repeat', icon: 'repeat', run: () => player.cycleRepeat(), keys: 'R' },
    { kind: 'action', label: 'Like current song', icon: 'heart', run: () => player.current && library.toggleLike(player.current), keys: 'F' },
    { kind: 'action', label: 'More like this', icon: 'wand', run: () => player.moreLikeThis(), keys: '⇧M' },
    { kind: 'action', label: 'Toggle sidebar', icon: 'sidebar', run: () => library.updateSettings({ sidebar: !library.settings.sidebar }), keys: 'B' },
    { kind: 'action', label: 'Sleep timer: 30 min', icon: 'timer', run: () => player.setSleep(30) },
    { kind: 'action', label: 'Sleep timer: end of song', icon: 'timer', run: () => player.setSleep('end') },
    ...STEERS.map((st) => ({
      kind: 'action' as const,
      label: `Steer: ${st.label}`,
      icon: 'steer',
      run: () => {
        player.setSteer(st.id);
        toasts.show(`Steering up next: ${st.label}`);
      },
    })),
    { kind: 'action', label: 'Your sound', icon: 'sparkles', run: () => router.go({ name: 'taste' }) },
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
      {#if !q.trim() && items.length}<div class="sec label">Recent &amp; quick actions</div>{/if}
      {#each items as it, i (i)}
        <button class="item" class:sel={i === sel} role="option" aria-selected={i === sel} onmouseenter={() => (sel = i)} onclick={() => run(it)}>
          {#if it.kind === 'search'}
            <span class="ic"><Icon name="search" size={16} /></span><span class="lbl ellipsis">{it.label}</span><span class="note">Search</span>
          {:else if it.kind === 'track'}
            <span class="ic"><Art src={it.track.art} size={28} /></span>
            <span class="lbl ellipsis">{it.track.title} <span class="by">{artistLine(it.track)}</span></span><span class="note">{it.note}</span>
          {:else if it.kind === 'playlist'}
            <span class="ic"><Icon name="library" size={16} /></span><span class="lbl ellipsis">{it.label}</span><span class="note">Playlist</span>
          {:else}
            <span class="ic"><Icon name={it.icon} size={16} /></span><span class="lbl ellipsis">{it.label}</span>
            {#if it.keys}<kbd>{it.keys}</kbd>{:else}<span class="note">Command</span>{/if}
          {/if}
        </button>
      {/each}
    </div>
    <div class="foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
      <span><kbd>↵</kbd> {items[sel]?.kind === 'search' ? 'search' : items[sel]?.kind === 'track' ? 'play radio' : 'open'}</span>
      <span class="sp"></span>
      <span class="num">{items.length} results</span>
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
    background: rgb(0 0 0 / 0.55);
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
    border-radius: 14px;
    background: var(--bg-1);
    box-shadow: inset 0 0 0 1px var(--hair-2), 0 30px 80px rgb(0 0 0 / 0.6);
    overflow: hidden;
    animation: pop 0.14s var(--ease);
  }
  .palette:focus-visible {
    outline: none;
  }
  @keyframes pop {
    from {
      transform: scale(0.985) translateY(-4px);
      opacity: 0;
    }
  }
  .field {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    height: 56px;
    flex: none;
    border-bottom: 1px solid var(--hair);
    color: var(--text-3);
  }
  input:focus-visible {
    outline: none;
  }
  input {
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    outline: none;
    font: 450 18px var(--sans);
    letter-spacing: -0.02em;
    color: var(--text);
  }
  input::placeholder {
    color: var(--text-4);
  }
  .results {
    padding: 6px;
  }
  .sec {
    padding: 8px 10px 6px;
    color: var(--text-4);
  }
  .item {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 40px;
    padding: 0 10px 0 8px;
    border-radius: 8px;
    text-align: left;
    font-size: 13.5px;
    color: var(--text-2);
  }
  .item.sel {
    background: var(--bg-3);
    color: var(--text);
  }
  .item.sel::before {
    content: '';
    position: absolute;
    left: 0;
    top: 10px;
    bottom: 10px;
    width: 2px;
    border-radius: 2px;
    background: var(--accent);
  }
  .ic {
    flex: none;
    width: 28px;
    display: grid;
    place-items: center;
    color: var(--text-3);
  }
  .item.sel .ic {
    color: var(--text);
  }
  .lbl {
    flex: 1;
    min-width: 0;
  }
  .by {
    margin-left: 6px;
    color: var(--text-3);
  }
  .note {
    flex: none;
    font: 11px var(--mono);
    color: var(--text-4);
  }
  .item.sel .note {
    color: var(--text-3);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: none;
    height: 34px;
    padding: 0 14px;
    border-top: 1px solid var(--hair);
    font: 11px var(--mono);
    color: var(--text-4);
  }
  .foot span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .foot kbd {
    padding: 2px 4px;
    font-size: 10px;
  }
  .sp {
    flex: 1;
  }
</style>
