<script lang="ts">
  // The queue panel: what's playing, what comes next, and how autoplay picks it.
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { STEERS } from '../lib/taste/recommend';
  import { artistLine, type Track } from '../lib/sources/types';

  let dragFrom = $state<number | null>(null);
  let dragOver = $state<number | null>(null);

  const cur = $derived(player.current);
  const upcoming = $derived(player.queue.map((t, i) => ({ t, i })).filter((x) => x.i > player.index));

  function drop(i: number) {
    if (dragFrom !== null && dragFrom !== i) player.moveItem(dragFrom, i);
    dragFrom = dragOver = null;
  }
</script>

{#snippet row(t: Track, i: number, current: boolean)}
  <div
    class="item"
    class:current
    class:over={dragOver === i && dragFrom !== i}
    class:dragging={dragFrom === i}
    role="listitem"
    draggable={!current}
    ondragstart={(e) => {
      dragFrom = i;
      e.dataTransfer?.setData('text/plain', String(i));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    }}
    ondragend={() => (dragFrom = dragOver = null)}
    ondragover={(e) => {
      if (dragFrom === null || current) return;
      e.preventDefault();
      dragOver = i;
    }}
    ondragleave={() => dragOver === i && (dragOver = null)}
    ondrop={() => drop(i)}
    ondblclick={() => player.playAt(i)}
    onpointerenter={() => !current && player.warm(t)}
    oncontextmenu={(e) => ui.openMenu(e, t)}
  >
    <button class="art" onclick={() => player.playAt(i)} aria-label={`Play ${t.title}`}>
      <Art src={t.art} size={40} radius={5} />
      {#if current && player.playing}
        <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
      {/if}
    </button>
    <div class="meta">
      <div class="title ellipsis" title={t.title}>{t.title}</div>
      {#if player.reasons[t.id] && !current}
        <div class="reason ellipsis" title={player.reasons[t.id]}>{player.reasons[t.id]}</div>
      {:else}
        <div class="sub ellipsis">{artistLine(t)}</div>
      {/if}
    </div>
    {#if !current}
      <button class="icon-btn rm" onclick={() => player.removeAt(i)} aria-label="Remove from queue" title="Remove"><Icon name="close" size={14} /></button>
    {/if}
  </div>
{/snippet}

<aside class="queue" aria-label="Queue">
  <header>
    <h2 class="h2">Queue</h2>
    <button class="icon-btn close" onclick={() => (ui.queueOpen = false)} aria-label="Close queue" title="Close (Q)"><Icon name="close" size={17} /></button>
  </header>

  <section class="steer">
    <div class="steer-head">
      <span class="label">Autoplay · picks what comes next</span>
      <button
        class="chip auto"
        class:on={library.settings.autoplay}
        onclick={() => library.updateSettings({ autoplay: !library.settings.autoplay })}
        aria-pressed={library.settings.autoplay}
        title="When the queue runs out, keep playing songs picked for you"
      >
        <Icon name="infinity" size={14} />
        {library.settings.autoplay ? 'On' : 'Off'}
      </button>
    </div>
    <div class="chips" class:dim={!library.settings.autoplay}>
      {#each STEERS as s (s.id)}
        <button class="chip" class:on={player.steer === s.id} onclick={() => player.setSteer(s.id)} title={s.hint} aria-pressed={player.steer === s.id}>{s.label}</button>
      {/each}
    </div>
  </section>

  <div class="items scroll">
    {#if cur}
      <div class="label sec">Now playing</div>
      {@render row(cur, player.index, true)}

      <div class="label sec">
        Next up
        {#if upcoming.length}<span class="count num">{upcoming.length}</span>{/if}
      </div>
      {#each upcoming as x (x.t.id + ':' + x.i)}
        {@render row(x.t, x.i, false)}
      {:else}
        <div class="empty">
          {library.settings.autoplay ? 'Autoplay will pick what comes next.' : 'Nothing queued. Turn on autoplay to keep the music going.'}
        </div>
      {/each}
    {:else}
      <div class="empty big">
        <Icon name="queue" size={22} />
        <p>Nothing queued.</p>
        <p class="faint">Play a song and similar tracks will follow.</p>
      </div>
    {/if}
  </div>

  {#if upcoming.length}
    <footer>
      <button class="chip quiet" onclick={() => player.clearUpcoming()}><Icon name="trash" size={13} /> Clear upcoming</button>
      <span class="label">drag to reorder</span>
    </footer>
  {/if}
</aside>

<style>
  .queue {
    position: fixed;
    top: 0;
    right: 0;
    bottom: var(--bar);
    width: 360px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    background: var(--bg-1);
    box-shadow: inset 1px 0 0 var(--hair), -24px 0 48px -24px rgb(0 0 0 / 0.6);
    animation: slide 0.2s var(--ease) both;
  }
  @keyframes slide {
    from {
      transform: translateX(24px);
      opacity: 0;
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 12px 10px 20px;
  }
  .close {
    width: 32px;
    height: 32px;
  }

  .steer {
    padding: 4px 20px 14px;
    box-shadow: inset 0 -1px 0 var(--hair);
  }
  .steer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  .auto {
    height: 24px;
    padding: 0 9px;
    font-size: 11.5px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    transition: opacity 0.15s;
  }
  .chips.dim {
    opacity: 0.45;
  }

  .items {
    flex: 1;
    padding: 4px 10px 16px;
  }
  .sec {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 10px 6px;
  }
  .count {
    color: var(--text-4);
    letter-spacing: 0;
  }

  .item {
    position: relative;
    display: grid;
    grid-template-columns: 40px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 6px 8px;
    border-radius: 8px;
    transition: background 0.12s;
  }
  .item[draggable='true'] {
    cursor: grab;
  }
  .item:hover {
    background: var(--bg-3);
  }
  .item.over::before {
    content: '';
    position: absolute;
    left: 8px;
    right: 8px;
    top: -1px;
    height: 2px;
    border-radius: 1px;
    background: var(--accent);
  }
  .item.dragging {
    opacity: 0.4;
  }
  .item.current .title {
    color: var(--accent);
  }
  .art {
    position: relative;
    border-radius: 5px;
  }
  .eq {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 2px;
    padding-bottom: 11px;
    border-radius: 5px;
    background: rgb(0 0 0 / 0.5);
  }
  .eq i {
    width: 3px;
    height: 16px;
    border-radius: 1px;
    background: var(--accent);
    transform-origin: bottom;
    animation: eq 0.9s infinite alternate var(--ease);
  }
  .eq i:nth-child(2) {
    animation-delay: -0.3s;
  }
  .eq i:nth-child(3) {
    animation-delay: -0.6s;
  }
  @keyframes eq {
    from {
      transform: scaleY(0.25);
    }
  }
  .meta {
    min-width: 0;
  }
  .title {
    font-size: 13.5px;
    font-weight: 540;
    line-height: 1.35;
  }
  .sub {
    font-size: 12px;
    color: var(--text-3);
    line-height: 1.35;
  }
  .reason {
    font-size: 11px;
  }
  .rm {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    opacity: 0;
  }
  .item:hover .rm,
  .rm:focus-visible {
    opacity: 1;
  }
  .empty {
    padding: 14px 10px;
    font-size: 12.5px;
    color: var(--text-3);
  }
  .empty.big {
    padding: 56px 20px;
    text-align: center;
    color: var(--text-2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .empty.big :global(svg) {
    color: var(--text-4);
    margin-bottom: 10px;
  }
  .empty p {
    margin: 0;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    box-shadow: inset 0 1px 0 var(--hair);
  }
  .quiet {
    background: none;
    color: var(--text-3);
  }
  .quiet:hover {
    color: var(--text);
  }
  footer .label {
    color: var(--text-4);
  }
</style>
