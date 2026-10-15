<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <div class="modal" role="dialog" tabindex="-1" aria-label={title} onclick={(e) => e.stopPropagation()}>
    <header><h3 class="serif mt">{title}</h3><button class="icon-btn" onclick={onclose} aria-label="Close"><Icon name="close" /></button></header>
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
    border-radius: 28px;
    background: rgb(16 12 28 / 0.82);
    backdrop-filter: blur(40px) saturate(170%);
    box-shadow: var(--glass-edge), 0 40px 100px rgb(0 0 0 / 0.6);
    box-shadow: 0 40px 100px rgb(0 0 0 / 0.6);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px 6px 22px;
  }
  .mt {
    font-size: 30px;
  }
  .body {
    padding: 6px 22px 22px;
  }
</style>
