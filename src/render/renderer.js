import * as THREE from 'three';
import { EffectComposer } from '../../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/addons/postprocessing/RenderPass.js';
import { ShaderPass } from '../../vendor/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/addons/postprocessing/OutputPass.js';
import { GTAOPass } from '../../vendor/addons/postprocessing/GTAOPass.js';
import { Sky } from '../../vendor/addons/objects/Sky.js';
import { VOXEL } from '../materials.js';

// Quality presets. "high" is the default on Apple Silicon: MSAA is nearly free
// on tile-based GPUs (resolved on-chip), so it beats a post-AA pass there.
export const QUALITY = {
  low: { scale: 0.6, shadow: 2048, msaa: 0, bloom: false, gtao: false, lights: 2 },
  medium: { scale: 0.8, shadow: 2048, msaa: 2, bloom: true, gtao: false, lights: 4 },
  high: { scale: 1.0, shadow: 4096, msaa: 4, bloom: true, gtao: false, lights: 6 },
  ultra: { scale: 1.0, shadow: 4096, msaa: 4, bloom: true, gtao: true, lights: 6 },
};

const MAX_DPR = 2;
export const FOG_DENSITY = 0.0052;
export const FOG_FALLOFF = 0.11;

/**
 * Replace three's fog with exponential height fog (denser near the ground)
 * that picks up the sun's colour when looking towards it. The sun is static,
 * so its direction and colour are baked in as constants. FogExp2's density
 * is reused as the ground-level extinction coefficient.
 */
function installAtmosphere(sunDir, sunColor) {
  const v3 = (v) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
  const c3 = (c) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogRay;\n#endif';
  // mvPosition rotated back to world space: the camera-to-fragment vector.
  C.fog_vertex = '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z;\n\tvFogRay = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;\n#endif';
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying float vFogDepth;
    varying vec3 vFogRay;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear;
      uniform float fogFar;
    #endif
  #endif`;
  C.fog_fragment = `#ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogDist = length( vFogRay );
      vec3 fogDir = vFogRay / max( fogDist, 1e-4 );
      float fy = fogDir.y * ${FOG_FALLOFF.toFixed(3)} * fogDist;
      float fogAmt = fogDensity * exp( - max( cameraPosition.y, 0.0 ) * ${FOG_FALLOFF.toFixed(3)} ) * fogDist
        * ( abs( fy ) > 1e-3 ? ( 1.0 - exp( - fy ) ) / fy : 1.0 );
      float fogFactor = 1.0 - exp( - fogAmt );
      float sunAmt = pow( max( dot( fogDir, ${v3(sunDir)} ), 0.0 ), 8.0 );
      vec3 fogCol = mix( fogColor, ${c3(sunColor)}, sunAmt * 0.85 );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
      vec3 fogCol = fogColor;
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
  #endif`;
} // Retina; beyond 2x the extra pixels are invisible at game distances

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0 },
    uVignette: { value: 0.32 },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberration, uVignette, uDamage, uFlash;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      // Chromatic aberration grows towards the edges and with screen shake.
      vec2 off = d * (0.0025 + uAberration) * r2 * 4.0;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      // Gentle warm grade in linear HDR: lift shadows towards blue, warm highlights.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c * vec3(0.94, 0.98, 1.06), c * vec3(1.05, 1.0, 0.94), smoothstep(0.05, 1.2, l));
      c *= 1.0 - uVignette * smoothstep(0.08, 0.6, r2);
      c = mix(c, c * vec3(1.6, 0.25, 0.2), uDamage * smoothstep(0.02, 0.45, r2));
      c += uFlash;
      c += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.012; // fine grain, hides banding
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/**
 * Voxel surface material: physically based, with per-vertex roughness and
 * metalness, baked AO in the vertex colour, a subtle bevel line on every
 * voxel edge, and emissive heat on freshly blasted or cut surfaces that
 * cools from white-hot to dull red without remeshing.
 */
export function makeVoxelMaterial(timeUniform) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.8 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surf;\nvarying vec3 vSurf;\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;\nvObjPos = position;\nvObjNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vSurf;
        varying vec3 vObjPos;
        varying vec3 vObjNormal;
        float voxelEdge() {
          vec3 g = vObjPos / ${VOXEL.toFixed(4)};
          vec3 an = abs(vObjNormal);
          vec2 uv = an.x > 0.5 ? g.yz : (an.y > 0.5 ? g.xz : g.xy);
          vec2 f = abs(fract(uv) - 0.5);
          float e = max(f.x, f.y);
          float w = fwidth(e) * 1.5;
          // Fade the bevel out with distance so it never shimmers.
          float fade = 1.0 - smoothstep(0.08, 0.25, w);
          return smoothstep(0.5 - 0.035 - w, 0.5 - w * 0.5, e) * fade;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float edge = voxelEdge();
        diffuseColor.rgb *= 1.0 - 0.1 * edge;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(vSurf.x + edge * 0.1, 0.03, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float age = uTime - vSurf.z;
        if (age >= 0.0 && age < 7.0) {
          float k = pow(1.0 - age / 7.0, 2.2);
          vec3 hot = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.62, 0.25), smoothstep(0.55, 1.0, k));
          totalEmissiveRadiance += hot * k * 9.0 * (0.55 + 0.45 * edge);
        }`);
  };
  return mat;
}

export class Renderer {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // MSAA lives on the composer's render target instead
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 0.92;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFShadowMap;
    // Static sun + static world: re-render the shadow map only when something
    // that casts shadows has changed (see markShadowsDirty()).
    this.r.shadowMap.autoUpdate = false;
    this.shadowDirty = true;

    this.time = { value: 0 };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1500);
    this.scene.add(this.camera);
    // Viewmodel (held tool) lives in its own scene so it never clips walls.
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.vmScene.add(this.vmCamera);

    this.voxelMaterial = makeVoxelMaterial(this.time);
    this.glassMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, opacity: 0.42, roughness: 0.04, metalness: 0,
      envMapIntensity: 1.4, depthWrite: false,
    });

    this.setupSky();
    this.setupLights();
    // Viewmodel lighting: same sky IBL plus a key light matching the sun.
    this.vmScene.environment = this.scene.environment;
    this.vmScene.environmentIntensity = 0.8;
    const key = new THREE.DirectionalLight(0xffe2b8, 2.2);
    key.position.set(1, 2, 1);
    this.vmScene.add(key, new THREE.HemisphereLight(0xbfd4ff, 0x4a3c2c, 0.8));
    this.applyQuality(quality);
    this.dynScale = 1;
    this.adaptive = true;
    this.frameMs = 16.7;
    this.lastResize = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setupSky() {
    const sky = new Sky();
    sky.scale.setScalar(1200);
    const u = sky.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.86;
    u.cloudCoverage.value = 0.35;
    u.cloudDensity.value = 0.5;
    // Late afternoon: low, warm sun for long shadows across the street.
    const elev = THREE.MathUtils.degToRad(22), azim = THREE.MathUtils.degToRad(215);
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, azim);
    u.sunPosition.value.copy(this.sunDir);
    this.sky = sky;
    this.scene.add(sky);

    // Image-based lighting from the same sky (clouds hidden so the IBL is smooth).
    const pm = new THREE.PMREMGenerator(this.r);
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(1000);
    envSky.material.uniforms.turbidity.value = u.turbidity.value;
    envSky.material.uniforms.rayleigh.value = u.rayleigh.value;
    envSky.material.uniforms.mieCoefficient.value = u.mieCoefficient.value;
    envSky.material.uniforms.mieDirectionalG.value = u.mieDirectionalG.value;
    envSky.material.uniforms.sunPosition.value.copy(this.sunDir);
    envSky.material.uniforms.cloudCoverage.value = 0;
    envSky.material.uniforms.showSunDisc.value = 0;
    envScene.add(envSky);
    // A dark ground hemisphere so reflections underneath are not sky-blue.
    const ground = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x3a3a34, side: THREE.BackSide }));
    envScene.add(ground);
    this.scene.environment = pm.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.4;
    pm.dispose();

    this.scene.fog = new THREE.FogExp2(0xaebdcc, FOG_DENSITY);
    installAtmosphere(this.sunDir, new THREE.Color(0xffd29a).multiplyScalar(1.6));
    this.buildSurroundings();
  }

  // Ground that continues past the playable area and a ring of distant
  // hills, so the town sits in a landscape instead of floating in haze.
  buildSurroundings() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x55803a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(32, 1.0, 32);
    ground.receiveShadow = true;
    this.scene.add(ground);
    const seg = 160, rings = 6;
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    for (let r = 0; r <= rings; r++) {
      const rad = 150 + r * 45;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const n = Math.sin(a * 3 + r) * 0.5 + Math.sin(a * 7.3 + r * 2.1) * 0.3 + Math.sin(a * 17.1 + r * 0.7) * 0.2;
        const h = r === 0 ? 0 : Math.max(0, (8 + r * 7) * (0.55 + 0.45 * n));
        pos.push(32 + Math.cos(a) * rad, 1 + h, 32 + Math.sin(a) * rad);
        c.setHSL(0.27 + n * 0.03, 0.32, 0.22 + h * 0.003);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let r = 0; r < rings; r++)
      for (let i = 0; i < seg; i++) {
        const a = r * (seg + 1) + i, b = a + seg + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));
  }

  setupLights() {
    const sun = new THREE.DirectionalLight(0xffdcb0, 2.5);
    sun.castShadow = true;
    const c = sun.shadow.camera;
    c.left = -46; c.right = 46; c.top = 46; c.bottom = -46; c.near = 1; c.far = 220;
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 2.2;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    // Bounce fill: warm from the ground, cool from the sky.
    this.scene.add(new THREE.HemisphereLight(0xa9c6e8, 0x5a4a38, 0.3));
    // Fixed pool of point lights (explosions, fire, muzzle flashes). Constant
    // count means no shader recompiles mid-game; unused lights sit at 0.
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 22, 2);
      l.userData = { life: 0, max: 1, base: 0, flicker: 0, owner: null };
      this.scene.add(l);
      this.lights.push(l);
    }
  }

  // Centre the sun's shadow frustum on the playable area.
  centreShadow(cx, cz) {
    const d = this.sunDir;
    this.sun.position.set(cx + d.x * 110, d.y * 110, cz + d.z * 110);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.target.updateMatrixWorld();
    this.markShadowsDirty();
  }

  markShadowsDirty() {
    this.shadowDirty = true;
  }

  applyQuality(name) {
    const q = QUALITY[name] || QUALITY.high;
    this.quality = name in QUALITY ? name : 'high';
    this.q = q;
    if (this.sun.shadow.mapSize.x !== q.shadow) {
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.buildComposer();
    this.markShadowsDirty();
  }

  buildComposer() {
    this.composer?.dispose?.();
    const q = this.q;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(this.r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = null;
    if (q.gtao) {
      this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtao.blendIntensity = 0.8;
      this.composer.addPass(this.gtao);
    }
    const vm = new RenderPass(this.vmScene, this.vmCamera);
    vm.clear = false;
    vm.clearDepth = true;
    this.composer.addPass(vm);
    this.bloom = null;
    if (q.bloom) {
      // Threshold well above sunlit surfaces (~1-2 in HDR) so only fire, hot
      // metal, sparks and flashes bloom; a low threshold washes the scene out.
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 3.2);
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.resize(true);
  }

  resize(force = false) {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * (this.q?.scale ?? 1) * (this.dynScale ?? 1);
    if (!force && this.size && this.size[0] === w && this.size[1] === h && Math.abs(this.size[2] - pr) < 1e-3) return;
    this.size = [w, h, pr];
    this.r.setPixelRatio(pr);
    this.r.setSize(w, h, false);
    this.composer?.setPixelRatio(pr);
    this.composer?.setSize(w, h);
    this.camera.aspect = this.vmCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.updateProjectionMatrix();
  }

  /**
   * Dynamic resolution: keep frame time near the display's budget by
   * scaling render resolution in coarse steps (each step reallocates
   * render targets, so it is rate-limited).
   */
  adapt(dtMs, now) {
    this.frameMs += (dtMs - this.frameMs) * 0.05;
    if (!this.adaptive) return;
    if (now - this.lastResize < 1500) return;
    let s = this.dynScale;
    if (this.frameMs > 19) s -= 0.1;
    else if (this.frameMs < 13 && s < 1) s += 0.05;
    s = Math.min(1, Math.max(0.5, Math.round(s * 20) / 20));
    if (s !== this.dynScale) {
      this.dynScale = s;
      this.lastResize = now;
      this.resize(true);
    }
  }

  // Borrow a light from the pool for a flash or a fire.
  flash(pos, color, intensity, seconds, flicker = 0) {
    let best = this.lights[0];
    for (const l of this.lights.slice(0, this.q.lights)) {
      if (l.userData.life <= 0) { best = l; break; }
      if (l.userData.life < best.userData.life) best = l;
    }
    best.position.set(pos[0], pos[1], pos[2]);
    best.color.set(color);
    Object.assign(best.userData, { life: seconds, max: seconds, base: intensity, flicker });
    best.intensity = intensity;
    return best;
  }

  updateLights(dt) {
    for (const l of this.lights) {
      const u = l.userData;
      if (u.life <= 0) {
        l.intensity = 0;
        continue;
      }
      u.life -= dt;
      const k = Math.max(0, u.life / u.max);
      const f = u.flicker ? 1 - u.flicker + u.flicker * Math.random() : 1;
      l.intensity = u.base * (u.flicker ? f : k * k);
      if (u.life <= 0) l.intensity = 0;
    }
  }

  render(dt, effects = {}) {
    this.time.value += dt;
    this.sky.material.uniforms.time.value = this.time.value;
    const g = this.grade.uniforms;
    g.uTime.value = this.time.value % 100;
    g.uAberration.value = effects.aberration ?? 0;
    g.uDamage.value = effects.damage ?? 0;
    g.uFlash.value = effects.flash ?? 0;
    this.updateLights(dt);
    if (this.shadowDirty) {
      this.r.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.composer.render(dt);
  }
}
