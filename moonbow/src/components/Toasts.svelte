<script lang="ts">
  import { toasts } from '../lib/toasts.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts.list as t (t.id)}
    <div class="toast" class:error={t.kind === 'error'} role={t.kind === 'error' ? 'alert' : 'status'}>
      <i class="dot"></i><span>{t.text}</span>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: calc(var(--bar) + 16px);
    transform: translateX(-50%);
    z-index: 70;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(520px, calc(100vw - 32px));
    height: 38px;
    padding: 0 16px 0 14px;
    border-radius: 10px;
    background: var(--bg-3);
    box-shadow: inset 0 0 0 1px var(--hair-2), 0 12px 32px rgb(0 0 0 / 0.5);
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    animation: up 0.2s var(--ease);
  }
  .toast span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }
  .toast.error .dot {
    background: #ff5d5d;
  }
  @keyframes up {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>
