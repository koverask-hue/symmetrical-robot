<script lang="ts">
  import Modal from './Modal.svelte';
  import Logo from './Logo.svelte';
  import Icon from './Icon.svelte';
  import { library, type Accent } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { ui } from '../lib/ui.svelte';
  import { taste } from '../lib/taste/store.svelte';

  const s = $derived(library.settings);
  const ACCENTS: [Accent, string, string][] = [
    ['volt', 'Volt', '#d4ff3f'],
    ['ice', 'Ice', '#7fe3ff'],
    ['ember', 'Ember', '#ff7a45'],
    ['orchid', 'Orchid', '#c7a2ff'],
    ['silver', 'Silver', '#e9e9ec'],
  ];
  const ambient = $derived(s.visuals !== 'off');
</script>

{#snippet toggle(on: boolean, label: string, set: (v: boolean) => void)}
  <button class="sw" class:on role="switch" aria-checked={on} aria-label={label} onclick={() => set(!on)}><i></i></button>
{/snippet}

<Modal title="Settings" onclose={() => (ui.settingsOpen = false)}>
  <section>
    <h4 class="label">Profile</h4>
    <div class="row">
      <div><div class="name">Your name</div><div class="hint">How Moonbow greets you.</div></div>
      <input class="txt" value={taste.state.name} onchange={(e) => taste.setName(e.currentTarget.value)} maxlength="32" aria-label="Your name" placeholder="Name" />
    </div>
  </section>

  <section>
    <h4 class="label">Look</h4>
    <div class="row">
      <div><div class="name">Accent</div><div class="hint">One colour for buttons, progress and the little dots.</div></div>
      <div class="swatches" role="radiogroup" aria-label="Accent colour">
        {#each ACCENTS as [id, label, hex] (id)}
          <button
            class="swatch"
            class:on={s.accent === id}
            style:--c={hex}
            role="radio"
            aria-checked={s.accent === id}
            aria-label={label}
            title={label}
            onclick={() => library.updateSettings({ accent: id })}
          >{#if s.accent === id}<Icon name="check" size={12} stroke={2.6} />{/if}</button>
        {/each}
      </div>
    </div>
    <div class="row">
      <div><div class="name">Ambient light</div><div class="hint">A faint glow from the playing cover behind the app. Off saves the most battery.</div></div>
      {@render toggle(ambient, 'Ambient light', (v) => library.updateSettings({ visuals: v ? 'reactive' : 'off' }))}
    </div>
  </section>

  <section>
    <h4 class="label">Playback</h4>
    <div class="row">
      <div>
        <div class="name">Crossfade <span class="num val">{s.crossfade ? `${s.crossfade}s` : 'off'}</span></div>
        <div class="hint">{s.crossfade ? `${s.crossfade}s overlap between songs.` : 'Songs play back to back with no gap.'}</div>
      </div>
      <input type="range" min="0" max="12" step="1" value={s.crossfade} style:--v={s.crossfade / 12}
        oninput={(e) => player.setCrossfade(+e.currentTarget.value)} aria-label="Crossfade seconds" />
    </div>
    <div class="row">
      <div><div class="name">Volume normalization</div><div class="hint">Keeps loud and quiet songs at a similar level.</div></div>
      {@render toggle(s.normalize, 'Volume normalization', (v) => player.setNormalize(v))}
    </div>
    <div class="row">
      <div><div class="name">Autoplay</div><div class="hint">Keep playing similar songs when the queue ends.</div></div>
      {@render toggle(s.autoplay, 'Autoplay', (v) => library.updateSettings({ autoplay: v }))}
    </div>
  </section>

  <section>
    <h4 class="label">Lyrics</h4>
    <div class="row">
      <div><div class="name">Romanize</div><div class="hint">Shows a Latin reading under Cyrillic, Greek, Korean and Japanese kana lines.</div></div>
      {@render toggle(s.romanize, 'Romanize lyrics', (v) => library.updateSettings({ romanize: v }))}
    </div>
  </section>

  <section class="about-sec">
    <h4 class="label">About</h4>
    <div class="brand"><Logo size={26} wordmark /><span class="label ver">Open source · MIT</span></div>
    <p class="about">
      Your taste profile never leaves this computer. Lyrics come from <a href="https://lrclib.net" target="_blank" rel="noreferrer">LRCLIB</a>. Moonbow is an unofficial YouTube Music client
      and isn't affiliated with or endorsed by YouTube or Google.
    </p>
  </section>
</Modal>

<style>
  section {
    padding: 18px 0 6px;
    border-top: 1px solid var(--hair);
  }
  section:first-child {
    border-top: 0;
    padding-top: 4px;
  }
  h4 {
    margin: 0 0 4px;
    color: var(--text-4);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 10px 0;
  }
  .name {
    font-size: 13.5px;
    font-weight: 560;
  }
  .val {
    margin-left: 6px;
    font-size: 11.5px;
    font-weight: 450;
    color: var(--accent);
  }
  .hint {
    margin-top: 2px;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--text-3);
  }

  /* switch */
  .sw {
    position: relative;
    flex: none;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: var(--bg-4);
    box-shadow: inset 0 0 0 1px var(--hair);
    transition: background 0.18s var(--ease);
  }
  .sw i {
    position: absolute;
    left: 2px;
    top: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-2);
    transition: transform 0.18s var(--ease), background 0.18s;
  }
  .sw.on {
    background: var(--accent);
    box-shadow: none;
  }
  .sw.on i {
    transform: translateX(16px);
    background: var(--accent-ink);
  }
  .sw:focus-visible {
    border-radius: 999px;
  }

  /* accent swatches */
  .swatches {
    display: flex;
    gap: 8px;
    flex: none;
  }
  .swatch {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--c);
    color: #0a0a0a;
    transition: transform 0.15s var(--ease), box-shadow 0.15s;
  }
  .swatch:hover {
    transform: scale(1.1);
  }
  .swatch.on {
    box-shadow: 0 0 0 2px var(--bg-1), 0 0 0 3.5px var(--c);
  }
  .swatch:focus-visible {
    border-radius: 50%;
  }

  /* slider */
  input[type='range'] {
    flex: none;
    width: 140px;
    appearance: none;
    height: 4px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent) calc(var(--v) * 100%), var(--bg-4) calc(var(--v) * 100%));
    outline: none;
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text);
    box-shadow: 0 0 0 3px var(--bg-1);
  }

  .txt {
    flex: none;
    width: 190px;
    height: 34px;
    padding: 0 12px;
    border: 0;
    outline: none;
    border-radius: 8px;
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair);
    font-size: 13.5px;
    transition: box-shadow 0.15s;
  }
  .txt:focus,
  .txt:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .txt::placeholder {
    color: var(--text-4);
  }

  .brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 12px 0 0;
  }
  .ver {
    color: var(--text-4);
  }
  .about {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--text-3);
    margin: 10px 0 8px;
  }
  .about a {
    color: var(--text-2);
    text-underline-offset: 3px;
    text-decoration-color: var(--hair-2);
  }
  .about a:hover {
    color: var(--accent);
  }
</style>
