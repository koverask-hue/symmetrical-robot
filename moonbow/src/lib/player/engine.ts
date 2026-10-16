// Audio engine: two <audio> decks so the next track is already buffered when the
// current one ends (gapless), with optional crossfade, routed through Web Audio
// so the visuals can read a live spectrum.

type DeckEvent = 'ended' | 'error' | 'playing' | 'waiting' | 'loaded';

interface Deck {
  el: HTMLAudioElement;
  gain?: GainNode;
  src?: string;
}

export interface EngineEvents {
  onEnded(): void;
  onError(err: string): void;
  onBuffering(b: boolean): void;
  onDuration(d: number): void;
  /** Fired when the preloaded deck took over (gapless or crossfade). */
  onAdvanced(): void;
}

const FFT = 256;

export class Engine {
  #decks: [Deck, Deck];
  #active = 0;
  #ctx?: AudioContext;
  #master?: GainNode;
  #comp?: DynamicsCompressorNode;
  #normalize = false;
  #analyser?: AnalyserNode;
  #bins = new Uint8Array(FFT / 2);
  #volume = 1;
  #crossfading = false;
  crossfade = 0;

  constructor(private ev: EngineEvents) {
    this.#decks = [this.#makeDeck(0), this.#makeDeck(1)];
  }

  #makeDeck(i: number): Deck {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    const deck: Deck = { el };
    const on = (type: string, fn: (e: DeckEvent) => void, e: DeckEvent) => el.addEventListener(type, () => fn(e));
    const handle = (e: DeckEvent) => this.#event(i, e);
    on('ended', handle, 'ended');
    on('error', handle, 'error');
    on('playing', handle, 'playing');
    on('waiting', handle, 'waiting');
    on('loadedmetadata', handle, 'loaded');
    return deck;
  }

  #event(i: number, e: DeckEvent) {
    const active = i === this.#active;
    const el = this.#decks[i].el;
    if (!active) {
      // Errors on the preloading deck are reported only once it would become active.
      if (e === 'error') this.#decks[i].src = undefined;
      return;
    }
    switch (e) {
      case 'ended':
        if (!this.#crossfading) this.ev.onEnded();
        break;
      case 'error':
        if (el.src) this.ev.onError(el.error?.message || `media error ${el.error?.code ?? ''}`.trim());
        break;
      case 'playing':
        this.ev.onBuffering(false);
        break;
      case 'waiting':
        this.ev.onBuffering(true);
        break;
      case 'loaded':
        this.ev.onDuration(el.duration);
        break;
    }
  }

  /** Builds the Web Audio graph. Must run inside a user gesture the first time. */
  #ensureGraph() {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') void this.#ctx.resume();
      return;
    }
    try {
      const ctx = new AudioContext({ latencyHint: 'playback' });
      const master = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT;
      analyser.smoothingTimeConstant = 0.78;
      master.gain.value = this.#volume;
      // Gentle compressor for level-matching loud and quiet songs; bypassed when off.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 24;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.005;
      comp.release.value = 0.3;
      this.#comp = comp;
      master.connect(analyser);
      this.#route(analyser, ctx.destination);
      for (const d of this.#decks) {
        d.gain = ctx.createGain();
        ctx.createMediaElementSource(d.el).connect(d.gain).connect(master);
        d.el.volume = 1;
      }
      this.#ctx = ctx;
      this.#master = master;
      this.#analyser = analyser;
    } catch {
      // No Web Audio: fall back to element volume, visuals run without audio input.
      for (const d of this.#decks) d.el.volume = this.#volume;
    }
  }

  #route(analyser: AnalyserNode, dest: AudioNode) {
    analyser.disconnect();
    this.#comp?.disconnect();
    if (this.#normalize && this.#comp) analyser.connect(this.#comp).connect(dest);
    else analyser.connect(dest);
  }

  setNormalize(on: boolean) {
    this.#normalize = on;
    if (this.#ctx && this.#analyser) this.#route(this.#analyser, this.#ctx.destination);
  }

  get #deck() {
    return this.#decks[this.#active];
  }
  get #other() {
    return this.#decks[1 - this.#active];
  }

  get time() {
    return this.#deck.el.currentTime || 0;
  }
  get duration() {
    const d = this.#deck.el.duration;
    return Number.isFinite(d) ? d : 0;
  }
  get paused() {
    return this.#deck.el.paused;
  }

  async load(url: string, autoplay: boolean, startAt = 0) {
    this.#ensureGraph();
    this.#crossfading = false;
    const other = this.#other;
    if (other.src === url && other.el.readyState >= 2) {
      // Already preloaded on the other deck.
      this.#swap();
    } else {
      const d = this.#deck;
      d.el.pause();
      d.src = url;
      d.el.src = url;
      if (d.gain) d.gain.gain.value = 1;
    }
    this.#silence(this.#other);
    const el = this.#deck.el;
    if (startAt > 0) el.currentTime = startAt;
    if (autoplay) await this.play();
  }

  /** Starts buffering the next track on the idle deck. */
  preload(url: string | undefined) {
    const o = this.#other;
    if (!url || o.src === url || this.#crossfading) return;
    o.src = url;
    o.el.src = url;
    o.el.load();
  }

  /** Called by the store each frame-ish; starts a crossfade when the tail is reached. */
  tick(nextUrl: string | undefined) {
    if (!this.crossfade || this.#crossfading || !nextUrl || this.paused) return;
    const left = this.duration - this.time;
    if (this.duration > this.crossfade * 3 && left > 0 && left <= this.crossfade && this.#other.src === nextUrl && this.#other.el.readyState >= 3) {
      this.#startCrossfade(left);
    }
  }

  #startCrossfade(seconds: number) {
    const ctx = this.#ctx;
    const from = this.#deck;
    const to = this.#other;
    if (!ctx || !from.gain || !to.gain) return;
    this.#crossfading = true;
    const now = ctx.currentTime;
    to.gain.gain.setValueAtTime(0, now);
    to.gain.gain.linearRampToValueAtTime(1, now + seconds);
    from.gain.gain.setValueAtTime(from.gain.gain.value, now);
    from.gain.gain.linearRampToValueAtTime(0, now + seconds);
    to.el.currentTime = 0;
    void to.el.play();
    this.#active = 1 - this.#active;
    this.ev.onDuration(this.duration);
    this.ev.onAdvanced();
    setTimeout(() => {
      from.el.pause();
      this.#crossfading = false;
    }, seconds * 1000 + 100);
  }

  #swap() {
    this.#active = 1 - this.#active;
    const d = this.#deck;
    if (d.gain) d.gain.gain.value = 1;
    d.el.currentTime = 0;
    this.ev.onDuration(this.duration);
  }

  #silence(d: Deck) {
    if (!this.#crossfading) d.el.pause();
  }

  /** Gapless hand-off on 'ended' when the next track is already buffered. Returns false if not ready. */
  advancePreloaded(nextUrl: string): boolean {
    const o = this.#other;
    if (o.src !== nextUrl || o.el.readyState < 2) return false;
    this.#swap();
    void this.play();
    this.ev.onAdvanced();
    return true;
  }

  async play() {
    this.#ensureGraph();
    try {
      await this.#deck.el.play();
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') this.ev.onError(String((e as Error)?.message ?? e));
    }
  }

  pause() {
    for (const d of this.#decks) d.el.pause();
    this.#crossfading = false;
  }

  seek(t: number) {
    const el = this.#deck.el;
    if (Number.isFinite(t)) el.currentTime = Math.max(0, Math.min(t, this.duration || t));
  }

  setVolume(v: number) {
    this.#volume = v;
    if (this.#master && this.#ctx) this.#master.gain.setTargetAtTime(v, this.#ctx.currentTime, 0.03);
    else for (const d of this.#decks) d.el.volume = v;
  }

  /** Spectrum 0..255 per bin, or null when Web Audio is unavailable or audio is cross-origin. */
  spectrum(): Uint8Array | null {
    if (!this.#analyser) return null;
    this.#analyser.getByteFrequencyData(this.#bins);
    return this.#bins;
  }

  stop() {
    for (const d of this.#decks) {
      d.el.pause();
      d.el.removeAttribute('src');
      d.src = undefined;
      d.el.load();
    }
  }
}
