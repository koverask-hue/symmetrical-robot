// Full-window animated gradient: four color fields drifting on slow Lissajous
// paths with domain-warped noise, swelling with the bass. Rendered at reduced
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
uniform vec3 c0, c1, c2, c3;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}
float blob(vec2 uv, vec2 c, float r) { return exp(-dot(uv - c, uv - c) / (r * r)); }

void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec2 q = uv; q.x *= res.x / res.y;
  float s = t * 0.06;
  vec2 warp = vec2(fbm(q * 1.6 + s), fbm(q * 1.6 - s + 4.0)) - 0.5;
  q += warp * (0.35 + bass * 0.25);
  float ax = res.x / res.y;
  float r = 0.55 + bass * 0.18;
  vec2 p0 = vec2(ax * (0.25 + 0.15 * sin(s * 1.3)), 0.30 + 0.20 * cos(s * 1.7));
  vec2 p1 = vec2(ax * (0.75 + 0.12 * cos(s * 1.1)), 0.70 + 0.18 * sin(s * 0.9));
  vec2 p2 = vec2(ax * (0.70 + 0.18 * sin(s * 0.7 + 2.0)), 0.20 + 0.15 * sin(s * 1.5));
  vec2 p3 = vec2(ax * (0.20 + 0.15 * cos(s * 0.8 + 1.0)), 0.80 + 0.12 * cos(s * 1.2));
  float w0 = blob(q, p0, r), w1 = blob(q, p1, r * 0.9), w2 = blob(q, p2, r * 0.8), w3 = blob(q, p3, r * 0.85);
  vec3 base = c0 * 0.35;
  vec3 col = base + c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3;
  col /= 0.35 + w0 + w1 + w2 + w3 * 0.9;
  col *= 0.82 + energy * 0.35;
  // vignette + grain to avoid banding
  float v = smoothstep(1.25, 0.25, length(uv - 0.5));
  col *= mix(0.55, 1.0, v);
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 96.0;
  o = vec4(col, 1.0);
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
    for (const n of ['res', 't', 'bass', 'energy', 'c0', 'c1', 'c2', 'c3']) this.#u[n] = gl.getUniformLocation(this.#prog, n);
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
    const bins = this.opts.reactive() ? this.opts.spectrum() : null;
    if (bins) {
      for (let i = 1; i < 6; i++) bass += bins[i];
      bass /= 5 * 255;
      for (let i = 0; i < bins.length; i++) energy += bins[i];
      energy /= bins.length * 255;
    }
    // Fast attack, slow release, so it pulses rather than jitters.
    const k = (target: number, cur: number) => cur + (target - cur) * (target > cur ? 0.5 : 0.08);
    this.#bass = k(bass * bass * 1.4, this.#bass);
    this.#energy = k(energy, this.#energy);

    this.#mix = Math.min(1, this.#mix + dt / 1.4);
    const pal = this.#current();
    gl.uniform2f(this.#u.res, w, h);
    gl.uniform1f(this.#u.t, (now - this.#t0) / 1000);
    gl.uniform1f(this.#u.bass, this.#bass);
    gl.uniform1f(this.#u.energy, this.#energy);
    pal.forEach((col, i) => gl.uniform3f(this.#u[`c${i}`], col[0], col[1], col[2]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
