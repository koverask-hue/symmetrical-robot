<script lang="ts">
  // Pointer-driven range. Shows the dragged value immediately and commits on release,
  // so seeking a stream doesn't fire dozens of range requests.
  let {
    value,
    max = 1,
    onchange,
    oninput,
    label,
    format,
  }: {
    value: number;
    max?: number;
    onchange: (v: number) => void;
    oninput?: (v: number) => void;
    label: string;
    format?: (v: number) => string;
  } = $props();

  let el: HTMLDivElement;
  let dragging = $state(false);
  let dragValue = $state(0);
  let hover = $state<number | null>(null);

  const shown = $derived(dragging ? dragValue : value);
  const pct = $derived(max > 0 ? Math.max(0, Math.min(1, shown / max)) * 100 : 0);
  const tipPct = $derived(hover !== null && max > 0 ? Math.max(0, Math.min(1, hover / max)) * 100 : 0);

  function at(e: PointerEvent) {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * max;
  }
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    dragging = true;
    dragValue = at(e);
    oninput?.(dragValue);
  }
  function move(e: PointerEvent) {
    hover = at(e);
    if (dragging) {
      dragValue = hover;
      oninput?.(dragValue);
    }
  }
  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    onchange(at(e));
  }
  function key(e: KeyboardEvent) {
    const step = max / 20;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onchange(Math.min(max, value + step));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onchange(Math.max(0, value - step));
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<div
  class="slider"
  class:dragging
  bind:this={el}
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={max}
  aria-valuenow={Math.round(shown)}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={() => (dragging = false)}
  onpointerleave={() => (hover = null)}
  onkeydown={key}
>
  <div class="track"><div class="fill" style:transform="scaleX({pct / 100})"></div></div>
  <div class="thumb" style:left="{pct}%"></div>
  {#if format && hover !== null}
    <div class="tip num" style:left="{tipPct}%">{format(hover)}</div>
  {/if}
</div>

<style>
  .slider {
    position: relative;
    height: 16px;
    display: flex;
    align-items: center;
    cursor: pointer;
    touch-action: none;
    min-width: 0;
    flex: 1;
  }
  .track {
    position: relative;
    width: 100%;
    height: 3px;
    border-radius: 2px;
    background: var(--bg-4);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0;
    background: var(--text);
    transform-origin: left center;
    transition: background 0.15s;
  }
  .slider:hover .fill,
  .dragging .fill {
    background: var(--accent);
  }
  .thumb {
    position: absolute;
    top: 50%;
    width: 11px;
    height: 11px;
    margin: -5.5px 0 0 -5.5px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.5);
    opacity: 0;
    transform: scale(0.6);
    transition: opacity 0.12s, transform 0.15s var(--ease);
    pointer-events: none;
  }
  .slider:hover .thumb,
  .dragging .thumb,
  .slider:focus-visible .thumb {
    opacity: 1;
    transform: none;
  }
  .slider:focus-visible {
    outline-offset: 4px;
  }
  .tip {
    position: absolute;
    bottom: 20px;
    transform: translateX(-50%);
    padding: 3px 6px;
    border-radius: 5px;
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--hair-2);
    color: var(--text);
    font-size: 11px;
    line-height: 1.3;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
