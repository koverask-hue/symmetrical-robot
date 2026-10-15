<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <div class="modal" role="dialog" tabindex="-1" aria-label={title} onclick={(e) => e.stopPropagation()}>
    <header><h3>{title}</h3><button class="icon-btn" onclick={onclose} aria-label="Close"><Icon name="close" /></button></header>
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
    background: rgb(0 0 0 / 0.45);
    animation: fade 0.12s;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  .modal {
    width: min(520px, calc(100vw - 32px));
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    background: rgb(22 19 30 / 0.96);
    border: 1px solid rgb(255 255 255 / 0.1);
    box-shadow: 0 40px 100px rgb(0 0 0 / 0.6);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px 6px 22px;
  }
  .body {
    padding: 6px 22px 22px;
  }
</style>
