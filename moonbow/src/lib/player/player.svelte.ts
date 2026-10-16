// The player: queue, transport and the glue between the engine, the source and the OS.

import { library } from '../library.svelte';
import { source } from '../sources';
import { artistLine, type Track } from '../sources/types';
import { toasts } from '../toasts.svelte';
import { Engine } from './engine';
import { appendUnique, indexAfterMove, move, nextIndex, prevIndex, shuffleUpcoming, type Repeat } from './queue';
import { load, save } from '../util/persist';
import { taste } from '../taste/store.svelte';
import { FeatureMeter } from '../taste/features';
import type { Steer } from '../taste/recommend';

const PRELOAD_AT = 25; // seconds before the end to start buffering the next track
const RADIO_WHEN_LEFT = 2; // fetch more radio tracks when this few remain
const SKIP_MEMORY = 30 * 60_000; // how long a session skip steers autoplay

/** The listen in progress, finalised into the taste model when the track changes. */
interface Session {
  track: Track;
  chosen: boolean;
  listened: number;
  lastT: number;
}

export interface PlayOptions {
  /** Why each track is here (shown in the UI). */
  reasons?: Record<string, string>;
  /** Treat the started track as picked by you (the default for clicks). */
  chosen?: boolean;
}

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
  /** How autoplay picks what comes next. */
  steer = $state<Steer>(load('steer', 'similar'));
  /** Sleep timer: a timestamp, 'end' (after this song), or null. */
  sleepAt = $state<number | 'end' | null>(null);

  /** Why a queued track was picked, when it came from a mix or autoplay. */
  reasons = $state<Record<string, string>>({});

  current = $derived(this.index >= 0 ? this.queue[this.index] : undefined);
  reason = $derived(this.current ? this.reasons[this.current.id] : undefined);
  upNext = $derived(this.queue.slice(this.index + 1));

  #engine: Engine;
  #urls = new Map<string, string>();
  #radioLoading = false;
  #retried = new Set<string>();
  #unshuffled: Track[] | null = null;
  #loadToken = 0;
  #session: Session | null = null;
  #meter = new FeatureMeter();
  #recent: Track[] = [];
  #skipped: { track: Track; at: number }[] = [];
  #autoAdded = new Set<string>();
  #autoSkipStreak = 0;

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
    this.#engine.setNormalize(library.settings.normalize);
    if (typeof window !== 'undefined') {
      setInterval(() => this.#tick(), 200);
      // Sound fingerprint for the taste model, sampled from the visualiser's analyser.
      setInterval(() => {
        if (!this.playing) return;
        const bins = this.#engine.spectrum();
        if (bins) this.#meter.add(bins, 0.05);
      }, 50);
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
  playTracks(tracks: Track[], start = 0, opts: PlayOptions = {}) {
    if (!tracks.length) return;
    this.#unshuffled = null;
    this.shuffled = false;
    this.queue = tracks.slice();
    this.#autoAdded.clear();
    this.reasons = opts.reasons ? { ...opts.reasons } : {};
    void this.#start(start, 0, false, opts.chosen ?? true);
  }

  /** Warm the stream for a track the user is about to pick (hover, focus). */
  warm(t: Track) {
    source.prefetch?.(t);
  }

  setSteer(steer: Steer) {
    this.steer = steer;
    save('steer', steer);
    this.#resteer();
  }

  /** "More like this": learn it, and rebuild what's coming next around this song. */
  moreLikeThis() {
    const t = this.current;
    if (!t) return;
    taste.feedback(t, 'more');
    if (this.steer !== 'similar') {
      this.steer = 'similar';
      save('steer', 'similar');
    }
    this.#resteer();
    toasts.show(`Up next: more like “${t.title}”`);
  }

  /** Replace autoplay picks that haven't played yet with fresh ones for the current steer. */
  #resteer() {
    const head = this.queue.slice(0, this.index + 1);
    const tail = this.queue.slice(this.index + 1).filter((x) => !this.#autoAdded.has(x.id));
    this.queue = [...head, ...tail];
    void this.#maybeRadio(true);
  }

  setSleep(minutes: number | 'end' | null) {
    this.sleepAt = minutes === null ? null : minutes === 'end' ? 'end' : Date.now() + minutes * 60_000;
    if (minutes !== null) toasts.show(minutes === 'end' ? 'Stopping after this song' : `Stopping in ${minutes} minutes`);
  }

  /** Play one track now and fill the rest of the queue with its radio. */
  playRadio(t: Track) {
    this.playTracks([t]);
  }

  playAt(i: number) {
    if (i >= 0 && i < this.queue.length) void this.#start(i, 0, false, true);
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

  async #start(i: number, startAt = 0, fresh = false, chosen = false) {
    const token = ++this.#loadToken;
    const t = this.queue[i];
    // A retry of the same track continues the same listen.
    if (this.#session?.track.id !== t.id || !fresh) this.#begin(t, chosen);
    this.index = i;
    this.position = startAt;
    this.duration = t.duration;
    this.buffering = true;
    library.recordPlay(t);
    this.#updateMediaSession();
    // The next two are resolved right away so skipping ahead is instant.
    for (const n of this.queue.slice(i + 1, i + 3)) source.prefetch?.(n);
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
    void this.#start(prevIndex({ tracks: this.queue, index: this.index }, this.repeat), 0, false, true);
  }

  seek(t: number) {
    this.#engine.seek(t);
    this.position = t;
  }

  seekBy(d: number) {
    this.seek(Math.max(0, this.#engine.time + d));
  }

  setNormalize(on: boolean) {
    this.#engine.setNormalize(on);
    library.updateSettings({ normalize: on });
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
    const now = this.#engine.time;
    const ses = this.#session;
    if (ses && ses.track.id === this.current.id) {
      // Count only time actually heard: seeks jump, they don't listen.
      const d = now - ses.lastT;
      if (this.playing && d > 0 && d < 1.5) ses.listened += d;
      ses.lastT = now;
    }
    this.position = now;
    if (typeof this.sleepAt === 'number' && Date.now() >= this.sleepAt && this.playing) {
      this.sleepAt = null;
      this.toggle();
      toasts.show('Sleep timer: paused. Good night.');
    }
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
    if (this.sleepAt === 'end') {
      this.sleepAt = null;
      this.#finish(true);
      this.playing = false;
      this.#engine.pause();
      return;
    }
    const i = nextIndex({ tracks: this.queue, index: this.index }, this.repeat, false);
    if (i < 0) {
      this.#finish(true);
      this.playing = false;
      this.seek(0);
      this.#engine.pause();
      return;
    }
    if (i === this.index) {
      this.#finish(true);
      this.#begin(this.queue[i], false);
      this.seek(0);
      void this.#engine.play();
      return;
    }
    this.#finish(true);
    const url = this.#urls.get(this.queue[i].id);
    if (url && this.#engine.advancePreloaded(url)) return;
    void this.#start(i);
  }

  /** The engine switched decks on its own (gapless or crossfade). */
  #advanced() {
    const i = nextIndex({ tracks: this.queue, index: this.index }, this.repeat, false);
    if (i < 0) return;
    this.#finish(true);
    this.#begin(this.queue[i], false);
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

  async #maybeRadio(force = false) {
    if (!library.settings.autoplay || this.#radioLoading || !this.current || this.repeat !== 'off') return;
    if (!force && this.queue.length - this.index - 1 > RADIO_WHEN_LEFT) return;
    this.#radioLoading = true;
    try {
      const cutoff = Date.now() - SKIP_MEMORY;
      const skipped = this.#skipped.filter((x) => x.at > cutoff).map((x) => x.track);
      // Anchored on what's playing; your taste and the steer decide the order.
      let picks = await taste.next(this.current, { recent: this.#recent, skipped, steer: this.steer }).catch(() => []);
      if (picks.length < 3) picks = (await source.radio(this.current)).map((track) => ({ track, reason: 'From YouTube Music radio' }));
      const before = this.queue.length;
      this.queue = appendUnique(this.queue, picks.map((p) => p.track));
      for (const p of picks) {
        this.reasons[p.track.id] ??= p.reason;
        this.#autoAdded.add(p.track.id);
      }
      if (this.queue.length === before && !picks.length) return;
    } catch {
      // Autoplay is best effort.
    } finally {
      this.#radioLoading = false;
    }
  }

  // ---- listening sessions (what the taste model learns from) ----

  #begin(t: Track, chosen: boolean) {
    this.#finish(false);
    this.#session = { track: t, chosen, listened: 0, lastT: this.#engine.time };
    this.#meter.reset();
  }

  #finish(ended: boolean) {
    const ses = this.#session;
    if (!ses) return;
    this.#session = null;
    if (ses.listened < 1 && !ended) return; // never really started
    const duration = this.#engine.duration || ses.track.duration;
    const outcome = taste.record({
      track: ses.track, listened: ses.listened, duration, ended, chosen: ses.chosen, at: new Date(), feat: this.#meter.result() ?? undefined,
    });
    this.#recent = [...this.#recent.slice(-19), ses.track];
    const skip = outcome === 'skip' || outcome === 'early-skip';
    if (skip) this.#skipped = [...this.#skipped.slice(-19), { track: ses.track, at: Date.now() }];
    // Two quick skips of autoplay picks in a row: the queue is off. Re-steer it now.
    if (skip && !ses.chosen && this.#autoAdded.has(ses.track.id)) {
      if (++this.#autoSkipStreak >= 2) {
        this.#autoSkipStreak = 0;
        // After the index has moved to the next song, so that song is kept.
        setTimeout(() => this.#resteer(), 0);
        toasts.show('Got it. Steering away from that sound.');
      }
    } else if (!skip) this.#autoSkipStreak = 0;
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
