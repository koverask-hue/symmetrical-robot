<script lang="ts">
  import Shelf from '../components/Shelf.svelte';
  import Loading from '../components/Loading.svelte';
  import { source } from '../lib/sources';
  import { library } from '../lib/library.svelte';
  import { loader } from '../lib/util/load.svelte';
  import type { Shelf as ShelfT } from '../lib/sources/types';

  const home = loader(() => source.home());
  home.run();

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const recent = $derived<ShelfT | null>(
    library.history.length ? { title: 'Jump back in', items: library.history.slice(0, 12).map((track) => ({ type: 'track', track })) } : null,
  );
</script>

<div class="page">
  <h1 class="greet">{greeting}</h1>
  {#if recent}<Shelf shelf={recent} />{/if}
  {#if home.state.loading && !home.state.data}
    <Loading />
  {:else if home.state.error}
    <Loading error={home.state.error} retry={home.run} />
  {:else}
    {#each home.state.data ?? [] as shelf, i (i)}<Shelf {shelf} />{/each}
  {/if}
</div>

<style>
  .greet {
    font-size: 34px;
    font-weight: 850;
    padding: 4px 10px 20px;
  }
</style>
