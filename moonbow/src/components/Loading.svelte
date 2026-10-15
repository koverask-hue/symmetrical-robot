<script lang="ts">
  let { error = null, retry }: { error?: unknown; retry?: () => void } = $props();
</script>

{#if error}
  <div class="err">
    <h3>That didn't load</h3>
    <p class="muted">{(error as Error)?.message ?? String(error)}</p>
    {#if retry}<button class="btn" onclick={retry}>Try again</button>{/if}
  </div>
{:else}
  <div class="loading">
    <div class="skeleton head"></div>
    {#each Array(6) as _, i (i)}<div class="skeleton row"></div>{/each}
  </div>
{/if}

<style>
  .loading {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 10px;
  }
  .head {
    width: 40%;
    height: 40px;
    margin-bottom: 12px;
  }
  .row {
    height: 48px;
  }
  .err {
    padding: 60px 10px;
    text-align: center;
  }
  .err p {
    max-width: 520px;
    margin: 8px auto 16px;
  }
</style>
