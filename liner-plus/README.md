# Verse

A small, fast desktop player for YouTube Music, with karaoke-style word-synced lyrics and visuals that move with the music. It's open source (MIT) and needs no account or backend.

Verse is a from-scratch take on the same idea as [Liner](https://github.com/tryliner). It shares none of Liner's code.

## What's different

| | Liner | Verse |
|---|---|---|
| Shell | Electron (bundles Chromium, ~100 MB+) | Tauri (uses the OS webview): a 7.3 MB binary, 3.2 MB `.deb` |
| Backend | Its own private "Liner API" | None. Talks to YouTube Music directly and resolves streams locally with yt-dlp |
| Lyrics | Syllable timing from their backend | [LRCLIB](https://lrclib.net) (open, community-synced). Uses exact word timing when available, otherwise estimates word timing from syllables, so every synced song gets karaoke highlighting |
| Lyrics extras | | Click a line to seek, adjust timing per song (`[` `]`), romanization (Cyrillic, Greek, Korean, Japanese kana), animated interlude dots, text size |
| Visuals | WebGL shader | WebGL gradient built from each cover's colors, pulsing with the bass via a live Web Audio spectrum. Reactive, calm or off modes; respects reduced motion |
| Playback | | Gapless (the next track is buffered on a second deck), optional crossfade, radio autoplay when the queue runs out, OS media keys |
| Control | | Keyboard-first: `Ctrl K` command palette for search, your library and commands; `?` lists every shortcut |
| License | Source-available, non-commercial, no forks | MIT |
| Extending | | Every view talks to one `MusicSource` interface (`src/lib/sources/types.ts`). Adding a source (local files, another service) doesn't touch the UI |

## Be aware

- **This is an unofficial YouTube Music client.** It uses YouTube's private InnerTube API (through [youtubei.js](https://github.com/LuanRT/YouTube.js)) and [yt-dlp](https://github.com/yt-dlp/yt-dlp) to get audio, which is against YouTube's Terms of Service. Use it for personal listening. Publishing builds widely invites a takedown. It isn't affiliated with YouTube or Google.
- **YouTube changes things often.** When playback breaks, the fix is almost always a newer yt-dlp. Verse updates the copy it downloads by itself on every launch. If you installed yt-dlp yourself, update it (`yt-dlp -U`, or your package manager).
- **yt-dlp needs a JavaScript runtime for YouTube.** Install [Deno](https://deno.land) (recommended) or Node.js and Verse passes it to yt-dlp automatically.
- No sign-in, so there's no YouTube library sync. Likes, history and playlists are stored locally.

## How it works

```
┌──────────── webview (Svelte 5) ─────────────┐        ┌────────── Rust (Tauri) ──────────┐
│ youtubei.js ── search/browse/radio ─────────┼─ IPC ──► tauri-plugin-http (no CORS)      │──► music.youtube.com
│ LRCLIB lyrics ──────────────────────────────┼─ IPC ──► tauri-plugin-http                 │──► lrclib.net
│ <audio> ×2 → Web Audio → analyser → shader  │◄─ http ─ 127.0.0.1 proxy (Range, CORS)     │──► *.googlevideo.com
│                                             │         └ yt-dlp resolves id → stream URL  │
└─────────────────────────────────────────────┘        └───────────────────────────────────┘
```

- **Streams:** the `<audio>` element loads `http://127.0.0.1:<port>/<random-token>/stream/<videoId>`. On the first request the proxy runs yt-dlp, caches the signed URL until shortly before it expires, and forwards Range requests with the headers yt-dlp says are required. If an upstream 403 says the URL has gone stale, the proxy re-resolves it once. The proxy adds CORS headers, which lets Web Audio analyse the stream for the visuals.
- **Prefetch:** 25 s before a track ends, the next stream is resolved and buffered on the idle deck. Tracks then switch with no gap, or crossfade if you've turned that on.
- **Formats:** Opus on Windows and Linux, AAC on macOS (WKWebView's safest codec).

## Run it

Needs Node 22 and Rust (stable). On Linux you also need WebKitGTK: `sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`. To play Opus/AAC, install the GStreamer plugins (`gstreamer1.0-plugins-good`, `gstreamer1.0-libav`).

```sh
cd liner-plus
npm install
npm run app        # desktop app with hot reload
npm run dist       # installers in src-tauri/target/release/bundle/
```

`npm run dev` opens the UI in a normal browser with a **built-in demo source**: synthesized songs with original lyrics, so you can work on the UI offline. `VERSE_DEMO=1 npm run app` runs the desktop app on the demo catalogue. `VERSE_DEMO=proxy` also streams it through the native audio proxy and yt-dlp (point `VERSE_YTDLP` at a stub to test playback without YouTube).

```sh
npm test           # lyrics parser, word timing, romanization, queue, YouTube mapping
npm run check      # svelte-check / TypeScript
npm run smoke      # drives the whole UI in headless Chromium against the demo source
cargo test --manifest-path src-tauri/Cargo.toml   # proxy (ranges, CORS, expiry retry) and yt-dlp parsing
```

CI (`.github/workflows/verse.yml`) runs all of these, then builds `.deb`/`.AppImage`, a universal `.dmg` and a Windows installer as downloadable artifacts. The builds are unsigned, so macOS needs right-click → Open the first time.

## Keyboard

`Space` play/pause · `Shift ←/→` previous/next · `←/→` seek 5 s · `↑/↓` volume · `M` mute · `L` lyrics · `Q` queue · `S` shuffle · `R` repeat · `F` like · `[ ]` lyric timing · `Ctrl K` or `/` search & commands · `Alt ←/→` back/forward · `?` help

## Layout

```
src/lib/sources/   MusicSource interface, YouTube Music adapter (+ pure mappers), demo source
src/lib/player/    two-deck audio engine, queue logic, player store
src/lib/lyrics/    LRC/enhanced-LRC parser, word-timing estimator, romanizer, LRCLIB provider
src/lib/visuals/   palette extraction (k-means on cover art), WebGL background
src/components/    UI; Lyrics.svelte drives word fill from a rAF loop, not reactive state
src/pages/         Home, Search, Album/Playlist, Artist, Library, local playlists
src-tauri/src/     proxy.rs (local audio proxy), ytdlp.rs (resolver, cache, auto-download)
```

## Known limits

- **Not yet run against live YouTube.** The machine this was built on couldn't reach YouTube. What was verified: unit tests for the mappers, lyrics and queue; a full UI smoke test; Rust tests for the proxy; and the real Linux app playing audio through the proxy from a stubbed yt-dlp. The youtubei.js parsing against real responses is the part most likely to need a first round of fixes.
- Verified on Linux (WebKitGTK) only. macOS (WKWebView) and Windows (WebView2) builds come from CI but haven't been tried by hand.
- Kanji and Chinese characters aren't romanized: that needs a dictionary.
- No YouTube account features (your YT library, uploads, likes sync).
