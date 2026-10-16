<script lang="ts">
  // Page header for album, playlist, mix and library pages: cover, mono kind, title, facts, actions.
  import type { Snippet } from 'svelte';
  import Art from './Art.svelte';

  let { art, kind, title, subtitle, description, round = false, actions, visual }: {
    art?: string; kind: string; title: string; subtitle?: string; description?: string; round?: boolean;
    actions?: Snippet; visual?: Snippet;
  } = $props();
  let expanded = $state(false);
  const size = $derived(title.length > 40 ? 'xl' : title.length > 22 ? 'l' : '');
</script>

<header class="hdr enter">
  <div class="visual">
    {#if visual}
      {@render visual()}
    {:else}
      <Art src={art} size={200} {round} radius={10} alt={title} />
    {/if}
  </div>
  <div class="info">
    <span class="label">{kind}</span>
    <h1 class="h1 title" class:l={size === 'l'} class:xl={size === 'xl'}>{title}</h1>
    {#if subtitle}<div class="meta">{subtitle}</div>{/if}
    {#if description}
      <button class="desc" class:expanded onclick={() => (expanded = !expanded)} aria-expanded={expanded}>{description}</button>
    {/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</header>

<style>
  .hdr {
    display: flex;
    align-items: flex-end;
    gap: 32px;
    padding: 28px 10px 32px;
  }
  .visual {
    flex: none;
    width: 200px;
    height: 200px;
    display: grid;
    place-items: center;
  }
  .visual :global(.art),
  .visual :global(.mosaic) {
    box-shadow: inset 0 0 0 1px var(--hair), 0 24px 48px -24px rgb(0 0 0 / 0.9);
  }
  .info {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .title {
    margin: 2px 0 2px;
    font-size: clamp(36px, 4.4vw, 64px);
    overflow-wrap: anywhere;
  }
  .title.l {
    font-size: clamp(30px, 3.4vw, 46px);
  }
  .title.xl {
    font-size: clamp(26px, 2.6vw, 36px);
    letter-spacing: -0.03em;
  }
  .meta {
    font: 500 11px/1.4 var(--mono);
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .desc {
    max-width: 640px;
    font-size: 13px;
    line-height: 1.55;
    text-align: left;
    color: var(--text-3);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    user-select: text;
    transition: color 0.15s;
  }
  .desc:hover {
    color: var(--text-2);
  }
  .desc.expanded {
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 12px;
    flex-wrap: wrap;
    align-items: center;
  }
  @media (max-width: 900px) {
    .hdr {
      gap: 22px;
    }
    .visual {
      width: 160px;
      height: 160px;
    }
    .visual :global(.art) {
      width: 160px !important;
      height: 160px !important;
    }
  }
</style>
