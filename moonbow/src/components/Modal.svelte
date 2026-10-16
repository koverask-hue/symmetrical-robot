<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <div class="modal" role="dialog" tabindex="-1" aria-label={title} onclick={(e) => e.stopPropagation()}>
    <header>
      <h3 class="mt">{title}</h3>
      <span class="esc"><kbd>Esc</kbd></span>
      <button class="icon-btn" onclick={onclose} aria-label="Close"><Icon name="close" size={16} /></button>
    </header>
    <div class="body scroll">{@render children()}</div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 55;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.62);
    animation: fade 0.12s;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .modal {
    width: min(540px, calc(100vw - 32px));
    max-height: 82vh;
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    background: var(--bg-1);
    box-shadow: inset 0 0 0 1px var(--hair-2), 0 30px 80px rgb(0 0 0 / 0.6);
    animation: pop 0.16s var(--ease);
  }
  .modal:focus-visible {
    outline: none;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.985);
    }
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 12px 12px 24px;
    border-bottom: 1px solid var(--hair);
  }
  .mt {
    flex: 1;
    margin: 0;
    font: 620 16px/1.2 var(--sans);
    letter-spacing: -0.02em;
  }
  .esc {
    display: flex;
  }
  .icon-btn {
    width: 30px;
    height: 30px;
    border-radius: 8px;
  }
  .body {
    padding: 16px 24px 20px;
  }
</style>
