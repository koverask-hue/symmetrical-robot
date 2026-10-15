<script lang="ts">
  // First run: who you are, who you love, how adventurous you are.
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import { source } from '../lib/sources';
  import { taste } from '../lib/taste/store.svelte';
  import type { CollectionRef } from '../lib/sources/types';
  import { debounce } from '../lib/util/format';

  let step = $state(0);
  let name = $state('');
  let query = $state('');
  let suggestions = $state<CollectionRef[]>([]);
  let results = $state<CollectionRef[] | null>(null);
  let picked = $state<CollectionRef[]>([]);
  let adventurous = $state(0.5);
  let tuning = $state(false);
  let input = $state<HTMLInputElement>();

  // Artists from the YouTube Music home feed make a good first wall to pick from.
  source
    .home()
    .then((shelves) => {
      // Artist cards (with photos) win over artists mentioned on song cards.
      const byId = new Map<string, CollectionRef>();
      for (const sh of shelves)
        for (const it of sh.items) {
          if (it.type === 'collection' && it.ref.kind === 'artist') byId.set(it.ref.id, it.ref);
          if (it.type === 'track')
            for (const a of it.track.artists) if (a.id && !byId.has(a.id)) byId.set(a.id, { kind: 'artist', id: a.id, title: a.name });
        }
      suggestions = [...byId.values()].sort((x, y) => Number(!!y.art) - Number(!!x.art)).slice(0, 18);
    })
    .catch(() => {});

  const search = debounce(async (q: string) => {
    if (!q.trim()) return (results = null);
    try {
      const r = await source.search(q);
      if (q === query) results = r.artists.slice(0, 12);
    } catch {
      results = [];
    }
  }, 250);
  $effect(() => search(query));
  $effect(() => {
    step;
    queueMicrotask(() => input?.focus());
  });

  const isPicked = (a: CollectionRef) => picked.some((p) => p.id === a.id);
  const toggle = (a: CollectionRef) => (picked = isPicked(a) ? picked.filter((p) => p.id !== a.id) : [...picked, a]);
  const wall = $derived([...picked, ...(results ?? suggestions).filter((a) => !isPicked(a))]);

  async function finish() {
    tuning = true;
    step = 3;
    try {
      await taste.onboard(name, picked, adventurous);
    } finally {
      tuning = false;
    }
  }
</script>

<div class="onb">
  <div class="inner">
    <div class="brand enter"><Logo size={44} wordmark /></div>

    {#if step === 0}
      <div class="step enter">
        <h1 class="display">Hello. I'm a music player that <em class="iris-text">learns you</em>.</h1>
        <p class="lede">Everything I learn stays on this computer. First, what should I call you?</p>
        <form onsubmit={(e) => { e.preventDefault(); step = 1; }}>
          <input bind:this={input} bind:value={name} class="name" placeholder="Your name" maxlength="32" aria-label="Your name" />
          <button class="btn primary" type="submit">Continue <Icon name="forward" size={16} /></button>
        </form>
      </div>
    {:else if step === 1}
      <div class="step enter">
        <h1 class="display">{name ? `${name}, who` : 'Who'} do you <em class="iris-text">love</em>?</h1>
        <p class="lede">Pick three or more artists. They're where I start; your listening takes it from there.</p>
        <div class="search">
          <Icon name="search" size={17} />
          <input bind:this={input} bind:value={query} placeholder="Search for an artist" aria-label="Search artists" />
        </div>
        <div class="wall">
          {#each wall as a (a.id)}
            <button class="artist" class:on={isPicked(a)} onclick={() => toggle(a)} aria-pressed={isPicked(a)}>
              <span class="ph">
                {#if a.art}<img src={a.art} alt="" loading="lazy" />{:else}<span class="initial serif" aria-hidden="true">{a.title[0]}</span>{/if}
                {#if isPicked(a)}<span class="tick"><Icon name="plus" size={14} /></span>{/if}
              </span>
              <span class="nm ellipsis">{a.title}</span>
            </button>
          {:else}
            <p class="faint none">{results ? 'No artists found. Try another spelling.' : 'Search for anyone you love.'}</p>
          {/each}
        </div>
        <div class="foot">
          <button class="chip" onclick={() => { taste.setName(name); taste.skipOnboarding(); }}>Skip. I'll just play</button>
          <button class="btn primary" disabled={picked.length < 1} onclick={() => (step = 2)}>
            {picked.length < 3 ? `${picked.length} picked` : 'Next'} <Icon name="forward" size={16} />
          </button>
        </div>
      </div>
    {:else if step === 2}
      <div class="step enter">
        <h1 class="display">How <em class="iris-text">adventurous</em> are you?</h1>
        <p class="lede">I'll keep adjusting this from how you react to songs you've never heard.</p>
        <div class="adv">
          <input type="range" min="0" max="1" step="0.05" bind:value={adventurous} aria-label="Adventurousness" style:--v={adventurous} />
          <div class="ends"><span>Keep me close to what I love</span><span>Surprise me</span></div>
        </div>
        <div class="foot">
          <button class="chip" onclick={() => (step = 1)}>Back</button>
          <button class="btn primary" onclick={finish}>Tune Moonbow to me <Icon name="sparkle" size={16} /></button>
        </div>
      </div>
    {:else}
      <div class="step tuning enter">
        <div class="orb"><div class="core"></div></div>
        <h1 class="display small">{tuning ? 'Listening to your taste…' : 'Ready.'}</h1>
        <p class="lede">{tuning ? `Mapping the neighbourhoods around ${picked.map((p) => p.title).slice(0, 3).join(', ')}.` : ''}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .onb {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 40px;
    background: radial-gradient(120% 90% at 50% 0%, rgb(6 5 11 / 0.2), rgb(6 5 11 / 0.82));
    backdrop-filter: blur(6px);
    overflow-y: auto;
  }
  .inner {
    width: min(880px, 100%);
  }
  .brand {
    margin-bottom: 48px;
  }
  .display {
    font-size: clamp(46px, 6vw, 84px);
  }
  .display.small {
    font-size: 54px;
    text-align: center;
  }
  .lede {
    margin: 18px 0 34px;
    max-width: 560px;
    font-size: 17px;
    color: var(--text-2);
  }
  form {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .name {
    flex: 1;
    max-width: 440px;
    height: 64px;
    padding: 0 26px;
    border: 0;
    outline: none;
    border-radius: 999px;
    font: italic 400 30px var(--serif);
    background: rgb(255 255 255 / 0.06);
    box-shadow: var(--glass-edge);
  }
  .name:focus-visible,
  .search input:focus-visible {
    outline: none;
  }
  .name:focus {
    box-shadow: var(--glass-edge), 0 0 0 1.5px rgb(185 168 255 / 0.6), 0 0 40px rgb(185 168 255 / 0.25);
  }
  .name::placeholder {
    color: var(--text-4);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 480px;
    height: 52px;
    padding: 0 20px;
    border-radius: 999px;
    color: var(--text-3);
    background: rgb(255 255 255 / 0.06);
    box-shadow: var(--glass-edge);
    margin-bottom: 26px;
  }
  .search input {
    flex: 1;
    border: 0;
    outline: none;
    background: none;
    font-size: 16px;
    color: var(--text);
  }
  .wall {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
    gap: 18px 10px;
    max-height: 42vh;
    overflow-y: auto;
    padding: 6px 4px 16px;
    scrollbar-width: thin;
  }
  .none {
    grid-column: 1 / -1;
    margin: 0;
  }
  .artist {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .ph {
    position: relative;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.03));
    transition: transform 0.5s var(--ease), box-shadow 0.5s var(--ease);
  }
  .ph img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
  .initial {
    font-size: 40px;
    color: var(--text-2);
  }
  .artist:hover .ph {
    transform: scale(1.05);
  }
  .artist.on .ph {
    transform: scale(1.06);
    box-shadow: 0 0 0 3px #0b0814, 0 0 0 5px #b9a8ff, 0 0 40px 4px rgb(185 168 255 / 0.5);
  }
  .tick {
    position: absolute;
    right: 0;
    bottom: 2px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--iris);
    color: #0b0814;
    transform: rotate(45deg);
  }
  .tick :global(svg) {
    transform: rotate(-45deg);
  }
  .nm {
    max-width: 100%;
    font-size: 13px;
    color: var(--text-2);
  }
  .artist.on .nm {
    color: var(--text);
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 28px;
  }
  .adv {
    max-width: 620px;
    margin: 20px 0 10px;
  }
  .adv input {
    width: 100%;
    appearance: none;
    height: 10px;
    border-radius: 999px;
    background: linear-gradient(90deg, #b9a8ff calc(var(--v) * 100%), rgb(255 255 255 / 0.1) calc(var(--v) * 100%));
    outline: none;
  }
  .adv input::-webkit-slider-thumb {
    appearance: none;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 0 6px rgb(185 168 255 / 0.25), 0 6px 20px rgb(0 0 0 / 0.5);
    cursor: grab;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: 14px;
    font: italic 400 18px var(--serif);
    color: var(--text-2);
  }
  .tuning {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .orb {
    position: relative;
    width: 180px;
    height: 180px;
    margin-bottom: 36px;
    border-radius: 50%;
    background: conic-gradient(#9fefff, #b9a8ff, #ffaee0, #ffd9a6, #9fefff);
    filter: blur(2px);
    animation: spin 3s linear infinite;
  }
  .core {
    position: absolute;
    inset: 10px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #241b3d, #06050b 70%);
  }
  .orb::after {
    content: '';
    position: absolute;
    inset: -30px;
    border-radius: 50%;
    background: inherit;
    filter: blur(40px);
    opacity: 0.5;
    z-index: -1;
  }
  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }
</style>
