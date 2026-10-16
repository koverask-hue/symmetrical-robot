# Moonbow

**A music player that learns you.** YouTube Music's catalogue, a taste engine that runs on your own computer, karaoke lyrics, and an aurora sky lit by whatever's playing.

A moonbow is a rainbow made by moonlight: rare, quiet, only visible at night. That's the feel this app aims for.

## What makes it personal

Big streaming apps personalise with everyone's data on their servers. Moonbow takes the "crowd" half from YouTube Music and keeps the "you" half on your machine:

| Layer | What it does |
|---|---|
| **The crowd** | Every time you finish or love a song, Moonbow fetches its YouTube Music radio and adds it to a **song graph** (what goes with what, according to millions of listeners). |
| **You** | A taste model on your computer learns from **every signal**: finishing, skipping (an early skip counts more than a late one), replaying within days, loving, *more / less like this*, hiding an artist, adding to a playlist, and whether you chose a song or it autoplayed. Scores decay with a 45-day half-life, so it follows your taste as it changes. |
| **When** | It learns **when** you play each artist (late night, morning, afternoon, evening; weekday vs weekend) and leans your mixes toward what fits the moment. |
| **How it sounds** | While a song plays, it measures three numbers from the audio: **energy, brightness, pulse**. Over time it learns the sound you want at each time of day. |
| **How adventurous** | It watches how you treat songs you've never heard and tunes the ratio of new to familiar picks automatically. You can override it. |
| **Real time** | Skip two autoplay picks in a row and the queue re-steers immediately, away from those artists for the session. |

Recommendations are **personalised PageRank** over the song graph, seeded by your strongest songs for this moment, then scored with your artist affinity, time-of-day fit, sound match, novelty appetite and fatigue (nothing you heard an hour ago), and spread out so no artist dominates. **Every pick says why**: *"You play Kavinsky in the evening"*, *"New to you · close to 'Nightcall'"*.

### What you get

- **For you**: a greeting with your name and a line about what you've been into, then the **right-now mix** (named for the moment, e.g. *Thursday evening*), your **worlds** (clusters of your taste found by community detection on the artist graph, each an endless mix), **Fresh finds**, **On repeat** and **Back in rotation**.
- **Your sound**: your taste drawn as a **constellation** (artists as stars sized by love, coloured by world, linked by listeners), what the model has learned in plain sentences, when you listen, how your music sounds by time of day, and controls (adventurousness, hidden artists, forget everything).
- **Onboarding**: your name, a few artists you love, how adventurous you are. Day one is already yours.

### Honest limits

- It needs listening to get sharp. Onboarding makes day one decent, and about a week of normal use makes it genuinely good.
- It can't see what *other Moonbow users* do. The crowd signal is YouTube's, which is broad but not as fine-grained as Spotify's internal data.
- Everything lives in this app's local storage. Reinstalling the OS or clearing app data resets it.

## Design

Black, clean, one accent.

- **Surfaces:** near-black in four steps with hairline borders. No glass over moving content, no blur, no WebGL, so it stays fast.
- **Type:** Geist for everything you read, Geist Mono for the small facts: times, counts, the codec badge (`OPUS · 160`), labels and the reason on every pick.
- **One accent colour:** Volt lime by default; Ice, Ember, Orchid or Silver in Settings. The playing cover only adds a faint ambient glow.
- **One player:** the bottom bar is the only set of controls. The lyrics stage shows the cover and the words, nothing duplicated.

## Also

- **Sidebar** like Spotify, Tidal and Apple Music: For you, Search, Your sound, Liked songs, Recently played, saved Albums, followed Artists, your mixes and your playlists. Collapse it with `B`.
- **Steer what plays next:** Similar, Discover, Favorites or This artist, from the player bar or the queue. Autoplay is anchored on the song playing, so the next one is always close to it. **More like this** (`⇧M`) rebuilds what's coming right now.
- **Follow artists, save albums** (both feed the taste model), **sleep timer**, **volume normalization**, and the next song shown under the progress bar.

- **Lyrics**: word-by-word karaoke in serif type that glows in the song's colour. Uses exact word timing when LRCLIB has it, otherwise estimates it from syllables. Click a line to seek, nudge timing per song (`[` `]`), romanize Cyrillic, Greek, Korean and kana.
- **Playback**: gapless (the next song is buffered on a second deck), optional crossfade, OS media keys.
- **Keyboard first**: `Ctrl K` for everything, `?` lists all shortcuts.
- **Small**: Tauri, not Electron. A 3.5 MB `.deb`.

## Be aware

- **Unofficial YouTube Music client.** It uses YouTube's private InnerTube API (via [youtubei.js](https://github.com/LuanRT/YouTube.js)) and [yt-dlp](https://github.com/yt-dlp/yt-dlp) for audio, which is against YouTube's Terms of Service. For personal listening only. Not affiliated with YouTube or Google.
- **Install [Deno](https://deno.land)** (or Node). yt-dlp needs a JavaScript runtime for YouTube. Moonbow downloads yt-dlp and keeps it updated by itself.
- **When YouTube changes things**, a newer yt-dlp is almost always the fix, and it updates on launch.

## How it works

```
┌──────────── webview (Svelte 5) ─────────────┐          ┌────────── Rust (Tauri) ───────────┐
│ youtubei.js ── browse/search/radio ─────────┼─ IPC ──► yt_request: browser-accurate      │──► youtube.com
│                                             │          Origin/User-Agent (no 403s)       │
│ taste engine (IndexedDB) ◄─ listens, skips, │          tauri-plugin-http                 │──► lrclib.net
│   replays, likes, audio features            │                                           │
│ <audio> ×2 → Web Audio → analyser → sky     │◄─ http ─ 127.0.0.1 proxy (Range, CORS)     │──► googlevideo.com
│                         └→ feature meter    │          └ yt-dlp: id → stream URL        │
└─────────────────────────────────────────────┘          └───────────────────────────────────┘
```

InnerTube calls go through Rust (`src-tauri/src/ytweb.rs`) because a webview HTTP bridge sends `Origin: tauri://localhost`, which YouTube answers with **403**. Rust sends what a desktop browser on youtube.com would, and can only reach YouTube hosts.

## Run it

Needs Node 22 and Rust (stable). On Linux also: `sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev gstreamer1.0-plugins-good gstreamer1.0-libav`.

```sh
cd moonbow
npm install
npm run app        # desktop app with hot reload
npm run dist       # installers in src-tauri/target/release/bundle/
```

`npm run dev` opens the UI in a browser with a **built-in demo catalogue** (synthesized songs, original lyrics), so the whole app, taste engine included, works offline. `MOONBOW_DEMO=1 npm run app` runs the desktop app on it. `MOONBOW_DEMO=proxy` also streams through the native audio proxy (point `MOONBOW_YTDLP` at a stub).

```sh
npm test           # taste model, graph, recommender, lyrics, romanizer, queue, YouTube mapping
npm run check      # svelte-check / TypeScript
npm run smoke      # onboarding → mixes → stage → feedback → your sound, in headless Chromium
cargo test --manifest-path src-tauri/Cargo.toml   # InnerTube headers, audio proxy, yt-dlp parsing
```

## Layout

```
src/lib/taste/     model.ts (signals → affinities), graph.ts (song graph, PageRank, worlds),
                   recommend.ts (ranking, mixes, reasons, insights), features.ts (audio fingerprint),
                   store.svelte.ts (persistence, graph growth, mix building)
src/lib/sources/   MusicSource interface, YouTube Music adapter, demo source
src/lib/player/    two-deck audio engine, queue, player (feeds every listen to the taste model)
src/lib/lyrics/    LRC parser, word-timing estimator, romanizer, LRCLIB provider
src/lib/visuals/   palette extraction, aurora sky shader
src/components/    UI · src/pages/ views
src-tauri/src/     ytweb.rs (InnerTube bridge), proxy.rs (audio proxy), ytdlp.rs (stream resolver)
```

## Status

The 403 is fixed at its cause, and the Rust request builder is unit-tested. The full app runs end to end against the demo catalogue and a stubbed yt-dlp. It has **still not been run against live YouTube**: the build machine can't reach it. Verified on Linux (WebKitGTK); macOS and Windows builds come from CI.
