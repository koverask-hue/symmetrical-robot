import * as THREE from 'three';
import { BLOCKS, VOXEL } from '../materials.js';

/**
 * Flying voxel chips: instanced cubes with cheap ballistic physics that
 * bounce off the voxel grid and fade out. Not simulated by Rapier — there
 * can be thousands and they never need to stack.
 */
export class Chips {
  constructor(scene, world, max = 4000) {
    this.world = world;
    this.max = max;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.rot = new Float32Array(max * 4); // axis-angle spin (xyz axis, w speed)
    this.ang = new Float32Array(max);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.n = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.ax = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.col = new THREE.Color();
  }

  /**
   * list: [{p:[x,y,z], id}], speed: outward speed or a velocity [vx,vy,vz],
   * from: blast centre (chips fly away from it).
   */
  spawn(list, speed = 4, from = null) {
    const vel = Array.isArray(speed) ? speed : null;
    const sp = typeof speed === 'number' ? speed : 3;
    for (const c of list) {
      if (this.n >= this.max) this.kill(0);
      const i = this.n++;
      const o = i * 3;
      this.p[o] = c.p[0]; this.p[o + 1] = c.p[1]; this.p[o + 2] = c.p[2];
      let dx = Math.random() - 0.5, dy = Math.random() * 0.8, dz = Math.random() - 0.5;
      if (from) {
        dx += (c.p[0] - from[0]) * 0.8; dy += (c.p[1] - from[1]) * 0.8 + 0.3; dz += (c.p[2] - from[2]) * 0.8;
      }
      const l = Math.hypot(dx, dy, dz) || 1;
      const k = sp * (0.4 + Math.random() * 0.9) / l;
      this.v[o] = dx * k + (vel ? vel[0] : 0);
      this.v[o + 1] = dy * k + (vel ? vel[1] : 0);
      this.v[o + 2] = dz * k + (vel ? vel[2] : 0);
      this.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      this.rot[i * 4] = this.ax.x; this.rot[i * 4 + 1] = this.ax.y; this.rot[i * 4 + 2] = this.ax.z;
      this.rot[i * 4 + 3] = (Math.random() - 0.5) * 18;
      this.ang[i] = Math.random() * 6;
      this.size[i] = VOXEL * (0.25 + Math.random() * 0.45);
      this.life[i] = 1.6 + Math.random() * 2.2;
      const b = BLOCKS[c.id] || BLOCKS[1];
      const s = 0.85 + Math.random() * 0.25;
      this.col.setRGB(b.color[0] * s, b.color[1] * s, b.color[2] * s);
      this.mesh.instanceColor.setXYZ(i, this.col.r, this.col.g, this.col.b);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (let k = 0; k < 3; k++) {
      this.p[i * 3 + k] = this.p[j * 3 + k];
      this.v[i * 3 + k] = this.v[j * 3 + k];
    }
    for (let k = 0; k < 4; k++) this.rot[i * 4 + k] = this.rot[j * 4 + k];
    this.ang[i] = this.ang[j];
    this.size[i] = this.size[j];
    this.life[i] = this.life[j];
    const c = this.mesh.instanceColor;
    c.setXYZ(i, c.getX(j), c.getY(j), c.getZ(j));
    c.needsUpdate = true;
  }

  update(dt) {
    const w = this.world;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const o = i * 3;
      this.v[o + 1] -= 18 * dt;
      const nx = this.p[o] + this.v[o] * dt, ny = this.p[o + 1] + this.v[o + 1] * dt, nz = this.p[o + 2] + this.v[o + 2] * dt;
      if (w.solidAt(nx, ny, nz)) {
        // Find which axis we crossed and bounce on it.
        if (w.solidAt(this.p[o], ny, this.p[o + 2])) {
          this.v[o + 1] *= -0.3;
          this.v[o] *= 0.6;
          this.v[o + 2] *= 0.6;
          this.rot[i * 4 + 3] *= 0.6;
        } else if (w.solidAt(nx, this.p[o + 1], this.p[o + 2])) this.v[o] *= -0.35;
        else this.v[o + 2] *= -0.35;
      } else {
        this.p[o] = nx; this.p[o + 1] = ny; this.p[o + 2] = nz;
      }
      this.ang[i] += this.rot[i * 4 + 3] * dt;
      this.ax.set(this.rot[i * 4], this.rot[i * 4 + 1], this.rot[i * 4 + 2]);
      this.q.setFromAxisAngle(this.ax, this.ang[i]);
      const s = this.size[i] * Math.min(1, this.life[i] * 2);
      this.s.set(s, s, s);
      this.pos.set(this.p[o], this.p[o + 1], this.p[o + 2]);
      this.m.compose(this.pos, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }
}

// A soft, noisy puff generated once (no texture files to ship).
function puffTexture() {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const rnd = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = rnd(ix, iy), b = rnd(ix + 1, iy), c = rnd(ix, iy + 1), d = rnd(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      let n = 0, amp = 0.5, f = 4;
      for (let o = 0; o < 4; o++) {
        n += noise(x / N * f, y / N * f) * amp;
        amp *= 0.5;
        f *= 2;
      }
      const a = Math.max(0, 1 - r) ** 1.6 * (0.55 + 0.9 * n);
      const i = (x + y * N) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255 * (0.75 + 0.25 * n);
      data[i + 3] = Math.min(255, 255 * a);
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Camera-facing quads with per-particle size, colour, alpha, rotation and
 * motion. One instance of this class per blend mode.
 */
export class Billboards {
  constructor(scene, { max = 2000, additive = false, texture, lit = false, sunDir = null }) {
    this.max = max;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSR = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iSR', this.aSR);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        uSun: { value: sunDir ? sunDir.clone() : new THREE.Vector3(0, 1, 0) },
        fogColor: { value: new THREE.Color(0xb9c4cf) },
        fogDensity: { value: 0.0065 },
      },
      defines: lit ? { LIT: 1 } : {},
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSR;
        varying vec2 vUv; varying vec4 vCol; varying float vFog; varying float vShade;
        uniform vec3 uSun;
        void main() {
          vUv = uv; vCol = iCol;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float c = cos(iSR.y), s = sin(iSR.y);
          vec2 p = mat2(c, s, -s, c) * position.xy * iSR.x;
          mv.xy += p;
          // Puffs facing the sun are brighter; cheap volumetric impression.
          vec3 viewSun = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
          vShade = 0.55 + 0.45 * clamp(dot(normalize(vec3(p, 0.6)), viewSun) * 0.5 + 0.5, 0.0, 1.0);
          vFog = length(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 fogColor; uniform float fogDensity;
        varying vec2 vUv; varying vec4 vCol; varying float vFog; varying float vShade;
        void main() {
          vec4 t = texture2D(map, vUv);
          float a = t.a * vCol.a;
          if (a < 0.003) discard;
          vec3 c = vCol.rgb * t.rgb;
          #ifdef LIT
            c *= vShade;
            float f = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog);
            c = mix(c, fogColor, f);
          #endif
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 4 : 3;
    scene.add(this.mesh);
    // CPU state.
    this.n = 0;
    this.st = new Float32Array(max * 16);
    // layout: 0-2 pos, 3-5 vel, 6 age, 7 life, 8 size0, 9 size1, 10 rot, 11 spin,
    // 12-14 rgb, 15 alpha peak. (drag/buoyancy are per system)
    this.gravity = 0;
    this.drag = 1.5;
  }

  emit(p, v, life, size0, size1, rgb, alpha, spin = 0) {
    if (this.n >= this.max) return;
    const s = this.st, o = this.n++ * 16;
    s[o] = p[0]; s[o + 1] = p[1]; s[o + 2] = p[2];
    s[o + 3] = v[0]; s[o + 4] = v[1]; s[o + 5] = v[2];
    s[o + 6] = 0; s[o + 7] = life; s[o + 8] = size0; s[o + 9] = size1;
    s[o + 10] = Math.random() * 6.28; s[o + 11] = spin;
    s[o + 12] = rgb[0]; s[o + 13] = rgb[1]; s[o + 14] = rgb[2]; s[o + 15] = alpha;
  }

  update(dt, fadeIn = 0.15) {
    const s = this.st;
    const damp = Math.exp(-this.drag * dt);
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 16;
      s[o + 6] += dt;
      if (s[o + 6] >= s[o + 7]) continue;
      s[o + 3] *= damp; s[o + 4] = s[o + 4] * damp + this.gravity * dt; s[o + 5] *= damp;
      s[o] += s[o + 3] * dt; s[o + 1] += s[o + 4] * dt; s[o + 2] += s[o + 5] * dt;
      s[o + 10] += s[o + 11] * dt;
      if (w !== i) s.copyWithin(w * 16, o, o + 16);
      w++;
    }
    this.n = w;
    const P = this.aPos.array, C = this.aCol.array, SR = this.aSR.array;
    for (let i = 0; i < w; i++) {
      const o = i * 16, t = s[o + 6] / s[o + 7];
      P[i * 3] = s[o]; P[i * 3 + 1] = s[o + 1]; P[i * 3 + 2] = s[o + 2];
      const a = s[o + 15] * Math.min(1, t / fadeIn) * (1 - t) * (1 - t * 0.3);
      C[i * 4] = s[o + 12]; C[i * 4 + 1] = s[o + 13]; C[i * 4 + 2] = s[o + 14]; C[i * 4 + 3] = a;
      SR[i * 2] = s[o + 8] + (s[o + 9] - s[o + 8]) * Math.sqrt(t);
      SR[i * 2 + 1] = s[o + 10];
    }
    this.geo.instanceCount = w;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSR.needsUpdate = true;
    this.aPos.updateRanges.length = 0; // upload everything that is live
  }

  clear() {
    this.n = 0;
    this.geo.instanceCount = 0;
  }
}

/** All particle effects, with helpers for the common recipes. */
export class Effects {
  constructor(scene, world, sunDir) {
    const tex = puffTexture();
    this.chips = new Chips(scene, world);
    this.smoke = new Billboards(scene, { max: 2500, texture: tex, lit: true, sunDir });
    this.smoke.gravity = 0.6;
    this.smoke.drag = 1.2;
    this.glow = new Billboards(scene, { max: 3000, additive: true, texture: tex });
    this.glow.gravity = 0;
    this.glow.drag = 2.0;
    this.sparks = new Billboards(scene, { max: 2000, additive: true, texture: tex });
    this.sparks.gravity = -9;
    this.sparks.drag = 0.4;
  }

  dust(p, amount = 1, color = [0.62, 0.58, 0.52]) {
    const n = Math.round(4 + amount * 14);
    for (let i = 0; i < n; i++) {
      const v = [(Math.random() - 0.5) * 3 * amount, Math.random() * 1.2, (Math.random() - 0.5) * 3 * amount];
      const q = [p[0] + (Math.random() - 0.5) * amount, p[1] + Math.random() * 0.3, p[2] + (Math.random() - 0.5) * amount];
      this.smoke.emit(q, v, 2.5 + Math.random() * 3, 0.5 + amount * 0.5, 2 + amount * 3, color, 0.35, (Math.random() - 0.5) * 0.6);
    }
  }

  explosion(p, power) {
    // Fireball (HDR colours > 1 drive the bloom).
    for (let i = 0; i < 26 * power; i++) {
      const d = [Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5];
      const s = 6 + Math.random() * 7;
      this.glow.emit(p, [d[0] * s * power, d[1] * s * power, d[2] * s * power], 0.35 + Math.random() * 0.35, 0.8 * power, 2.6 * power,
        [8, 3.2 + Math.random() * 2, 0.8], 0.9, (Math.random() - 0.5) * 3);
    }
    // Dark rolling smoke.
    for (let i = 0; i < 34 * power; i++) {
      const d = [Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5];
      const s = 3 + Math.random() * 5;
      const g = 0.18 + Math.random() * 0.14;
      this.smoke.emit([p[0] + d[0], p[1] + d[1], p[2] + d[2]], [d[0] * s, d[1] * s + 1, d[2] * s], 4 + Math.random() * 5,
        1.2 * power, (4 + Math.random() * 3) * power, [g, g * 0.95, g * 0.9], 0.75, (Math.random() - 0.5) * 0.5);
    }
    // Sparks / embers.
    for (let i = 0; i < 60 * power; i++) {
      const d = [Math.random() - 0.5, Math.random() * 0.9 - 0.1, Math.random() - 0.5];
      const s = 10 + Math.random() * 16;
      this.sparks.emit(p, [d[0] * s, d[1] * s, d[2] * s], 0.6 + Math.random() * 1.2, 0.06, 0.03, [12, 5, 1.2], 1);
    }
  }

  sparksAt(p, n, dir = [0, 1, 0], hot = 1) {
    for (let i = 0; i < n; i++) {
      const s = 2 + Math.random() * 6;
      this.sparks.emit(p, [dir[0] * s + (Math.random() - 0.5) * 5, dir[1] * s + Math.random() * 3, dir[2] * s + (Math.random() - 0.5) * 5],
        0.3 + Math.random() * 0.5, 0.05, 0.02, [10 * hot, 4.5 * hot, 1.2 * hot], 1);
    }
  }

  flame(p, scale = 1) {
    const r = Math.random();
    this.glow.emit([p[0] + (Math.random() - 0.5) * 0.2, p[1], p[2] + (Math.random() - 0.5) * 0.2],
      [(Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4],
      0.45 + r * 0.4, 0.45 * scale, 0.12 * scale, [5 + r * 3, 1.6 + r * 1.2, 0.35], 0.8, (Math.random() - 0.5) * 2);
  }

  smokePuff(p, dark = 0.2, size = 1) {
    this.smoke.emit([p[0], p[1] + 0.3, p[2]], [(Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6],
      3 + Math.random() * 3, 0.4 * size, 2.4 * size, [dark, dark, dark * 0.95], 0.45, (Math.random() - 0.5) * 0.4);
  }

  mist(p, v) {
    this.smoke.emit(p, v, 0.9 + Math.random() * 0.6, 0.15, 1.1, [0.95, 0.97, 1.0], 0.35, (Math.random() - 0.5) * 2);
  }

  muzzle(p, dir) {
    for (let i = 0; i < 6; i++) {
      const s = 2 + Math.random() * 6;
      this.glow.emit(p, [dir[0] * s, dir[1] * s, dir[2] * s], 0.06 + Math.random() * 0.05, 0.25, 0.4, [10, 6, 2.5], 1);
    }
  }

  trail(p) {
    this.smoke.emit(p, [(Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4], 1.5 + Math.random(), 0.25, 1.4, [0.7, 0.7, 0.7], 0.35);
    this.glow.emit(p, [0, 0, 0], 0.08, 0.5, 0.2, [9, 4, 1], 1);
  }

  update(dt) {
    this.chips.update(dt);
    this.smoke.update(dt, 0.08);
    this.glow.update(dt, 0.02);
    this.sparks.update(dt, 0.01);
  }

  clear() {
    this.chips.clear();
    this.smoke.clear();
    this.glow.clear();
    this.sparks.clear();
  }
}
