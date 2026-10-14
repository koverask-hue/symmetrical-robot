// Procedural canvas textures: marble, slate, flagstones, stained glass, runes and soft sprites.
import * as THREE from '../vendor/three.module.js';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Seeded value noise + fractal sum, tileable over `period` cells.
function makeNoise(seed = 1) {
  const perm = new Uint8Array(512);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = Float32Array.from({ length: 256 }, () => rnd());
  const smooth = (t) => t * t * (3 - 2 * t);
  function noise(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const w = (a) => ((a % period) + period) % period;
    const v = (a, b) => vals[perm[perm[w(a)] + w(b)]];
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }
  return function fbm(x, y, octaves = 5, period = 8) {
    let sum = 0, amp = 0.5, f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * f, y * f, period * f);
      amp *= 0.5;
      f *= 2;
    }
    return sum;
  };
}

export function marbleTexture(size = 512) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const fbm = makeNoise(7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 8, v = (y / size) * 8;
      const n = fbm(u, v, 5, 8);
      const vein = Math.pow(Math.abs(Math.sin((u * 0.9 + v * 0.5 + n * 5.5) * Math.PI * 0.5)), 0.22);
      const fine = Math.pow(Math.abs(Math.sin((u * 2.3 - v + n * 9) * Math.PI)), 0.08);
      const k = 0.62 + 0.38 * vein * fine;
      const i = (y * size + x) * 4;
      img.data[i] = 236 * k + 6 * n;
      img.data[i + 1] = 232 * k + 4 * n;
      img.data[i + 2] = 224 * k + 14 * (1 - k);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { repeat: true });
}

// Obsidian is nearly black; its character is in the roughness: smooth glass with conchoidal ripples.
export function obsidianRoughness(size = 256) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const fbm = makeNoise(3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * 4, (y / size) * 4, 4, 4);
      const ripple = 0.5 + 0.5 * Math.sin(n * 40);
      const r = 30 + 40 * ripple * ripple;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = r;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false, repeat: true });
}

const FILES = 'abcdefgh';

// Board top: 8x8 squares inside a 0.4-unit stone border carrying file and rank labels.
export function boardTexture(px = 2048, border = 0.4) {
  const [c, g] = canvas(px);
  const total = 8 + border * 2;
  const unit = px / total;
  const b = border * unit;
  const fbm = makeNoise(11);
  g.fillStyle = '#1a1b22';
  g.fillRect(0, 0, px, px);
  // Thin gold inlay framing the playing field.
  g.strokeStyle = '#b8955a';
  g.lineWidth = unit * 0.025;
  g.strokeRect(b - unit * 0.06, b - unit * 0.06, unit * 8 + unit * 0.12, unit * 8 + unit * 0.12);
  const sq = document.createElement('canvas');
  sq.width = sq.height = 128;
  const sg = sq.getContext('2d');
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (r + f) % 2 === 1;
      const img = sg.createImageData(128, 128);
      for (let y = 0; y < 128; y++) {
        for (let x = 0; x < 128; x++) {
          const n = fbm(f * 2 + x / 64, r * 2 + y / 64, 4, 16);
          const vein = Math.pow(Math.abs(Math.sin((x / 64 + y / 128 + n * 4 + f) * Math.PI)), 0.25);
          const i = (y * 128 + x) * 4;
          if (light) {
            const k = 0.82 + 0.18 * vein;
            img.data[i] = 214 * k; img.data[i + 1] = 206 * k; img.data[i + 2] = 192 * k;
          } else {
            const k = 0.75 + 0.25 * n + 0.08 * vein;
            img.data[i] = 58 * k; img.data[i + 1] = 58 * k; img.data[i + 2] = 64 * k;
          }
          img.data[i + 3] = 255;
        }
      }
      sg.putImageData(img, 0, 0);
      // rank 8 at the top of the texture (texture v=1 maps to -z, black's side)
      g.drawImage(sq, b + f * unit, b + (7 - r) * unit, unit + 1, unit + 1);
    }
  }
  g.fillStyle = '#9d8c6f';
  g.font = `500 ${Math.round(unit * 0.22)}px "Roboto Flex", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    const x = b + (i + 0.5) * unit;
    g.fillText(FILES[i], x, px - b / 2);
    g.save();
    g.translate(x, b / 2);
    g.rotate(Math.PI);
    g.fillText(FILES[i], 0, 0);
    g.restore();
    const y = b + (7 - i + 0.5) * unit;
    g.fillText(String(i + 1), b / 2, y);
    g.save();
    g.translate(px - b / 2, y);
    g.rotate(Math.PI);
    g.fillText(String(i + 1), 0, 0);
    g.restore();
  }
  return toTexture(c);
}

export function flagstoneTexture(px = 1024) {
  const [c, g] = canvas(px);
  const fbm = makeNoise(5);
  const img = g.createImageData(px, px);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const n = fbm((x / px) * 8, (y / px) * 8, 5, 8);
      const v = 30 + 26 * n;
      const i = (y * px + x) * 4;
      img.data[i] = v; img.data[i + 1] = v * 0.98; img.data[i + 2] = v * 1.06; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Large slabs laid in a running bond.
  g.strokeStyle = 'rgba(8,8,12,0.9)';
  g.lineWidth = 3;
  const n = 4;
  const s = px / n;
  for (let r = 0; r < n; r++) {
    g.beginPath();
    g.moveTo(0, r * s);
    g.lineTo(px, r * s);
    g.stroke();
    for (let k = 0; k <= n; k++) {
      const x = k * s + (r % 2) * s * 0.5;
      g.beginPath();
      g.moveTo(x % (px + 1), r * s);
      g.lineTo(x % (px + 1), (r + 1) * s);
      g.stroke();
    }
  }
  return toTexture(c, { repeat: true });
}

const GLASS = ['#1d3f9e', '#1d3f9e', '#2a56c4', '#123173', '#9e1b2c', '#b8862b', '#1d3f9e', '#5a2a8a'];

function pick(seed) {
  return GLASS[Math.abs(Math.floor(Math.sin(seed * 91.7) * 1e4)) % GLASS.length];
}

// Rose window: concentric rings of petals in lead tracery.
export function roseWindowTexture(px = 1024, variant = 0) {
  const [c, g] = canvas(px);
  const cx = px / 2;
  const R = px / 2;
  g.fillStyle = '#000';
  g.fillRect(0, 0, px, px);
  const rings = [0.16, 0.38, 0.62, 0.86, 1.0];
  const petals = [1, 8, 16, 16, 32];
  for (let ri = rings.length - 1; ri >= 0; ri--) {
    const r1 = rings[ri] * R * 0.98;
    const r0 = ri ? rings[ri - 1] * R * 0.98 : 0;
    const n = petals[ri];
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + (ri % 2) * (Math.PI / n);
      const a1 = ((k + 1) / n) * Math.PI * 2 + (ri % 2) * (Math.PI / n);
      g.beginPath();
      g.arc(cx, cx, r1, a0, a1);
      g.arc(cx, cx, r0, a1, a0, true);
      g.closePath();
      const col = ri === 0 ? '#d4a23a' : pick(ri * 31 + k * (ri === 2 ? 1 : 2) + variant * 7 + (k % 2) * 3);
      const grad = g.createRadialGradient(cx, cx, r0, cx, cx, r1);
      grad.addColorStop(0, col);
      grad.addColorStop(1, shade(col, 0.55));
      g.fillStyle = grad;
      g.fill();
      g.lineWidth = px * 0.008;
      g.strokeStyle = '#050507';
      g.stroke();
    }
    // Inner foils inside each petal of ring 2 for a tracery feel.
    if (ri === 2) {
      for (let k = 0; k < n; k++) {
        const a = ((k + 0.5) / n) * Math.PI * 2;
        const rr = (r0 + r1) / 2;
        g.beginPath();
        g.arc(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr, (r1 - r0) * 0.28, 0, Math.PI * 2);
        g.fillStyle = '#e1b85a';
        g.fill();
        g.stroke();
      }
    }
  }
  g.beginPath();
  g.arc(cx, cx, R * 0.985, 0, Math.PI * 2);
  g.lineWidth = px * 0.02;
  g.strokeStyle = '#050507';
  g.stroke();
  return toTexture(c);
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * k, gg = ((n >> 8) & 255) * k, b = (n & 255) * k;
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

// Lancet window: pointed arch with diamond quarries and one medallion.
export function lancetTexture(w = 256, h = 1024, seed = 1) {
  const [c, g] = canvas(w, h);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const q = w / 8;
  for (let y = -q; y < h + q; y += q / 2) {
    for (let x = -q; x < w + q; x += q) {
      const ox = ((y / (q / 2)) % 2) * (q / 2);
      g.beginPath();
      g.moveTo(x + ox, y - q / 2);
      g.lineTo(x + ox + q / 2, y);
      g.lineTo(x + ox, y + q / 2);
      g.lineTo(x + ox - q / 2, y);
      g.closePath();
      const t = Math.sin((x * 3 + y * 7 + seed * 13) * 0.37);
      g.fillStyle = t > 0.9 ? '#8e1a2a' : t > 0.8 ? '#a8802f' : t > 0.2 ? '#1d3f9e' : t > -0.4 ? '#173480' : '#22489f';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#050507';
      g.stroke();
    }
  }
  const my = h * 0.45;
  g.beginPath();
  g.arc(w / 2, my, w * 0.32, 0, Math.PI * 2);
  g.fillStyle = seed % 2 ? '#9e1b2c' : '#b8862b';
  g.fill();
  g.lineWidth = 8;
  g.stroke();
  g.beginPath();
  g.arc(w / 2, my, w * 0.16, 0, Math.PI * 2);
  g.fillStyle = '#e1c27a';
  g.fill();
  g.stroke();
  return toTexture(c);
}

// A ring of runes drawn under the selected piece.
export function runeRingTexture(px = 512) {
  const [c, g] = canvas(px);
  const cx = px / 2;
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineWidth = px * 0.012;
  g.beginPath();
  g.arc(cx, cx, px * 0.46, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = px * 0.006;
  g.beginPath();
  g.arc(cx, cx, px * 0.36, 0, Math.PI * 2);
  g.stroke();
  const n = 16;
  g.lineWidth = px * 0.01;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * px * 0.41, cx + Math.sin(a) * px * 0.41);
    g.rotate(a + Math.PI / 2);
    const s = px * 0.03;
    g.beginPath();
    // Each rune is a stave plus two branches whose angles vary per glyph.
    g.moveTo(0, -s);
    g.lineTo(0, s);
    const b1 = ((k * 37) % 5) - 2, b2 = ((k * 53) % 5) - 2;
    g.moveTo(0, -s * 0.4);
    g.lineTo(s * 0.35 * b1, -s * 0.9);
    g.moveTo(0, s * 0.2);
    g.lineTo(s * 0.35 * b2, s * 0.7);
    g.stroke();
    g.restore();
  }
  return toTexture(c, { srgb: false });
}

export function softDotTexture(px = 128) {
  const [c, g] = canvas(px);
  const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  return toTexture(c, { srgb: false });
}

export function flameTexture(w = 64, h = 128) {
  const [c, g] = canvas(w, h);
  const grad = g.createRadialGradient(w / 2, h * 0.65, 1, w / 2, h * 0.6, h * 0.45);
  grad.addColorStop(0, 'rgba(255,250,230,1)');
  grad.addColorStop(0.3, 'rgba(255,190,90,0.9)');
  grad.addColorStop(0.7, 'rgba(255,110,30,0.25)');
  grad.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(w / 2, 0);
  g.quadraticCurveTo(w, h * 0.6, w / 2, h);
  g.quadraticCurveTo(0, h * 0.6, w / 2, 0);
  g.fill();
  return toTexture(c);
}

// Vertical gradient used for light shafts: bright at the window end, fading toward the floor.
export function shaftTexture(px = 256) {
  const [c, g] = canvas(64, px);
  const grad = g.createLinearGradient(0, 0, 0, px);
  grad.addColorStop(0, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, px);
  const side = g.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 64, px);
  return toTexture(c, { srgb: false });
}
