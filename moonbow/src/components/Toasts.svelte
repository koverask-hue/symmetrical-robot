<script lang="ts">
  import { toasts } from '../lib/toasts.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts.list as t (t.id)}
    <div class="toast" class:error={t.kind === 'error'}>{t.text}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: calc(var(--capsule) + 34px);
    transform: translateX(-50%);
    z-index: 70;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    max-width: 520px;
    padding: 10px 16px;
    border-radius: 12px;
    background: rgb(246 243 255 / 0.95);
    color: #0b0814;
    font-weight: 550;
    border-radius: 999px;
    padding: 11px 20px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.4);
    animation: up 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .toast.error {
    background: #ff5d6c;
    color: #fff;
  }
  @keyframes up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
</style>
