// Synthesised sound through a long generated reverb, so every click rings like stone in a nave.
export class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  // Browsers only allow audio after a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    this.master.connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.#impulse(4.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.8;
    this.dry.connect(this.master);
    this.#drone();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.1);
  }

  #impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  #out(node, wet = 1) {
    node.connect(this.dry);
    if (wet) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.reverb);
    }
  }

  #noise(duration) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  #drone() {
    // A low, quiet organ-like pad: two detuned fifths through a slow filter.
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    for (const f of [55, 55.4, 82.4, 110.2]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lp.connect(g);
    this.#out(g, 1.2);
  }

  // Pitched oscillator with an exponential glide and decay.
  #tone(t, { type = 'sine', f0, f1 = f0, dur, gain, wet = 1, attack = 0.01 }) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.#out(g, wet);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Filtered noise with a swept cutoff.
  #hiss(t, { filter = 'bandpass', f0, f1 = f0, q = 1, dur, gain, wet = 1, attack = 0.005 }) {
    const n = this.#noise(dur + 0.05);
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g);
    this.#out(g, wet);
    n.start(t);
  }

  #grains(t, { count, spread, lo, hi, gain, q = 10 }) {
    for (let i = 0; i < count; i++) {
      const at = t + Math.random() * spread;
      const f = lo + Math.random() * (hi - lo);
      this.#hiss(at, { f0: f, f1: f * 0.9, q, dur: 0.04 + Math.random() * 0.05, gain: gain * (0.3 + Math.random() * 0.7), wet: 0.8 });
    }
  }

  // Sounds for the kill finishers.
  #finisher(name, t) {
    switch (name) {
      case 'thunder':
        this.#hiss(t, { filter: 'highpass', f0: 3000, f1: 1500, dur: 0.18, gain: 0.8, wet: 0.6 });
        this.#hiss(t + 0.03, { filter: 'lowpass', f0: 2500, f1: 120, dur: 2.2, gain: 0.9, wet: 1.4 });
        this.#tone(t, { f0: 55, f1: 28, dur: 1.8, gain: 0.6, wet: 1.2 });
        return true;
      case 'whistle':
        this.#tone(t, { type: 'triangle', f0: 380, f1: 2600, dur: 1.3, gain: 0.12, attack: 0.05 });
        this.#hiss(t, { f0: 500, f1: 3000, q: 3, dur: 1.2, gain: 0.15 });
        return true;
      case 'incoming':
        this.#tone(t, { type: 'triangle', f0: 2400, f1: 260, dur: 0.95, gain: 0.13, attack: 0.05 });
        this.#hiss(t, { f0: 1200, f1: 180, q: 1.5, dur: 0.95, gain: 0.35, attack: 0.3 });
        return true;
      case 'ping':
        this.#tone(t, { f0: 2093, dur: 1.6, gain: 0.14, wet: 1.5 });
        this.#tone(t, { f0: 3136, dur: 1.2, gain: 0.05, wet: 1.5 });
        return true;
      case 'glass':
        this.#hiss(t, { filter: 'highpass', f0: 4000, f1: 2500, dur: 0.5, gain: 0.5 });
        this.#grains(t, { count: 30, spread: 1.4, lo: 3000, hi: 9000, gain: 0.3, q: 14 });
        return true;
      case 'rumble':
        this.#tone(t, { f0: 48, f1: 24, dur: 2.2, gain: 0.8, wet: 1.2, attack: 0.05 });
        this.#hiss(t, { filter: 'lowpass', f0: 500, f1: 70, dur: 1.8, gain: 0.7, wet: 1.2 });
        return true;
      case 'boom':
        this.#tone(t, { f0: 80, f1: 22, dur: 1.4, gain: 1, wet: 1.3 });
        this.#hiss(t, { filter: 'lowpass', f0: 1800, f1: 90, dur: 1, gain: 0.9, wet: 1.3 });
        return true;
      case 'void':
        this.#tone(t, { type: 'sawtooth', f0: 120, f1: 35, dur: 1.8, gain: 0.08, attack: 0.3 });
        this.#tone(t, { f0: 90, f1: 30, dur: 1.8, gain: 0.4, attack: 0.3 });
        this.#hiss(t, { f0: 400, f1: 60, q: 2, dur: 1.8, gain: 0.3, attack: 0.4 });
        return true;
      case 'freeze':
        this.#grains(t, { count: 22, spread: 0.6, lo: 2500, hi: 7000, gain: 0.25, q: 8 });
        this.#tone(t, { f0: 1800, f1: 2700, dur: 0.6, gain: 0.05 });
        return true;
      case 'wind':
        this.#hiss(t, { f0: 250, f1: 1400, q: 2.5, dur: 2.2, gain: 0.4, attack: 0.6 });
        this.#hiss(t + 0.3, { f0: 600, f1: 2200, q: 4, dur: 1.8, gain: 0.2, attack: 0.5 });
        return true;
      case 'wail':
        this.#tone(t, { f0: 620, f1: 300, dur: 2.2, gain: 0.09, attack: 0.3, wet: 1.6 });
        this.#tone(t + 0.1, { f0: 930, f1: 455, dur: 2, gain: 0.04, attack: 0.3, wet: 1.6 });
        return true;
      case 'dissolve':
        this.#hiss(t, { filter: 'highpass', f0: 7000, f1: 1500, dur: 1.5, gain: 0.25, attack: 0.2 });
        this.#tone(t, { f0: 1200, f1: 2400, dur: 1.4, gain: 0.04, attack: 0.2 });
        return true;
    }
    return false;
  }

  play(name, strength = 1) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.#finisher(name, t)) return;
    if (name === 'select') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g);
      this.#out(g, 0.6);
      o.start(t);
      o.stop(t + 0.3);
    } else if (name === 'land') {
      // Stone on stone: a damped low thump plus a short click.
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
      g.gain.setValueAtTime(0.5 * strength, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g);
      this.#out(g, 0.7);
      o.start(t);
      o.stop(t + 0.2);
      const n = this.#noise(0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.35 * strength, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      n.connect(bp).connect(ng);
      this.#out(ng, 0.5);
      n.start(t);
    } else if (name === 'whoosh') {
      const n = this.#noise(0.4);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.5;
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.exponentialRampToValueAtTime(1800, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      n.connect(bp).connect(g);
      this.#out(g, 0.6);
      n.start(t);
    } else if (name === 'zap') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1600, t);
      o.frequency.exponentialRampToValueAtTime(180, t + 0.3);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g);
      this.#out(g, 1);
      o.start(t);
      o.stop(t + 0.4);
    } else if (name === 'shatter') {
      // Crack: bright noise burst with a cascade of grains, over a low boom.
      const boom = ctx.createOscillator();
      const bg = ctx.createGain();
      boom.frequency.setValueAtTime(90, t);
      boom.frequency.exponentialRampToValueAtTime(35, t + 0.5);
      bg.gain.setValueAtTime(0.7, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      boom.connect(bg);
      this.#out(bg, 1);
      boom.start(t);
      boom.stop(t + 0.7);
      const n = this.#noise(0.6);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.6, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      n.connect(hp).connect(ng);
      this.#out(ng, 0.9);
      n.start(t);
      for (let i = 0; i < 14; i++) {
        const dt = 0.05 + Math.random() * 0.9;
        const grain = this.#noise(0.03);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 2000 + Math.random() * 5000;
        f.Q.value = 6;
        const gg = ctx.createGain();
        gg.gain.setValueAtTime(0.25 * Math.random(), t + dt);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.03);
        grain.connect(f).connect(gg);
        this.#out(gg, 0.6);
        grain.start(t + dt);
      }
    } else if (name === 'chime') {
      for (const [f, d] of [[523.25, 0], [659.25, 0.08], [783.99, 0.16]]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.12, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.2);
        o.connect(g);
        this.#out(g, 1);
        o.start(t + d);
        o.stop(t + d + 1.3);
      }
    } else if (name === 'toll') {
      // Cathedral bell for check and game end.
      for (const [f, a] of [[196, 0.25], [392.5, 0.12], [588, 0.06], [470, 0.05]]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(a * strength, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
        o.connect(g);
        this.#out(g, 1.2);
        o.start(t);
        o.stop(t + 3.1);
      }
    }
  }
}
