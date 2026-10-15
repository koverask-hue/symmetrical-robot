// Measures how a song *sounds* while it plays, from the same analyser that drives
// the visuals: loudness/density, brightness (spectral centroid) and how busy the
// rhythm is (onset rate). No audio leaves the machine; only three numbers are kept.

import type { Features } from './model';

const MIN_FRAMES = 200; // ~10 s at 20 Hz

export class FeatureMeter {
  #frames = 0;
  #energy = 0;
  #centroid = 0;
  #prev: Float32Array | null = null;
  #fluxMean = 0;
  #onsets = 0;
  #lastOnset = -1;
  #seconds = 0;

  /** Feed one spectrum frame (0..255 per bin) taken `dt` seconds after the previous one. */
  add(bins: Uint8Array, dt: number) {
    if (!bins.length) return;
    let sum = 0;
    let weighted = 0;
    for (let i = 0; i < bins.length; i++) {
      sum += bins[i];
      weighted += bins[i] * i;
    }
    if (sum < bins.length * 2) return; // silence: don't let gaps skew the averages
    this.#frames++;
    this.#seconds += dt;
    this.#energy += sum / (bins.length * 255);
    this.#centroid += weighted / sum / bins.length;

    let flux = 0;
    if (this.#prev) for (let i = 0; i < bins.length; i++) flux += Math.max(0, bins[i] - this.#prev[i]);
    this.#prev ??= new Float32Array(bins.length);
    this.#prev.set(bins);
    this.#fluxMean = this.#fluxMean * 0.95 + flux * 0.05;
    if (flux > this.#fluxMean * 1.6 + bins.length * 1.5 && this.#seconds - this.#lastOnset > 0.15) {
      this.#onsets++;
      this.#lastOnset = this.#seconds;
    }
  }

  result(): Features | null {
    if (this.#frames < MIN_FRAMES) return null;
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    return {
      energy: clamp((this.#energy / this.#frames) * 1.8),
      bright: clamp((this.#centroid / this.#frames) * 3),
      pulse: clamp(this.#onsets / this.#seconds / 5),
    };
  }

  reset() {
    this.#frames = this.#energy = this.#centroid = this.#fluxMean = this.#onsets = this.#seconds = 0;
    this.#lastOnset = -1;
    this.#prev = null;
  }
}
