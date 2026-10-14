// Renderer, cathedral set, board, lighting, camera rig and board picking.
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import {
  boardTexture, flagstoneTexture, roseWindowTexture, lancetTexture, runeRingTexture,
  softDotTexture, flameTexture, shaftTexture,
} from './textures.js';

export const BORDER = 0.4;
const DAIS_Y = -1.2; // nave floor height; board top is y = 0
const NAVE_HALF = 9; // arcade line
const NAVE_LEN = 48;
const BAY = 6;

export function squareToXZ(sq) {
  const f = sq.charCodeAt(0) - 97;
  const r = sq.charCodeAt(1) - 49;
  return new THREE.Vector3(f - 3.5, 0, 3.5 - r);
}

export function xzToSquare(x, z) {
  const f = Math.floor(x + 4);
  const r = Math.floor(4 - z);
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return String.fromCharCode(97 + f) + (r + 1);
}

// Floor height for debris: board top inside the board, the dais step outside it.
export function floorAt(x, z) {
  const h = 4 + BORDER;
  if (Math.abs(x) <= h && Math.abs(z) <= h) return 0;
  if (Math.abs(x) <= 6.2 && Math.abs(z) <= 6.2) return -0.6;
  return DAIS_Y;
}

// Points of a pointed (two-centred) arch from the left springer over the apex to the right springer.
// rise is radius / span; 0.5 gives a round arch, 1.0 an equilateral Gothic arch.
function archPoints(cx, springY, halfW, rise = 0.62, n = 16) {
  const r = halfW * 2 * rise;
  const cL = cx - halfW + r; // centre of the left-hand arc
  const cR = cx + halfW - r; // centre of the right-hand arc
  const aTop = Math.acos((cx - cL) / r);
  const bTop = Math.acos((cx - cR) / r);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (aTop - Math.PI) * (i / n);
    pts.push(new THREE.Vector2(cL + Math.cos(a) * r, springY + Math.sin(a) * r));
  }
  for (let i = 1; i <= n; i++) {
    const a = bTop * (1 - i / n);
    pts.push(new THREE.Vector2(cR + Math.cos(a) * r, springY + Math.sin(a) * r));
  }
  return pts;
}

// Closed outline of an arched opening: straight jambs from `bottom` up to the springers, then the arch.
function archOutline(cx, bottom, springY, halfW, rise) {
  return [new THREE.Vector2(cx - halfW, bottom), ...archPoints(cx, springY, halfW, rise), new THREE.Vector2(cx + halfW, bottom)];
}

function archHole(cx, bottom, springY, halfW, rise) {
  return new THREE.Path(archOutline(cx, bottom, springY, halfW, rise));
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const lowPower = matchMedia('(max-width: 840px)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true; // used by dissolve and abyss finishers

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080c);
    this.scene.fog = new THREE.FogExp2(0x0a0b11, 0.022);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.updaters = [];
    this.windows = []; // stained glass that finishers can throw pieces through
    this.#environment();
    this.#lights();
    this.#cathedral();
    this.#board();
    this.#markers();
    this.#measureWindows();
    this.rig = new OrbitRig(this.camera, canvas);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    // Keep the whole board in view on tall, narrow screens.
    this.camera.fov = w / h < 0.8 ? 60 : 46;
    this.camera.updateProjectionMatrix();
  }

  // A tiny emissive "room" baked into an environment map gives the glossy pieces something to reflect.
  #environment() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x05060a);
    const panel = (color, intensity, w, h, pos, look) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(...look);
      env.add(m);
    };
    panel(0x3a5bd0, 3, 6, 6, [0, 6, -12], [0, 0, 0]); // rose window
    panel(0x8b2030, 2, 4, 4, [0, 6, 12], [0, 0, 0]);
    panel(0xffb46a, 6, 1, 1, [6, 1, 6], [0, 0, 0]); // candles
    panel(0xffb46a, 6, 1, 1, [-6, 1, -6], [0, 0, 0]);
    panel(0xffb46a, 6, 1, 1, [-6, 1, 6], [0, 0, 0]);
    panel(0x99aacc, 1.2, 20, 3, [0, 14, 0], [0, 0, 0]); // clerestory glow
    panel(0x1e2440, 1, 3, 10, [10, 4, 0], [0, 0, 0]);
    panel(0x1e2440, 1, 3, 10, [-10, 4, 0], [0, 0, 0]);
    const rt = pm.fromScene(env, 0.02);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.75;
    pm.dispose();
  }

  #lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x9096a8, 0x1a1410, 0.6));

    // Cool shaft of light from the clerestory: the only shadow caster.
    const key = new THREE.SpotLight(0xdfe6ff, 900, 0, 0.42, 0.65, 2);
    key.position.set(5, 17, 6);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.camera.near = 8;
    key.shadow.camera.far = 40;
    s.add(key, key.target);

    // Coloured rim lights from the two rose windows.
    const roseN = new THREE.DirectionalLight(0x6d85ff, 0.6);
    roseN.position.set(0, 10, -20);
    const roseS = new THREE.DirectionalLight(0xc04050, 0.5);
    roseS.position.set(0, 10, 20);
    s.add(roseN, roseS);
  }

  #stone() {
    if (!this._stone) {
      this._stone = new THREE.MeshStandardMaterial({ color: 0x4a4b55, roughness: 0.92, metalness: 0 });
      this._stoneDark = new THREE.MeshStandardMaterial({ color: 0x2c2d35, roughness: 0.95 });
    }
    return this._stone;
  }

  #cathedral() {
    const s = this.scene;
    const stone = this.#stone();
    const group = new THREE.Group();
    s.add(group);

    // Floor
    const floorTex = flagstoneTexture();
    floorTex.repeat.set(6, 12);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, NAVE_LEN + 4),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = DAIS_Y;
    floor.receiveShadow = true;
    group.add(floor);

    // Two-step dais under the board
    // Steps top out at -0.9 and -0.6; the board slab and its plinth sit on the upper one.
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 14), this._stoneDark);
    step1.position.y = DAIS_Y + 0.15;
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.3, 12.4), stone);
    step2.position.y = -0.75;
    for (const m of [step1, step2]) {
      m.receiveShadow = true;
      group.add(m);
    }

    // Arcade walls: one extruded slab per side with a pointed arch and a clerestory lancet per bay.
    const bays = Math.round(NAVE_LEN / BAY);
    const wallTop = 27;
    const spring = 10.5;
    const archHalf = BAY / 2 - 0.75;
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape();
      const z0 = -NAVE_LEN / 2, z1 = NAVE_LEN / 2;
      shape.moveTo(z0, DAIS_Y - 0.5);
      shape.lineTo(z1, DAIS_Y - 0.5);
      shape.lineTo(z1, wallTop);
      shape.lineTo(z0, wallTop);
      for (let i = 0; i < bays; i++) {
        const cz = z0 + BAY * (i + 0.5);
        shape.holes.push(archHole(cz, DAIS_Y, spring, archHalf, 0.62));
        shape.holes.push(archHole(cz, 18, 22.5, 0.9, 0.7));
      }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: false, curveSegments: 4 });
      const wall = new THREE.Mesh(geo, stone);
      wall.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
      wall.position.x = side * (NAVE_HALF + 1); // the extrusion runs inward, so the wall spans |x| 9..10
      wall.receiveShadow = true;
      group.add(wall);

      // Clustered piers at each bay line
      for (let i = 0; i <= bays; i++) {
        const z = z0 + BAY * i;
        group.add(this.#pier(side * (NAVE_HALF - 0.2), z, spring + 0.2));
      }
      // Aisle outer wall with tall glowing lancets
      const outer = new THREE.Mesh(new THREE.BoxGeometry(0.8, 20, NAVE_LEN), this._stoneDark);
      outer.position.set(side * (NAVE_HALF + 7), DAIS_Y + 10, 0);
      group.add(outer);
      for (let i = 0; i < bays; i++) {
        const cz = z0 + BAY * (i + 0.5);
        group.add(this.#window(lancetTexture(256, 1024, i + (side > 0 ? 20 : 0)), 1.6, 7.5, side * (NAVE_HALF + 6.55), 1.2, cz, side, 1.6));
        group.add(this.#window(lancetTexture(128, 512, i * 3 + 5), 2.0, 6.4, side * (NAVE_HALF + 1.05), 17.9, cz, side, 2.2));
      }
    }

    // Nave vault: a pointed barrel plus transverse ribs at each bay.
    const vaultBand = (thick) => {
      const outer = archPoints(0, wallTop, NAVE_HALF, 0.62, 24);
      const inner = archPoints(0, wallTop, NAVE_HALF - thick, 0.62, 24).reverse();
      return new THREE.Shape([...outer, ...inner]);
    };
    const vault = new THREE.Mesh(
      new THREE.ExtrudeGeometry(vaultBand(0.5), { depth: NAVE_LEN, bevelEnabled: false, curveSegments: 4 }),
      this._stoneDark,
    );
    vault.position.z = -NAVE_LEN / 2;
    group.add(vault);
    const ribGeo = new THREE.ExtrudeGeometry(vaultBand(1.1), { depth: 0.5, bevelEnabled: false });
    for (let i = 0; i <= bays; i++) {
      const rib = new THREE.Mesh(ribGeo, stone);
      rib.position.z = -NAVE_LEN / 2 + BAY * i - 0.25;
      group.add(rib);
    }

    // End walls. Behind Obsidian: a chancel with three tall lancets under a rose window, low enough to
    // glow above the back rank from the playing view. Behind Marble: the west portal under a second rose.
    for (const end of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(-NAVE_HALF - 1, DAIS_Y - 0.5);
      sh.lineTo(NAVE_HALF + 1, DAIS_Y - 0.5);
      for (const p of archPoints(0, wallTop, NAVE_HALF + 1, 0.62, 24).reverse()) sh.lineTo(p.x, p.y);
      const roseY = end < 0 ? 19.6 : 19;
      const roseR = end < 0 ? 5 : 6.2;
      const rose = new THREE.Path();
      rose.absarc(0, roseY, roseR, 0, Math.PI * 2, true);
      sh.holes.push(rose);
      const zFace = end * (NAVE_LEN / 2);
      const lancets = end < 0 ? [[-4.1, 1.2, 9], [0, 1.45, 11], [4.1, 1.2, 9]] : [];
      const bottom = DAIS_Y + 1.6;
      for (const [x, halfW, spring] of lancets) sh.holes.push(archHole(x, bottom, spring, halfW, 0.72));
      if (end > 0) sh.holes.push(archHole(0, DAIS_Y, 5, 2.6, 0.62));
      const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false, curveSegments: 48 }), stone);
      wall.position.z = zFace - (end > 0 ? 0 : 1.2);
      group.add(wall);
      const win = new THREE.Mesh(
        new THREE.CircleGeometry(roseR + 0.05, 64),
        new THREE.MeshBasicMaterial({ map: roseWindowTexture(1024, end > 0 ? 1 : 0), color: new THREE.Color(1, 1, 1).multiplyScalar(2.4), fog: false }),
      );
      win.position.set(0, roseY, end * (NAVE_LEN / 2 + 0.7));
      win.rotation.y = end < 0 ? 0 : Math.PI;
      group.add(win);
      this.windows.push({ mesh: win, normal: new THREE.Vector3(0, 0, -end) });
      lancets.forEach(([x, halfW, spring], i) => {
        const w = halfW * 2 + 0.3;
        const h = spring - bottom + w * 0.9 + 0.3;
        group.add(this.#window(lancetTexture(256, 1024, 40 + i), w, h, x, bottom - 0.1, zFace - 0.6, 0, 1.7));
      });
      if (end > 0) {
        const door = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 9), new THREE.MeshBasicMaterial({ color: 0x020203 }));
        door.position.set(0, DAIS_Y + 4.5, zFace + 1);
        door.rotation.y = Math.PI;
        group.add(door);
      }
    }

    this.#shafts();
    this.#candles();
    this.#dust();
  }

  #measureWindows() {
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    for (const w of this.windows) {
      box.setFromObject(w.mesh);
      w.center = box.getCenter(new THREE.Vector3());
      box.getSize(size);
      w.width = Math.max(size.x, size.z);
      w.height = size.y;
      w.broken = false;
    }
  }

  #pier(x, z, h) {
    const g = new THREE.Group();
    const stone = this._stone;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, h, 20), stone);
    core.position.y = DAIS_Y + h / 2;
    g.add(core);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, h + 16, 10), stone);
      shaft.position.set(Math.cos(a) * 0.62, DAIS_Y + (h + 16) / 2, Math.sin(a) * 0.62);
      g.add(shaft);
    }
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.8, 8), this._stoneDark);
    plinth.position.y = DAIS_Y + 0.4;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.7, 0.6, 8), stone);
    cap.position.y = DAIS_Y + h;
    g.add(plinth, cap);
    g.position.set(x, 0, z);
    g.traverse((m) => {
      if (m.isMesh) m.receiveShadow = true;
    });
    return g;
  }

  #window(tex, w, h, x, y, z, side, intensity) {
    const sh = new THREE.Shape(archOutline(0, 0, h - w * 0.9, w / 2, 0.72));
    const geo = new THREE.ShapeGeometry(sh, 8);
    // Map UVs to the bounding box so the texture fills the lancet.
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / (h + 0.2));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, color: new THREE.Color(1, 1, 1).multiplyScalar(intensity), side: THREE.DoubleSide, fog: false,
    }));
    m.position.set(x, y, z);
    m.rotation.y = side > 0 ? -Math.PI / 2 : side < 0 ? Math.PI / 2 : 0;
    this.windows.push({ mesh: m, normal: new THREE.Vector3(side > 0 ? -1 : side < 0 ? 1 : 0, 0, side ? 0 : 1) });
    return m;
  }

  #shafts() {
    const tex = shaftTexture();
    const mk = (color, from, to, width, opacity) => {
      const len = from.distanceTo(to);
      const geo = new THREE.CylinderGeometry(width * 0.55, width, len, 24, 1, true);
      geo.translate(0, -len / 2, 0);
      const mat = new THREE.MeshBasicMaterial({
        color, map: tex, transparent: true, opacity, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(from);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
      this.scene.add(m);
      return m;
    };
    this.shafts = [
      mk(0x9fb4ff, new THREE.Vector3(5, 18, 6), new THREE.Vector3(0, -0.5, 0), 4.2, 0.07),
      mk(0x4f6dff, new THREE.Vector3(0, 19.6, -23.5), new THREE.Vector3(0, -1, -5), 4.6, 0.06),
      mk(0x5d78ff, new THREE.Vector3(0, 6, -23.5), new THREE.Vector3(0, -1.2, -9), 3.2, 0.05),
      mk(0xb03848, new THREE.Vector3(0, 19, 23.5), new THREE.Vector3(0, -1, 7), 5, 0.04),
      mk(0x7e93ff, new THREE.Vector3(-14, 9, -3), new THREE.Vector3(-5, -1.2, -1), 2.4, 0.05),
      mk(0xd7a24b, new THREE.Vector3(14, 9, 3), new THREE.Vector3(5, -1.2, 2), 2.4, 0.04),
    ];
    this.updaters.push((t) => {
      this.shafts.forEach((m, i) => {
        m.material.opacity = m.userData.base ??= m.material.opacity;
        m.material.opacity = m.userData.base * (0.85 + 0.15 * Math.sin(t * 0.4 + i * 1.7));
      });
    });
  }

  #candles() {
    const flameTex = flameTexture();
    const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.9, roughness: 0.35 });
    const wax = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.7, emissive: 0x3a2a10, emissiveIntensity: 0.4 });
    this.flames = [];
    this.candleLights = [];
    const spots = [[5.6, 5.6], [-5.6, 5.6], [5.6, -5.6], [-5.6, -5.6]];
    for (const [x, z] of spots) {
      const g = new THREE.Group();
      g.position.set(x, -0.6, z);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 2.2, 10), brass);
      stem.position.y = 1.1;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.12, 16), brass);
      const arm = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 32, Math.PI), brass);
      arm.position.y = 2.15;
      arm.rotation.z = Math.PI;
      arm.rotation.y = Math.atan2(x, z) + Math.PI / 2;
      g.add(stem, foot, arm);
      const offsets = [[0, 0], [Math.cos(arm.rotation.y) * 0.42, -Math.sin(arm.rotation.y) * 0.42], [-Math.cos(arm.rotation.y) * 0.42, Math.sin(arm.rotation.y) * 0.42]];
      offsets.forEach(([ox, oz], i) => {
        const h = i === 0 ? 0.5 : 0.36;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, h, 10), wax);
        const baseY = i === 0 ? 2.25 : 2.17;
        c.position.set(ox, baseY + h / 2, oz);
        const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        f.scale.set(0.12, 0.26, 1);
        f.position.set(ox, baseY + h + 0.12, oz);
        f.userData.phase = Math.random() * 10;
        this.flames.push(f);
        g.add(c, f);
      });
      const light = new THREE.PointLight(0xffa860, 14, 14, 2);
      light.position.set(0, 2.9, 0);
      light.userData.phase = Math.random() * 10;
      g.add(light);
      this.candleLights.push(light);
      g.traverse((m) => {
        if (m.isMesh) m.castShadow = false;
      });
      this.scene.add(g);
    }
    this.updaters.push((t) => {
      for (const f of this.flames) {
        const p = f.userData.phase;
        const k = 1 + 0.12 * Math.sin(t * 13 + p) + 0.08 * Math.sin(t * 23 + p * 2);
        f.scale.set(0.12 * (2 - k), 0.26 * k, 1);
      }
      for (const l of this.candleLights) {
        const p = l.userData.phase;
        l.intensity = 14 * (0.88 + 0.08 * Math.sin(t * 11 + p) + 0.05 * Math.sin(t * 27 + p));
      }
    });
  }

  #dust() {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 18;
      pos[i * 3 + 1] = Math.random() * 16 - 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.05, map: softDotTexture(), color: 0xcfd6ff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(pts);
    this.updaters.push((t, dt) => {
      const a = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        a[i * 3 + 1] += dt * (0.05 + 0.04 * Math.sin(i));
        a[i * 3] += dt * 0.03 * Math.sin(t * 0.2 + i);
        if (a[i * 3 + 1] > 15) a[i * 3 + 1] = -1;
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  #board() {
    const size = 8 + BORDER * 2;
    const top = new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.38, metalness: 0.0 });
    const side = new THREE.MeshStandardMaterial({ color: 0x1a1b22, roughness: 0.6 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(size, 0.3, size), [side, side, top, side, side, side]);
    slab.position.y = -0.15;
    slab.receiveShadow = true;
    slab.castShadow = true;
    this.scene.add(slab);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(size - 0.6, 0.3, size - 0.6), side);
    plinth.position.y = -0.45;
    this.scene.add(plinth);
    this.boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  // Square highlights, legal-move dots, capture rings, the rune circle and the check glow.
  #markers() {
    const g = new THREE.Group();
    g.position.y = 0.004;
    this.scene.add(g);
    this.markerGroup = g;
    const sqGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.squareTint = {};
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = String.fromCharCode(97 + f) + (r + 1);
        const m = new THREE.Mesh(sqGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
        m.position.copy(squareToXZ(sq));
        m.visible = false;
        g.add(m);
        this.squareTint[sq] = m;
      }
    }
    const dotGeo = new THREE.CircleGeometry(0.15, 32).rotateX(-Math.PI / 2);
    const haloGeo = new THREE.RingGeometry(0.15, 0.19, 40).rotateX(-Math.PI / 2);
    const ringGeo = new THREE.RingGeometry(0.38, 0.47, 48).rotateX(-Math.PI / 2);
    this.dotMat = new THREE.MeshBasicMaterial({ color: 0x3d5ad8, transparent: true, opacity: 0.9, depthWrite: false });
    this.haloMat = new THREE.MeshBasicMaterial({ color: 0xdfe5ff, transparent: true, opacity: 0.9, depthWrite: false });
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xe0453a, transparent: true, opacity: 0.95, depthWrite: false });
    this.dots = [];
    for (let i = 0; i < 28; i++) {
      const d = new THREE.Mesh(dotGeo, this.dotMat);
      d.add(new THREE.Mesh(haloGeo, this.haloMat));
      const ring = new THREE.Mesh(ringGeo, this.ringMat);
      d.visible = ring.visible = false;
      g.add(d, ring);
      this.dots.push({ d, ring });
    }
    this.rune = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.15).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: runeRingTexture(), color: 0x9fb2ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.rune.position.y = 0.006;
    this.rune.visible = false;
    this.scene.add(this.rune);
    this.updaters.push((t) => {
      if (this.rune.visible) {
        this.rune.rotation.y = t * 0.6;
        this.rune.material.opacity = 0.75 + 0.25 * Math.sin(t * 3);
      }
      if (this.checkSquare) {
        const m = this.squareTint[this.checkSquare];
        m.material.opacity = 0.35 + 0.2 * Math.sin(t * 5);
      }
      for (const { d } of this.dots) if (d.visible) d.scale.setScalar(1 + 0.08 * Math.sin(t * 4));
    });
  }

  setHighlights({ lastMove = null, check = null, hover = null, selected = null } = {}) {
    for (const m of Object.values(this.squareTint)) m.visible = false;
    const tint = (sq, color, opacity) => {
      if (!sq) return;
      const m = this.squareTint[sq];
      m.visible = true;
      m.material.color.set(color);
      m.material.opacity = opacity;
    };
    if (lastMove) {
      tint(lastMove.from, 0xd9a94e, 0.35);
      tint(lastMove.to, 0xd9a94e, 0.45);
    }
    if (hover && hover !== selected) tint(hover, 0xffffff, 0.12);
    if (selected) tint(selected, 0x5c78f0, 0.5);
    this.checkSquare = check;
    if (check) tint(check, 0xff4a3d, 0.4);
  }

  showTargets(targets) {
    this.dots.forEach(({ d, ring }, i) => {
      const t = targets[i];
      d.visible = ring.visible = false;
      if (!t) return;
      const p = squareToXZ(t.square);
      if (t.capture) {
        ring.position.copy(p);
        ring.visible = true;
      } else {
        d.position.copy(p);
        d.visible = true;
      }
    });
  }

  showRune(square) {
    this.rune.visible = !!square;
    if (square) this.rune.position.set(...squareToXZ(square).toArray().map((v, i) => (i === 1 ? 0.006 : v)));
  }

  pickSquare(clientX, clientY, pieceMeshes) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    if (pieceMeshes?.length) {
      const hit = ray.intersectObjects(pieceMeshes, false)[0];
      if (hit) {
        let o = hit.object;
        while (o && !o.userData.square) o = o.parent;
        if (o) return o.userData.square;
      }
    }
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(this.boardPlane, p)) return null;
    return xzToSquare(p.x, p.z);
  }

  render(t, dt) {
    for (const u of this.updaters) u(t, dt);
    this.rig.update(dt);
    this.composer.render();
  }
}

// Minimal orbit camera: drag to orbit, wheel or pinch to zoom, damped.
class OrbitRig {
  constructor(camera, el) {
    this.camera = camera;
    this.el = el;
    this.target = new THREE.Vector3(0, 0.9, -0.8);
    this.azimuth = 0;
    this.polar = 1.05;
    this.radius = 15;
    this.goal = { azimuth: 0, polar: 1.05, radius: 15 };
    this.home = this.target.clone();
    this.cine = null; // temporary camera move requested by a finisher
    this.pointers = new Map();
    this.dragDistance = 0;
    this.shake = 0;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragDistance = 0;
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.pointers.size === 1) {
        this.dragDistance += Math.abs(dx) + Math.abs(dy);
        if (this.dragDistance > 6) {
          this.cine = null;
          this.goal.azimuth -= dx * 0.006;
          this.goal.polar = THREE.MathUtils.clamp(this.goal.polar - dy * 0.005, 0.25, 1.32);
        }
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX;
        p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * (before / Math.max(after, 1)), 8, 26);
        this.dragDistance += 10;
        return;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    });
    const up = (e) => this.pointers.delete(e.pointerId);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * (1 + Math.sign(e.deltaY) * 0.08), 8, 26);
    }, { passive: false });
  }

  get wasDrag() {
    return this.dragDistance > 6;
  }

  faceSide(color) {
    // Snap to the nearest equivalent angle so the camera turns the short way.
    const want = color === 'b' ? Math.PI : 0;
    const k = Math.round((this.goal.azimuth - want) / (Math.PI * 2));
    this.goal.azimuth = want + k * Math.PI * 2;
  }

  rotateHalf() {
    this.goal.azimuth += Math.PI;
  }

  // Swing the camera to frame a moment, then drift back to where the player had it.
  cinematic({ target, radius = this.goal.radius, polar = this.goal.polar, azimuth = null, hold = 2 }) {
    let az = azimuth ?? this.goal.azimuth;
    // Turn the short way round.
    az += Math.round((this.azimuth - az) / (Math.PI * 2)) * Math.PI * 2;
    this.cine = { target: target.clone(), radius, polar, azimuth: az, hold };
  }

  update(dt) {
    const c = this.cine;
    if (c) {
      c.hold -= dt;
      if (c.hold <= 0) this.cine = null;
    }
    const k = 1 - Math.exp(-dt * (c ? 4 : 6));
    this.target.lerp(c ? c.target : this.home, k);
    this.azimuth += ((c ? c.azimuth : this.goal.azimuth) - this.azimuth) * k;
    this.polar += ((c ? c.polar : this.goal.polar) - this.polar) * k;
    this.radius += ((c ? c.radius : this.goal.radius) - this.radius) * k;
    const s = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.radius * s * Math.sin(this.azimuth),
      this.target.y + this.radius * Math.cos(this.polar),
      this.target.z + this.radius * s * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const a = this.shake * this.shake * 0.08;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
  }
}
