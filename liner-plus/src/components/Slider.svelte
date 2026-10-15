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
  onpointerleave={() => (hover = null)}
  onkeydown={key}
>
  <div class="track"><div class="fill" style:width="{pct}%"></div></div>
  <div class="thumb" style:left="{pct}%"></div>
  {#if format && hover !== null}
    <div class="tip" style:left="{(hover / max) * 100}%">{format(hover)}</div>
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
  }
  .track {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: rgb(255 255 255 / 0.18);
    overflow: hidden;
    transition: height 0.12s;
  }
  .fill {
    height: 100%;
    background: var(--text);
    border-radius: 2px;
  }
  .slider:hover .fill,
  .dragging .fill {
    background: linear-gradient(90deg, var(--accent-2), var(--accent));
  }
  .slider:hover .track,
  .dragging .track {
    height: 6px;
  }
  .thumb {
    position: absolute;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.4);
    opacity: 0;
    transition: opacity 0.12s;
    pointer-events: none;
  }
  .slider:hover .thumb,
  .dragging .thumb,
  .slider:focus-visible .thumb {
    opacity: 1;
  }
  .tip {
    position: absolute;
    bottom: 20px;
    transform: translateX(-50%);
    padding: 3px 7px;
    border-radius: 6px;
    background: var(--glass-strong);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
