// The player: queue, transport and the glue between the engine, the source and the OS.

import { library } from '../library.svelte';
import { source } from '../sources';
import { artistLine, type Track } from '../sources/types';
import { toasts } from '../toasts.svelte';
import { Engine } from './engine';
import { appendUnique, indexAfterMove, move, nextIndex, prevIndex, shuffleUpcoming, type Repeat } from './queue';
import { load, save } from '../util/persist';

const PRELOAD_AT = 25; // seconds before the end to start buffering the next track
const RADIO_WHEN_LEFT = 2; // fetch more radio tracks when this few remain

class Player {
  queue = $state<Track[]>([]);
  index = $state(-1);
  playing = $state(false);
  buffering = $state(false);
  /** Coarse position for the UI (updated ~5×/s). Use `time()` for frame-accurate reads. */
  position = $state(0);
  duration = $state(0);
  volume = $state<number>(load('volume', 0.8));
  muted = $state(false);
  repeat = $state<Repeat>(load('repeat', 'off'));
  shuffled = $state(false);

  current = $derived(this.index >= 0 ? this.queue[this.index] : undefined);
  upNext = $derived(this.queue.slice(this.index + 1));

  #engine: Engine;
  #urls = new Map<string, string>();
  #radioLoading = false;
  #retried = new Set<string>();
  #unshuffled: Track[] | null = null;
  #loadToken = 0;

  constructor() {
    this.#engine = new Engine({
      onEnded: () => this.#onEnded(),
      onError: (e) => this.#onError(e),
      onBuffering: (b) => (this.buffering = b),
      onDuration: (d) => {
        if (Number.isFinite(d) && d > 0) this.duration = d;
      },
      onAdvanced: () => this.#advanced(),
    });
    this.#engine.setVolume(this.volume);
    this.#engine.crossfade = library.settings.crossfade;
    if (typeof window !== 'undefined') {
      setInterval(() => this.#tick(), 200);
      this.#mediaSession();
    }
  }

  time = () => this.#engine.time;
  spectrum = () => this.#engine.spectrum();

  async #url(t: Track): Promise<string> {
    let u = this.#urls.get(t.id);
    if (!u) {
      u = await source.streamUrl(t);
      this.#urls.set(t.id, u);
    }
    return u;
  }

  // ---- queue ----

  /** Replace the queue and start playing. */
  playTracks(tracks: Track[], start = 0) {
    if (!tracks.length) return;
    this.#unshuffled = null;
    this.shuffled = false;
    this.queue = tracks.slice();
    void this.#start(start);
  }

  /** Play one track now and fill the rest of the queue with its radio. */
  playRadio(t: Track) {
    this.playTracks([t]);
  }

  playAt(i: number) {
    if (i >= 0 && i < this.queue.length) void this.#start(i);
  }

  playNext(t: Track) {
    if (!this.current) return this.playTracks([t]);
    const cur = this.current;
    const q = this.queue.filter((x, i) => x.id !== t.id || i === this.index);
    const idx = q.findIndex((x) => x.id === cur.id);
    q.splice(idx + 1, 0, t);
    this.queue = q;
    this.index = idx;
    toasts.show(`Playing next: ${t.title}`);
  }

  addToQueue(tracks: Track[]) {
    if (!this.current) return this.playTracks(tracks);
    this.queue = appendUnique(this.queue, tracks);
    toasts.show(tracks.length === 1 ? `Added to queue: ${tracks[0].title}` : `Added ${tracks.length} tracks to queue`);
  }

  removeAt(i: number) {
    if (i === this.index) return;
    this.queue = this.queue.filter((_, j) => j !== i);
    if (i < this.index) this.index--;
  }

  moveItem(from: number, to: number) {
    this.queue = move(this.queue, from, to);
    this.index = indexAfterMove(this.index, from, to);
  }

  clearUpcoming() {
    this.queue = this.queue.slice(0, this.index + 1);
  }

  toggleShuffle() {
    if (this.shuffled && this.#unshuffled) {
      const cur = this.current;
      this.queue = this.#unshuffled;
      this.index = Math.max(0, this.queue.findIndex((t) => t.id === cur?.id));
      this.#unshuffled = null;
      this.shuffled = false;
    } else {
      this.#unshuffled = this.queue.slice();
      this.queue = shuffleUpcoming(this.queue, this.index);
      this.shuffled = true;
    }
  }

  cycleRepeat() {
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    save('repeat', this.repeat);
  }

  // ---- transport ----

  async #start(i: number, startAt = 0, fresh = false) {
    const token = ++this.#loadToken;
    this.index = i;
    const t = this.queue[i];
    this.position = startAt;
    this.duration = t.duration;
    this.buffering = true;
    library.recordPlay(t);
    this.#updateMediaSession();
    try {
      let url = await this.#url(t);
      if (fresh) url += `${url.includes('?') ? '&' : '?'}fresh=1`;
      if (token !== this.#loadToken) return;
      await this.#engine.load(url, true, startAt);
      this.playing = true;
    } catch (e) {
      if (token === this.#loadToken) this.#onError(String((e as Error)?.message ?? e));
    }
    void this.#maybeRadio();
  }

  toggle() {
    if (!this.current) return;
    if (this.#engine.paused) {
      void this.#engine.play();
      this.playing = true;
    } else {
      this.#engine.pause();
      this.playing = false;
    }
  }

  next() {
    const i = nextIndex({ tracks: this.queue, index: this.index }, this.repeat, true);
    if (i >= 0) void this.#start(i);
  }

  prev() {
    if (this.#engine.time > 3) return this.seek(0);
    void this.#start(prevIndex({ tracks: this.queue, index: this.index }, this.repeat));
  }

  seek(t: number) {
    this.#engine.seek(t);
    this.position = t;
  }

  seekBy(d: number) {
    this.seek(Math.max(0, this.#engine.time + d));
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.muted = false;
    this.#engine.setVolume(this.volume);
    save('volume', this.volume);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.#engine.setVolume(this.muted ? 0 : this.volume);
  }

  setCrossfade(s: number) {
    this.#engine.crossfade = s;
    library.updateSettings({ crossfade: s });
  }

  // ---- internals ----

  #nextTrack(): Track | undefined {
    const i = nextIndex({ tracks: this.queue, index: this.index }, this.repeat, false);
    return i >= 0 && i !== this.index ? this.queue[i] : undefined;
  }

  #tick() {
    if (!this.current) return;
    this.position = this.#engine.time;
    const d = this.#engine.duration;
    if (d > 0) this.duration = d;
    const left = this.duration - this.position;
    const next = this.#nextTrack();
    if (next && left > 0 && left < PRELOAD_AT) {
      source.prefetch?.(next);
      const known = this.#urls.get(next.id);
      if (known) this.#engine.preload(known);
      else void this.#url(next).then((u) => this.#engine.preload(u));
      this.#engine.tick(known);
    }
  }

  #onEnded() {
    const i = nextIndex({ tracks: this.queue, index: this.index }, this.repeat, false);
    if (i < 0) {
      this.playing = false;
      this.seek(0);
      this.#engine.pause();
      return;
    }
    if (i === this.index) {
      this.seek(0);
      void this.#engine.play();
      return;
    }
    const url = this.#urls.get(this.queue[i].id);
    if (url && this.#engine.advancePreloaded(url)) return;
    void this.#start(i);
  }

  /** The engine switched decks on its own (gapless or crossfade). */
  #advanced() {
    const i = nextIndex({ tracks: this.queue, index: this.index }, this.repeat, false);
    if (i < 0) return;
    this.index = i;
    this.duration = this.#engine.duration || this.queue[i].duration;
    library.recordPlay(this.queue[i]);
    this.#updateMediaSession();
    void this.#maybeRadio();
  }

  #onError(e: string) {
    const t = this.current;
    if (!t) return;
    // The cached stream URL may have expired; ask the proxy for a fresh one once.
    if (!this.#retried.has(t.id)) {
      this.#retried.add(t.id);
      void this.#start(this.index, this.#engine.time, true);
      return;
    }
    toasts.error(`Couldn't play “${t.title}”: ${e}`);
    this.buffering = false;
    if (this.index + 1 < this.queue.length) this.next();
    else this.playing = false;
  }

  async #maybeRadio() {
    if (!library.settings.autoplay || this.#radioLoading || !this.current || this.repeat !== 'off') return;
    if (this.queue.length - this.index - 1 > RADIO_WHEN_LEFT) return;
    this.#radioLoading = true;
    try {
      const more = await source.radio(this.current);
      this.queue = appendUnique(this.queue, more);
    } catch {
      // Radio is best effort.
    } finally {
      this.#radioLoading = false;
    }
  }

  #mediaSession() {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const set = (a: MediaSessionAction, fn: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(a, fn);
      } catch {
        /* unsupported action */
      }
    };
    set('play', () => !this.playing && this.toggle());
    set('pause', () => this.playing && this.toggle());
    set('nexttrack', () => this.next());
    set('previoustrack', () => this.prev());
    set('seekto', (d) => d.seekTime != null && this.seek(d.seekTime));
  }

  #updateMediaSession() {
    const t = this.current;
    if (!t || !navigator.mediaSession || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: artistLine(t),
      album: t.album?.name ?? '',
      artwork: t.art ? [{ src: t.art, sizes: '544x544' }] : [],
    });
  }
}

export const player = new Player();
