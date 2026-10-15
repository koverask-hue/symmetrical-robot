<script lang="ts">
  import Constellation from '../components/Constellation.svelte';
  import Icon from '../components/Icon.svelte';
  import { taste } from '../lib/taste/store.svelte';
  import { CONTEXT_NAMES, explore, preferredFeatures } from '../lib/taste/model';
  import { insights } from '../lib/taste/recommend';
  import { toasts } from '../lib/toasts.svelte';

  const s = $derived((taste.version, taste.state));
  const now = Date.now();
  const learned = $derived(insights(s, now));
  const tracks = $derived(Object.values(s.tracks));
  const hours = $derived(tracks.reduce((a, t) => a + t.listenSec, 0) / 3600);
  const played = $derived(tracks.filter((t) => t.plays > 0).length);
  const artistsKnown = $derived(Object.keys(s.artists).length);
  const adv = $derived(explore(s));
  const auto = $derived(s.exploreOverride == null);
  const muted = $derived(Object.entries(s.artists).filter(([, a]) => a.muted));

  // When you listen: four parts of the day, weekdays (inner) and weekends (outer).
  const clock = $derived.by(() => {
    const v = new Array(8).fill(0);
    for (const t of tracks) t.ctx.forEach((x, i) => (v[i] += x));
    const max = Math.max(1e-9, ...v);
    return v.map((x) => x / max);
  });
  const arc = (i: number, r0: number, r1: number, v: number) => {
    const a0 = (i / 4) * Math.PI * 2 - Math.PI / 2 + 0.06;
    const a1 = ((i + 1) / 4) * Math.PI * 2 - Math.PI / 2 - 0.06;
    const r = r0 + (r1 - r0) * Math.max(0.06, v);
    const p = (a: number, rr: number) => `${100 + Math.cos(a) * rr} ${100 + Math.sin(a) * rr}`;
    return `M${p(a0, r0)} A${r0} ${r0} 0 0 1 ${p(a1, r0)} L${p(a1, r)} A${r} ${r} 0 0 0 ${p(a0, r)} Z`;
  };
  const PART_HUE = [250, 40, 190, 320];

  const sound = $derived([0, 1, 2, 3].map((p) => ({ name: CONTEXT_NAMES[p], f: preferredFeatures(s, p, now) })));

  let armed = $state(false);
  function reset() {
    if (!armed) {
      armed = true;
      setTimeout(() => (armed = false), 3000);
      return;
    }
    taste.reset();
    toasts.show('Forgotten. We start fresh.');
  }
</script>

<div class="page">
  <header class="hello enter">
    <div class="kicker">Your sound</div>
    <h1 class="display">What I know about <em class="iris-text">you</em>.</h1>
    <p class="line">{learned[0]?.text ?? 'Not much yet. Play, skip, love, and watch this page fill in.'}</p>
  </header>

  <section class="enter">
    <Constellation />
    <p class="cap faint">Each star is an artist. Bigger means you love them more, colours are your worlds, and lines are how listeners connect them. Click a star to visit.</p>
  </section>

  <div class="grid">
    <section class="panel enter">
      <h2 class="section-title">What I've <em>learned</em></h2>
      <ul class="learned">
        {#each learned as l (l.text)}
          <li class="serif">{l.text}</li>
        {:else}
          <li class="serif faint">Give me a few days of listening.</li>
        {/each}
      </ul>
      <div class="stats">
        <div><span class="n serif">{played}</span><span class="faint">songs heard</span></div>
        <div><span class="n serif">{hours.toFixed(1)}</span><span class="faint">hours</span></div>
        <div><span class="n serif">{artistsKnown}</span><span class="faint">artists</span></div>
      </div>
    </section>

    <section class="panel enter">
      <h2 class="section-title">When you <em>listen</em></h2>
      <div class="clockwrap">
        <svg viewBox="0 0 200 200" class="clock" aria-label="Listening by part of day">
          {#each [0, 1, 2, 3] as i (i)}
            <path d={arc(i, 38, 64, clock[i])} fill="hsl({PART_HUE[i]} 80% 70% / .85)" />
            <path d={arc(i, 70, 94, clock[i + 4])} fill="hsl({PART_HUE[i]} 80% 70% / .45)" />
          {/each}
          <circle cx="100" cy="100" r="30" fill="rgb(255 255 255 / .03)" />
        </svg>
        <ul class="legend">
          {#each [0, 1, 2, 3] as i (i)}
            <li><span class="dot" style:background="hsl({PART_HUE[i]} 80% 70%)"></span>{CONTEXT_NAMES[i]}</li>
          {/each}
          <li class="faint small">Inner ring weekdays · outer ring weekends</li>
        </ul>
      </div>
    </section>

    <section class="panel enter">
      <h2 class="section-title">How it <em>sounds</em></h2>
      <p class="faint small">Measured from the audio of songs you finish, by time of day.</p>
      <div class="sound">
        {#each sound as row (row.name)}
          <div class="srow">
            <span class="serif part">{row.name}</span>
            {#if row.f}
              {#each [['Energy', row.f.energy], ['Brightness', row.f.bright], ['Pulse', row.f.pulse]] as [label, v] (label)}
                <div class="bar" title="{label}: {Math.round(Number(v) * 100)}%"><i style:width="{Number(v) * 100}%"></i><span>{label}</span></div>
              {/each}
            {:else}
              <span class="faint small">Not enough yet</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section class="panel enter">
      <h2 class="section-title">Your <em>controls</em></h2>
      <div class="ctl">
        <div class="row">
          <span>Adventurousness</span>
          <button class="chip" class:on={auto} onclick={() => taste.setExplore(auto ? adv : null)}>{auto ? 'Learning it' : 'Set by you'}</button>
        </div>
        <input type="range" min="0.05" max="0.95" step="0.05" value={adv} style:--v={adv} disabled={auto}
          oninput={(e) => taste.setExplore(+e.currentTarget.value)} aria-label="Adventurousness" />
        <div class="ends faint"><span>Familiar</span><span>{Math.round(adv * 100)}% new</span><span>Surprise me</span></div>
      </div>
      {#if muted.length}
        <div class="ctl">
          <span>Hidden artists</span>
          <div class="chips">
            {#each muted as [key, a] (key)}
              <button class="chip" onclick={() => taste.mute(key, false)}>{a.name} <Icon name="close" size={12} /></button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="ctl">
        <button class="chip danger" onclick={reset}><Icon name="trash" size={14} /> {armed ? 'Click again to forget everything' : 'Forget my taste'}</button>
      </div>
    </section>
  </div>
</div>

<style>
  .hello {
    padding: 34px 12px 36px;
  }
  .hello .display {
    margin: 14px 0 16px;
  }
  .line {
    margin: 0;
    font: italic 400 22px/1.35 var(--serif);
    color: var(--text-2);
  }
  .cap {
    margin: 14px 18px 48px;
    font-size: 12.5px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    gap: 18px;
  }
  .panel {
    padding: 30px 32px;
    border-radius: 34px;
    background: rgb(14 10 26 / 0.42);
    backdrop-filter: blur(24px);
    box-shadow: var(--glass-edge);
  }
  .section-title em {
    color: rgb(var(--tint));
  }
  .learned {
    list-style: none;
    padding: 0;
    margin: 18px 0 24px;
  }
  .learned li {
    font-size: 21px;
    line-height: 1.3;
    padding: 10px 0;
    border-bottom: 1px solid var(--hair);
  }
  .stats {
    display: flex;
    gap: 34px;
  }
  .stats div {
    display: flex;
    flex-direction: column;
    font-size: 12px;
  }
  .n {
    font-size: 40px;
    line-height: 1;
  }
  .clockwrap {
    display: flex;
    align-items: center;
    gap: 24px;
    margin-top: 12px;
  }
  .clock {
    width: 200px;
    height: 200px;
    flex: none;
    filter: drop-shadow(0 0 18px rgb(var(--tint) / 0.25));
  }
  .legend {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13.5px;
  }
  .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-right: 10px;
  }
  .small {
    font-size: 12px;
  }
  .sound {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 16px;
  }
  .srow {
    display: grid;
    grid-template-columns: 100px repeat(3, 1fr);
    gap: 10px;
    align-items: center;
  }
  .part {
    font-size: 18px;
  }
  .bar {
    position: relative;
    height: 26px;
    border-radius: 9px;
    overflow: hidden;
    background: rgb(255 255 255 / 0.05);
  }
  .bar i {
    position: absolute;
    inset: 0 auto 0 0;
    background: linear-gradient(90deg, rgb(var(--tint-2) / 0.5), rgb(var(--tint) / 0.8));
  }
  .bar span {
    position: relative;
    font-size: 11px;
    padding-left: 8px;
    line-height: 26px;
    color: var(--text);
  }
  .ctl {
    margin-top: 20px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .ctl input[type='range'] {
    width: 100%;
    appearance: none;
    height: 8px;
    border-radius: 999px;
    background: linear-gradient(90deg, rgb(var(--tint)) calc(var(--v) * 100%), rgb(255 255 255 / 0.1) calc(var(--v) * 100%));
    outline: none;
  }
  .ctl input[type='range']:disabled {
    opacity: 0.55;
  }
  .ctl input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 0 5px rgb(var(--tint) / 0.25);
  }
  .ends {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin-top: 10px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .danger:hover {
    background: rgb(255 90 120 / 0.2);
  }
</style>
