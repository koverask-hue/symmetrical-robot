<script lang="ts">
  import Icon from './Icon.svelte';
  let { error = null, retry }: { error?: unknown; retry?: () => void } = $props();
</script>

{#if error}
  <div class="err panel" role="alert">
    <span class="label">Error</span>
    <h3>That didn't load</h3>
    <p class="msg">{(error as Error)?.message ?? String(error)}</p>
    {#if retry}<button class="btn" onclick={retry}><Icon name="refresh" size={15} /> Try again</button>{/if}
  </div>
{:else}
  <div class="loading" aria-busy="true" aria-label="Loading">
    <div class="skeleton head"></div>
    {#each Array(6) as _, i (i)}
      <div class="line" style:opacity={1 - i * 0.13}>
        <div class="skeleton art"></div>
        <div class="text">
          <div class="skeleton a" style:width="{46 - (i % 3) * 8}%"></div>
          <div class="skeleton b" style:width="{26 + (i % 2) * 8}%"></div>
        </div>
        <div class="skeleton d"></div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .loading {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 10px;
  }
  .head {
    width: 220px;
    height: 22px;
    border-radius: 6px;
    margin-bottom: 14px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 56px;
    padding: 0 12px;
  }
  .art {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    flex: none;
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .a {
    height: 11px;
    border-radius: 4px;
  }
  .b {
    height: 9px;
    border-radius: 4px;
  }
  .d {
    width: 36px;
    height: 9px;
    border-radius: 4px;
  }
  .err {
    max-width: 460px;
    margin: 40px auto;
    padding: 28px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .err .label {
    color: var(--accent);
  }
  h3 {
    margin: 0;
    font: 620 17px/1.3 var(--sans);
    letter-spacing: -0.02em;
  }
  .msg {
    margin: 0 0 14px;
    font: 450 12px/1.5 var(--mono);
    color: var(--text-3);
    word-break: break-word;
    user-select: text;
  }
</style>
