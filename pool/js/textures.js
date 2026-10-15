// Procedural canvas textures: numbered balls, cloth, wood.
import * as THREE from '../vendor/three.module.js';

export const BALL_COLORS = {
  1: '#f3c12d', 2: '#1e4db3', 3: '#d32f27', 4: '#5a2b8c', 5: '#ef7a1c', 6: '#1c7a45', 7: '#7b1e27', 8: '#121214',
};

export function ballColor(id) {
  if (id === 0) return '#f4f1e8';
  return BALL_COLORS[id > 8 ? id - 8 : id];
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Equirectangular ball skin: solid or striped, with the number in a white circle on two sides.
// The cue ball gets small red dots so its spin is visible.
export function ballTexture(id) {
  const [c, g] = canvas(512, 256);
  const color = ballColor(id);
  const ivory = '#f4f1e8';
  if (id === 0) {
    g.fillStyle = ivory;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#c4312b';
    for (const [u, v] of [[0.0, 0.5], [0.25, 0.5], [0.5, 0.5], [0.75, 0.5], [0.125, 0.1], [0.625, 0.9]]) {
      for (const du of [0, 1]) {
        g.beginPath();
        g.arc(u * 512 + du * 512, v * 256, 7, 0, Math.PI * 2);
        g.fill();
      }
    }
    return tex(c);
  }
  if (id > 8) {
    g.fillStyle = ivory;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = color;
    g.fillRect(0, 256 * 0.28, 512, 256 * 0.44);
  } else {
    g.fillStyle = color;
    g.fillRect(0, 0, 512, 256);
  }
  for (const u of [0.25, 0.75]) {
    const x = u * 512, y = 128;
    g.fillStyle = ivory;
    g.beginPath();
    g.ellipse(x, y, 34, 34, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#141414';
    g.font = `700 ${id > 9 ? 34 : 40}px "Roboto Flex", Roboto, Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(id), x, y + 2);
    if (id === 6 || id === 9) g.fillRect(x - 9, y + 20, 18, 3); // underline to tell 6 from 9
  }
  return tex(c);
}

function noise(seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const grid = Array.from({ length: 64 * 64 }, rnd);
  const at = (x, y) => grid[((y & 63) << 6) | (x & 63)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// Worsted cloth: almost flat colour with a faint nap.
export function clothTexture(base = [18, 92, 68]) {
  const [c, g] = canvas(512);
  const img = g.createImageData(512, 512);
  const n = noise(3);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const k = 0.94 + 0.06 * n(x / 6, y / 6) + 0.03 * n(x / 40, y / 40) + (Math.random() - 0.5) * 0.04;
      const i = (y * 512 + x) * 4;
      img.data[i] = base[0] * k;
      img.data[i + 1] = base[1] * k;
      img.data[i + 2] = base[2] * k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true });
}

export function woodTexture({ base = [74, 38, 22], dark = [38, 18, 10], planks = 0, w = 1024, h = 256 } = {}) {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const n = noise(9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const plank = planks ? Math.floor((y / h) * planks) : 0;
      const grain = Math.sin((y / h) * 60 + n(x / 90 + plank * 7, y / 14) * 6 + plank * 3);
      const k = 0.5 + 0.5 * grain;
      const m = 0.85 + 0.15 * n(x / 30, y / 4 + plank * 11);
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) img.data[i + ch] = (dark[ch] + (base[ch] - dark[ch]) * k) * m;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (planks) {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    for (let p = 1; p < planks; p++) g.fillRect(0, (p / planks) * h - 1, w, 2);
    for (let p = 0; p < planks; p++) {
      const off = ((p * 377) % w);
      g.fillRect(off, (p / planks) * h, 2, h / planks);
    }
  }
  return tex(c, { repeat: true });
}

export function softDot(px = 128) {
  const [c, g] = canvas(px);
  const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, px, px);
  return tex(c, { srgb: false });
}
