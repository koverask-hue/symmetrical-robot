// Custom cues. Each design paints a full skin (colour, glow and metal/roughness maps) laid out along
// the cue's length, and adds real geometry for its metal rings and joint collar.
//
// Skin layout (v = fraction of the length, 0 at the butt, 1 at the tip):
//   0.000-0.014 bumper   0.014-0.110 butt sleeve   0.115-0.330 wrap   0.340-0.500 forearm (points)
//   0.500-0.520 joint    0.520-0.983 shaft         0.983-0.996 ferrule  0.996-1 tip
import * as THREE from '../vendor/three.module.js';
import { CUE_LENGTH } from './physics.js';

const W = 512; // around the cue
const H = 4096; // along the cue

export function cueRadius(v) {
  if (v < 0.5) return 0.0148 - v * 0.0072;
  const s = (v - 0.5) / 0.5;
  return 0.0108 - 0.0042 * Math.min(1, Math.pow(s, 0.65));
}

let sharedGeo = null;
export function cueGeometry() {
  if (sharedGeo) return sharedGeo;
  const pts = [new THREE.Vector2(0, 0)];
  const N = 320;
  for (let i = 0; i <= N; i++) {
    const v = i / N;
    pts.push(new THREE.Vector2(cueRadius(v), v * CUE_LENGTH));
  }
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(cueRadius(1) * Math.cos(a), CUE_LENGTH + Math.sin(a) * 0.0025));
  }
  sharedGeo = new THREE.LatheGeometry(pts, 40);
  sharedGeo.rotateZ(-Math.PI / 2); // along +x
  sharedGeo.translate(-CUE_LENGTH - 0.0025, 0, 0); // tip at the origin, butt towards -x
  return sharedGeo;
}

// x position along the built cue for a fraction v of its length.
const xAt = (v) => (v - 1) * CUE_LENGTH - 0.0025;

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------

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

class Skin {
  constructor() {
    const mk = (fill) => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = fill;
      g.fillRect(0, 0, W, H);
      return [c, g];
    };
    [this.c, this.g] = mk('#d8b98a');
    [this.ec, this.eg] = mk('#000');
    [this.oc, this.og] = mk('rgb(0,90,0)'); // G = roughness, B = metalness
    this.glow = false;
    this.metal = false;
  }

  Y(v) {
    return H * (1 - v);
  }

  band(v0, v1, fill, layer = this.g) {
    layer.fillStyle = fill;
    layer.fillRect(0, this.Y(v1), W, this.Y(v0) - this.Y(v1));
  }

  // Material for a band: roughness 0-1, metalness 0-1.
  surface(v0, v1, roughness, metalness = 0) {
    if (metalness > 0) this.metal = true;
    this.band(v0, v1, `rgb(0,${Math.round(roughness * 255)},${Math.round(metalness * 255)})`, this.og);
  }

  pixels(v0, v1, fn, layer = this.g) {
    const y0 = Math.floor(this.Y(v1)), y1 = Math.ceil(this.Y(v0));
    const hgt = Math.max(1, y1 - y0);
    const img = layer.createImageData(W, hgt);
    for (let y = 0; y < hgt; y++) {
      const v = 1 - (y0 + y) / H;
      const local = (v - v0) / (v1 - v0);
      for (let x = 0; x < W; x++) {
        const col = fn(x, y0 + y, local, v);
        const i = (y * W + x) * 4;
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = col[3] ?? 255;
      }
    }
    layer.putImageData(img, 0, y0);
  }

  // n points rising from v0 to an apex at v1; layers are [halfWidth px, colour], widest first.
  points(v0, v1, n, layers, { phase = 0, layer = this.g, curve = 0 } = {}) {
    for (let k = 0; k < n; k++) {
      const cx = ((k + 0.5 + phase) / n) * W;
      for (const [hw, col] of layers) {
        for (const off of [-W, 0, W]) {
          layer.fillStyle = col;
          layer.beginPath();
          layer.moveTo(cx + off - hw, this.Y(v0));
          if (curve) layer.quadraticCurveTo(cx + off - hw * 0.2, this.Y((v0 + v1) / 2) + curve, cx + off, this.Y(v1));
          else layer.lineTo(cx + off, this.Y(v1));
          if (curve) layer.quadraticCurveTo(cx + off + hw * 0.2, this.Y((v0 + v1) / 2) + curve, cx + off + hw, this.Y(v0));
          else layer.lineTo(cx + off + hw, this.Y(v0));
          layer.closePath();
          layer.fill();
        }
      }
    }
  }

  inlays(v, n, { shape = 'diamond', size = 14, color = '#f4efe6', phase = 0, layer = this.g, stretch = 2.2 } = {}) {
    for (let k = 0; k < n; k++) {
      const cx = ((k + phase) / n) * W, cy = this.Y(v);
      for (const off of [-W, 0, W]) {
        layer.fillStyle = color;
        layer.beginPath();
        if (shape === 'diamond') {
          layer.moveTo(cx + off, cy - size * stretch);
          layer.lineTo(cx + off + size, cy);
          layer.lineTo(cx + off, cy + size * stretch);
          layer.lineTo(cx + off - size, cy);
        } else {
          layer.ellipse(cx + off, cy, size, size * stretch * 0.6, 0, 0, Math.PI * 2);
        }
        layer.closePath();
        layer.fill();
      }
    }
  }

  ring(v, thick, color, layer = this.g) {
    layer.fillStyle = color;
    layer.fillRect(0, this.Y(v) - thick / 2, W, thick);
  }

  maple(v0, v1, seed = 3) {
    const n = noise(seed);
    this.pixels(v0, v1, (x, y) => {
      const k = 0.9 + 0.08 * Math.sin(y / 22 + n(x / 50, y / 260) * 4) + 0.03 * n(x / 4, y / 40);
      return [236 * k, 212 * k, 168 * k];
    });
    this.surface(v0, v1, 0.32);
  }

  carbon(v0, v1, tint = [26, 27, 30]) {
    this.pixels(v0, v1, (x, y) => {
      const cell = 10;
      const a = (Math.floor(x / cell) + Math.floor(y / (cell * 2))) % 2;
      const fx = (x % cell) / cell, fy = (y % (cell * 2)) / (cell * 2);
      const sheen = a ? 0.65 + 0.35 * Math.sin(fx * Math.PI) : 0.55 + 0.45 * Math.sin(fy * Math.PI);
      return tint.map((c) => c * (0.7 + 0.9 * sheen));
    });
    this.surface(v0, v1, 0.22, 0.15);
  }

  wood(v0, v1, base, dark, { seed = 5, rings = 28, figure = 0 } = {}) {
    const n1 = noise(seed), n2 = noise(seed + 9);
    this.pixels(v0, v1, (x, y, local) => {
      const w = n1(x / 90, y / 300) * 2.4 + n2(x / 20, y / 60) * 0.3;
      const f = (x / W) * rings + w;
      const t = f - Math.floor(f);
      const late = t > 0.7 ? Math.pow((t - 0.7) / 0.3, 1.4) : 0;
      const fig = 1 + figure * Math.sin(y / 9 + n2(x / 40, y / 30) * 5);
      return base.map((c, i) => (c + (dark[i] - c) * late) * fig);
    });
    this.surface(v0, v1, 0.3);
  }

  linen(v0, v1, base = [30, 30, 32], thread = 'rgba(255,255,255,0.07)') {
    const n = noise(77);
    this.pixels(v0, v1, (x, y) => base.map((c) => c * (0.85 + 0.3 * n(x / 2, y / 2))));
    const g = this.g;
    g.strokeStyle = thread;
    g.lineWidth = 2;
    for (let y = this.Y(v1); y < this.Y(v0); y += 7) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y + 9);
      g.stroke();
    }
    this.surface(v0, v1, 0.85);
  }

  leather(v0, v1, base, stitch) {
    const n = noise(31);
    this.pixels(v0, v1, (x, y) => {
      const pebble = n(x / 3, y / 3) * 0.6 + n(x / 9, y / 9) * 0.4;
      return base.map((c) => c * (0.8 + 0.35 * pebble));
    });
    const g = this.g;
    g.strokeStyle = stitch;
    g.lineWidth = 4;
    g.setLineDash([16, 10]);
    for (const v of [v0 + 0.006, v1 - 0.006]) {
      g.beginPath();
      g.moveTo(0, this.Y(v));
      g.lineTo(W, this.Y(v));
      g.stroke();
    }
    g.setLineDash([]);
    this.surface(v0, v1, 0.7);
  }

  knurl(v0, v1, base, edge) {
    this.pixels(v0, v1, (x, y) => {
      const a = ((x + y) % 24) / 24, b = ((x - y + 4096 * 24) % 24) / 24;
      const ridge = Math.min(Math.abs(a - 0.5), Math.abs(b - 0.5)) * 2;
      return (ridge < 0.15 ? edge : base).map((c) => c * (0.8 + 0.4 * ridge));
    });
    this.surface(v0, v1, 0.6);
  }

  text(v, str, { color = '#d9b45a', size = 34, font = 'Bungee, "Arial Black", sans-serif', layer = this.g, copies = 2 } = {}) {
    const g = layer;
    for (let k = 0; k < copies; k++) {
      g.save();
      g.translate(((k + 0.25) / copies) * W, this.Y(v));
      g.rotate(-Math.PI / 2);
      g.fillStyle = color;
      g.font = `400 ${size}px ${font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(str, 0, 0);
      g.restore();
    }
  }

  ferruleAndTip(tip = '#2f66b0', ferrule = '#f3f0e6') {
    this.band(0.983, 0.996, ferrule);
    this.band(0.996, 1, tip);
    this.surface(0.983, 0.996, 0.25);
    this.surface(0.996, 1, 0.95);
    this.band(0, 0.014, '#151517'); // rubber bumper
    this.surface(0, 0.014, 0.9);
  }
}

// ---------------------------------------------------------------------------
// The designs
// ---------------------------------------------------------------------------

const METALS = {
  silver: { color: 0xd9dbe0, roughness: 0.2 },
  gold: { color: 0xe3b65a, roughness: 0.22 },
  brass: { color: 0xc89b4a, roughness: 0.3 },
  chrome: { color: 0xf0f0f4, roughness: 0.1 },
  black: { color: 0x1a1a1c, roughness: 0.3 },
  copper: { color: 0xd98a5a, roughness: 0.25 },
};

export const CUES = [
  {
    id: 'heritage',
    name: 'Heritage',
    tagline: 'Cocobolo, four ebony points, Irish linen',
    metal: 'silver',
    rings: [0.11, 0.335, 0.5],
    paint(s) {
      s.maple(0.52, 0.983);
      s.wood(0.014, 0.11, [176, 84, 40], [70, 26, 10], { seed: 3, rings: 22 });
      s.wood(0.34, 0.5, [186, 92, 44], [74, 28, 10], { seed: 4, rings: 26, figure: 0.06 });
      s.points(0.34, 0.47, 4, [[46, '#f2ead8'], [40, '#9b1c22'], [34, '#f2ead8'], [28, '#0e0b0a']]);
      s.inlays(0.07, 8, { shape: 'diamond', size: 11, color: '#efe9dc', phase: 0.5 });
      s.inlays(0.43, 4, { shape: 'diamond', size: 8, color: '#efe9dc', phase: 0 });
      s.linen(0.115, 0.33);
      s.text(0.055, 'HERITAGE', { color: '#e8dcc0', size: 26 });
      s.ferruleAndTip();
    },
  },
  {
    id: 'royale',
    name: 'Ebony Royale',
    tagline: 'Six ivory points, gold filigree, pearl',
    metal: 'gold',
    rings: [0.03, 0.11, 0.335, 0.5],
    paint(s) {
      s.maple(0.52, 0.983, 8);
      s.wood(0.014, 0.11, [34, 26, 24], [8, 6, 6], { seed: 11, rings: 40 });
      s.wood(0.34, 0.5, [36, 28, 25], [8, 6, 6], { seed: 12, rings: 40 });
      s.points(0.34, 0.485, 6, [[34, '#d9b45a'], [30, '#0b0b0b'], [27, '#f4ecd8'], [21, '#d9b45a'], [17, '#f4ecd8']], { curve: -30 });
      s.inlays(0.4, 6, { shape: 'dot', size: 7, color: '#eaf2f4', phase: 0.0 });
      s.inlays(0.455, 6, { shape: 'diamond', size: 6, color: '#d9b45a', phase: 0.0 });
      // gold filigree scrolls on the sleeve
      const g = s.g;
      g.strokeStyle = '#d9b45a';
      g.lineWidth = 3;
      for (let k = 0; k < 8; k++) {
        const cx = (k / 8) * W + 32, cy = s.Y(0.065);
        for (const dir of [-1, 1]) {
          g.beginPath();
          for (let t = 0; t < 4 * Math.PI; t += 0.1) {
            const r = 4 + t * 3.2;
            g.lineTo(cx + Math.cos(t) * r * dir, cy + Math.sin(t) * r * 2.4 * dir);
          }
          g.stroke();
        }
      }
      s.inlays(0.025, 12, { shape: 'dot', size: 5, color: '#eaf2f4' });
      s.leather(0.115, 0.33, [86, 48, 26], '#d9b45a');
      s.ferruleAndTip('#1d3f7a', '#f6f0e0');
    },
  },
  {
    id: 'inferno',
    name: 'Inferno',
    tagline: 'Black lacquer, hand-laid flames that glow',
    metal: 'chrome',
    rings: [0.11, 0.335, 0.5],
    glowIntensity: 1.6,
    paint(s) {
      s.maple(0.52, 0.983, 5);
      s.band(0.014, 0.5, '#0b0b0d');
      s.surface(0.014, 0.5, 0.12);
      const n = noise(91), n2 = noise(92);
      const flame = (x, y, local) => {
        const u = x / W;
        const tongue = n(u * 10, local * 6) * 0.65 + n2(u * 26, local * 14) * 0.35;
        const reach = Math.pow(1 - local, 1.3); // flames rise towards the tip
        const f = tongue * 1.25 * reach + 0.15 * reach - 0.35;
        return Math.max(0, Math.min(1, f * 2.2));
      };
      const ramp = (f) => {
        if (f <= 0) return [11, 11, 13];
        if (f < 0.35) return [130 * (f / 0.35) + 11, 10, 8];
        if (f < 0.7) return [230, 60 + 120 * ((f - 0.35) / 0.35), 15];
        return [255, 190 + 60 * ((f - 0.7) / 0.3), 60 + 160 * ((f - 0.7) / 0.3)];
      };
      for (const [v0, v1] of [[0.34, 0.5], [0.014, 0.11]]) {
        s.pixels(v0, v1, (x, y, local) => ramp(flame(x, y, local)));
        s.pixels(v0, v1, (x, y, local) => {
          const f = flame(x, y, local);
          return f > 0.3 ? ramp(f).map((c) => c * 0.8) : [0, 0, 0];
        }, s.eg);
      }
      s.glow = true;
      s.knurl(0.115, 0.33, [120, 14, 16], [20, 4, 4]);
      s.text(0.06, 'INFERNO', { color: '#ff9a3a', size: 30 });
      s.text(0.06, 'INFERNO', { color: '#ff7a20', size: 30, layer: s.eg });
      s.ferruleAndTip('#2a2a2a', '#f3f0e6');
    },
  },
  {
    id: 'circuit',
    name: 'Neon Circuit',
    tagline: 'Carbon weave, live traces, carbon shaft',
    metal: 'black',
    rings: [0.11, 0.335, 0.5],
    glowIntensity: 2.2,
    pulse: true,
    paint(s) {
      s.carbon(0.014, 0.5);
      s.carbon(0.52, 0.983, [22, 23, 26]);
      // Lay out the traces once, then draw them on the colour and glow layers.
      const r = rng(5);
      const traces = [];
      for (let k = 0; k < 18; k++) {
        let x = r() * W, v = 0.02 + r() * 0.06;
        const end = Math.min(0.49, v + 0.1 + r() * 0.38);
        const pts = [[x, v]];
        while (v < end) {
          v += 0.01 + r() * 0.03;
          const turn = r();
          if (turn < 0.25) x += 24;
          else if (turn < 0.5) x -= 24;
          pts.push([x, Math.min(v, 0.49)]);
        }
        traces.push(pts);
      }
      for (const [g, width, node] of [[s.g, 3, 6], [s.eg, 5, 7]]) {
        g.strokeStyle = g.fillStyle = '#3ff5ff';
        g.lineWidth = width;
        g.lineCap = g.lineJoin = 'round';
        for (const pts of traces) {
          g.beginPath();
          pts.forEach(([x, v], i) => (i ? g.lineTo(x, s.Y(v)) : g.moveTo(x, s.Y(v))));
          g.stroke();
          const [ex, ev] = pts[pts.length - 1];
          g.beginPath();
          g.arc(ex, s.Y(ev), node, 0, Math.PI * 2);
          g.fill();
        }
      }
      for (const v of [0.335, 0.11]) {
        s.ring(v + 0.004, 6, '#ff3df0');
        s.ring(v + 0.004, 8, '#ff3df0', s.eg);
      }
      s.ring(0.52, 6, '#3ff5ff');
      s.ring(0.52, 8, '#3ff5ff', s.eg);
      s.glow = true;
      s.knurl(0.115, 0.33, [40, 42, 46], [12, 12, 14]);
      s.surface(0.115, 0.33, 0.5, 0.6);
      s.text(0.06, 'CIRCUIT', { color: '#3ff5ff', size: 28, font: '"Roboto Mono", monospace' });
      s.text(0.06, 'CIRCUIT', { color: '#3ff5ff', size: 28, font: '"Roboto Mono", monospace', layer: s.eg });
      s.ferruleAndTip('#16161a', '#0d0d10');
    },
  },
  {
    id: 'dragon',
    name: 'Jade Dragon',
    tagline: 'Carved jade, gold scales, a coiled dragon',
    metal: 'gold',
    rings: [0.03, 0.11, 0.335, 0.5],
    glowIntensity: 1.2,
    paint(s) {
      s.maple(0.52, 0.983, 9);
      const n = noise(61), n2 = noise(62);
      const jade = (x, y) => {
        const cloud = n(x / 70, y / 120) * 0.7 + n2(x / 14, y / 30) * 0.3;
        const vein = Math.pow(Math.abs(Math.sin((x / W) * 9 + y / 140 + cloud * 5)), 18);
        return [40 + 60 * cloud + 150 * vein, 120 + 70 * cloud + 110 * vein, 90 + 50 * cloud + 120 * vein];
      };
      s.pixels(0.014, 0.11, jade);
      s.pixels(0.34, 0.5, jade);
      s.surface(0.014, 0.5, 0.15);
      // gold scales on the forearm
      const g = s.g;
      g.strokeStyle = '#e3b65a';
      g.lineWidth = 3;
      for (let row = 0; row < 26; row++) {
        const y = s.Y(0.345 + row * 0.006);
        for (let k = 0; k < 16; k++) {
          const x = (k + (row % 2) * 0.5) * (W / 16);
          g.beginPath();
          g.arc(x, y, W / 32, Math.PI, 0);
          g.stroke();
        }
      }
      // a dragon coiling round the butt sleeve
      g.lineWidth = 16;
      g.strokeStyle = '#d9a640';
      g.beginPath();
      for (let t = 0; t <= 1; t += 0.002) {
        const x = (t * W * 2.3) % W;
        const v = 0.02 + t * 0.085 + Math.sin(t * Math.PI * 7) * 0.006;
        if (x < 6) g.moveTo(x, s.Y(v));
        else g.lineTo(x, s.Y(v));
      }
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = '#7a4a10';
      for (let t = 0; t <= 1; t += 0.012) {
        const x = (t * W * 2.3) % W;
        const v = 0.02 + t * 0.085 + Math.sin(t * Math.PI * 7) * 0.006;
        g.beginPath();
        g.moveTo(x - 6, s.Y(v) - 8);
        g.lineTo(x + 6, s.Y(v) - 22); // spines
        g.stroke();
      }
      // glowing ruby eyes
      for (const layer of [s.g, s.eg]) {
        layer.fillStyle = '#ff2a2a';
        layer.beginPath();
        layer.arc((W * 2.3) % W, s.Y(0.105), 7, 0, Math.PI * 2);
        layer.fill();
      }
      s.glow = true;
      s.leather(0.115, 0.33, [120, 20, 24], '#e3b65a');
      s.ferruleAndTip('#1b4a3a', '#f3f0e6');
    },
  },
  {
    id: 'nebula',
    name: 'Nebula',
    tagline: 'A night sky that turns as you play',
    metal: 'silver',
    rings: [0.11, 0.335, 0.5],
    glowIntensity: 1.8,
    drift: 0.02,
    paint(s) {
      s.maple(0.52, 0.983, 13);
      const n = noise(71), n2 = noise(72), n3 = noise(73);
      const sky = (x, y, local, v) => {
        const neb1 = Math.max(0, n(x / 80, y / 140) - 0.45) * 2.2;
        const neb2 = Math.max(0, n2(x / 50, y / 90) - 0.5) * 2.2;
        const base = [10 + 20 * (1 - v), 8, 34 + 40 * v];
        return [base[0] + 200 * neb1 + 40 * neb2, base[1] + 40 * neb1 + 130 * neb2, base[2] + 160 * neb1 + 200 * neb2];
      };
      s.pixels(0.014, 0.11, sky);
      s.pixels(0.34, 0.5, sky);
      s.pixels(0.014, 0.11, (x, y, l, v) => sky(x, y, l, v).map((c) => Math.max(0, c - 40) * 0.6), s.eg);
      s.pixels(0.34, 0.5, (x, y, l, v) => sky(x, y, l, v).map((c) => Math.max(0, c - 40) * 0.6), s.eg);
      s.surface(0.014, 0.5, 0.1);
      const r = rng(17);
      for (const [v0, v1, count] of [[0.014, 0.11, 260], [0.34, 0.5, 420], [0.115, 0.33, 160]]) {
        for (let k = 0; k < count; k++) {
          const x = r() * W, y = s.Y(v0 + r() * (v1 - v0));
          const big = r() < 0.06;
          const size = big ? 3 + r() * 2 : 1 + r() * 1.5;
          for (const layer of [s.g, s.eg]) {
            layer.fillStyle = big ? '#fff6d8' : '#ffffff';
            layer.beginPath();
            layer.arc(x, y, size, 0, Math.PI * 2);
            layer.fill();
            if (big) {
              layer.fillRect(x - size * 3, y - 0.5, size * 6, 1);
              layer.fillRect(x - 0.5, y - size * 3, 1, size * 6);
            }
          }
        }
      }
      // a constellation
      s.g.strokeStyle = 'rgba(200,220,255,0.6)';
      s.g.lineWidth = 2;
      s.g.beginPath();
      [[60, 0.36], [120, 0.39], [170, 0.37], [230, 0.42], [260, 0.46], [330, 0.44]].forEach(([x, v], i) => (i ? s.g.lineTo(x, s.Y(v)) : s.g.moveTo(x, s.Y(v))));
      s.g.stroke();
      s.glow = true;
      s.linen(0.115, 0.33, [14, 12, 30], 'rgba(150,170,255,0.12)');
      s.ferruleAndTip('#3a2a7a', '#f3f0e6');
    },
  },
  {
    id: 'damascus',
    name: 'Damascus',
    tagline: 'Folded steel, brass collars, wenge',
    metal: 'brass',
    rings: [0.03, 0.11, 0.335, 0.5],
    paint(s) {
      s.maple(0.52, 0.983, 21);
      const n = noise(81), n2 = noise(82);
      const steel = (x, y) => {
        const u = x / W;
        const fold = Math.sin(y / 11 + Math.sin(u * Math.PI * 6) * 3 + n(u * 8, y / 200) * 6 + n2(u * 30, y / 40) * 1.2);
        const k = 0.5 + 0.5 * fold;
        const g = 110 + 120 * Math.pow(k, 1.8);
        return [g, g * 1.0, g * 1.04];
      };
      s.pixels(0.014, 0.11, steel);
      s.pixels(0.34, 0.5, steel);
      s.pixels(0.014, 0.11, (x, y) => {
        const c = steel(x, y);
        return [0, 50 + (230 - c[0]) * 0.6, 255];
      }, s.og);
      s.pixels(0.34, 0.5, (x, y) => {
        const c = steel(x, y);
        return [0, 50 + (230 - c[0]) * 0.6, 255];
      }, s.og);
      s.metal = true;
      s.wood(0.115, 0.33, [72, 52, 40], [24, 16, 12], { seed: 33, rings: 60 });
      s.points(0.34, 0.43, 3, [[40, '#c89b4a'], [32, '#2a1e16']], { phase: 0.25 });
      s.surface(0.34, 0.43, 0.35, 0.0);
      s.text(0.07, 'DAMASCUS', { color: '#c89b4a', size: 26 });
      s.ferruleAndTip('#5a3a20', '#f3f0e6');
    },
  },
];

const cache = new Map();

function skinFor(design) {
  if (cache.has(design.id)) return cache.get(design.id);
  const s = new Skin();
  design.paint(s);
  // Joint and butt cap bands in the metal's colour.
  const metal = METALS[design.metal];
  const css = '#' + new THREE.Color(metal.color).getHexString();
  s.band(0.5, 0.52, css);
  s.surface(0.5, 0.52, metal.roughness, 1);
  s.band(0.012, 0.016, css);
  s.surface(0.012, 0.016, metal.roughness, 1);
  cache.set(design.id, s);
  return s;
}

export function cueMaterial(design) {
  const s = skinFor(design);
  if (s.material) return s.material;
  const map = new THREE.CanvasTexture(s.c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.wrapS = THREE.RepeatWrapping;
  const orm = new THREE.CanvasTexture(s.oc);
  orm.wrapS = THREE.RepeatWrapping;
  const params = {
    map, roughness: 1, roughnessMap: orm, metalness: s.metal ? 1 : 0, metalnessMap: s.metal ? orm : null,
    clearcoat: 0.9, clearcoatRoughness: 0.07,
  };
  if (s.glow) {
    const em = new THREE.CanvasTexture(s.ec);
    em.colorSpace = THREE.SRGBColorSpace;
    em.wrapS = THREE.RepeatWrapping;
    Object.assign(params, { emissive: 0xffffff, emissiveMap: em, emissiveIntensity: design.glowIntensity ?? 1.2 });
  }
  s.material = new THREE.MeshPhysicalMaterial(params);
  return s.material;
}

const metalMats = {};
function metalMaterial(name) {
  if (!metalMats[name]) {
    const m = METALS[name];
    metalMats[name] = new THREE.MeshStandardMaterial({ color: m.color, metalness: 1, roughness: m.roughness });
  }
  return metalMats[name];
}

// A complete cue: the turned body plus raised metal rings, a joint collar and a butt cap.
export function buildCueModel(design) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(cueGeometry(), cueMaterial(design));
  body.castShadow = true;
  g.add(body);
  const metal = metalMaterial(design.metal);
  const collar = (v0, v1, extra) => {
    const r0 = cueRadius(v0) + extra, r1 = cueRadius(v1) + extra;
    const geo = new THREE.CylinderGeometry(r1, r0, (v1 - v0) * CUE_LENGTH, 40);
    geo.rotateZ(-Math.PI / 2); // +y -> +x: r1 end towards the tip
    const m = new THREE.Mesh(geo, metal);
    m.position.x = xAt((v0 + v1) / 2);
    m.castShadow = true;
    g.add(m);
  };
  collar(0.5, 0.52, 0.0006);
  for (const v of design.rings) collar(v - 0.002, v + 0.002, 0.0004);
  // Rubber bumper with a domed end.
  const bump = new THREE.Mesh(new THREE.SphereGeometry(cueRadius(0) * 0.96, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.85 }));
  bump.rotation.z = Math.PI / 2;
  bump.scale.set(0.35, 1, 1);
  bump.position.x = xAt(0);
  g.add(bump);
  g.userData.design = design;
  return g;
}

// Per-frame touches: pulsing traces, drifting stars.
export function animateCue(model, time) {
  const d = model?.userData.design;
  if (!d) return;
  const mat = model.children[0].material;
  if (d.pulse) mat.emissiveIntensity = (d.glowIntensity ?? 1) * (0.6 + 0.4 * Math.sin(time * 3));
  if (d.drift) mat.map.offset.x = mat.emissiveMap.offset.x = (time * d.drift) % 1;
}

// A side-on picture of the cue for the picker.
export function cueThumbnail(design, w = 420, h = 40) {
  const s = skinFor(design);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d');
  const cy = h / 2;
  const maxR = cueRadius(0);
  for (let x = 0; x < w; x++) {
    const v = x / (w - 1);
    const r = (cueRadius(v) / maxR) * (h / 2 - 2);
    const sy = Math.floor((1 - v) * H);
    // the front half of the circumference, squeezed into the visible height
    g.drawImage(s.c, W * 0.25, Math.min(H - 1, sy), W * 0.5, 1, x, cy - r, 1, 2 * r);
    if (s.glow) {
      g.globalCompositeOperation = 'lighter';
      g.drawImage(s.ec, W * 0.25, Math.min(H - 1, sy), W * 0.5, 1, x, cy - r, 1, 2 * r);
      g.globalCompositeOperation = 'source-over';
    }
  }
  // round it with light and shade
  const shade = g.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(255,255,255,0.35)');
  shade.addColorStop(0.3, 'rgba(255,255,255,0.05)');
  shade.addColorStop(0.7, 'rgba(0,0,0,0.05)');
  shade.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  return out.toDataURL();
}
