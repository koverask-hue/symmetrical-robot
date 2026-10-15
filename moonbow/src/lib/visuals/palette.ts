// Pulls a small, background-friendly palette out of cover art.

import { imageBlobUrl } from '../platform';

export type RGB = [number, number, number]; // 0..1

// Moonbow's own palette, used before anything plays: moonlight violet, aurora teal, rose, deep indigo.
export const FALLBACK: RGB[] = [
  [0.42, 0.36, 0.86],
  [0.2, 0.62, 0.66],
  [0.78, 0.38, 0.62],
  [0.1, 0.08, 0.22],
];

/** A lighter, saturated version for UI accents (text, glows) from a palette colour. */
export function accent(c: RGB): RGB {
  const [h, s] = rgbToHsl(c);
  return hslToRgb([h, Math.max(0.55, s), 0.74]);
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): RGB {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** Keeps colors rich but dark enough for white text on top. */
export function tame(c: RGB): RGB {
  const [h, s, l] = rgbToHsl(c);
  // Near-grey covers stay grey instead of being forced into a random hue.
  const sat = s < 0.08 ? s : Math.min(0.9, Math.max(0.35, s * 1.25));
  return hslToRgb([h, sat, Math.min(0.52, Math.max(0.22, l * 0.9))]);
}

/** k-means over RGBA pixels. Returns `k` colors ordered by vividness × population. */
export function extractPalette(px: Uint8ClampedArray, k = 4, iterations = 8): RGB[] {
  const pts: RGB[] = [];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    pts.push([px[i] / 255, px[i + 1] / 255, px[i + 2] / 255]);
  }
  if (pts.length < k) return FALLBACK;

  // Deterministic init: spread seeds across the luminance-sorted pixels.
  const sorted = [...pts].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centers: RGB[] = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)]);
  let counts = new Array(k).fill(0);

  for (let it = 0; it < iterations; it++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    counts = new Array(k).fill(0);
    for (const p of pts) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (p[0] - centers[c][0]) ** 2 + (p[1] - centers[c][1]) ** 2 + (p[2] - centers[c][2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      counts[best]++;
    }
    centers = centers.map((c, i) => (counts[i] ? [sums[i][0] / counts[i], sums[i][1] / counts[i], sums[i][2] / counts[i]] : c));
  }

  const scored = centers.map((c, i) => {
    const [, s, l] = rgbToHsl(c);
    const vivid = s * (1 - Math.abs(l - 0.5) * 1.2);
    return { c, score: (counts[i] / pts.length) * 0.6 + vivid * 0.4 };
  });
  return scored.sort((a, b) => b.score - a.score).map((x) => tame(x.c));
}

const cache = new Map<string, Promise<RGB[]>>();

export function paletteFor(url: string | undefined): Promise<RGB[]> {
  if (!url) return Promise.resolve(FALLBACK);
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const blobUrl = url.startsWith('data:') ? url : await imageBlobUrl(url);
      try {
        const img = new Image();
        img.src = blobUrl;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = c.height = 32;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(img, 0, 0, 32, 32);
        return extractPalette(g.getImageData(0, 0, 32, 32).data);
      } finally {
        if (blobUrl !== url) URL.revokeObjectURL(blobUrl);
      }
    })().catch(() => FALLBACK);
    cache.set(url, p);
  }
  return p;
}
