<script lang="ts" module>
  // 24×24 stroke icons. Filled variants use `fill` instead.
  const STROKE: Record<string, string> = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3',
    library: 'M4 4v16M9 4v16M14 4l5 16',
    plus: 'M12 5v14M5 12h14',
    back: 'M15 5l-7 7 7 7',
    forward: 'M9 5l7 7-7 7',
    shuffle: 'M16 4h4v4M4 20 20 4M20 16v4h-4M15 15l5 5M4 4l5 5',
    repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
    heart: 'M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20z',
    queue: 'M3 6h13M3 12h13M3 18h9M17 15v6l5-3z',
    lyrics: 'M4 6h16M4 10h10M4 14h16M4 18h8',
    volume: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
    mute: 'M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    close: 'M6 6l12 12M18 6 6 18',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    radio: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5',
    album: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
    keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    translate: 'M4 5h8M8 3v2M6 5c0 4 2 7 6 8M10 5c0 3-2 6-6 8M13 21l4-9 4 9M14.5 18h5',
  };
  const FILL: Record<string, string> = {
    play: 'M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z',
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
    next: 'M5 4.8v14.4a.8.8 0 0 0 1.2.7L16 13v6h3V5h-3v6L6.2 4.1a.8.8 0 0 0-1.2.7z',
    prev: 'M19 4.8v14.4a.8.8 0 0 1-1.2.7L8 13v6H5V5h3v6l9.8-6.9a.8.8 0 0 1 1.2.7z',
    'heart-filled': 'M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20z',
  };
</script>

<script lang="ts">
  let { name, size = 20 }: { name: string; size?: number } = $props();
  const filled = $derived(name in FILL);
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  aria-hidden="true"
  fill={filled ? 'currentColor' : 'none'}
  stroke={filled ? 'none' : 'currentColor'}
  stroke-width="1.9"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d={filled ? FILL[name] : STROKE[name]} />
  {#if name === 'repeat-one'}
    <path d={STROKE.repeat} /><text x="12" y="15" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">1</text>
  {/if}
</svg>
