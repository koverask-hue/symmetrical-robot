<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Loading from '../components/Loading.svelte';
  import MixHero from '../components/MixHero.svelte';
  import Shelf from '../components/Shelf.svelte';
  import WorldCard from '../components/WorldCard.svelte';
  import { source } from '../lib/sources';
  import { library } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { personalLine, type Mix } from '../lib/taste/recommend';
  import { loader } from '../lib/util/load.svelte';
  import type { Shelf as ShelfT } from '../lib/sources/types';

  const yt = loader(() => source.home());
  yt.run();

  $effect(() => {
    if (taste.loaded && taste.state.onboarded) void taste.buildMixes();
  });

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const stamp = now.toLocaleDateString('en', { weekday: 'long' }) + ' · ' + now.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });

  const name = $derived((taste.version, taste.state.name));
  const line = $derived((taste.version, personalLine(taste.state, taste.ctx())));
  const m = $derived(taste.mixes);

  const asShelf = (mix: Mix): ShelfT => ({ title: mix.title, items: mix.tracks.map((track) => ({ type: 'track', track })) });
  const playFrom = (mix: Mix) => (i: number) => player.playTracks(mix.tracks, i, { reasons: mix.reasons });

  const jump = $derived<ShelfT | null>(
    library.history.length ? { title: 'Pick up', items: library.history.slice(0, 14).map((track) => ({ type: 'track', track })) } : null,
  );
</script>

<div class="page">
  <header class="hello enter">
    <div class="kicker">{stamp}</div>
    <h1 class="display">
      {greeting}{#if name}, <em class="iris-text">{name}</em>{/if}.
    </h1>
    <p class="line">{line}</p>
  </header>

  {#if m.now}
    <MixHero mix={m.now} />
  {:else if taste.building}
    <div class="skeleton hero-skel"></div>
  {:else if !taste.hasTaste}
    <section class="cold enter">
      <div class="kicker">Learning you</div>
      <h2 class="display small">Every song you play <em>teaches me</em>.</h2>
      <p class="muted">Finish it, skip it, replay it, love it. I notice when you listen and what it sounds like. Your first mix appears after a few songs.</p>
    </section>
  {/if}

  {#if m.worlds.length}
    <section class="enter">
      <header class="sh">
        <h2 class="section-title">Your <em>worlds</em></h2>
        <p class="note">The corners of your taste I've found so far. Each one is its own endless mix.</p>
      </header>
      <div class="worlds">
        {#each m.worlds as w (w.id)}<WorldCard mix={w} />{/each}
      </div>
    </section>
  {/if}

  {#if m.fresh}<Shelf shelf={asShelf(m.fresh)} accent="for you" note={m.fresh.subtitle} reasons={m.fresh.reasons} onplay={playFrom(m.fresh)} />{/if}
  {#if m.repeat}<Shelf shelf={asShelf(m.repeat)} note={m.repeat.subtitle} reasons={m.repeat.reasons} onplay={playFrom(m.repeat)} />{/if}
  {#if m.rotation}<Shelf shelf={asShelf(m.rotation)} note={m.rotation.subtitle} reasons={m.rotation.reasons} onplay={playFrom(m.rotation)} />{/if}
  {#if jump && !m.repeat}<Shelf shelf={jump} accent="where you left off" />{/if}

  {#if taste.hasTaste}
    <div class="refresh">
      <button class="chip" onclick={() => taste.buildMixes(true)} disabled={taste.building}>
        <Icon name="refresh" size={14} /> {taste.building ? 'Listening to your taste…' : 'Rebuild my mixes'}
      </button>
    </div>
  {/if}

  <div class="divider"><span class="kicker">From YouTube Music</span></div>
  {#if yt.state.loading && !yt.state.data}
    <Loading />
  {:else if yt.state.error}
    <Loading error={yt.state.error} retry={yt.run} />
  {:else}
    {#each yt.state.data ?? [] as shelf, i (i)}<Shelf {shelf} />{/each}
  {/if}
</div>

<style>
  .hello {
    padding: 34px 12px 44px;
  }
  .hello .display {
    margin: 14px 0 16px;
  }
  .line {
    margin: 0;
    max-width: 640px;
    font: italic 400 22px/1.35 var(--serif);
    color: var(--text-2);
  }
  .hero-skel {
    height: 380px;
    border-radius: 40px;
    margin-bottom: 64px;
  }
  .cold {
    padding: 40px 48px;
    margin-bottom: 64px;
    border-radius: 40px;
    background: rgb(14 10 26 / 0.4);
    box-shadow: var(--glass-edge);
    backdrop-filter: blur(24px);
  }
  .cold .small {
    font-size: 48px;
    margin: 12px 0;
  }
  .cold p {
    max-width: 560px;
    margin: 0;
    font-size: 15px;
  }
  .sh {
    padding: 0 12px 6px;
  }
  .sh em {
    color: rgb(var(--tint));
  }
  .note {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--text-3);
  }
  .worlds {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    margin-bottom: 48px;
  }
  .refresh {
    display: flex;
    justify-content: center;
    margin: -20px 0 40px;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 20px 12px 30px;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--hair), transparent);
  }
</style>
