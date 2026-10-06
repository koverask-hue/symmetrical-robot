// Procedural, positional audio. Every sound is synthesised from noise and
// oscillators, routed through an HRTF panner and a generated outdoor reverb.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.lastImpact = 0;
    this.alarm = null;
    this.fireGain = null;
  }

  // Must be called from a user gesture (browsers keep audio suspended until then).
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -14;
    this.master.ratio.value = 6;
    this.out = ctx.createGain();
    this.out.gain.value = 0.85;
    this.master.connect(this.out).connect(ctx.destination);
    // Reverb: exponentially decaying stereo noise with a slapback bump.
    const len = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        const slap = t > 0.11 && t < 0.16 ? 0.6 : 0;
        d[i] = (Math.random() * 2 - 1) * (Math.exp(-t * 3.2) * 0.5 + slap * Math.exp(-(t - 0.11) * 40));
      }
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.35;
    this.verbIn.connect(this.verb).connect(this.master);
    // Shared white noise.
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // Fire crackle bed, gain driven by how much is burning.
    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    const fsrc = this.noiseSource(true);
    const fbp = ctx.createBiquadFilter();
    fbp.type = 'bandpass';
    fbp.frequency.value = 1800;
    fbp.Q.value = 0.6;
    const crackle = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(crackle.gain);
    lfo.start();
    fsrc.connect(fbp).connect(crackle).connect(this.fireGain).connect(this.master);
    fsrc.start();
  }

  noiseSource(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    s.loopStart = Math.random();
    return s;
  }

  setListener(pos, fwd, up) {
    const l = this.ctx?.listener;
    if (!l) return;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(up.x, t); l.upY.setValueAtTime(up.y, t); l.upZ.setValueAtTime(up.z, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  // Output node for a sound at a world position (or non-positional if null).
  bus(pos, gain = 1, wet = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 3;
      p.rolloffFactor = 1.1;
      p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2];
      g.connect(p);
      p.connect(this.master);
      if (wet) {
        const s = ctx.createGain();
        s.gain.value = wet;
        p.connect(s).connect(this.verbIn);
      }
    } else {
      g.connect(this.master);
    }
    return g;
  }

  ok() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }

  noiseBurst(out, t, dur, type, freq, q, attack = 0.002, sweepTo = null) {
    const ctx = this.ctx;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  tone(out, t, dur, type, f0, f1, vol = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  explosion(pos, power, dist) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + Math.min(0.5, dist / 343); // sound travels
    const out = this.bus(pos, 1.6 * Math.min(1.5, power), 1.4);
    this.noiseBurst(out, t, 2.2, 'lowpass', 1400, 0.7, 0.003, 60);
    this.noiseBurst(out, t, 0.35, 'highpass', 2500, 0.5, 0.001);
    this.tone(out, t, 1.2, 'sine', 90, 28, 1.2);
    // Debris rain.
    for (let i = 0; i < 10; i++) this.noiseBurst(out, t + 0.3 + Math.random() * 1.2, 0.05, 'bandpass', 900 + Math.random() * 1600, 3, 0.001);
  }

  impact(pos, material, strength) {
    if (!this.ok()) return;
    const now = this.ctx.currentTime;
    if (now - this.lastImpact < 0.03) return; // keep big collapses from becoming noise
    this.lastImpact = now;
    const s = Math.min(1, strength / 8);
    const out = this.bus(pos, 0.25 + s * 0.9, 0.6);
    const t = now;
    switch (material) {
      case 'metal':
        for (const f of [420, 1130, 2210, 3170]) this.tone(out, t, 0.6 + Math.random() * 0.5, 'sine', f * (0.9 + Math.random() * 0.2), f * 0.98, 0.18);
        this.noiseBurst(out, t, 0.08, 'highpass', 3000, 1, 0.001);
        break;
      case 'glass':
        this.noiseBurst(out, t, 0.25, 'highpass', 4000, 1, 0.001);
        for (let i = 0; i < 6; i++) this.tone(out, t + Math.random() * 0.25, 0.15, 'sine', 3000 + Math.random() * 4000, 2500, 0.08);
        break;
      case 'wood':
        this.noiseBurst(out, t, 0.18, 'bandpass', 700 + Math.random() * 300, 2.5, 0.002);
        this.tone(out, t, 0.12, 'triangle', 220, 120, 0.3);
        break;
      case 'leaves':
      case 'dirt':
        this.noiseBurst(out, t, 0.2, 'lowpass', 900, 0.7, 0.004);
        break;
      default:
        this.noiseBurst(out, t, 0.25 + s * 0.4, 'lowpass', 600 + s * 900, 0.8, 0.002, 90);
        this.tone(out, t, 0.2, 'sine', 120, 50, 0.4 * s);
    }
  }

  shot(pos) {
    if (!this.ok()) return;
    const out = this.bus(pos, 1.1, 1.2);
    const t = this.ctx.currentTime;
    this.noiseBurst(out, t, 0.5, 'lowpass', 3500, 0.6, 0.001, 200);
    this.tone(out, t, 0.2, 'square', 160, 40, 0.3);
  }

  whoosh(pos) {
    if (!this.ok()) return;
    const out = this.bus(pos, 0.7, 0.5);
    this.noiseBurst(out, this.ctx.currentTime, 0.6, 'bandpass', 600, 1.2, 0.01, 2400);
  }

  swing() {
    if (!this.ok()) return;
    this.noiseBurst(this.bus(null, 0.25), this.ctx.currentTime, 0.18, 'bandpass', 500, 1, 0.03, 1500);
  }

  cutter(pos) {
    if (!this.ok()) return;
    const out = this.bus(pos, 0.25, 0.2);
    const t = this.ctx.currentTime;
    this.noiseBurst(out, t, 0.07, 'highpass', 5000, 0.7, 0.002);
    this.tone(out, t, 0.07, 'sawtooth', 95, 90, 0.15);
  }

  spray() {
    if (!this.ok()) return;
    this.noiseBurst(this.bus(null, 0.18, 0), this.ctx.currentTime, 0.12, 'highpass', 2500, 0.3, 0.01);
  }

  pickup() {
    if (!this.ok()) return;
    const out = this.bus(null, 0.5, 0.3);
    const t = this.ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => this.tone(out, t + i * 0.07, 0.3, 'triangle', f, f, 0.5));
  }

  click() {
    if (!this.ok()) return;
    this.tone(this.bus(null, 0.2, 0), this.ctx.currentTime, 0.05, 'square', 900, 600, 0.3);
  }

  hurt() {
    if (!this.ok()) return;
    this.tone(this.bus(null, 0.5, 0.2), this.ctx.currentTime, 0.25, 'sawtooth', 160, 60, 0.4);
  }

  step(material) {
    if (!this.ok()) return;
    const out = this.bus(null, 0.08, 0.1);
    const f = material === 'metal' ? 2400 : material === 'wood' ? 900 : material === 'glass' ? 3200 : 500;
    this.noiseBurst(out, this.ctx.currentTime, 0.06, 'bandpass', f * (0.85 + Math.random() * 0.3), 1.5, 0.002);
  }

  setAlarm(on) {
    if (!this.ctx) return;
    if (on && !this.alarm) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const lfo = ctx.createOscillator();
      lfo.type = 'triangle';
      lfo.frequency.value = 0.9;
      const depth = ctx.createGain();
      depth.gain.value = 220;
      o.frequency.value = 760;
      lfo.connect(depth).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2200;
      const g = ctx.createGain();
      g.gain.value = 0.07;
      o.connect(f).connect(g).connect(this.master);
      o.start();
      lfo.start();
      this.alarm = { o, lfo, g };
    } else if (!on && this.alarm) {
      this.alarm.o.stop();
      this.alarm.lfo.stop();
      this.alarm = null;
    }
  }

  setFire(level) {
    if (!this.fireGain) return;
    this.fireGain.gain.setTargetAtTime(Math.min(0.25, level * 0.0025), this.ctx.currentTime, 0.3);
  }
}
