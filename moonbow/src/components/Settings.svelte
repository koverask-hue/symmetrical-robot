<script lang="ts">
  import Modal from './Modal.svelte';
  import { library, type VisualsMode } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { ui } from '../lib/ui.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import Logo from './Logo.svelte';

  const s = $derived(library.settings);
  const VISUALS: [VisualsMode, string][] = [
    ['reactive', 'Reactive'],
    ['calm', 'Calm'],
    ['off', 'Off'],
  ];
</script>

<Modal title="Settings" onclose={() => (ui.settingsOpen = false)}>
  <div class="row">
    <div><div class="name">Your name</div><div class="hint">How Moonbow greets you.</div></div>
    <input class="txt" value={taste.state.name} onchange={(e) => taste.setName(e.currentTarget.value)} maxlength="32" aria-label="Your name" />
  </div>
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
  <div class="brand"><Logo size={34} wordmark /></div>
  <p class="about">
    Moonbow is open source (MIT). Your taste profile never leaves this computer. Lyrics come from <a href="https://lrclib.net" target="_blank" rel="noreferrer">LRCLIB</a>. It's an unofficial YouTube Music client
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
    border-bottom: 1px solid var(--hair);
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
    color: #0b0814;
  }
  input[type='range'] {
    accent-color: rgb(var(--tint));
    width: 140px;
  }
  input[type='checkbox'] {
    accent-color: rgb(var(--tint));
    width: 18px;
    height: 18px;
  }
  .txt {
    width: 180px;
    height: 36px;
    padding: 0 14px;
    border: 0;
    outline: none;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.07);
    box-shadow: var(--glass-edge);
    font: italic 400 18px var(--serif);
  }
  .brand {
    margin-top: 22px;
  }
  .about {
    font-size: 12.5px;
    color: var(--text-3);
    margin: 10px 0 0;
  }
  .about a {
    color: var(--text-2);
  }
</style>
