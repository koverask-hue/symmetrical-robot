<script lang="ts">
  import Modal from './Modal.svelte';
  import { ui } from '../lib/ui.svelte';

  // Each key list is a sequence of keys; '/' and 'or' render as quiet separators.
  const GROUPS: [string, [string[], string][]][] = [
    [
      'Playback',
      [
        [['Space'], 'Play / pause'],
        [['⇧', '→', '/', '←'], 'Next / previous track'],
        [['→', '/', '←'], 'Seek 5 seconds'],
        [['↑', '/', '↓'], 'Volume'],
        [['M'], 'Mute'],
        [['S'], 'Shuffle'],
        [['R'], 'Repeat'],
        [['F'], 'Like current song'],
        [['⇧', 'M'], 'More like this'],
      ],
    ],
    [
      'View',
      [
        [['L'], 'Lyrics'],
        [['Q'], 'Queue'],
        [['B'], 'Collapse / expand sidebar'],
        [['[', '/', ']'], 'Lyrics later / earlier'],
      ],
    ],
    [
      'Navigation',
      [
        [['Ctrl', 'K', 'or', '/'], 'Search & commands'],
        [['Alt', '←', '/', '→'], 'Back / forward'],
        [['Esc'], 'Close'],
        [['?'], 'This list'],
      ],
    ],
  ];
  const SEP = new Set(['/', 'or']);
</script>

<Modal title="Keyboard shortcuts" onclose={() => (ui.helpOpen = false)}>
  {#each GROUPS as [group, keys] (group)}
    <section>
      <h4 class="label">{group}</h4>
      <dl>
        {#each keys as [k, v] (v)}
          <div class="row">
            <dt>{v}</dt>
            <dd>
              {#each k as part, i (i)}
                {#if SEP.has(part)}<span class="sep">{part}</span>{:else}<kbd>{part}</kbd>{/if}
              {/each}
            </dd>
          </div>
        {/each}
      </dl>
    </section>
  {/each}
</Modal>

<style>
  section + section {
    margin-top: 18px;
  }
  h4 {
    margin: 0 0 6px;
    color: var(--text-4);
  }
  dl {
    margin: 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: 36px;
    border-bottom: 1px solid var(--hair);
  }
  .row:last-child {
    border-bottom: 0;
  }
  dt {
    font-size: 13.5px;
    color: var(--text-2);
  }
  dd {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  kbd {
    min-width: 20px;
    text-align: center;
    color: var(--text-2);
  }
  .sep {
    font: 10.5px var(--mono);
    color: var(--text-4);
    padding: 0 2px;
  }
</style>
