// The 3D scene: a sunlit loft, the table, the balls, the cue, the aiming guide and the camera.
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { R, HX, HZ, POCKETS } from './physics.js';
import { ballTexture } from './textures.js';
import { buildTable, buildRoom, buildCue, CUSHION_TOP, RAIL_TOP, RAIL_IN, OUT_X, OUT_Z, CUE_LENGTH } from './models.js';
import { CameraRig } from './camera.js';

const DEG = Math.PI / 180;
export const MIN_ELEVATION = 4 * DEG;
export const MAX_ELEVATION = 70 * DEG;

export class PoolScene {
  constructor(canvas) {
    this.canvas = canvas;
    const narrow = matchMedia('(max-width: 840px)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, narrow ? 1.5 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe9e4da);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 60);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.12, 0.35, 1.4);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const room = buildRoom();
    this.scene.add(room.group);
    this.pendantMeshes = room.pendantMeshes;
    const table = buildTable();
    this.scene.add(table.group);
    this.kitchen = table.kitchen;
    this.#lights();
    this.#environment();
    this.#balls();
    this.cue = buildCue();
    this.cue.visible = false;
    this.scene.add(this.cue);
    this.#guide();
    this.bedPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);
    this.rig = new CameraRig(this.camera);
    this.resize();
    this.rig.baseFov = this.camera.fov;
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 60 : 45;
    this.camera.updateProjectionMatrix();
    this.rig.aspect = w / h;
    this.rig.baseFov = this.camera.fov;
  }

  #lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xfff6ea, 0xb39472, 0.85));
    // Afternoon sun through the windows at the foot end.
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.7);
    sun.position.set(7, 4.2, -2.5);
    sun.target.position.set(0, -0.4, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -4;
    sc.right = 4;
    sc.top = 3;
    sc.bottom = -3;
    sc.near = 1;
    sc.far = 16;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    s.add(sun, sun.target);
    // Soft fill from the window wall.
    const fill = new THREE.DirectionalLight(0xdfeaff, 0.35);
    fill.position.set(6, 1.5, 2);
    s.add(fill);
    // The pendant over the table.
    for (const x of [-0.78, 0, 0.78]) {
      const spot = new THREE.SpotLight(0xfff2dc, 1.7, 0, 0.9, 0.8, 2);
      spot.position.set(x, 1.12, 0);
      spot.target.position.set(x, 0, 0);
      if (x !== 0) {
        spot.castShadow = true;
        spot.shadow.mapSize.set(1024, 1024);
        spot.shadow.camera.near = 0.5;
        spot.shadow.camera.far = 2.5;
        spot.shadow.bias = -0.0005;
        spot.shadow.normalBias = 0.01;
        spot.shadow.radius = 3;
      }
      s.add(spot, spot.target);
    }
  }

  // Reflections: a simple stand-in of the room (window wall, ceiling, warm floor, the pendant) baked
  // into an environment map. Capturing the fully lit scene itself produces NaNs under shadowed lights.
  #environment() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    const box = new THREE.Mesh(new THREE.BoxGeometry(12, 3.3, 10), new THREE.MeshBasicMaterial({ color: 0xbfb6a8, side: THREE.BackSide }));
    box.position.y = 0.9;
    env.add(box);
    const panel = (color, k, w, h, pos, rot) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.rotation.set(...rot);
      env.add(m);
    };
    panel(0xdcecff, 3.2, 9, 2.4, [5.9, 1.0, 0], [0, -Math.PI / 2, 0]); // windows
    panel(0xfaf6ee, 1.4, 12, 10, [0, 2.5, 0], [Math.PI / 2, 0, 0]); // ceiling
    panel(0xc89d6a, 0.9, 12, 10, [0, -0.75, 0], [-Math.PI / 2, 0, 0]); // floor
    panel(0xfff1d8, 6, 2, 0.35, [0, 1.12, 0], [Math.PI / 2, 0, 0]); // pendant
    panel(0xe8e2d6, 1.1, 12, 3, [0, 0.9, -4.95], [0, 0, 0]); // brick wall
    this.scene.environment = pm.fromScene(env, 0.035).texture;
    this.scene.environmentIntensity = 0.45;
    pm.dispose();
  }

  #balls() {
    this.ballMeshes = new Map();
    const geo = new THREE.SphereGeometry(R, 64, 48);
    for (let id = 0; id < 16; id++) {
      const mat = new THREE.MeshPhysicalMaterial({ map: ballTexture(id), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 0.8 });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.ballId = id;
      m.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      this.scene.add(m);
      this.ballMeshes.set(id, m);
    }
    this.dropping = [];
    this.inPocket = POCKETS.map(() => 0);
  }

  resetPockets() {
    this.dropping.length = 0;
    this.inPocket = POCKETS.map(() => 0);
    for (const m of this.ballMeshes.values()) m.userData.inPocket = false;
  }

  // Sync meshes to physics; spin them by their angular velocity.
  syncBalls(balls, dt) {
    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3();
    for (const b of balls) {
      const m = this.ballMeshes.get(b.id);
      if (!b.on) continue; // pocketed balls stay where they fell
      m.visible = true;
      m.userData.inPocket = false;
      m.position.set(b.x, R, b.z);
      const w = Math.hypot(b.wx, b.wy, b.wz);
      if (w > 1e-4 && dt > 0) {
        axis.set(b.wx / w, b.wy / w, b.wz / w);
        q.setFromAxisAngle(axis, w * dt);
        m.quaternion.premultiply(q);
      }
    }
  }

  // A ball drops into a pocket and settles in the bag, where it stays visible.
  dropBall(id, pocket, speed) {
    const m = this.ballMeshes.get(id);
    const p = POCKETS[pocket];
    const n = this.inPocket[pocket]++;
    const out = { x: Math.sign(p.x) || 0, z: Math.sign(p.z) };
    const ring = [[0, 0], [0.032, 0.02], [-0.032, 0.02], [0, 0.04], [0.03, -0.03], [-0.03, -0.03]];
    const [ox, oz] = ring[n % ring.length];
    const to = new THREE.Vector3(p.x + ox * (out.z || 1) * 0.6 + out.x * 0.01, -0.045 - Math.floor(n / ring.length) * 0.02 + (n % ring.length) * 0.004, p.z + oz * 0.6 + out.z * 0.01);
    m.userData.inPocket = true;
    this.dropping.push({ mesh: m, from: m.position.clone(), to, t: 0, dur: 0.3 + 0.2 / (1 + speed), spin: speed * 12 });
  }

  updateDrops(dt) {
    const q = new THREE.Quaternion();
    for (let i = this.dropping.length - 1; i >= 0; i--) {
      const d = this.dropping[i];
      d.t += dt / d.dur;
      const k = Math.min(1, d.t);
      d.mesh.position.lerpVectors(d.from, d.to, k);
      d.mesh.position.y = d.from.y + (d.to.y - d.from.y) * k * k;
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), d.spin * dt * (1 - k));
      d.mesh.quaternion.premultiply(q);
      if (k >= 1) this.dropping.splice(i, 1);
    }
  }

  // How high the cue has to be raised so it clears the cushions, rails and other balls, the way a
  // player jacks up the butt when the cue ball is near a rail or behind another ball.
  cueElevation(balls, cue, angle, b = 0, gap = 0.05) {
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const ux = -dx, uz = -dz; // from the tip back towards the butt
    const tipX = cue.x - dx * R, tipZ = cue.z - dz * R;
    const tipY = R + b * R;
    let need = Math.tan(MIN_ELEVATION);
    const cueR = (s) => 0.0068 + Math.min(1, s / CUE_LENGTH) * 0.0082 + 0.004;
    const ix = HX + RAIL_IN, iz = HZ + RAIL_IN;
    for (let s = gap + 0.01; s < gap + CUE_LENGTH; s += 0.015) {
      const x = tipX + ux * s, z = tipZ + uz * s;
      let h = 0;
      if (Math.abs(x) < HX && Math.abs(z) < HZ) h = 0;
      else if (Math.abs(x) < ix && Math.abs(z) < iz) h = CUSHION_TOP;
      else if (Math.abs(x) < OUT_X + 0.01 && Math.abs(z) < OUT_Z + 0.01) h = RAIL_TOP + 0.004;
      else break; // past the table: nothing in the way
      if (h) need = Math.max(need, (h + cueR(s) - tipY) / s);
    }
    for (const o of balls) {
      if (!o.on || o.id === cue.id) continue;
      const rx = o.x - tipX, rz = o.z - tipZ;
      const s = rx * ux + rz * uz;
      if (s <= 0) continue;
      const lat = Math.abs(rx * uz - rz * ux);
      const r = cueR(s);
      if (lat > R + r) continue;
      const top = R + Math.sqrt(Math.max(0, (R + r) ** 2 - lat * lat));
      need = Math.max(need, (top - tipY) / Math.max(0.02, s - R));
    }
    return Math.min(MAX_ELEVATION, Math.atan(need));
  }

  // Place the cue: tip `gap` metres back from the contact point along the cue's own axis.
  setCue(ball, angle, gap, a, b, elevation = MIN_ELEVATION) {
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const sx = -dz, sz = dx; // right of aim
    const c = Math.sqrt(Math.max(0, 1 - a * a - b * b));
    const ce = Math.cos(elevation), se = Math.sin(elevation);
    const contact = new THREE.Vector3(ball.x + R * (a * sx - c * dx), R + R * b, ball.z + R * (a * sz - c * dz));
    this.cue.position.set(contact.x - dx * ce * gap, contact.y + se * gap, contact.z - dz * ce * gap);
    this.cue.rotation.set(0, -angle, 0);
    this.cue.rotateZ(-elevation);
    this.cue.visible = true;
  }

  #guide() {
    const make = (color, opacity) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 2;
      this.scene.add(m);
      return m;
    };
    this.guide = {
      aim: make(0xffffff, 0.8),
      obj: make(0xffd27a, 0.9),
      cue: make(0x9fd7ff, 0.75),
      ghost: new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false })),
      ring: new THREE.Mesh(new THREE.RingGeometry(R * 1.1, R * 1.45, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, depthWrite: false })),
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
    this.#segment(g.aim, cue.x, cue.z, hit.x, hit.z, 0.0035);
    if (hit.kind === 'ball') {
      g.ghost.visible = true;
      g.ghost.position.set(hit.x, R, hit.z);
      if (mode === 'full') {
        const b = hit.ball;
        const L = 0.12 + 0.5 * Math.cos(hit.cut);
        this.#segment(g.obj, b.x, b.z, b.x + hit.objDir.x * L, b.z + hit.objDir.z * L, 0.005);
        const cl = Math.hypot(hit.cueDir.x, hit.cueDir.z);
        if (cl > 0.05) this.#segment(g.cue, hit.x, hit.z, hit.x + (hit.cueDir.x / cl) * 0.2 * cl, hit.z + (hit.cueDir.z / cl) * 0.2 * cl, 0.0035);
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
    ring.material.color.set(valid ? 0xffd27a : 0xff5a4a);
  }

  // Ray from the screen to the plane of ball centres.
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const meshes = [...this.ballMeshes.values()].filter((m) => m.visible && !m.userData.inPocket);
    const hit = ray.intersectObjects(meshes, false)[0];
    const p = new THREE.Vector3();
    const onBed = ray.ray.intersectPlane(this.bedPlane, p);
    return { ball: hit ? hit.object.userData.ballId : null, x: onBed ? p.x : null, z: onBed ? p.z : null };
  }

  render(dt) {
    this.rig.update(dt);
    // Hide the pendant fixture when the camera rises past it (its light stays on).
    const c = this.camera.position;
    const above = c.y > 1.0 && Math.abs(c.x) < 2.4 && Math.abs(c.z) < 1.8;
    for (const m of this.pendantMeshes) m.visible = !above;
    this.composer.render();
  }
}
