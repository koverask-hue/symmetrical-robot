// The 3D scene: a dark pool hall, the table (built from the same geometry the physics uses), balls,
// the cue, the aiming guide and the camera rig.
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { R, HX, HZ, TABLE, POCKETS, SEGMENTS, HEAD_STRING_X } from './physics.js';
import { ballTexture, clothTexture, woodTexture, softDot } from './textures.js';

const FLOOR_Y = -0.76;
const CUSHION_H = 0.04;
const RAIL_TOP = 0.046;
const RAIL_IN = 0.05; // cushion depth behind the nose line
const RAIL_W = 0.14; // wooden rail width

export class PoolScene {
  constructor(canvas) {
    this.canvas = canvas;
    const narrow = matchMedia('(max-width: 840px)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, narrow ? 1.5 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07080a);
    this.scene.fog = new THREE.Fog(0x07080a, 4, 11);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 40);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.45, 0.96);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.#environment();
    this.#room();
    this.#lights();
    this.#table();
    this.#balls();
    this.#cue();
    this.#guide();
    this.rig = new CameraRig(this.camera);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 62 : 45;
    this.camera.updateProjectionMatrix();
    this.rig.aspect = w / h;
  }

  #environment() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x030304);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1d6).multiplyScalar(2.2), side: THREE.DoubleSide }));
    lamp.position.set(0, 1.1, 0);
    lamp.rotation.x = Math.PI / 2;
    env.add(lamp);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d7f).multiplyScalar(2), side: THREE.DoubleSide }));
    sign.position.set(0, 1.0, -4);
    env.add(sign);
    this.scene.environment = pm.fromScene(env, 0.02).texture;
    this.scene.environmentIntensity = 0.45;
    pm.dispose();
  }

  #room() {
    const floorTex = woodTexture({ base: [58, 36, 24], dark: [28, 16, 10], planks: 8, w: 1024, h: 1024 });
    floorTex.repeat.set(5, 5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.95 });
    for (const [x, z, ry] of [[0, -5, 0], [0, 5, Math.PI], [-6, 0, Math.PI / 2], [6, 0, -Math.PI / 2]]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), wallMat);
      wall.position.set(x, FLOOR_Y + 2, z);
      wall.rotation.y = ry;
      this.scene.add(wall);
    }
    // A neon 8 on the far wall.
    const neon = new THREE.Group();
    const neonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d7f).multiplyScalar(3) });
    for (const [y, r] of [[0.19, 0.14], [-0.17, 0.18]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 48), neonMat);
      ring.position.y = y;
      neon.add(ring);
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xff3d7f, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(1.6, 1.8, 1);
    neon.add(halo);
    neon.position.set(0, 1.0, -4.95);
    this.scene.add(neon);
    const neonLight = new THREE.PointLight(0xff3d7f, 3, 5, 2);
    neonLight.position.set(0, 1.0, -4.6);
    this.scene.add(neonLight);
  }

  #lights() {
    this.scene.add(new THREE.HemisphereLight(0x8a90a0, 0x201510, 0.25));
    // A long billiard lamp: three shades over the table.
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1d4a3a, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1d6).multiplyScalar(2) });
    const lamp = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.03, 0.04), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.8, roughness: 0.3 }));
    bar.position.y = 1.32;
    lamp.add(bar);
    for (const x of [-0.75, 0, 0.75]) {
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 0.16, 32, 1, true), shadeMat);
      shade.position.set(x, 1.22, 0);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32).rotateX(Math.PI / 2), glowMat);
      bulb.position.set(x, 1.15, 0);
      lamp.add(shade, bulb);
      const spot = new THREE.SpotLight(0xfff0d8, 2.6, 0, 0.95, 0.8, 2);
      spot.position.set(x, 1.12, 0);
      spot.target.position.set(x, 0, 0);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.camera.near = 0.6;
      spot.shadow.camera.far = 2.5;
      spot.shadow.bias = -0.0005;
      spot.shadow.normalBias = 0.01;
      spot.shadow.radius = 3;
      lamp.add(spot, spot.target);
    }
    this.scene.add(lamp);
    // Fixture meshes only (not the lights): hidden when the camera rises above the lamp.
    this.lampMeshes = lamp.children.filter((c) => c.isMesh);
  }

  #table() {
    const t = new THREE.Group();
    this.scene.add(t);
    const clothTex = clothTexture();
    clothTex.repeat.set(6, 3);
    const cloth = new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.95 });
    this.clothMat = cloth;

    // Bed with pocket holes cut out.
    const bedShape = new THREE.Shape();
    const ex = HX + RAIL_IN + 0.01, ez = HZ + RAIL_IN + 0.01;
    bedShape.moveTo(-ex, -ez);
    bedShape.lineTo(ex, -ez);
    bedShape.lineTo(ex, ez);
    bedShape.lineTo(-ex, ez);
    bedShape.lineTo(-ex, -ez);
    this.pocketHoles = POCKETS.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.004 }));
    for (const h of this.pocketHoles) {
      const hole = new THREE.Path();
      hole.absarc(h.x, -h.z, h.r, 0, Math.PI * 2, true);
      bedShape.holes.push(hole);
    }
    const bed = new THREE.Mesh(new THREE.ShapeGeometry(bedShape, 32).rotateX(-Math.PI / 2), cloth);
    bed.receiveShadow = true;
    t.add(bed);
    // Head string and spots, faint, as on a real cloth.
    const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false });
    const headLine = new THREE.Mesh(new THREE.PlaneGeometry(0.004, TABLE.W).rotateX(-Math.PI / 2), markMat);
    headLine.position.set(HEAD_STRING_X, 0.0008, 0);
    t.add(headLine);
    for (const x of [-HX / 2, HX / 2]) {
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.008, 16).rotateX(-Math.PI / 2), markMat);
      spot.position.set(x, 0.0009, 0);
      t.add(spot);
    }

    // Pocket cups.
    const cupMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.DoubleSide });
    const leather = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.6 });
    for (const h of this.pocketHoles) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r * 0.85, 0.14, 32, 1, true), cupMat);
      cup.position.set(h.x, -0.07, h.z);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(h.r * 0.85, 32).rotateX(-Math.PI / 2), cupMat);
      bottom.position.set(h.x, -0.14, h.z);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(h.r + 0.006, 0.011, 10, 40).rotateX(Math.PI / 2), leather);
      rim.position.set(h.x, 0.004, h.z);
      t.add(cup, bottom, rim);
    }

    // Cushions: each nose segment plus its two jaws, extruded upward.
    const nose = SEGMENTS.filter((s) => !s.jaw);
    const jaws = SEGMENTS.filter((s) => s.jaw);
    for (const s of nose) {
      const jawAt = (x, z) => jaws.find((j) => Math.abs(j.ax - x) < 1e-6 && Math.abs(j.az - z) < 1e-6);
      const ja = jawAt(s.ax, s.az), jb = jawAt(s.bx, s.bz);
      const k = RAIL_IN / 0.06;
      const pts = [
        [s.ax, s.az], [s.bx, s.bz],
        jb ? [s.bx + jb.dx * k, s.bz + jb.dz * k] : [s.bx, s.bz],
        ja ? [s.ax + ja.dx * k, s.az + ja.dz * k] : [s.ax, s.az],
      ];
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: CUSHION_H, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, cloth);
      m.castShadow = true;
      m.receiveShadow = true;
      t.add(m);
    }

    // Wooden rails, with gaps at the pockets, and pocket caps.
    const railTex = woodTexture({ base: [96, 48, 24], dark: [44, 20, 10] });
    const wood = new THREE.MeshStandardMaterial({ map: railTex, roughness: 0.35, metalness: 0.05 });
    const railH = RAIL_TOP + 0.08;
    const block = (x0, x1, z0, z1, y0 = RAIL_TOP - railH, y1 = RAIL_TOP) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), wood);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      t.add(m);
    };
    const inZ = HZ + RAIL_IN, outZ = inZ + RAIL_W;
    const inX = HX + RAIL_IN, outX = inX + RAIL_W;
    for (const sz of [-1, 1]) {
      const [a, b] = sz < 0 ? [-outZ, -inZ] : [inZ, outZ];
      block(-HX + 0.06, -0.08, a, b);
      block(0.08, HX - 0.06, a, b);
      // side pocket cap, behind the hole
      const capIn = HZ + 0.05 + 0.07;
      block(-0.08, 0.08, sz < 0 ? -outZ : capIn, sz < 0 ? -capIn : outZ);
    }
    for (const sx of [-1, 1]) {
      const [a, b] = sx < 0 ? [-outX, -inX] : [inX, outX];
      block(a, b, -HZ + 0.06, HZ - 0.06);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // corner caps hug the outside of the pocket
        const cx = sx * (HX + 0.03), cz = sz * (HZ + 0.03);
        const r0 = 0.08;
        block(Math.min(cx + sx * r0, sx * outX), Math.max(cx + sx * r0, sx * outX), Math.min(sz * (HZ - 0.06), sz * outZ), Math.max(sz * (HZ - 0.06), sz * outZ));
        block(Math.min(sx * (HX - 0.06), cx + sx * r0), Math.max(sx * (HX - 0.06), cx + sx * r0), Math.min(cz + sz * r0, sz * outZ), Math.max(cz + sz * r0, sz * outZ));
      }
    }
    // Diamonds
    const pearl = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.3, metalness: 0.2 });
    const diamond = new THREE.CircleGeometry(0.009, 4).rotateX(-Math.PI / 2);
    for (let k = 1; k < 8; k++) {
      if (k === 4) continue;
      for (const sz of [-1, 1]) {
        const d = new THREE.Mesh(diamond, pearl);
        d.position.set(-HX + (k * TABLE.L) / 8, RAIL_TOP + 0.0005, sz * (inZ + RAIL_W * 0.45));
        t.add(d);
      }
    }
    for (let k = 1; k < 4; k++) {
      for (const sx of [-1, 1]) {
        const d = new THREE.Mesh(diamond, pearl);
        d.position.set(sx * (inX + RAIL_W * 0.45), RAIL_TOP + 0.0005, -HZ + (k * TABLE.W) / 4);
        t.add(d);
      }
    }
    // Apron and legs
    const apronMat = new THREE.MeshStandardMaterial({ map: railTex, color: 0x6a5a50, roughness: 0.5 });
    const apron = new THREE.Mesh(new THREE.BoxGeometry(outX * 2 - 0.04, 0.2, outZ * 2 - 0.04), apronMat);
    apron.position.y = RAIL_TOP - railH - 0.1;
    apron.castShadow = true;
    t.add(apron);
    for (const sx of [-1, 0, 1]) {
      for (const sz of [-1, 1]) {
        if (sx === 0) continue;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, -FLOOR_Y - 0.3, 0.16), apronMat);
        leg.position.set(sx * (HX - 0.15), FLOOR_Y + (-FLOOR_Y - 0.3) / 2, sz * (HZ - 0.12));
        leg.castShadow = true;
        t.add(leg);
      }
    }
    // Kitchen shading for ball-in-hand placement.
    this.kitchen = new THREE.Mesh(
      new THREE.PlaneGeometry(HEAD_STRING_X + HX, TABLE.W).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.035, depthWrite: false }),
    );
    this.kitchen.position.set((HEAD_STRING_X - HX) / 2, 0.001, 0);
    this.kitchen.visible = false;
    t.add(this.kitchen);
    this.bedPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);
  }

  #balls() {
    this.ballMeshes = new Map();
    const geo = new THREE.SphereGeometry(R, 48, 32);
    for (let id = 0; id < 16; id++) {
      const mat = new THREE.MeshPhysicalMaterial({ map: ballTexture(id), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.ballId = id;
      // Random starting orientation so the rack doesn't look printed.
      m.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      this.scene.add(m);
      this.ballMeshes.set(id, m);
    }
    this.dropping = [];
  }

  // Sync meshes to physics; spin them by their angular velocity.
  syncBalls(balls, dt) {
    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3();
    for (const b of balls) {
      const m = this.ballMeshes.get(b.id);
      if (!b.on) {
        if (!this.dropping.some((d) => d.mesh === m) && m.visible && !m.userData.pocketed) m.visible = false;
        continue;
      }
      m.visible = true;
      m.userData.pocketed = false;
      m.position.set(b.x, R, b.z);
      const w = Math.hypot(b.wx, b.wy, b.wz);
      if (w > 1e-4 && dt > 0) {
        axis.set(b.wx / w, b.wy / w, b.wz / w);
        q.setFromAxisAngle(axis, w * dt);
        m.quaternion.premultiply(q);
      }
    }
  }

  // A ball drops into a pocket and disappears.
  dropBall(id, pocket, speed) {
    const m = this.ballMeshes.get(id);
    const p = POCKETS[pocket];
    m.userData.pocketed = true;
    this.dropping.push({ mesh: m, from: m.position.clone(), to: new THREE.Vector3(p.x, -0.11, p.z), t: 0, dur: 0.28 + 0.2 / (1 + speed) });
  }

  updateDrops(dt) {
    for (let i = this.dropping.length - 1; i >= 0; i--) {
      const d = this.dropping[i];
      d.t += dt / d.dur;
      const k = Math.min(1, d.t);
      d.mesh.position.lerpVectors(d.from, d.to, k);
      d.mesh.position.y = d.from.y + (d.to.y - d.from.y) * k * k;
      if (k >= 1) {
        d.mesh.visible = false;
        this.dropping.splice(i, 1);
      }
    }
  }

  #cue() {
    const g = new THREE.Group();
    const parts = [
      // [length, r0, r1, material]
      [0.012, 0.0062, 0.0062, new THREE.MeshStandardMaterial({ color: 0x3a6fb0, roughness: 0.9 })], // chalked tip
      [0.022, 0.0064, 0.0065, new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.4 })], // ferrule
      [0.68, 0.0065, 0.0105, new THREE.MeshStandardMaterial({ map: woodTexture({ base: [196, 166, 120], dark: [168, 134, 92] }), roughness: 0.35 })], // maple shaft
      [0.02, 0.0105, 0.0108, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.6 })], // joint
      [0.36, 0.0108, 0.0128, new THREE.MeshStandardMaterial({ map: woodTexture({ base: [70, 30, 18], dark: [30, 12, 6] }), roughness: 0.3 })], // forearm
      [0.27, 0.0128, 0.014, new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.85 })], // wrap
      [0.1, 0.014, 0.0145, new THREE.MeshStandardMaterial({ map: woodTexture({ base: [70, 30, 18], dark: [30, 12, 6] }), roughness: 0.3 })], // butt
    ];
    let x = 0;
    for (const [len, r0, r1, mat] of parts) {
      const geo = new THREE.CylinderGeometry(r0, r1, len, 24);
      geo.rotateZ(Math.PI / 2); // along x; r0 at +x end
      const m = new THREE.Mesh(geo, mat);
      m.position.x = -(x + len / 2);
      m.castShadow = true;
      g.add(m);
      x += len;
    }
    // The group's origin is the tip; the cue extends along -x.
    this.cue = new THREE.Group();
    this.cue.add(g);
    this.scene.add(this.cue);
    this.cue.visible = false;
  }

  // Place the cue: tip `gap` metres behind the contact point, aiming along `angle`, tip offset (a, b).
  setCue(ball, angle, gap, a, b, elevation = 0.07) {
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const sx = -dz, sz = dx; // right of aim
    const c = Math.sqrt(Math.max(0, 1 - a * a - b * b));
    const tip = new THREE.Vector3(
      ball.x + R * (a * sx - c * dx) - dx * gap,
      R + R * b + Math.sin(elevation) * gap,
      ball.z + R * (a * sz - c * dz) - dz * gap,
    );
    this.cue.position.copy(tip);
    this.cue.rotation.set(0, -angle, 0);
    this.cue.rotateZ(-elevation);
    this.cue.visible = true;
  }

  #guide() {
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    const make = (mat) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.guide = {
      aim: make(lineMat),
      obj: make(new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.6, depthWrite: false })),
      cue: make(new THREE.MeshBasicMaterial({ color: 0x9fd7ff, transparent: true, opacity: 0.45, depthWrite: false })),
      ghost: new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })),
      ring: new THREE.Mesh(new THREE.RingGeometry(R * 1.05, R * 1.35, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.8, depthWrite: false })),
    };
    this.guide.ghost.visible = false;
    this.guide.ring.visible = false;
    this.scene.add(this.guide.ghost, this.guide.ring);
  }

  #segment(mesh, x0, z0, x1, z1, width) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-4) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.set((x0 + x1) / 2, 0.0015, (z0 + z1) / 2);
    mesh.scale.set(len, 1, width);
    mesh.rotation.set(0, -Math.atan2(z1 - z0, x1 - x0), 0);
  }

  // Draw the aiming guide from a castAim() result. mode: 'full' | 'short' | 'off'.
  showGuide(cue, hit, mode) {
    const g = this.guide;
    for (const k of ['aim', 'obj', 'cue']) g[k].visible = false;
    g.ghost.visible = false;
    if (!hit || mode === 'off' || !cue) return;
    this.#segment(g.aim, cue.x, cue.z, hit.x, hit.z, 0.003);
    if (hit.kind === 'ball') {
      g.ghost.visible = true;
      g.ghost.position.set(hit.x, R, hit.z);
      if (mode === 'full') {
        const b = hit.ball;
        const L = 0.12 + 0.45 * Math.cos(hit.cut);
        this.#segment(g.obj, b.x, b.z, b.x + hit.objDir.x * L, b.z + hit.objDir.z * L, 0.004);
        const cl = Math.hypot(hit.cueDir.x, hit.cueDir.z);
        if (cl > 0.05) this.#segment(g.cue, hit.x, hit.z, hit.x + (hit.cueDir.x / cl) * 0.18 * cl, hit.z + (hit.cueDir.z / cl) * 0.18 * cl, 0.003);
      }
    }
  }

  hideGuide() {
    this.showGuide(null, null, 'off');
  }

  showPlacement(ball, valid) {
    const ring = this.guide.ring;
    ring.visible = !!ball;
    if (!ball) return;
    ring.position.set(ball.x, 0.002, ball.z);
    ring.material.color.set(valid ? 0xffd38a : 0xff5a4a);
  }

  // Ray from the screen to the plane of ball centres.
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const meshes = [...this.ballMeshes.values()].filter((m) => m.visible);
    const hit = ray.intersectObjects(meshes, false)[0];
    const p = new THREE.Vector3();
    const onBed = ray.ray.intersectPlane(this.bedPlane, p);
    return { ball: hit ? hit.object.userData.ballId : null, x: onBed ? p.x : null, z: onBed ? p.z : null };
  }

  render(dt) {
    this.rig.update(dt);
    const above = this.camera.position.y > 1.0;
    for (const m of this.lampMeshes) m.visible = !above;
    this.composer.render();
  }
}

// Orbit-style camera that eases between an aiming view behind the cue ball, an overview during the
// shot and a straight-down view.
class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.aspect = 1.6;
    this.target = new THREE.Vector3(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = 0.5;
    this.dist = 2.6;
    this.goal = { target: new THREE.Vector3(), yaw: Math.PI, pitch: 0.5, dist: 2.6 };
    this.userPitch = 0;
    this.userDist = 1;
    this.userYaw = 0;
    this.mode = 'aim';
  }

  // Behind the cue ball, looking along the aim.
  aimAt(ball, angle) {
    this.goal.target.set(ball.x + Math.cos(angle) * 0.35, 0, ball.z + Math.sin(angle) * 0.35);
    this.goal.yaw = angle + Math.PI;
    this.goal.pitch = this.aspect < 0.9 ? 0.42 : 0.3;
    this.goal.dist = this.aspect < 0.9 ? 1.75 : 1.25;
  }

  overview(angle) {
    this.goal.target.set(0, 0, 0);
    this.goal.yaw = angle + Math.PI;
    this.goal.pitch = 0.95;
    this.goal.dist = this.aspect < 0.9 ? 3.9 : 2.9;
  }

  top() {
    this.goal.target.set(0, 0, 0);
    this.goal.yaw = Math.PI / 2;
    this.goal.pitch = 1.53;
    this.goal.dist = this.aspect < 0.9 ? 4.3 : 2.85;
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 5);
    this.target.lerp(this.goal.target, k);
    let dy = this.goal.yaw + this.userYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * k;
    this.pitch += (Math.min(1.55, Math.max(0.08, this.goal.pitch + this.userPitch)) - this.pitch) * k;
    this.dist += (this.goal.dist * this.userDist - this.dist) * k;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.cos(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.sin(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.target);
  }
}
