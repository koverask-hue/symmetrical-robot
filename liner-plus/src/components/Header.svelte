<script lang="ts">
  // Big page header used by album, playlist, artist and library pages.
  import type { Snippet } from 'svelte';
  import Art from './Art.svelte';

  let { art, kind, title, subtitle, description, round = false, actions }: {
    art?: string; kind: string; title: string; subtitle?: string; description?: string; round?: boolean; actions?: Snippet;
  } = $props();
  let expanded = $state(false);
</script>

<header class="hdr">
  <Art src={art} size={208} {round} alt={title} />
  <div class="info">
    <div class="kind">{kind}</div>
    <h1 class:long={title.length > 28}>{title}</h1>
    {#if subtitle}<div class="sub muted">{subtitle}</div>{/if}
    {#if description}
      <button class="desc muted" class:expanded onclick={() => (expanded = !expanded)}>{description}</button>
    {/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</header>

<style>
  .hdr {
    display: flex;
    align-items: flex-end;
    gap: 28px;
    padding: 12px 10px 28px;
  }
  .info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .kind {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-2);
  }
  h1 {
    font-size: clamp(32px, 5vw, 64px);
    line-height: 1.02;
    font-weight: 850;
  }
  h1.long {
    font-size: clamp(26px, 3.4vw, 44px);
  }
  .desc {
    max-width: 680px;
    font-size: 13px;
    text-align: left;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    user-select: text;
  }
  .desc.expanded {
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 10px;
  }
</style>
