// Procedural canvas textures: numbered balls, cloth, woods, plaster, brick, rug, the view outside
// the windows and the cue's inlays.
import * as THREE from '../vendor/three.module.js';

export const BALL_COLORS = {
  1: '#f6c21c', 2: '#1b4fc2', 3: '#d9271f', 4: '#5d2a95', 5: '#f2731a', 6: '#147a43', 7: '#7d1b25', 8: '#111114',
};

export function ballColor(id) {
  if (id === 0) return '#f6f3ea';
  return BALL_COLORS[id > 8 ? id - 8 : id];
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function tex(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function noise(seed) {
  const r = rng(seed);
  const grid = Array.from({ length: 64 * 64 }, r);
  const at = (x, y) => grid[((y & 63) << 6) | (x & 63)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// Ball skin, equirectangular. Numbers sit in white circles on opposite sides; the cue ball carries
// small red dots so you can watch its spin.
export function ballTexture(id) {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  const color = ballColor(id);
  const ivory = '#f6f3ea';
  if (id === 0) {
    g.fillStyle = ivory;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#c62b25';
    for (const [u, v] of [[0, 0.5], [0.25, 0.5], [0.5, 0.5], [0.75, 0.5], [0.125, 0.12], [0.625, 0.88]]) {
      g.beginPath();
      g.ellipse(u * W, v * H, 12 / Math.max(0.35, Math.sin(v * Math.PI)), 12, 0, 0, Math.PI * 2);
      g.fill();
      if (u === 0) {
        g.beginPath();
        g.ellipse(W, v * H, 12, 12, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    return tex(c);
  }
  if (id > 8) {
    g.fillStyle = ivory;
    g.fillRect(0, 0, W, H);
    g.fillStyle = color;
    g.fillRect(0, H * 0.27, W, H * 0.46);
  } else {
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
  }
  for (const u of [0.25, 0.75]) {
    const x = u * W, y = H / 2;
    g.fillStyle = ivory;
    g.beginPath();
    g.arc(x, y, 66, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#141414';
    g.font = `800 ${id > 9 ? 68 : 82}px "Roboto Flex", Roboto, Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(id), x, y + 4);
    if (id === 6 || id === 9) g.fillRect(x - 18, y + 42, 36, 6); // underline tells 6 from 9
  }
  return tex(c);
}

// Worsted cloth: nearly flat colour with a fine nap.
export function clothTexture(base = [16, 104, 74]) {
  const [c, g] = canvas(512);
  const img = g.createImageData(512, 512);
  const n = noise(3);
  const r = rng(11);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const k = 0.95 + 0.04 * n(x / 5, y / 5) + 0.025 * n(x / 48, y / 48) + (r() - 0.5) * 0.035;
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

// Long-grain wood. `planks` > 0 draws a plank floor with joints.
export function woodTexture({ base = [120, 64, 34], dark = [62, 30, 14], planks = 0, w = 1024, h = 256, seed = 9, rings = 60 } = {}) {
  const [c, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const n = noise(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const plank = planks ? Math.floor((y / h) * planks) : 0;
      const tone = planks ? 0.9 + 0.2 * n(plank * 13.7, 3.1) : 1;
      const grain = Math.sin((y / h) * rings + n(x / 110 + plank * 7, y / 12) * 5 + plank * 3);
      const k = 0.5 + 0.5 * grain;
      const m = (0.88 + 0.12 * n(x / 34, y / 3 + plank * 11)) * tone;
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) img.data[i + ch] = Math.min(255, (dark[ch] + (base[ch] - dark[ch]) * k) * m);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (planks) {
    g.fillStyle = 'rgba(40,24,12,0.45)';
    for (let p = 1; p < planks; p++) g.fillRect(0, (p / planks) * h - 1, w, 2);
    for (let p = 0; p < planks; p++) {
      const off = (p * 397) % w;
      g.fillRect(off, (p / planks) * h, 2, h / planks);
      g.fillRect((off + w / 2) % w, (p / planks) * h, 2, h / planks);
    }
  }
  return tex(c, { repeat: true });
}

export function plasterTexture(base = [236, 231, 222]) {
  const [c, g] = canvas(512);
  const img = g.createImageData(512, 512);
  const n = noise(21);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const k = 0.96 + 0.035 * n(x / 30, y / 30) + 0.02 * n(x / 4, y / 4);
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

// Whitewashed brick.
export function brickTexture() {
  const [c, g] = canvas(1024);
  const n = noise(5);
  const r = rng(77);
  g.fillStyle = '#d9d3c9';
  g.fillRect(0, 0, 1024, 1024);
  const bw = 128, bh = 48;
  for (let row = 0; row < 1024 / bh + 1; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < 1024 / bw + 1; col++) {
      const x = col * bw + off, y = row * bh;
      const k = 0.9 + r() * 0.1;
      const warm = r() < 0.12;
      g.fillStyle = warm ? `rgb(${226 * k},${200 * k},${184 * k})` : `rgb(${240 * k},${236 * k},${228 * k})`;
      g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    }
  }
  const img = g.getImageData(0, 0, 1024, 1024);
  for (let y = 0; y < 1024; y++) {
    for (let x = 0; x < 1024; x++) {
      const i = (y * 1024 + x) * 4;
      const k = 0.94 + 0.08 * n(x / 9, y / 9);
      img.data[i] *= k;
      img.data[i + 1] *= k;
      img.data[i + 2] *= k;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: true });
}

// A wool rug with a border.
export function rugTexture() {
  const [c, g] = canvas(1024, 768);
  const n = noise(31);
  g.fillStyle = '#c9b79c';
  g.fillRect(0, 0, 1024, 768);
  g.fillStyle = '#2f4f5a';
  g.fillRect(40, 40, 944, 688);
  g.fillStyle = '#e7dcc8';
  g.fillRect(70, 70, 884, 628);
  g.strokeStyle = '#b9643e';
  g.lineWidth = 10;
  g.strokeRect(100, 100, 824, 568);
  g.fillStyle = '#d8ccb5';
  for (let i = 0; i < 12; i++) {
    const x = 160 + (i % 6) * 140, y = 220 + Math.floor(i / 6) * 330;
    g.beginPath();
    g.moveTo(x, y - 40);
    g.lineTo(x + 40, y);
    g.lineTo(x, y + 40);
    g.lineTo(x - 40, y);
    g.closePath();
    g.fill();
  }
  const img = g.getImageData(0, 0, 1024, 768);
  for (let y = 0; y < 768; y++) {
    for (let x = 0; x < 1024; x++) {
      const i = (y * 1024 + x) * 4;
      const k = 0.9 + 0.1 * n(x / 3, y / 3) + 0.04 * n(x / 40, y / 40);
      img.data[i] *= k;
      img.data[i + 1] *= k;
      img.data[i + 2] *= k;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

// Bright afternoon sky over a city skyline, for the view through the windows.
export function skylineTexture() {
  const [c, g] = canvas(2048, 1024);
  const sky = g.createLinearGradient(0, 0, 0, 1024);
  sky.addColorStop(0, '#7fb6ea');
  sky.addColorStop(0.55, '#cfe6f7');
  sky.addColorStop(1, '#f3f1e8');
  g.fillStyle = sky;
  g.fillRect(0, 0, 2048, 1024);
  const r = rng(4);
  // soft clouds
  for (let i = 0; i < 14; i++) {
    const x = r() * 2048, y = 80 + r() * 300, w = 200 + r() * 300;
    const cg = g.createRadialGradient(x, y, 0, x, y, w);
    cg.addColorStop(0, 'rgba(255,255,255,0.55)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg;
    g.fillRect(x - w, y - w, w * 2, w * 2);
  }
  // two layers of buildings: far (hazy) and near
  for (const [layer, top, color] of [[0, 560, 'rgba(150,172,196,0.75)'], [1, 640, 'rgba(112,134,160,0.9)']]) {
    let x = -20;
    while (x < 2048) {
      const w = 60 + r() * 140;
      const h = (layer ? 160 : 220) + r() * (layer ? 220 : 260);
      g.fillStyle = color;
      g.fillRect(x, top + 300 - h, w, h + 200);
      if (layer) {
        g.fillStyle = 'rgba(235,240,245,0.35)';
        for (let wy = top + 320 - h; wy < 1024; wy += 22) for (let wx = x + 8; wx < x + w - 10; wx += 16) if (r() < 0.6) g.fillRect(wx, wy, 7, 10);
      }
      x += w + 6 + r() * 20;
    }
  }
  return tex(c);
}

// Cue skin, laid out along the length (v = 0 at the butt, 1 at the tip).
export function cueTexture() {
  const W = 256, H = 4096;
  const [c, g] = canvas(W, H);
  const at = (v) => H - v * H; // canvas y for a fraction along the cue
  const band = (v0, v1, fill) => {
    g.fillStyle = fill;
    g.fillRect(0, at(v1), W, at(v0) - at(v1));
  };
  const n = noise(17);
  // maple shaft grain
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = 0.92 + 0.08 * Math.sin(y / 18 + n(x / 40, y / 200) * 4);
      const i = (y * W + x) * 4;
      img.data[i] = 232 * k;
      img.data[i + 1] = 206 * k;
      img.data[i + 2] = 160 * k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // butt section (0 .. 0.5): ebony and cocobolo with points
  band(0, 0.02, '#1b1b1d'); // rubber bumper
  band(0.02, 0.1, '#3a1d12'); // butt sleeve
  band(0.1, 0.105, '#d9c38f');
  band(0.105, 0.11, '#111');
  band(0.11, 0.33, '#202022'); // linen wrap (patterned below)
  band(0.33, 0.335, '#111');
  band(0.335, 0.34, '#d9c38f');
  band(0.34, 0.5, '#5a2414'); // forearm
  // wrap crosshatch
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 3;
  for (let y = at(0.33); y < at(0.11); y += 10) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y + 6);
    g.stroke();
  }
  // four ebony points with maple veneers rising into the forearm
  for (let k = 0; k < 4; k++) {
    const cx = (k + 0.5) * (W / 4);
    for (const [w, col] of [[30, '#e9d7a8'], [24, '#0d0d0f']]) {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(cx - w, at(0.34));
      g.lineTo(cx, at(0.46));
      g.lineTo(cx + w, at(0.34));
      g.closePath();
      g.fill();
    }
  }
  band(0.5, 0.506, '#c9c9cc'); // steel joint collar
  band(0.506, 0.512, '#2a2a2c');
  band(0.512, 0.518, '#c9c9cc');
  // ferrule and tip
  band(0.983, 0.996, '#f3f0e6');
  band(0.996, 1, '#2f66b0');
  return tex(c);
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

// Engraved brass name plate.
export function plateTexture(text) {
  const [c, g] = canvas(512, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#e2c27a');
  grad.addColorStop(0.5, '#b38a3c');
  grad.addColorStop(1, '#d9b46a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#7a5a1e';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#4a3410';
  g.font = '400 64px Bungee, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  return tex(c);
}

// Abstract print for the wall.
export function artTexture(seed = 1) {
  const [c, g] = canvas(512, 640);
  const r = rng(seed);
  g.fillStyle = '#f4efe6';
  g.fillRect(0, 0, 512, 640);
  const palette = ['#e0703d', '#2f6f8f', '#f2c14e', '#1f4f46', '#d9a6a1'];
  for (let i = 0; i < 6; i++) {
    g.fillStyle = palette[Math.floor(r() * palette.length)];
    if (r() < 0.5) {
      g.beginPath();
      g.arc(80 + r() * 352, 80 + r() * 480, 40 + r() * 110, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(40 + r() * 300, 40 + r() * 400, 60 + r() * 200, 30 + r() * 180);
    }
  }
  return tex(c);
}
