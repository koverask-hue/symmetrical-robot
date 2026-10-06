import * as THREE from 'three';
import { generateLevel, SIZE_X, SIZE_Z } from './level.js';
import { BLOCKS, VOXEL } from './materials.js';
import { initPhysics, Physics, RAPIER, STEP } from './physics.js';
import { Debris } from './debris.js';
import { Destruction } from './destruction.js';
import { Fire } from './fire.js';
import { Player } from './player.js';
import { Tools, TOOLS } from './tools.js';
import { ChunkMeshes, BodyMeshes } from './render/meshes.js';
import { Effects } from './render/particles.js';

const FIRE_ALARM_AT = 200; // burning voxels before the fire alarm goes off
const PICKUP_RANGE = 2.6;

const std = (color, rough, metal, emissive = 0x000000, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei });

// Small hand-modelled loot props.
function lootMesh(name) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  if (name === 'Gold Bars') {
    const gold = std(0xffc24a, 0.22, 1);
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.16, 0.08, 0.34), gold, (i - 1) * 0.18, -0.12, 0);
    for (let i = 0; i < 2; i++) add(new THREE.BoxGeometry(0.16, 0.08, 0.34), gold, (i - 0.5) * 0.18, -0.04, 0);
  } else if (name === 'Server Drive') {
    add(new THREE.BoxGeometry(0.42, 0.14, 0.5), std(0x1d2126, 0.35, 0.7));
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.03, 0.02, 0.01), std(0x000000, 0.5, 0, 0x40c8ff, 12), -0.15 + i * 0.06, 0.02, 0.255);
  } else if (name === 'Ledger') {
    add(new THREE.BoxGeometry(0.34, 0.08, 0.46), std(0x5a1f1a, 0.75, 0));
    add(new THREE.BoxGeometry(0.32, 0.06, 0.44), std(0xeee6d2, 0.9, 0), 0.012, 0, 0);
  } else if (name === 'Antique Clock') {
    add(new THREE.BoxGeometry(0.3, 0.5, 0.2), std(0x6b3d1d, 0.5, 0));
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24), std(0xf2e8cc, 0.4, 0), 0, 0.1, 0.105).rotation.x = Math.PI / 2;
  } else {
    add(new THREE.BoxGeometry(0.3, 0.22, 0.24), std(0x3b4752, 0.5, 0.6));
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.5), std(0x999999, 0.3, 1), 0.1, 0.35, 0);
    add(new THREE.SphereGeometry(0.03), std(0x000000, 0.4, 0, 0xff2020, 20), 0.1, 0.6, 0);
  }
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  return { mesh: g, half: [size.x / 2, size.y / 2, size.z / 2], offset: box.getCenter(new THREE.Vector3()) };
}

// Vertical light beam marking uncollected loot from a distance.
function beamMesh(color) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(2.5) }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
      void main(){ float a = (1.0 - vUv.y) * (0.5 + 0.5 * sin(uTime * 3.0 - vUv.y * 12.0)) * 0.35 + (1.0 - vUv.y) * 0.15;
      a *= 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0); gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 12, 1, true), mat);
  m.renderOrder = 5;
  return m;
}

export class Game {
  constructor({ renderer, input, hud, audio, onEnd }) {
    this.renderer = renderer;
    this.input = input;
    this.hud = hud;
    this.audio = audio;
    this.onEnd = onEnd;
    this.state = 'idle';
    this.time = 0;
    this.trauma = 0;
    this.sensitivity = 0.0022;
    this.fireLight = null;
    this.damageFlash = 0;
    this.whiteFlash = 0;
    this.fxBudget = 0;
  }

  async load(seed, progress = () => {}) {
    // The render loop keeps running while we await below; 'loading' makes it
    // skip frame() until every system exists again.
    this.state = 'loading';
    this.dispose();
    progress(0.05, 'Starting physics');
    await initPhysics();
    progress(0.1, 'Building the town');
    const L = (this.level = generateLevel(seed));
    const w = (this.world = L.world);
    this.physics = new Physics(w);
    progress(0.2, 'Building colliders');
    await nextFrame();
    this.physics.buildWorld();
    // Rapier builds its broad-phase on the first step (~100 ms for the town):
    // pay that here rather than on the first frame of play.
    this.physics.pw.step(this.physics.events);
    this.physics.events.drainContactForceEvents(() => {});
    this.fx = new Effects(this.renderer.scene, w, this.renderer.sunDir);
    const fxHooks = this.makeFxHooks();
    this.debris = new Debris(w, this.physics, fxHooks);
    this.fire = new Fire(w);
    this.destruction = new Destruction({ world: w, physics: this.physics, debris: this.debris, fire: this.fire, fx: fxHooks });
    this.fire.destruction = this.destruction;
    this.chunks = new ChunkMeshes(this.renderer, w);
    this.bodyMeshes = new BodyMeshes(this.renderer, this.debris);
    this.renderer.centreShadow((SIZE_X * VOXEL) / 2, (SIZE_Z * VOXEL) / 2);
    this.player = new Player(this.physics, L.spawn.pos, L.spawn.yaw);
    this.player.onLand = (v) => {
      this.audio.step(this.player.groundMaterial());
      this.addTrauma(Math.min(0.4, v * 0.02));
    };
    this.player.onStep = (mat) => this.audio.step(mat);
    this.tools = new Tools(this, L.loadout);
    this.spawnTargets();
    this.escape = this.makeEscape();
    // Mesh the whole town before the curtain goes up.
    this.chunks.requestAll();
    const total = this.world.cx * this.world.cy * this.world.cz;
    while (this.world.dirty.size || this.chunks.pending) {
      this.chunks.update(this.player.cur ? { x: L.spawn.pos[0], y: 3, z: L.spawn.pos[2] } : null, 40);
      const done = total - this.world.dirty.size - this.chunks.pending;
      progress(0.25 + 0.7 * (done / total), 'Meshing voxels');
      await nextFrame();
    }
    // Warm up shader programs so the first explosion does not hitch.
    this.fx.explosion([0, -50, 0], 0.1);
    this.renderer.r.compile(this.renderer.scene, this.renderer.camera);
    this.fx.clear();
    progress(1, 'Ready');
    this.phase = 'plan';
    this.alarmLeft = L.alarmTime;
    this.missionTime = 0;
    this.loot = 0;
    this.state = 'ready';
  }

  makeFxHooks() {
    return {
      chips: (list, vel, from) => {
        const max = 500;
        const l = list.length > max ? list.filter(() => Math.random() < max / list.length) : list;
        this.fx.chips.spawn(l, vel || 3, from || null);
        // Glass shatters with a sound of its own.
        if (l.some((c) => BLOCKS[c.id].transparent)) this.audio.impact(l[0].p, 'glass', 6);
      },
      dust: (p, amount) => this.fx.dust(p, amount),
      collapse: (body, n) => {
        const c = body.rb.worldCom();
        this.fx.dust([c.x, c.y, c.z], Math.min(2, n / 600));
        this.addTrauma(Math.min(0.5, n / 4000) * this.falloff([c.x, c.y, c.z], 40));
      },
      explosion: (p, power) => {
        this.fx.explosion(p, power);
        this.renderer.flash(p, 0xff9a4a, 900 * power, 0.5);
        const d = this.dist(p);
        this.audio.explosion(p, power, d);
        this.addTrauma(Math.min(1, power * 1.6 * this.falloff(p, 35)));
        if (d < 12) this.whiteFlash = Math.max(this.whiteFlash, 0.5 * (1 - d / 12));
      },
      impact: (p, mat, speed, mass) => {
        this.audio.impact(p, BLOCKS[mat].sound, speed * Math.min(2, Math.sqrt(mass) / 30));
        if (speed > 3 && mass > 300 && this.fxBudget-- > 0) this.fx.dust(p, Math.min(1.2, mass / 20000 + speed / 15));
        if (mass > 5000 && speed > 3) this.addTrauma(Math.min(0.35, mass / 200000) * this.falloff(p, 30));
      },
    };
  }

  dist(p) {
    const e = this.player.cur;
    return Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]);
  }

  falloff(p, range) {
    return Math.max(0, 1 - this.dist(p) / range);
  }

  addTrauma(t) {
    this.trauma = Math.min(1, this.trauma + t);
  }

  shake(t) {
    this.addTrauma(t);
  }

  get alarmOn() {
    return this.phase === 'alarm';
  }

  alarm(reason) {
    if (this.phase !== 'plan') return;
    this.phase = 'alarm';
    this.audio.setAlarm(true);
    this.hud.toast(reason, 'bad');
  }

  spawnTargets() {
    const pw = this.physics.pw;
    this.targets = this.level.targets.map((t) => {
      const { mesh, half, offset } = lootMesh(t.name);
      // Model-local offset so the collider box is centred on the mesh.
      mesh.children.forEach((c) => c.position.sub(offset));
      const rb = pw.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(t.pos[0], t.pos[1] + half[1] + 0.01, t.pos[2])
        .setCcdEnabled(true).setSleeping(true).setLinearDamping(0.1).setAngularDamping(0.3));
      const col = pw.createCollider(RAPIER.ColliderDesc.cuboid(half[0], half[1], half[2]).setDensity(900).setFriction(0.7), rb);
      const obj = { ...t, rb, col, mesh, collected: false, origin: t.pos.slice() };
      this.physics.register(col, 'target', obj);
      const beam = beamMesh(t.required ? 0x40d8ff : 0xffb040);
      beam.position.y = 15;
      obj.beam = beam;
      const holder = new THREE.Group();
      holder.add(mesh);
      this.renderer.scene.add(holder, beam);
      obj.holder = holder;
      return obj;
    });
  }

  makeEscape() {
    const e = this.level.escape;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(e.radius, 0.06, 8, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x50ff90).multiplyScalar(3) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(e.pos[0], e.pos[1] + 0.05, e.pos[2]);
    this.renderer.scene.add(ring);
    return { ...e, ring };
  }

  start() {
    this.state = 'playing';
    this.hud.show(true);
    this.hud.toast(`${this.level.name}: grab the loot, get to the van`);
  }

  pause(on) {
    if (this.state === 'playing' && on) this.state = 'paused';
    else if (this.state === 'paused' && !on) this.state = 'playing';
  }

  end(won, reason) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.phase = won ? 'won' : 'lost';
    this.audio.setAlarm(false);
    this.hud.show(false);
    this.onEnd?.({
      won, reason,
      time: this.missionTime,
      loot: this.loot,
      collected: this.targets.filter((t) => t.collected).length,
      total: this.targets.length,
      destroyed: this.destruction.voxelsDestroyed,
      collapse: this.destruction.biggestCollapse,
      seed: this.level.seed,
    });
  }

  explode(p, power) {
    this.destruction.explode(p, power);
    // Player: damage and knockback falling off with distance.
    const e = this.player.cur;
    const c = [e[0], e[1] + 0.9, e[2]];
    const d = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]);
    const R = 5 * power;
    if (d < R) {
      const k = 1 - d / R;
      this.player.damage(k * k * 110);
      this.damageFlash = Math.min(1, this.damageFlash + k);
      this.audio.hurt();
      const inv = 1 / Math.max(d, 0.3);
      this.player.vel[0] += (c[0] - p[0]) * inv * k * 14;
      this.player.vel[1] += Math.max(0, (c[1] - p[1]) * inv + 0.6) * k * 9;
      this.player.vel[2] += (c[2] - p[2]) * inv * k * 14;
    }
    for (const t of this.targets) {
      if (t.collected) continue;
      const q = t.rb.translation();
      const dd = Math.hypot(q.x - p[0], q.y - p[1], q.z - p[2]);
      if (dd < 6 * power) {
        const k = (1 - dd / (6 * power)) * 8 * t.rb.mass();
        const inv = 1 / Math.max(dd, 0.3);
        t.rb.applyImpulse({ x: (q.x - p[0]) * inv * k, y: ((q.y - p[1]) * inv + 0.5) * k, z: (q.z - p[2]) * inv * k }, true);
      }
    }
  }

  // Loot the player is aiming at or standing next to.
  lootInReach() {
    const e = this.player.eye(1), f = this.player.forward();
    let best = null, bestScore = Infinity;
    for (const t of this.targets) {
      if (t.collected) continue;
      const q = t.rb.translation();
      const d = [q.x - e[0], q.y - e[1], q.z - e[2]];
      const dist = Math.hypot(...d);
      if (dist > PICKUP_RANGE) continue;
      const facing = (d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / dist;
      if (facing < 0.6 && dist > 1.2) continue;
      const score = dist * (2 - facing);
      if (score < bestScore) {
        best = t;
        bestScore = score;
      }
    }
    return best;
  }

  collect(t) {
    t.collected = true;
    this.loot += t.value;
    this.audio.pickup();
    this.hud.toast(`${t.name} secured  +$${t.value.toLocaleString()}`, 'good');
    if (this.tools.carry && this.tools.carry.rb === t.rb) this.tools.drop();
    this.physics.unregister(t.col);
    this.physics.pw.removeRigidBody(t.rb);
    t.rb = null;
    this.renderer.scene.remove(t.holder, t.beam);
    this.alarm('ALARM TRIPPED — get out!');
  }

  frame(dt) {
    const t0 = performance.now();
    const inp = this.input;
    const playing = this.state === 'playing';
    if (playing) {
      if (inp.dx || inp.dy) this.player.look(inp.dx, inp.dy, this.sensitivity);
      for (let i = 0; i < TOOLS.length; i++) if (inp.hit('Digit' + (i + 1))) this.tools.select(i);
      if (inp.wheel) this.tools.cycle(inp.wheel > 0 ? 1 : -1);
      this.missionTime += dt;
    }
    const move = {
      f: playing ? (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0) : 0,
      r: playing ? (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0) : 0,
      jump: playing && inp.hit('Space'),
      sprint: inp.down('ShiftLeft') || inp.down('ShiftRight'),
      crouch: inp.down('ControlLeft') || inp.down('KeyC'),
    };
    if (playing) {
      this.tools.update(dt, {
        fire: inp.mouse.left, firePressed: inp.mouse.leftPressed,
        alt: inp.mouse.right || inp.down('KeyQ'), altPressed: inp.mouse.rightPressed || inp.hit('KeyQ'),
        lookDX: inp.dx, lookDY: inp.dy,
      });
      const near = this.lootInReach();
      this.hud.prompt(near ? `E  Grab ${near.name}` : this.tools.carry ? 'Click to throw · release to drop' : '');
      if (near && inp.hit('KeyE')) this.collect(near);
    }
    // Physics at a fixed 60 Hz; the player is stepped inside it.
    let jump = move.jump;
    this.fxBudget = 6;
    this.physics.update(this.state === 'paused' ? 0 : dt, (h) => {
      this.bodyMeshes.capture();
      this.player.step(h, { ...move, jump });
      jump = false;
    });
    const alpha = this.physics.acc / STEP;
    if (this.state !== 'paused') {
      this.debris.handleImpacts(this.destruction);
      this.debris.update(dt);
      this.fire.update(dt);
      this.debris.enforceBudget();
      this.destruction.time = this.time;
      this.time += dt;
      if (Math.floor(this.time / 2) !== Math.floor((this.time - dt) / 2)) this.world.coolDown(this.time, 8);
      this.updateFire(dt);
      this.updateTargets(dt);
      this.updateMission(dt);
      this.fx.update(dt);
    }
    // Camera.
    const cam = this.renderer.camera;
    const s = this.trauma * this.trauma;
    const n = (k) => Math.sin(this.time * 37 + k * 11.3) * 0.6 + Math.sin(this.time * 71 + k * 5.1) * 0.4;
    if (this.state === 'ready') {
      // Title screen: slow orbit over the town.
      const t = this.time * 0.045 + 2.2, cx = (SIZE_X * VOXEL) / 2, cz = (SIZE_Z * VOXEL) / 2;
      cam.position.set(cx + Math.cos(t) * 40, 19 + Math.sin(t * 0.7) * 3, cz + Math.sin(t) * 40);
      cam.lookAt(cx, 5, cz);
    } else {
      const eye = this.player.eye(alpha);
      cam.position.set(eye[0] + n(1) * s * 0.08, eye[1] + n(2) * s * 0.08, eye[2] + n(3) * s * 0.08);
      cam.rotation.set(this.player.pitch + n(4) * s * 0.06, this.player.yaw + n(5) * s * 0.06, n(6) * s * 0.05, 'YXZ');
    }
    this.tools.vm.visible = this.state !== 'ready';
    const sprinting = move.sprint && Math.hypot(this.player.vel[0], this.player.vel[2]) > 5;
    const fov = 75 + (sprinting ? 6 : 0);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 8);
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    this.chunks.update(cam.position, 4);
    this.bodyMeshes.sync(alpha);
    // Audio listener follows the camera.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, fwd, up);
    this.audio.setFire(this.fire.count);
    // HUD.
    if (playing || this.state === 'paused') {
      this.hud.tools(this.tools.current, this.tools.ammo);
      this.hud.health(this.player.health);
      this.hud.objectives(this.targets, this.phase);
      this.hud.alarm(this.phase === 'alarm' ? Math.max(0, this.alarmLeft) : null);
      this.updateMarkers();
    }
    // Simulation + scene update cost on the CPU (the GPU work is measured
    // separately by frame time).
    this.cpuMs = (this.cpuMs ?? 0) * 0.9 + (performance.now() - t0) * 0.1;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    this.whiteFlash = Math.max(0, this.whiteFlash - dt * 3);
    this.renderer.render(dt, {
      aberration: s * 0.02 + this.damageFlash * 0.01,
      damage: this.damageFlash * 0.7 + (this.player.health < 30 ? 0.25 + Math.sin(this.time * 6) * 0.1 : 0),
      flash: this.whiteFlash,
    });
  }

  updateFire(dt) {
    const n = this.fire.count;
    if (!n) return;
    const pts = this.fire.sample(Math.min(n, 70));
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) {
      cx += p[0]; cy += p[1]; cz += p[2];
      if (Math.random() < dt * 22) this.fx.flame(p, 1);
      if (Math.random() < dt * 1.6) this.fx.smokePuff(p, 0.14, 1.3);
      if (Math.random() < dt * 0.8) this.fx.sparks.emit(p, [(Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5)], 1.5, 0.04, 0.02, [9, 3.5, 1], 1);
    }
    const c = [cx / pts.length, cy / pts.length + 0.5, cz / pts.length];
    const L = this.fireLight;
    if (L && L.userData.life > 0 && L.userData.owner === 'fire') {
      L.position.lerp(new THREE.Vector3(...c), Math.min(1, dt * 4));
      L.userData.life = L.userData.max = 0.3;
      L.userData.base = Math.min(160, 25 + n * 1.2);
    } else {
      this.fireLight = this.renderer.flash(c, 0xff7a2a, Math.min(160, 25 + n * 1.2), 0.3, 0.35);
      this.fireLight.userData.owner = 'fire';
    }
    if (n > FIRE_ALARM_AT) this.alarm('FIRE ALARM — the fire brigade is coming');
  }

  updateTargets(dt) {
    for (const t of this.targets) {
      if (t.collected) continue;
      const p = t.rb.translation(), q = t.rb.rotation();
      if (p.y < -5 || p.x < -5 || p.z < -5 || p.x > SIZE_X * VOXEL + 5 || p.z > SIZE_Z * VOXEL + 5) {
        // Flung out of the map: put it back where it started.
        t.rb.setTranslation({ x: t.origin[0], y: t.origin[1] + 1, z: t.origin[2] }, true);
        t.rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        continue;
      }
      t.holder.position.set(p.x, p.y, p.z);
      t.holder.quaternion.set(q.x, q.y, q.z, q.w);
      t.beam.position.set(p.x, p.y + 15, p.z);
      t.beam.material.uniforms.uTime.value = this.time;
    }
  }

  updateMission(dt) {
    if (this.state !== 'playing') return;
    if (!this.player.alive) {
      this.end(false, 'You were killed');
      return;
    }
    if (this.phase === 'alarm') {
      this.alarmLeft -= dt;
      if (this.alarmLeft <= 0) {
        this.end(false, 'The police arrived');
        return;
      }
    }
    const allRequired = this.targets.filter((t) => t.required).every((t) => t.collected);
    const e = this.escape, p = this.player.cur;
    const inZone = Math.hypot(p[0] - e.pos[0], p[2] - e.pos[2]) < e.radius && Math.abs(p[1] - e.pos[1]) < 2.5;
    e.ring.material.color.setRGB(allRequired ? 0.3 : 0.8, allRequired ? 3 : 0.8, allRequired ? 1.2 : 0.8);
    if (allRequired && inZone) this.end(true, 'Clean getaway');
    if (this.time % 3 < dt) this.player.unstick();
  }

  updateMarkers() {
    const cam = this.renderer.camera;
    const w = this.renderer.canvas.clientWidth, h = this.renderer.canvas.clientHeight;
    const list = [];
    const v = new THREE.Vector3();
    const add = (pos, label, cls) => {
      v.set(pos[0], pos[1], pos[2]).project(cam);
      const behind = v.z > 1;
      let x = v.x, y = v.y;
      if (behind) { x = -x; y = -y; }
      const onScreen = !behind && Math.abs(x) < 0.95 && Math.abs(y) < 0.9;
      if (!onScreen) {
        const k = 0.92 / Math.max(Math.abs(x), Math.abs(y) / 0.95, 1e-3);
        x *= k; y *= k;
      }
      const d = Math.hypot(pos[0] - cam.position.x, pos[1] - cam.position.y, pos[2] - cam.position.z);
      list.push({ x: (x * 0.5 + 0.5) * w, y: (-y * 0.5 + 0.5) * h, label, sub: `${Math.round(d)} m`, cls, onScreen });
    };
    for (const t of this.targets) {
      if (t.collected) continue;
      const p = t.rb.translation();
      add([p.x, p.y + 0.5, p.z], t.name, t.required ? 'req' : 'opt');
    }
    if (this.targets.filter((t) => t.required).every((t) => t.collected)) add([this.escape.pos[0], this.escape.pos[1] + 1.5, this.escape.pos[2]], 'Getaway', 'esc');
    this.hud.markers(list);
    const fps = 1000 / this.renderer.frameMs;
    this.hud.stats(`${fps.toFixed(0)} fps · cpu ${(this.cpuMs ?? 0).toFixed(1)} ms · ${Math.round(this.renderer.size[2] * 100) / 100}x · ${this.debris.bodies.size} bodies · ${this.fire.count} fires`);
  }

  dispose() {
    if (!this.world) return;
    this.tools?.clear();
    this.chunks?.dispose();
    this.bodyMeshes?.clear();
    this.fx?.clear();
    for (const t of this.targets || []) this.renderer.scene.remove(t.holder, t.beam);
    if (this.escape) this.renderer.scene.remove(this.escape.ring);
    for (const k of ['chips', 'smoke', 'glow', 'sparks']) if (this.fx?.[k]) this.renderer.scene.remove(this.fx[k].mesh);
    this.tools && this.renderer.vmScene.remove(this.tools.vm);
    if (this.physics) {
      // Controllers and the event queue hold references into the world.
      this.physics.pw.removeCharacterController(this.player.kcc);
      this.physics.events.free();
      this.physics.pw.free();
    }
    this.audio.setAlarm(false);
    this.world = this.physics = this.player = this.tools = this.debris = this.fire = this.destruction = null;
    this.chunks = this.bodyMeshes = this.fx = this.targets = this.escape = null;
  }
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
