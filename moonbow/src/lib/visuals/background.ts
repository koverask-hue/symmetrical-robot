// The night sky behind everything: aurora curtains in the cover's colours that
// lift and brighten with the bass, and stars that twinkle with the treble. Rendered at reduced
// resolution (it's soft anyway), so it costs very little GPU.

import type { RGB } from './palette';

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res;
uniform float t;
uniform float bass;
uniform float energy;
uniform float treble;
uniform vec3 c0, c1, c2, c3;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + 17.3; a *= 0.5; }
  return v;
}

// One aurora curtain: a glowing ribbon whose height wanders with noise, with
// fine vertical rays like the real thing.
vec3 curtain(vec2 uv, float seed, float height, vec3 col, float speed) {
  float x = uv.x * 1.3 + seed;
  float h = height + 0.16 * (fbm(vec2(x * 0.9, t * speed + seed)) - 0.5) + 0.05 * sin(x * 2.0 + t * speed * 3.0);
  float d = uv.y - h;
  float band = exp(-d * d * (d > 0.0 ? 9.0 : 55.0));        // long soft top, crisp bottom edge
  float rays = 0.55 + 0.45 * fbm(vec2(x * 22.0, t * 0.35 + seed));
  float fade = smoothstep(0.0, 0.35, uv.x) * smoothstep(1.4, 0.9, uv.x);
  return col * band * rays * (0.55 + fade * 0.45);
}

void main() {
  vec2 uv = gl_FragCoord.xy / res;
  float ar = res.x / res.y;
  vec2 q = vec2(uv.x * ar, uv.y);

  // Sky: deep night at the top, a breath of the cover's darkest colour at the horizon.
  vec3 sky = mix(c3 * 0.5 + vec3(0.02, 0.015, 0.04), vec3(0.012, 0.01, 0.025), smoothstep(0.0, 1.0, uv.y));

  // Stars: twinkle more when the highs are busy.
  vec2 cell = floor(q * 140.0);
  float r = hash(cell);
  if (r > 0.9935) {
    vec2 f = fract(q * 140.0) - 0.5;
    float tw = 0.5 + 0.5 * sin(t * (1.0 + r * 4.0) + r * 60.0);
    float star = smoothstep(0.12, 0.0, length(f)) * (0.35 + 0.65 * tw) * (0.6 + treble * 1.6);
    sky += vec3(star) * smoothstep(0.15, 0.6, uv.y);
  }

  // Three curtains in the cover's colours; the bass lifts and brightens them.
  float lift = bass * 0.08;
  float glow = 0.75 + energy * 0.9 + bass * 0.8;
  vec3 aur = curtain(q, 0.0, 0.62 + lift, c0, 0.05)
           + curtain(q, 3.7, 0.50 + lift * 0.8, c1, 0.035) * 0.85
           + curtain(q, 8.1, 0.74 + lift * 1.2, c2, 0.06) * 0.6;
  sky += aur * glow * 0.9;

  // Soft colour pools near the ground so content never sits on pure black.
  float pool = exp(-pow(length(vec2((uv.x - 0.2) * ar, uv.y + 0.15)), 2.0) * 2.2);
  float pool2 = exp(-pow(length(vec2((uv.x - 0.85) * ar, uv.y + 0.05)), 2.0) * 2.6);
  sky += c1 * pool * 0.35 + c0 * pool2 * 0.25;

  sky *= mix(0.6, 1.0, smoothstep(1.3, 0.3, length((uv - vec2(0.5, 0.55)) * vec2(1.0, 1.2))));
  sky = sky / (1.0 + sky * 0.35);
  sky += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 120.0;
  o = vec4(sky, 1.0);
}`;

export interface BackgroundOptions {
  /** Returns 0..255 spectrum bins, or null for no audio reaction. */
  spectrum: () => Uint8Array | null;
  reactive: () => boolean;
  fps: () => number;
}

export class Background {
  #gl: WebGL2RenderingContext;
  #prog: WebGLProgram;
  #u: Record<string, WebGLUniformLocation | null> = {};
  #from: RGB[];
  #to: RGB[];
  #mix = 1;
  #bass = 0;
  #energy = 0;
  #treble = 0;
  #raf = 0;
  #last = 0;
  #t0 = performance.now();
  #scale = 0.5;

  constructor(private canvas: HTMLCanvasElement, initial: RGB[], private opts: BackgroundOptions) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.#gl = gl;
    this.#prog = this.#program(VERT, FRAG);
    gl.useProgram(this.#prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.#prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['res', 't', 'bass', 'energy', 'treble', 'c0', 'c1', 'c2', 'c3']) this.#u[n] = gl.getUniformLocation(this.#prog, n);
    this.#from = initial;
    this.#to = initial;
  }

  #program(vs: string, fs: string) {
    const gl = this.#gl;
    const make = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  }

  setPalette(p: RGB[]) {
    this.#from = this.#current();
    this.#to = p;
    this.#mix = 0;
  }

  #current(): RGB[] {
    const e = this.#mix * this.#mix * (3 - 2 * this.#mix);
    return this.#to.map((c, i) => c.map((v, j) => this.#from[i][j] + (v - this.#from[i][j]) * e) as RGB);
  }

  start() {
    cancelAnimationFrame(this.#raf);
    const loop = (now: number) => {
      this.#raf = requestAnimationFrame(loop);
      const interval = 1000 / this.opts.fps();
      if (now - this.#last < interval - 1 || document.hidden) return;
      const dt = Math.min(0.1, (now - this.#last) / 1000);
      this.#last = now;
      this.#frame(now, dt);
    };
    this.#raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.#raf);
  }

  #frame(now: number, dt: number) {
    const gl = this.#gl;
    const c = this.canvas;
    const w = Math.max(1, Math.round(c.clientWidth * this.#scale));
    const h = Math.max(1, Math.round(c.clientHeight * this.#scale));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    gl.viewport(0, 0, w, h);

    let bass = 0;
    let energy = 0;
    let treble = 0;
    const bins = this.opts.reactive() ? this.opts.spectrum() : null;
    if (bins) {
      for (let i = 1; i < 6; i++) bass += bins[i];
      bass /= 5 * 255;
      for (let i = 0; i < bins.length; i++) energy += bins[i];
      energy /= bins.length * 255;
      for (let i = 40; i < 90; i++) treble += bins[i];
      treble /= 50 * 255;
    }
    // Fast attack, slow release, so it pulses rather than jitters.
    const k = (target: number, cur: number) => cur + (target - cur) * (target > cur ? 0.5 : 0.08);
    this.#bass = k(bass * bass * 1.4, this.#bass);
    this.#energy = k(energy, this.#energy);
    this.#treble = k(treble * 1.6, this.#treble);

    this.#mix = Math.min(1, this.#mix + dt / 1.4);
    const pal = this.#current();
    gl.uniform2f(this.#u.res, w, h);
    gl.uniform1f(this.#u.t, (now - this.#t0) / 1000);
    gl.uniform1f(this.#u.bass, this.#bass);
    gl.uniform1f(this.#u.energy, this.#energy);
    gl.uniform1f(this.#u.treble, this.#treble);
    pal.forEach((col, i) => gl.uniform3f(this.#u[`c${i}`], col[0], col[1], col[2]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
