<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Loading from '../components/Loading.svelte';
  import MixCard from '../components/MixCard.svelte';
  import Mosaic from '../components/Mosaic.svelte';
  import QuickTile from '../components/QuickTile.svelte';
  import Shelf from '../components/Shelf.svelte';
  import { source } from '../lib/sources';
  import { library } from '../lib/library.svelte';
  import { player } from '../lib/player/player.svelte';
  import { router } from '../lib/router.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { personalLine, type Mix } from '../lib/taste/recommend';
  import { artistLine, type Shelf as ShelfT, type Track } from '../lib/sources/types';
  import { loader } from '../lib/util/load.svelte';

  const yt = loader(() => source.home());
  yt.run();

  // Only `loaded` is a dependency. buildMixes reads (and writes) store state before its
  // first await; tracking that would re-run this effect after every build, forever.
  $effect(() => {
    if (taste.loaded) untrack(() => taste.state.onboarded && void taste.buildMixes());
  });

  // The clock in the header ticks quietly.
  let now = $state(new Date());
  $effect(() => {
    const id = setInterval(() => (now = new Date()), 30_000);
    return () => clearInterval(id);
  });
  const hour = $derived(now.getHours());
  const greeting = $derived(hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
  const stamp = $derived(
    now.toLocaleDateString('en', { weekday: 'short' }).toUpperCase() +
      ' · ' +
      now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
  );

  const name = $derived((taste.version, taste.state.name));
  const line = $derived((taste.version, personalLine(taste.state, taste.ctx())));
  const m = $derived(taste.mixes);

  const playMix = (mix: Mix, start = 0) => player.playTracks(mix.tracks, start, { reasons: mix.reasons });
  const shuffleMix = (mix: Mix) => {
    playMix(mix);
    player.toggleShuffle();
  };
  const asShelf = (mix: Mix): ShelfT => ({ title: mix.title, items: mix.tracks.map((track) => ({ type: 'track', track })) });
  const playFrom = (mix: Mix) => (i: number) => playMix(mix, i);

  const allMixes = $derived([m.now, ...m.worlds, m.fresh, m.repeat, m.rotation].filter((x): x is Mix => !!x));

  // ---- quick tiles: mixes, liked songs, then what you played recently ----
  interface Tile {
    key: string;
    title: string;
    arts: (string | undefined)[];
    icon?: string;
    active?: boolean;
    open: () => void;
    play: () => void;
    warm?: () => void;
  }

  async function playAlbum(id: string) {
    try {
      player.playTracks((await source.collection('album', id)).tracks);
    } catch (err) {
      toasts.error(`Couldn't load: ${(err as Error).message}`);
    }
  }

  const tiles = $derived.by<Tile[]>(() => {
    const out: Tile[] = [];
    const cur = player.current?.id;
    const mixTile = (mix: Mix): Tile => ({
      key: 'mix:' + mix.id,
      title: mix.title,
      arts: mix.tracks.map((t) => t.art),
      open: () => router.go({ name: 'mix', id: mix.id }),
      play: () => playMix(mix),
    });
    if (m.now) out.push(mixTile(m.now));
    for (const w of m.worlds) out.push(mixTile(w));
    if (library.liked.length)
      out.push({
        key: 'liked',
        title: 'Liked songs',
        arts: [],
        icon: 'heart-filled',
        open: () => router.go({ name: 'library', tab: 'liked' }),
        play: () => player.playTracks(library.liked),
      });
    const seen = new Set<string>();
    for (const t of library.history) {
      if (out.length >= 8) break;
      const albumId = t.album?.id;
      if (albumId) {
        if (seen.has('a:' + albumId)) continue;
        seen.add('a:' + albumId);
        out.push({
          key: 'album:' + albumId,
          title: t.album!.name,
          arts: [t.art],
          active: !!cur && player.current?.album?.id === albumId,
          open: () => router.go({ name: 'album', id: albumId }),
          play: () => void playAlbum(albumId),
        });
      } else {
        if (seen.has('t:' + t.id)) continue;
        seen.add('t:' + t.id);
        out.push({
          key: 'track:' + t.id,
          title: `${t.title} · ${artistLine(t)}`,
          arts: [t.art],
          active: cur === t.id,
          open: () => player.playRadio(t),
          play: () => player.playRadio(t),
          warm: () => player.warm(t),
        });
      }
    }
    return out.slice(0, 8);
  });

  // ---- hero ----
  const first = $derived<Track | undefined>(m.now?.tracks[0]);
  const firstReason = $derived((m.now && first && m.now.reasons[first.id]) || 'Picked for this moment');

  const jump = $derived<ShelfT | null>(
    library.history.length ? { title: 'Pick up', items: library.history.slice(0, 14).map((track) => ({ type: 'track', track })) } : null,
  );
</script>

<div class="page home">
  <header class="hello enter">
    <span class="label stamp">{stamp}</span>
    <h1 class="h1">{greeting}{#if name}, {name}{/if}.</h1>
    <p class="line">{line}</p>
  </header>

  {#if tiles.length >= 2}
    <div class="tiles enter">
      {#each tiles as t (t.key)}
        <QuickTile title={t.title} arts={t.arts} icon={t.icon} active={t.active} onopen={t.open} onplay={t.play} onwarm={t.warm} />
      {/each}
    </div>
  {/if}

  {#if m.now}
    {@const mix = m.now}
    <section class="hero panel enter">
      <button class="hero-art" onclick={() => router.go({ name: 'mix', id: mix.id })} aria-label={`Open ${mix.title}`} tabindex="-1">
        <Mosaic arts={mix.tracks.map((t) => t.art)} size={168} radius={10} />
      </button>
      <div class="hero-main">
        <span class="label">Right now <span class="sep">·</span> <span class="accent">Made for you</span></span>
        <h2 class="title">{mix.title}</h2>
        <p class="hero-sub ellipsis">{mix.subtitle}</p>
        {#if first}
          <div class="opens">
            <span class="opens-line ellipsis">Opens with <b>{first.title}</b> <span class="faint">· {artistLine(first)}</span></span>
            <span class="reason ellipsis">{firstReason}</span>
          </div>
        {/if}
      </div>
      <div class="hero-actions">
        <button class="round-play" aria-label="Play" onclick={() => playMix(mix)}><Icon name="play" size={22} /></button>
        <button class="btn" onclick={() => shuffleMix(mix)}><Icon name="shuffle" size={15} /> Shuffle</button>
        <button class="why link" onclick={() => router.go({ name: 'mix', id: mix.id })} aria-label="Open the mix and see why each song is here">
          See why <Icon name="forward" size={13} />
        </button>
      </div>
      <span class="count num">{mix.tracks.length} songs</span>
    </section>
  {:else if taste.building}
    <div class="hero-skel panel" aria-busy="true">
      <div class="skeleton sk-art"></div>
      <div class="sk-text">
        <div class="skeleton" style:width="140px" style:height="10px"></div>
        <div class="skeleton" style:width="46%" style:height="34px"></div>
        <div class="skeleton" style:width="34%" style:height="12px"></div>
      </div>
    </div>
  {:else if !taste.hasTaste}
    <section class="cold panel enter">
      <span class="label">Learning you</span>
      <h2 class="h2">Every song you play teaches me.</h2>
      <p>Finish it, skip it, replay it, love it. I notice when you listen and what it sounds like. Your first mix appears after a few songs.</p>
    </section>
  {/if}

  {#if allMixes.length}
    <section class="made enter">
      <header class="sec-head">
        <h2 class="h2">Made for you</h2>
        <span class="num faint small">{allMixes.length}</span>
      </header>
      <div class="mixes">
        {#each allMixes as mix (mix.id)}<MixCard {mix} />{/each}
      </div>
    </section>
  {/if}

  {#if m.fresh}<Shelf shelf={asShelf(m.fresh)} note={m.fresh.subtitle} reasons={m.fresh.reasons} onplay={playFrom(m.fresh)} />{/if}
  {#if m.repeat}<Shelf shelf={asShelf(m.repeat)} note={m.repeat.subtitle} reasons={m.repeat.reasons} onplay={playFrom(m.repeat)} />{/if}
  {#if m.rotation}<Shelf shelf={asShelf(m.rotation)} note={m.rotation.subtitle} reasons={m.rotation.reasons} onplay={playFrom(m.rotation)} />{/if}
  {#if jump && !m.repeat}<Shelf shelf={jump} accent="where you left off" />{/if}

  {#if taste.hasTaste}
    <div class="refresh">
      <button class="chip" onclick={() => taste.buildMixes(true)} disabled={taste.building}>
        <Icon name="refresh" size={13} /> {taste.building ? 'Listening to your taste…' : 'Rebuild my mixes'}
      </button>
    </div>
  {/if}

  <div class="divider"><span class="label">From YouTube Music</span></div>
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
    padding: 36px 10px 26px;
  }
  .stamp {
    display: block;
    margin-bottom: 12px;
  }
  .hello .h1 {
    font-size: clamp(32px, 3.4vw, 46px);
  }
  .line {
    margin: 10px 0 0;
    max-width: 640px;
    font-size: 14.5px;
    color: var(--text-2);
  }

  /* quick tiles */
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 0 10px 28px;
  }
  @media (max-width: 1100px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* hero */
  .hero {
    position: relative;
    display: flex;
    align-items: center;
    gap: 26px;
    height: 200px;
    padding: 16px 28px 16px 16px;
    margin: 0 10px 40px;
  }
  .hero-art {
    flex: none;
    border-radius: 10px;
  }
  .hero-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sep {
    color: var(--text-4);
  }
  .hero .title {
    margin: 2px 0 0;
    font: 650 clamp(28px, 2.8vw, 40px) / 1.05 var(--sans);
    letter-spacing: -0.04em;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .hero-sub {
    margin: 0;
    font-size: 13.5px;
    color: var(--text-2);
  }
  .opens {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--hair);
    max-width: 560px;
  }
  .opens-line {
    font-size: 12.5px;
    color: var(--text-2);
  }
  .opens-line b {
    font-weight: 560;
    color: var(--text);
  }
  .hero-actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .why {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 38px;
    padding: 0 6px 0 8px;
    font-size: 13px;
    font-weight: 520;
    color: var(--text-2);
  }
  .count {
    position: absolute;
    top: 14px;
    right: 18px;
    font-size: 11px;
    color: var(--text-4);
  }
  @media (max-width: 1000px) {
    .hero {
      gap: 18px;
      padding-right: 18px;
    }
    .hero-actions .btn {
      display: none;
    }
  }

  .hero-skel {
    display: flex;
    align-items: center;
    gap: 26px;
    height: 200px;
    padding: 16px;
    margin: 0 10px 40px;
  }
  .sk-art {
    width: 168px;
    height: 168px;
    flex: none;
  }
  .sk-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .cold {
    padding: 26px 28px;
    margin: 0 10px 40px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cold .label {
    color: var(--accent);
  }
  .cold p {
    max-width: 560px;
    margin: 0;
    font-size: 13.5px;
    color: var(--text-2);
  }

  /* made for you */
  .made {
    margin-bottom: 40px;
  }
  .sec-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 0 10px 8px;
  }
  .small {
    font-size: 11px;
  }
  .mixes {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
  }
  .mixes::-webkit-scrollbar {
    display: none;
  }
  .mixes > :global(*) {
    scroll-snap-align: start;
  }

  .refresh {
    display: flex;
    justify-content: center;
    margin: -8px 0 36px;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 12px 10px 28px;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--hair);
  }
  .divider::before {
    flex: 0 0 24px;
  }
</style>
