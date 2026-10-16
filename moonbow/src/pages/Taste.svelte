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
  const raw = $derived.by(() => {
    const v = new Array(8).fill(0);
    for (const t of tracks) t.ctx.forEach((x, i) => (v[i] += x));
    return v as number[];
  });
  const clock = $derived.by(() => {
    const max = Math.max(1e-9, ...raw);
    return raw.map((x) => x / max);
  });
  const total = $derived(Math.max(1e-9, raw.reduce((a, b) => a + b, 0)));
  const pct = (i: number) => Math.round(((raw[i] + raw[i + 4]) / total) * 100);

  const GAP = 0.05;
  const ang = (i: number) => [(i / 4) * Math.PI * 2 - Math.PI / 2 + GAP, ((i + 1) / 4) * Math.PI * 2 - Math.PI / 2 - GAP];
  const arc = (i: number, r0: number, r1: number, v: number) => {
    const [a0, a1] = ang(i);
    const r = r0 + (r1 - r0) * Math.max(0.06, v);
    const p = (a: number, rr: number) => `${100 + Math.cos(a) * rr} ${100 + Math.sin(a) * rr}`;
    return `M${p(a0, r0)} A${r0} ${r0} 0 0 1 ${p(a1, r0)} L${p(a1, r)} A${r} ${r} 0 0 0 ${p(a0, r)} Z`;
  };
  const tagAt = (i: number) => {
    const a = ((i + 0.5) / 4) * Math.PI * 2 - Math.PI / 2;
    return { x: 100 + Math.cos(a) * 22, y: 100 + Math.sin(a) * 22 + 3 };
  };

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
    <div class="label">Your sound</div>
    <h1 class="h1">What I know about you.</h1>
    <p class="line">{learned[0]?.text ?? 'Not much yet. Play, skip, love, and watch this page fill in.'}</p>
  </header>

  <section class="enter sky-sec">
    <Constellation />
    <p class="cap">
      <span class="label">Legend</span>
      Each star is an artist. Bigger means you love them more; lit stars are your main world; lines are how listeners connect them. Click a star to visit.
    </p>
  </section>

  <div class="grid">
    <section class="panel enter">
      <div class="ph"><span class="label">01</span><h2 class="h2">What I've learned</h2></div>
      <ul class="learned">
        {#each learned as l (l.text)}
          <li>{l.text}</li>
        {:else}
          <li class="faint">Give me a few days of listening.</li>
        {/each}
      </ul>
      <div class="stats">
        <div><span class="num big">{played}</span><span class="label">songs heard</span></div>
        <div><span class="num big">{hours.toFixed(1)}</span><span class="label">hours</span></div>
        <div><span class="num big">{artistsKnown}</span><span class="label">artists</span></div>
      </div>
    </section>

    <section class="panel enter">
      <div class="ph"><span class="label">02</span><h2 class="h2">When you listen</h2></div>
      <div class="clockwrap">
        <svg viewBox="0 0 200 200" class="clock" role="img" aria-label="Listening by part of day">
          {#each [0, 1, 2, 3] as i (i)}
            <path d={arc(i, 38, 64, 1)} fill="var(--bg-3)" />
            <path d={arc(i, 70, 94, 1)} fill="var(--bg-3)" />
            <path d={arc(i, 38, 64, clock[i])} fill="var(--accent)" />
            <path d={arc(i, 70, 94, clock[i + 4])} fill="rgb(var(--accent-rgb) / 0.35)" />
            <text x={tagAt(i).x} y={tagAt(i).y} class="tag">0{i + 1}</text>
          {/each}
        </svg>
        <ul class="legend">
          {#each [0, 1, 2, 3] as i (i)}
            <li><span class="label">0{i + 1}</span><span class="pn">{CONTEXT_NAMES[i]}</span><span class="num faint">{pct(i)}%</span></li>
          {/each}
          <li class="key">
            <span><i class="sw wd"></i>Weekdays · inner</span>
            <span><i class="sw we"></i>Weekends · outer</span>
          </li>
        </ul>
      </div>
    </section>

    <section class="panel enter">
      <div class="ph"><span class="label">03</span><h2 class="h2">How it sounds</h2></div>
      <p class="sub">Measured from the audio of songs you finish, by time of day.</p>
      <div class="sound">
        <div class="srow head">
          <span></span><span class="label">Energy</span><span class="label">Brightness</span><span class="label">Pulse</span>
        </div>
        {#each sound as row (row.name)}
          <div class="srow">
            <span class="part">{row.name}</span>
            {#if row.f}
              {#each [['Energy', row.f.energy], ['Brightness', row.f.bright], ['Pulse', row.f.pulse]] as [label, v] (label)}
                <div class="bar" title="{label}: {Math.round(Number(v) * 100)}%">
                  <div class="track"><i style:transform="scaleX({Math.max(0, Math.min(1, Number(v)))})"></i></div>
                  <span class="num">{Math.round(Number(v) * 100)}</span>
                </div>
              {/each}
            {:else}
              <span class="none label">Not enough yet</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section class="panel enter">
      <div class="ph"><span class="label">04</span><h2 class="h2">Controls</h2></div>
      <div class="ctl">
        <div class="row">
          <span class="cname">Adventurousness</span>
          <button class="chip" class:on={auto} onclick={() => taste.setExplore(auto ? adv : null)}>
            {#if auto}<Icon name="sparkles" size={13} />{/if}{auto ? 'Learning it' : 'Set by you'}
          </button>
        </div>
        <input type="range" min="0.05" max="0.95" step="0.05" value={adv} style:--v={adv} disabled={auto}
          oninput={(e) => taste.setExplore(+e.currentTarget.value)} aria-label="Adventurousness" />
        <div class="ends label"><span>Familiar</span><span class="mid">{Math.round(adv * 100)}% new</span><span>Surprise me</span></div>
      </div>
      {#if muted.length}
        <div class="ctl">
          <span class="cname">Hidden artists</span>
          <div class="chips">
            {#each muted as [key, a] (key)}
              <button class="chip" onclick={() => taste.mute(key, false)} aria-label="Unhide {a.name}">{a.name} <Icon name="close" size={12} /></button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="ctl danger-row">
        <button class="btn danger" class:armed onclick={reset}><Icon name="trash" size={15} /> {armed ? 'Click again to forget everything' : 'Forget my taste'}</button>
        <span class="faint small">Clears everything learned on this computer.</span>
      </div>
    </section>
  </div>
</div>

<style>
  .hello {
    padding: 40px 0 32px;
  }
  .hello .h1 {
    margin: 12px 0 14px;
  }
  .line {
    margin: 0;
    max-width: 640px;
    font-size: 16px;
    line-height: 1.5;
    color: var(--text-2);
  }
  .cap {
    display: flex;
    gap: 12px;
    align-items: baseline;
    margin: 12px 4px 32px;
    font-size: 12.5px;
    color: var(--text-3);
  }
  .cap .label {
    flex: none;
    color: var(--text-4);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    gap: 16px;
  }
  .panel {
    padding: 24px;
    min-width: 0;
  }
  .ph {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .ph .label {
    color: var(--text-4);
  }
  .sub {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--text-3);
  }
  .small {
    font-size: 12px;
  }

  /* learned */
  .learned {
    list-style: none;
    padding: 0;
    margin: 16px 0 24px;
  }
  .learned li {
    font-size: 15px;
    line-height: 1.45;
    padding: 11px 0;
    border-bottom: 1px solid var(--hair);
  }
  .learned li:first-child {
    border-top: 1px solid var(--hair);
  }
  .stats {
    display: flex;
    gap: 36px;
  }
  .stats div {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .big {
    font-size: 32px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  /* clock */
  .clockwrap {
    display: flex;
    align-items: center;
    gap: 28px;
    margin-top: 18px;
  }
  .clock {
    width: 188px;
    height: 188px;
    flex: none;
  }
  .clock path {
    transition: d 0.25s var(--ease);
  }
  .tag {
    font: 500 8px var(--mono);
    fill: var(--text-3);
    text-anchor: middle;
  }
  .legend {
    list-style: none;
    padding: 0;
    margin: 0;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .legend li {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: baseline;
    padding: 8px 0;
    font-size: 13.5px;
    border-bottom: 1px solid var(--hair);
  }
  .legend .label {
    color: var(--text-4);
  }
  .legend li.key {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 0;
    padding-top: 12px;
    font: 11px var(--mono);
    color: var(--text-3);
  }
  .sw {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    margin-right: 8px;
  }
  .sw.wd {
    background: var(--accent);
  }
  .sw.we {
    background: rgb(var(--accent-rgb) / 0.35);
  }

  /* sound */
  .sound {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 18px;
  }
  .srow {
    display: grid;
    grid-template-columns: 92px repeat(3, 1fr);
    gap: 14px;
    align-items: center;
  }
  .srow.head {
    margin-bottom: -4px;
  }
  .srow.head .label {
    color: var(--text-4);
  }
  .part {
    font-size: 13.5px;
    font-weight: 540;
  }
  .none {
    grid-column: span 3;
    color: var(--text-4);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .track {
    flex: 1;
    height: 6px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--bg-3);
  }
  .track i {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
    transition: transform 0.25s var(--ease);
  }
  .bar .num {
    width: 22px;
    text-align: right;
    font-size: 11px;
    color: var(--text-3);
  }

  /* controls */
  .ctl {
    margin-top: 20px;
  }
  .cname {
    font-size: 13.5px;
    font-weight: 540;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .ctl input[type='range'] {
    width: 100%;
    appearance: none;
    height: 4px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent) calc(var(--v) * 100%), var(--bg-4) calc(var(--v) * 100%));
    outline: none;
    cursor: pointer;
  }
  .ctl input[type='range']:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .ctl input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text);
    box-shadow: 0 0 0 4px var(--bg-1);
    transition: transform 0.15s var(--ease);
  }
  .ctl input[type='range']:not(:disabled):hover::-webkit-slider-thumb {
    transform: scale(1.15);
  }
  .ends {
    display: flex;
    justify-content: space-between;
    margin-top: 12px;
  }
  .ends .mid {
    color: var(--accent);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .danger-row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding-top: 20px;
    border-top: 1px solid var(--hair);
  }
  .btn.danger:hover,
  .btn.danger.armed {
    color: #ff5d5d;
    box-shadow: inset 0 0 0 1px rgb(255 93 93 / 0.4);
  }
  .btn.danger.armed {
    background: rgb(255 93 93 / 0.1);
  }
</style>
