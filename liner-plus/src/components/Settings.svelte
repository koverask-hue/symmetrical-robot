<script lang="ts">
  import Modal from './Modal.svelte';
  import { library, type VisualsMode } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { ui } from '../lib/ui.svelte';

  const s = $derived(library.settings);
  const VISUALS: [VisualsMode, string][] = [
    ['reactive', 'Reactive'],
    ['calm', 'Calm'],
    ['off', 'Off'],
  ];
</script>

<Modal title="Settings" onclose={() => (ui.settingsOpen = false)}>
  <div class="row">
    <div><div class="name">Background</div><div class="hint">Reactive pulses with the music. Calm drifts slowly at 30 fps. Off saves the most battery.</div></div>
    <div class="seg">
      {#each VISUALS as [v, label] (v)}
        <button class:on={s.visuals === v} onclick={() => library.updateSettings({ visuals: v })}>{label}</button>
      {/each}
    </div>
  </div>
  <div class="row">
    <div><div class="name">Crossfade</div><div class="hint">{s.crossfade ? `${s.crossfade}s overlap between songs` : 'Off. Songs play back to back with no gap.'}</div></div>
    <input type="range" min="0" max="12" step="1" value={s.crossfade} oninput={(e) => player.setCrossfade(+e.currentTarget.value)} aria-label="Crossfade seconds" />
  </div>
  <div class="row">
    <div><div class="name">Autoplay</div><div class="hint">Keep playing similar songs when the queue ends.</div></div>
    <input type="checkbox" checked={s.autoplay} onchange={(e) => library.updateSettings({ autoplay: e.currentTarget.checked })} aria-label="Autoplay" />
  </div>
  <div class="row">
    <div><div class="name">Romanize lyrics</div><div class="hint">Shows a Latin reading under Cyrillic, Greek, Korean and Japanese kana lines.</div></div>
    <input type="checkbox" checked={s.romanize} onchange={(e) => library.updateSettings({ romanize: e.currentTarget.checked })} aria-label="Romanize lyrics" />
  </div>
  <p class="about">
    Verse is open source (MIT). Lyrics come from <a href="https://lrclib.net" target="_blank" rel="noreferrer">LRCLIB</a>. It's an unofficial YouTube Music client
    and isn't affiliated with or endorsed by YouTube or Google.
  </p>
</Modal>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }
  .name {
    font-weight: 600;
  }
  .hint {
    font-size: 12.5px;
    color: var(--text-3);
  }
  .seg {
    display: flex;
    flex: none;
    padding: 3px;
    border-radius: 999px;
    background: var(--hover);
  }
  .seg button {
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-2);
  }
  .seg button.on {
    background: var(--text);
    color: #111;
  }
  input[type='range'] {
    accent-color: var(--accent);
    width: 140px;
  }
  input[type='checkbox'] {
    accent-color: var(--accent);
    width: 18px;
    height: 18px;
  }
  .about {
    font-size: 12.5px;
    color: var(--text-3);
    margin: 16px 0 0;
  }
  .about a {
    color: var(--text-2);
  }
</style>
