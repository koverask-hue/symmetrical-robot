<script lang="ts">
  // Editorial page header used by album, playlist, mix and library pages.
  import type { Snippet } from 'svelte';

  let { art, kind, title, subtitle, description, round = false, actions, visual }: {
    art?: string; kind: string; title: string; subtitle?: string; description?: string; round?: boolean;
    actions?: Snippet; visual?: Snippet;
  } = $props();
  let expanded = $state(false);
  const words = $derived(title.split(' '));
</script>

<header class="hdr enter">
  <div class="visual">
    {#if visual}
      {@render visual()}
    {:else if art}
      <img class="glow" class:round src={art} alt="" aria-hidden="true" />
      <img class="cover" class:round src={art} alt={title} />
    {:else}
      <div class="cover empty" class:round></div>
    {/if}
  </div>
  <div class="info">
    <div class="kicker">{kind}</div>
    <h1 class="display" class:long={title.length > 26}>
      {#if words.length > 1}{words.slice(0, -1).join(' ')} <em>{words[words.length - 1]}</em>{:else}{title}{/if}
    </h1>
    {#if subtitle}<div class="sub">{subtitle}</div>{/if}
    {#if description}
      <button class="desc" class:expanded onclick={() => (expanded = !expanded)}>{description}</button>
    {/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</header>

<style>
  .hdr {
    display: flex;
    align-items: flex-end;
    gap: 40px;
    padding: 30px 12px 44px;
  }
  .visual {
    position: relative;
    flex: none;
    width: 240px;
    height: 240px;
    display: grid;
    place-items: center;
  }
  .visual:has(:global(.fan)) {
    width: 320px;
  }
  .cover,
  .glow {
    pointer-events: none;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 26px;
  }
  .cover {
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08), 0 40px 80px -30px rgb(0 0 0 / 0.9);
  }
  .glow {
    filter: blur(44px) saturate(1.8);
    opacity: 0.7;
    transform: translateY(20px) scale(0.95);
  }
  .round {
    border-radius: 50%;
  }
  .empty {
    background: linear-gradient(135deg, rgb(var(--tint) / 0.35), rgb(var(--tint-2) / 0.15));
  }
  .info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .display {
    font-size: clamp(48px, 6vw, 92px);
  }
  .display em {
    font-style: italic;
    color: rgb(var(--tint));
  }
  .display.long {
    font-size: clamp(36px, 4vw, 60px);
  }
  .sub {
    font-size: 14px;
    color: var(--text-2);
  }
  .desc {
    max-width: 640px;
    font-size: 13.5px;
    text-align: left;
    color: var(--text-3);
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
    margin-top: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
</style>
