<script lang="ts">
  import Art from './Art.svelte';
  import Icon from './Icon.svelte';
  import { player } from '../lib/player/player.svelte';
  import { library } from '../lib/library.svelte';
  import { ui } from '../lib/ui.svelte';
  import { artistLine } from '../lib/sources/types';

  let dragFrom = $state<number | null>(null);
  let dragOver = $state<number | null>(null);

  function drop(i: number) {
    if (dragFrom !== null && dragFrom !== i) player.moveItem(dragFrom, i);
    dragFrom = dragOver = null;
  }
</script>

<aside class="queue">
  <header>
    <h3 class="serif qt">Up <em>next</em></h3>
    <div class="actions">
      <button class="chip" class:on={library.settings.autoplay} onclick={() => library.updateSettings({ autoplay: !library.settings.autoplay })} title="When the queue ends, keep playing songs picked for you">
        <Icon name="sparkle" size={15} /> Keep going
      </button>
      <button class="icon-btn" onclick={() => player.clearUpcoming()} aria-label="Clear upcoming" title="Clear upcoming"><Icon name="trash" size={17} /></button>
      <button class="icon-btn" onclick={() => (ui.queueOpen = false)} aria-label="Close queue"><Icon name="close" size={18} /></button>
    </div>
  </header>
  <div class="items scroll">
    {#each player.queue as t, i (t.id + ':' + i)}
      {#if i === player.index + 1}<div class="label">Up next</div>{/if}
      {#if i >= player.index - 3}
        <div
          class="item"
          class:current={i === player.index}
          class:past={i < player.index}
          class:over={dragOver === i}
          role="listitem"
          draggable={i !== player.index}
          ondragstart={() => (dragFrom = i)}
          ondragover={(e) => {
            e.preventDefault();
            dragOver = i;
          }}
          ondragleave={() => dragOver === i && (dragOver = null)}
          ondrop={() => drop(i)}
          ondblclick={() => player.playAt(i)}
          oncontextmenu={(e) => ui.openMenu(e, t)}
        >
          <button onclick={() => player.playAt(i)} aria-label={`Play ${t.title}`}><Art src={t.art} size={40} /></button>
          <div class="meta">
            <div class="title ellipsis">{t.title}</div>
            {#if player.reasons[t.id] && i > player.index}
              <div class="reason ellipsis">{player.reasons[t.id]}</div>
            {:else}
              <div class="sub ellipsis muted">{artistLine(t)}</div>
            {/if}
          </div>
          {#if i !== player.index}
            <button class="icon-btn rm" onclick={() => player.removeAt(i)} aria-label="Remove"><Icon name="close" size={15} /></button>
          {/if}
        </div>
      {/if}
    {:else}
      <div class="empty muted">Nothing queued. Pick a song and similar tracks will follow.</div>
    {/each}
  </div>
</aside>

<style>
  .queue {
    position: absolute;
    top: 14px;
    right: 14px;
    bottom: calc(var(--capsule) + 28px);
    width: 380px;
    border-radius: 30px;
    overflow: hidden;
    z-index: 25;
    display: flex;
    flex-direction: column;
    background: var(--glass-strong);
    backdrop-filter: blur(30px) saturate(1.3);
    box-shadow: var(--glass-edge), var(--lift);
    animation: slide 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes slide {
    from {
      transform: translateX(40px);
      opacity: 0;
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 12px 8px 18px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
    background: var(--hover);
    margin-right: 4px;
  }
  .chip.on {
    color: #111;
    background: var(--text);
  }
  .items {
    flex: 1;
    padding: 4px 8px 16px;
  }
  .qt {
    font-size: 28px;
  }
  .qt em {
    color: rgb(var(--tint));
  }
  .reason {
    font-size: 12.5px;
  }
  .label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-3);
    padding: 14px 10px 6px;
  }
  .item {
    display: grid;
    grid-template-columns: 40px 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 6px 8px;
    border-radius: 10px;
    border-top: 2px solid transparent;
  }
  .item:hover {
    background: var(--hover);
  }
  .item.over {
    border-top-color: rgb(var(--tint));
  }
  .item.current {
    background: rgb(var(--tint) / 0.1);
  }
  .item.current .title {
    color: rgb(var(--tint));
  }
  .item.past {
    opacity: 0.45;
  }
  .meta {
    min-width: 0;
  }
  .title {
    font-weight: 550;
  }
  .sub {
    font-size: 12.5px;
  }
  .rm {
    width: 28px;
    height: 28px;
    opacity: 0;
  }
  .item:hover .rm {
    opacity: 1;
  }
  .empty {
    padding: 30px 12px;
    text-align: center;
  }
</style>
