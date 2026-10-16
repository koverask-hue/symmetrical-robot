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
    <div class="top enter">
      <Logo size={30} wordmark />
      {#if step < 3}<span class="label steps"><b>0{step + 1}</b> / 03</span>{/if}
    </div>

    {#if step === 0}
      <div class="step enter">
        <span class="label">Welcome</span>
        <h1 class="h1 big">Hello. I'm a music player that <span class="accent">learns you</span>.</h1>
        <p class="lede">Everything I learn stays on this computer. First, what should I call you?</p>
        <form onsubmit={(e) => { e.preventDefault(); step = 1; }}>
          <input bind:this={input} bind:value={name} class="name" placeholder="Your name" maxlength="32" aria-label="Your name" />
          <button class="btn primary lg" type="submit">Continue <Icon name="forward" size={16} /></button>
        </form>
        <p class="hint label">Press <kbd>Enter</kbd> to continue</p>
      </div>
    {:else if step === 1}
      <div class="step enter">
        <span class="label">Your artists</span>
        <h1 class="h1">{name ? `${name}, who` : 'Who'} do you <span class="accent">love</span>?</h1>
        <p class="lede">Pick three or more artists. They're where I start; your listening takes it from there.</p>
        <div class="search">
          <Icon name="search" size={17} />
          <input bind:this={input} bind:value={query} placeholder="Search for an artist" aria-label="Search artists" />
          {#if query}<button class="clear" onclick={() => (query = '')} aria-label="Clear search"><Icon name="close" size={14} /></button>{/if}
        </div>
        <div class="wall scroll">
          {#each wall as a (a.id)}
            <button class="artist" class:on={isPicked(a)} onclick={() => toggle(a)} aria-pressed={isPicked(a)}>
              <span class="ph">
                {#if a.art}<img src={a.art} alt="" loading="lazy" />{:else}<span class="initial" aria-hidden="true">{a.title[0]}</span>{/if}
                {#if isPicked(a)}<span class="tick"><Icon name="check" size={12} stroke={2.6} /></span>{/if}
              </span>
              <span class="nm ellipsis">{a.title}</span>
            </button>
          {:else}
            <p class="faint none">{results ? 'No artists found. Try another spelling.' : 'Search for anyone you love.'}</p>
          {/each}
        </div>
        <div class="foot">
          <button class="btn ghost" onclick={() => { taste.setName(name); taste.skipOnboarding(); }}>Skip. I'll just play</button>
          <div class="right">
            <span class="dots" aria-hidden="true">
              {#each [0, 1, 2] as i (i)}<i class:on={picked.length > i}></i>{/each}
            </span>
            <button class="btn primary lg" disabled={picked.length < 1} onclick={() => (step = 2)}>
              {picked.length < 3 ? `${picked.length} picked` : 'Next'} <Icon name="forward" size={16} />
            </button>
          </div>
        </div>
      </div>
    {:else if step === 2}
      <div class="step enter">
        <span class="label">Discovery</span>
        <h1 class="h1">How <span class="accent">adventurous</span> are you?</h1>
        <p class="lede">I'll keep adjusting this from how you react to songs you've never heard.</p>
        <div class="adv">
          <div class="val"><span class="num">{Math.round(adventurous * 100)}</span><span class="label">% new music</span></div>
          <input type="range" min="0" max="1" step="0.05" bind:value={adventurous} aria-label="Adventurousness" style:--v={adventurous} />
          <div class="ends label"><span>Keep me close to what I love</span><span>Surprise me</span></div>
        </div>
        <div class="foot">
          <button class="btn ghost" onclick={() => (step = 1)}><Icon name="back" size={16} /> Back</button>
          <button class="btn primary lg" onclick={finish}>Tune Moonbow to me <Icon name="sparkles" size={16} /></button>
        </div>
      </div>
    {:else}
      <div class="step tuning enter">
        <div class="spin" class:done={!tuning} aria-hidden="true"><span></span></div>
        <h1 class="h2 t">{tuning ? 'Listening to your taste…' : 'Ready.'}</h1>
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
    padding: 40px 24px;
    background: rgb(7 7 8 / 0.96);
    overflow-y: auto;
  }
  .inner {
    width: min(760px, 100%);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 56px;
  }
  .steps {
    color: var(--text-4);
  }
  .steps b {
    font-weight: 500;
    color: var(--text);
  }
  .step > .label {
    display: block;
    margin-bottom: 14px;
  }
  .h1 {
    font-size: clamp(36px, 4.6vw, 54px);
  }
  .h1.big {
    font-size: clamp(40px, 5.4vw, 64px);
  }
  .lede {
    margin: 16px 0 32px;
    max-width: 540px;
    font-size: 16px;
    color: var(--text-2);
  }
  form {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .name {
    flex: 1;
    max-width: 440px;
    height: 56px;
    padding: 0 20px;
    border: 0;
    outline: none;
    border-radius: 12px;
    font: 500 24px var(--sans);
    letter-spacing: -0.025em;
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair);
    transition: box-shadow 0.15s;
  }
  .name:focus-visible,
  .search input:focus-visible {
    outline: none;
  }
  .name:hover {
    box-shadow: inset 0 0 0 1px var(--hair-2);
  }
  .name:focus {
    box-shadow: inset 0 0 0 1px var(--accent), 0 0 0 3px rgb(var(--accent-rgb) / 0.18);
  }
  .name::placeholder {
    color: var(--text-4);
  }
  .btn.lg {
    height: 48px;
    padding: 0 22px;
    font-size: 14px;
  }
  .btn.ghost {
    background: none;
    box-shadow: none;
    color: var(--text-3);
    padding: 0 6px;
  }
  .btn.ghost:hover {
    color: var(--text);
  }
  .hint {
    margin: 14px 0 0;
    color: var(--text-4);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 420px;
    height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    color: var(--text-3);
    background: var(--bg-2);
    box-shadow: inset 0 0 0 1px var(--hair);
    margin-bottom: 22px;
    transition: box-shadow 0.15s;
  }
  .search:focus-within {
    box-shadow: inset 0 0 0 1px var(--accent), 0 0 0 3px rgb(var(--accent-rgb) / 0.18);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: none;
    font-size: 14.5px;
    color: var(--text);
  }
  .search input::placeholder {
    color: var(--text-4);
  }
  .clear {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    color: var(--text-3);
  }
  .clear:hover {
    color: var(--text);
    background: var(--bg-4);
  }
  .wall {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 20px 8px;
    max-height: 44vh;
    padding: 6px 4px 16px;
    margin: 0 -4px;
  }
  .none {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 13.5px;
  }
  .artist {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 4px 2px;
    border-radius: 10px;
  }
  .ph {
    position: relative;
    width: 88px;
    height: 88px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--bg-3);
    box-shadow: 0 0 0 0 transparent;
    transition: transform 0.2s var(--ease), box-shadow 0.15s;
  }
  .ph img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
  .initial {
    font: 600 30px var(--sans);
    letter-spacing: -0.03em;
    color: var(--text-3);
  }
  .artist:hover .ph {
    transform: scale(1.04);
  }
  .artist.on .ph {
    box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--accent);
  }
  .tick {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent);
    color: var(--accent-ink);
    box-shadow: 0 0 0 3px var(--bg);
    animation: tick 0.18s var(--ease);
  }
  @keyframes tick {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
  }
  .nm {
    max-width: 100%;
    font-size: 12.5px;
    color: var(--text-2);
  }
  .artist.on .nm {
    color: var(--text);
    font-weight: 540;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--hair);
  }
  .right {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .dots {
    display: flex;
    gap: 5px;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--bg-4);
    transition: background 0.15s;
  }
  .dots i.on {
    background: var(--accent);
  }
  .adv {
    max-width: 600px;
    margin: 8px 0 12px;
  }
  .val {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 18px;
  }
  .val .num {
    font-size: 40px;
    font-weight: 500;
    line-height: 1;
    color: var(--accent);
  }
  .adv input {
    width: 100%;
    appearance: none;
    height: 4px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent) calc(var(--v) * 100%), var(--bg-4) calc(var(--v) * 100%));
    outline: none;
    cursor: pointer;
  }
  .adv input::-webkit-slider-thumb {
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--text);
    box-shadow: 0 0 0 5px var(--bg), 0 0 0 6px var(--hair-2);
    cursor: grab;
    transition: transform 0.15s var(--ease);
  }
  .adv input:active::-webkit-slider-thumb {
    transform: scale(1.12);
    cursor: grabbing;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: 16px;
  }
  .tuning {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 40px 0;
  }
  .tuning .lede {
    margin: 10px 0 0;
    min-height: 1.5em;
  }
  .spin {
    position: relative;
    width: 64px;
    height: 64px;
    margin-bottom: 28px;
  }
  .spin::before,
  .spin span {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
  }
  .spin::before {
    box-shadow: inset 0 0 0 2px var(--bg-3);
  }
  .spin span {
    border: 2px solid transparent;
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
  }
  .spin::after {
    content: '';
    position: absolute;
    inset: 26px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.4s var(--ease) infinite;
  }
  .spin.done span {
    animation: none;
    border-color: var(--accent);
  }
  .spin.done::after {
    animation: none;
  }
  .t {
    font-size: 28px;
    letter-spacing: -0.035em;
  }
  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }
  @keyframes pulse {
    50% {
      transform: scale(0.5);
      opacity: 0.4;
    }
  }
</style>
