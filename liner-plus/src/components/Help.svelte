<script lang="ts">
  import Modal from './Modal.svelte';
  import { ui } from '../lib/ui.svelte';

  const KEYS: [string, string][] = [
    ['Space', 'Play / pause'],
    ['Shift + → / ←', 'Next / previous track'],
    ['→ / ←', 'Seek 5 seconds'],
    ['↑ / ↓', 'Volume'],
    ['M', 'Mute'],
    ['L', 'Lyrics'],
    ['Q', 'Queue'],
    ['S', 'Shuffle'],
    ['R', 'Repeat'],
    ['F', 'Like current song'],
    ['[ / ]', 'Lyrics later / earlier'],
    ['Ctrl + K  or  /', 'Search & commands'],
    ['Alt + ← / →', 'Back / forward'],
    ['Esc', 'Close'],
    ['?', 'This list'],
  ];
</script>

<Modal title="Keyboard shortcuts" onclose={() => (ui.helpOpen = false)}>
  <dl>
    {#each KEYS as [k, v] (k)}
      <dt><kbd>{k}</kbd></dt>
      <dd>{v}</dd>
    {/each}
  </dl>
</Modal>

<style>
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px 18px;
    margin: 0;
    align-items: center;
  }
  dd {
    margin: 0;
    color: var(--text-2);
  }
</style>
