// Synthesised pool-hall sound: ball clicks, cushion thumps, pockets and the cue, in a small room.
export class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.lastClick = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(ctx.destination);
    this.room = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 0.9);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    }
    this.room.buffer = buf;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    this.room.connect(wet).connect(this.master);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  #out(node) {
    node.connect(this.master);
    node.connect(this.room);
  }

  #tone(t, f0, f1, dur, gain, type = 'sine') {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.#out(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  #noise(t, type, freq, q, dur, gain) {
    const n = this.ctx.createBufferSource();
    const b = this.ctx.createBuffer(1, Math.max(1, Math.floor(this.ctx.sampleRate * dur)), this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = b;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g);
    this.#out(g);
    n.start(t);
  }

  // speed in m/s scales loudness.
  play(name, speed = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, Math.max(0.03, speed / 4));
    if (name === 'ball') {
      if (t - this.lastClick < 0.008) return; // a rack of contacts in one frame is one sound
      this.lastClick = t;
      const f = 2600 + Math.random() * 900;
      this.#tone(t, f, f * 0.92, 0.035, 0.5 * v);
      this.#noise(t, 'bandpass', 4200, 2, 0.012, 0.6 * v);
    } else if (name === 'rail') {
      this.#tone(t, 140, 80, 0.09, 0.45 * v);
      this.#noise(t, 'lowpass', 500, 0.7, 0.07, 0.5 * v);
    } else if (name === 'jaw') {
      this.#tone(t, 220, 120, 0.06, 0.35 * v);
      this.#noise(t, 'bandpass', 1400, 1.5, 0.04, 0.4 * v);
    } else if (name === 'pocket') {
      this.#tone(t + 0.02, 190, 90, 0.16, 0.5);
      this.#noise(t + 0.02, 'lowpass', 700, 1, 0.12, 0.5);
      for (let i = 0; i < 5; i++) this.#noise(t + 0.08 + i * 0.05 + Math.random() * 0.02, 'bandpass', 900 + Math.random() * 600, 4, 0.03, 0.25);
      this.#noise(t + 0.3, 'lowpass', 250, 0.7, 0.7, 0.18); // rolling down the return
    } else if (name === 'cue') {
      this.#noise(t, 'bandpass', 1800, 1.2, 0.02, 0.9 * v + 0.1);
      this.#tone(t, 700, 400, 0.03, 0.3 * v + 0.05, 'triangle');
    } else if (name === 'chalk') {
      this.#noise(t, 'highpass', 3000, 0.7, 0.18, 0.08);
    } else if (name === 'win') {
      for (const [f, d] of [[523.25, 0], [659.25, 0.1], [783.99, 0.2], [1046.5, 0.3]]) this.#tone(t + d, f, f, 0.6, 0.12, 'triangle');
    } else if (name === 'foul') {
      this.#tone(t, 220, 160, 0.35, 0.18, 'triangle');
    }
  }
}
