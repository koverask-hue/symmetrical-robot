import * as THREE from 'three';
import { RAPIER } from './physics.js';
import { BLOCKS, VOXEL } from './materials.js';

export const TOOLS = [
  { key: 'hammer', name: 'Sledgehammer', hint: 'Soft materials, some brick' },
  { key: 'shotgun', name: 'Shotgun', hint: 'Shreds glass, wood and plaster' },
  { key: 'bomb', name: 'Pipe Bomb', hint: '3 s fuse, bounces' },
  { key: 'rocket', name: 'Rocket', hint: 'Breaches steel' },
  { key: 'cutter', name: 'Plasma Cutter', hint: 'Cuts anything, uses fuel' },
  { key: 'extinguisher', name: 'Extinguisher', hint: 'Fires trigger alarms' },
];

const GRAB_RANGE = 3.2;
const GRAB_MAX_KG = 450;

const std = (color, rough = 0.6, metal = 0, emissive = 0x000000, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei });

function part(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

// Hand-built viewmodels; small primitive kits read well at this size.
function buildModels() {
  const steel = std(0x9aa3ab, 0.32, 1);
  const dark = std(0x2b2e33, 0.45, 0.8);
  const wood = std(0x7a4b28, 0.7);
  const red = std(0xb3241c, 0.35, 0.2);
  const olive = std(0x4c5a35, 0.6, 0.2);
  const glowTip = std(0x99ddff, 0.2, 0, 0x66ccff, 6);
  const cyl = (r, h, s = 16) => new THREE.CylinderGeometry(r, r, h, s);
  const m = {};
  let g = new THREE.Group();
  g.add(part(cyl(0.022, 0.75), wood, 0, 0, 0));
  g.add(part(new THREE.BoxGeometry(0.11, 0.11, 0.26), steel, 0, 0.38, 0));
  g.position.set(0.32, -0.32, -0.55);
  g.rotation.set(-0.3, 0.2, 0.25);
  m.hammer = g;
  g = new THREE.Group();
  g.add(part(cyl(0.022, 0.7), dark, 0.0, 0.02, -0.35, Math.PI / 2));
  g.add(part(cyl(0.022, 0.7), dark, 0.045, 0.02, -0.35, Math.PI / 2));
  g.add(part(new THREE.BoxGeometry(0.1, 0.07, 0.3), dark, 0.022, 0.0, 0.0));
  g.add(part(new THREE.BoxGeometry(0.075, 0.12, 0.34), wood, 0.022, -0.05, 0.28, -0.25));
  g.add(part(new THREE.BoxGeometry(0.08, 0.05, 0.22), wood, 0.022, -0.035, -0.32));
  g.position.set(0.22, -0.2, -0.42);
  m.shotgun = g;
  g = new THREE.Group();
  g.add(part(cyl(0.045, 0.24), steel, 0, 0, 0));
  g.add(part(cyl(0.052, 0.03), dark, 0, 0.13, 0));
  g.add(part(cyl(0.052, 0.03), dark, 0, -0.13, 0));
  g.add(part(new THREE.TorusGeometry(0.05, 0.006, 6, 12, Math.PI), red, 0, 0.16, 0));
  g.position.set(0.26, -0.24, -0.45);
  g.rotation.set(0.3, 0, -0.4);
  m.bomb = g;
  g = new THREE.Group();
  g.add(part(cyl(0.05, 0.8), olive, 0, 0.0, -0.25, Math.PI / 2));
  g.add(part(cyl(0.062, 0.1), dark, 0, 0.0, -0.66, Math.PI / 2));
  g.add(part(new THREE.BoxGeometry(0.04, 0.14, 0.06), dark, 0, -0.11, 0.0));
  g.add(part(new THREE.BoxGeometry(0.03, 0.05, 0.12), dark, 0, 0.09, -0.1));
  g.position.set(0.28, -0.2, -0.38);
  m.rocket = g;
  g = new THREE.Group();
  g.add(part(new THREE.BoxGeometry(0.1, 0.12, 0.3), dark, 0, 0, 0));
  g.add(part(cyl(0.018, 0.32), steel, 0, 0.02, -0.3, Math.PI / 2));
  const tip = part(cyl(0.012, 0.03), glowTip, 0, 0.02, -0.47, Math.PI / 2);
  g.add(tip);
  g.add(part(cyl(0.05, 0.22), red, 0.07, -0.04, 0.08));
  g.position.set(0.24, -0.22, -0.42);
  g.userData.tip = tip;
  m.cutter = g;
  g = new THREE.Group();
  g.add(part(cyl(0.07, 0.42), red, 0, 0, 0));
  g.add(part(cyl(0.025, 0.08), dark, 0, 0.24, 0));
  g.add(part(cyl(0.012, 0.25), dark, 0, 0.27, -0.12, Math.PI / 2.4));
  g.position.set(0.26, -0.3, -0.5);
  g.rotation.set(0.5, 0, -0.1);
  m.extinguisher = g;
  for (const k in m) m[k].userData.base = { p: m[k].position.clone(), r: m[k].rotation.clone() };
  return m;
}

/**
 * Tool logic, projectiles, carrying, and the held viewmodel.
 * `g` is the game: { renderer, destruction, physics, debris, fire, fx, audio,
 * player, shake(amount), hud, alarm(reason), time }.
 */
export class Tools {
  constructor(g, loadout) {
    this.g = g;
    this.ammo = { ...loadout };
    this.current = 0;
    this.cooldown = 0;
    this.anim = 0; // swing/recoil progress
    this.recoil = 0;
    this.sway = [0, 0];
    this.models = buildModels();
    this.vm = new THREE.Group();
    // Held tools sit small and low-right so they frame the view, not fill it.
    this.vm.scale.setScalar(0.62);
    this.vm.position.set(0.07, -0.03, 0.02);
    for (const k in this.models) {
      this.models[k].visible = false;
      this.vm.add(this.models[k]);
    }
    const vmScene = g.renderer.vmScene;
    vmScene.add(this.vm);
    this.projectiles = [];
    this.carry = null;
    this.cutTimer = 0;
    this.sprayTimer = 0;
    this.select(0);
  }

  get tool() {
    return TOOLS[this.current].key;
  }

  select(i) {
    if (i < 0 || i >= TOOLS.length) return;
    this.current = i;
    for (const k in this.models) this.models[k].visible = k === this.tool;
    this.anim = 1; // raise animation
    this.cooldown = Math.max(this.cooldown, 0.2);
  }

  cycle(d) {
    this.select((this.current + d + TOOLS.length) % TOOLS.length);
  }

  eyeRay() {
    const g = this.g;
    const e = g.player.eye(1);
    const f = g.player.forward();
    return { e, f };
  }

  // input: { fire (held), firePressed, alt (held), altPressed }
  update(dt, input) {
    const g = this.g;
    this.cooldown -= dt;
    this.anim = Math.max(0, this.anim - dt * 3.2);
    this.recoil *= Math.exp(-dt * 9);
    this.updateCarry(dt, input);
    if (g.player.alive && !this.carry) {
      const t = this.tool;
      if (t === 'cutter' || t === 'extinguisher') {
        if (input.fire) this.useHeld(t, dt);
      } else if (input.firePressed || (input.fire && t === 'hammer')) {
        if (this.cooldown <= 0) this.use(t);
      }
    }
    this.updateProjectiles(dt);
    this.updateViewmodel(dt, input);
  }

  use(t) {
    const g = this.g;
    const { e, f } = this.eyeRay();
    if (t !== 'hammer') {
      if (this.ammo[t] <= 0) {
        g.audio.click();
        this.cooldown = 0.25;
        g.hud.toast(`${TOOLS[this.current].name}: empty`);
        return;
      }
      this.ammo[t]--;
    }
    if (t === 'hammer') {
      this.cooldown = 0.45;
      this.anim = 1;
      g.audio.swing();
      const hit = g.destruction.pick(e, f, 2.8, g.player.collider);
      if (!hit) return;
      this.strike(hit, f, [0.42, 0.22, 0], 1.2);
      g.shake(0.12);
    } else if (t === 'shotgun') {
      this.cooldown = 0.9;
      this.recoil = 1;
      g.shake(0.3);
      g.audio.shot([e[0], e[1], e[2]]);
      const muzzle = [e[0] + f[0] * 0.6, e[1] + f[1] * 0.6 - 0.1, e[2] + f[2] * 0.6];
      g.fx.muzzle(muzzle, f);
      g.renderer.flash(muzzle, 0xffc070, 30, 0.08);
      const up = [0, 1, 0];
      const right = norm(cross(f, up));
      const u2 = cross(right, f);
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.075;
        const d = norm([f[0] + (right[0] * Math.cos(a) + u2[0] * Math.sin(a)) * r, f[1] + (right[1] * Math.cos(a) + u2[1] * Math.sin(a)) * r, f[2] + (right[2] * Math.cos(a) + u2[2] * Math.sin(a)) * r]);
        const hit = g.destruction.pick(e, d, 70, g.player.collider);
        if (hit) this.strike(hit, d, [0.24, 0.12, 0], 0.5, true);
      }
    } else if (t === 'bomb') {
      this.cooldown = 0.6;
      this.anim = 1;
      g.audio.swing();
      const pw = g.physics.pw;
      const pv = g.player.vel;
      const rb = pw.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(e[0] + f[0] * 0.5, e[1] + f[1] * 0.5 - 0.1, e[2] + f[2] * 0.5)
        .setLinvel(f[0] * 13 + pv[0] * 0.5, f[1] * 13 + 2.5, f[2] * 13 + pv[2] * 0.5)
        .setAngvel({ x: Math.random() * 8, y: Math.random() * 8, z: Math.random() * 8 })
        .setCcdEnabled(true));
      const col = pw.createCollider(RAPIER.ColliderDesc.capsule(0.11, 0.045).setDensity(4000).setRestitution(0.35).setFriction(0.6), rb);
      g.physics.register(col, 'projectile', null);
      const mesh = this.models.bomb.clone();
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.visible = true;
      mesh.traverse((o) => (o.castShadow = true));
      g.renderer.scene.add(mesh);
      this.projectiles.push({ type: 'bomb', rb, col, mesh, fuse: 3, blink: 0 });
    } else if (t === 'rocket') {
      this.cooldown = 1.2;
      this.recoil = 1.5;
      g.shake(0.35);
      g.audio.whoosh(e);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), std(0x4c5a35, 0.5, 0.3));
      mesh.add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.15, 10), std(0xb3241c, 0.4)).translateY(0.32));
      g.renderer.scene.add(mesh);
      const p = [e[0] + f[0] * 0.8, e[1] + f[1] * 0.8 - 0.08, e[2] + f[2] * 0.8];
      this.projectiles.push({ type: 'rocket', p, v: [f[0] * 40, f[1] * 40, f[2] * 40], mesh, life: 5, trail: 0 });
    }
  }

  // Shared hit response for melee and pellets.
  strike(hit, dir, radii, push, pellet = false) {
    const g = this.g;
    const p = [hit.point[0] + dir[0] * 0.05, hit.point[1] + dir[1] * 0.05, hit.point[2] + dir[2] * 0.05];
    let mat = 'stone';
    if (hit.kind === 'world') mat = BLOCKS[hit.id].sound;
    else if (hit.kind === 'body') mat = BLOCKS[hit.ref.grid.find((v) => v) || 1].sound;
    if (hit.kind === 'world' || hit.kind === 'body') {
      const n = g.destruction.carve(p, radii, { chips: pellet ? 0.6 : 1, chipVel: 3 });
      if (!n && (mat === 'metal')) g.fx.sparksAt(hit.point, 8, hit.normal, 0.6);
    }
    if (hit.kind === 'body' || hit.kind === 'target') {
      const rb = hit.ref.rb;
      if (rb) {
        const j = Math.min(rb.mass(), 300) * push * 3;
        rb.applyImpulseAtPoint({ x: dir[0] * j, y: dir[1] * j, z: dir[2] * j }, { x: hit.point[0], y: hit.point[1], z: hit.point[2] }, true);
      }
    }
    g.fx.dust(hit.point, pellet ? 0.15 : 0.35, mat === 'stone' ? [0.6, 0.57, 0.52] : [0.5, 0.45, 0.38]);
    g.audio.impact(hit.point, mat, pellet ? 2 : 5);
  }

  useHeld(t, dt) {
    const g = this.g;
    if (this.ammo[t] <= 0) {
      if (this.cooldown <= 0) {
        g.audio.click();
        g.hud.toast(`${TOOLS[this.current].name}: empty`);
        this.cooldown = 0.5;
      }
      return;
    }
    this.ammo[t] = Math.max(0, this.ammo[t] - dt);
    const { e, f } = this.eyeRay();
    if (t === 'cutter') {
      this.cutTimer -= dt;
      this.recoil = Math.max(this.recoil, 0.15);
      const hit = g.destruction.pick(e, f, 2.4, g.player.collider);
      if (!hit) return;
      g.fx.sparksAt(hit.point, 3, hit.normal, 1.3);
      g.renderer.flash(hit.point, 0x9fd8ff, 14, 0.06, 0.5);
      if (this.cutTimer > 0) return;
      this.cutTimer = 0.045;
      if (hit.kind === 'world' || hit.kind === 'body') {
        const p = [hit.point[0] + f[0] * 0.06, hit.point[1] + f[1] * 0.06, hit.point[2] + f[2] * 0.06];
        g.destruction.carve(p, [0.21, 0.21, 0.21], { heat: g.time, ignite: 0.08, chips: 0.3, chipVel: 2 });
        g.audio.cutter(hit.point);
      }
    } else {
      this.sprayTimer -= dt;
      g.fire.extinguish(e, f, 6.5, 0.9);
      for (let i = 0; i < 3; i++) {
        const s = 6 + Math.random() * 3;
        const j = () => (Math.random() - 0.5) * 1.6;
        g.fx.mist([e[0] + f[0] * 0.6, e[1] + f[1] * 0.6 - 0.15, e[2] + f[2] * 0.6], [f[0] * s + j(), f[1] * s + j(), f[2] * s + j()]);
      }
      if (this.sprayTimer <= 0) {
        g.audio.spray();
        this.sprayTimer = 0.1;
      }
    }
  }

  // Right mouse: pick up light objects and carry them; left click throws.
  updateCarry(dt, input) {
    const g = this.g;
    if (this.carry) {
      const c = this.carry;
      const rb = c.rb;
      if (!rb || !rb.isValid() || !input.alt || !g.player.alive || (c.body && !g.debris.bodies.has(c.body.id))) {
        this.drop();
        return;
      }
      const { e, f } = this.eyeRay();
      const target = [e[0] + f[0] * c.dist, e[1] + f[1] * c.dist, e[2] + f[2] * c.dist];
      const com = rb.worldCom();
      const d = [target[0] - com.x, target[1] - com.y, target[2] - com.z];
      const len = Math.hypot(...d);
      if (len > 3) {
        this.drop(); // snagged on something
        return;
      }
      const k = 12;
      rb.setLinvel({ x: d[0] * k, y: d[1] * k, z: d[2] * k }, true);
      const av = rb.angvel();
      rb.setAngvel({ x: av.x * 0.85, y: av.y * 0.85, z: av.z * 0.85 }, true);
      if (input.firePressed) {
        const m = rb.mass();
        const s = Math.min(16, 3000 / Math.max(m, 1));
        rb.setLinvel({ x: f[0] * s, y: f[1] * s + 1, z: f[2] * s }, true);
        this.drop();
        this.cooldown = 0.3;
        g.audio.swing();
      }
      return;
    }
    if (!input.altPressed || !g.player.alive) return;
    const { e, f } = this.eyeRay();
    const hit = g.destruction.pick(e, f, GRAB_RANGE, g.player.collider);
    if (!hit || (hit.kind !== 'body' && hit.kind !== 'target')) return;
    const rb = hit.ref.rb;
    if (!rb) return;
    if (rb.mass() > GRAB_MAX_KG) {
      g.hud.toast('Too heavy to carry');
      return;
    }
    this.carry = { rb, body: hit.kind === 'body' ? hit.ref : null, dist: Math.max(1.4, Math.min(2.4, hit.dist)) };
    g.player.ignoreCollider = hit.kind === 'body' ? hit.ref.collider : hit.ref.col;
    rb.wakeUp();
  }

  drop() {
    this.carry = null;
    this.g.player.ignoreCollider = null;
  }

  updateProjectiles(dt) {
    const g = this.g;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.type === 'bomb') {
        pr.fuse -= dt;
        const t = pr.rb.translation(), q = pr.rb.rotation();
        pr.mesh.position.set(t.x, t.y, t.z);
        pr.mesh.quaternion.set(q.x, q.y, q.z, q.w);
        pr.blink -= dt;
        if (pr.blink <= 0) {
          pr.blink = Math.max(0.08, pr.fuse * 0.18);
          g.fx.glow.emit([t.x, t.y + 0.15, t.z], [0, 0, 0], 0.08, 0.25, 0.2, [10, 1, 0.5], 1);
        }
        if (pr.fuse <= 0 || t.y < -5) {
          g.physics.unregister(pr.col);
          g.physics.pw.removeRigidBody(pr.rb);
          g.renderer.scene.remove(pr.mesh);
          this.projectiles.splice(i, 1);
          if (t.y > -5) g.explode([t.x, t.y, t.z], 1);
        }
      } else {
        pr.life -= dt;
        const step = Math.hypot(...pr.v) * dt;
        const d = norm(pr.v);
        const hit = g.destruction.pick(pr.p, d, step + 0.05, g.player.collider);
        pr.trail -= dt;
        if (pr.trail <= 0) {
          pr.trail = 0.012;
          g.fx.trail(pr.p);
        }
        if (hit || pr.life <= 0 || pr.p[1] < -5) {
          g.renderer.scene.remove(pr.mesh);
          pr.mesh.geometry.dispose();
          this.projectiles.splice(i, 1);
          const at = hit ? [hit.point[0] - d[0] * 0.1, hit.point[1] - d[1] * 0.1, hit.point[2] - d[2] * 0.1] : pr.p;
          g.explode(at, 1.45);
          continue;
        }
        pr.v[1] -= 1.5 * dt; // slight drop
        pr.p = [pr.p[0] + pr.v[0] * dt, pr.p[1] + pr.v[1] * dt, pr.p[2] + pr.v[2] * dt];
        pr.mesh.position.set(...pr.p);
        pr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d));
        g.renderer.flash(pr.p, 0xffa040, 8, 0.03);
      }
    }
  }

  updateViewmodel(dt, input) {
    const g = this.g;
    const m = this.models[this.tool];
    const base = m.userData.base;
    // Sway lags mouse motion; bob follows the player's step cycle.
    this.sway[0] += ((input.lookDX || 0) * -0.0006 - this.sway[0]) * Math.min(1, dt * 10);
    this.sway[1] += ((input.lookDY || 0) * 0.0006 - this.sway[1]) * Math.min(1, dt * 10);
    const bob = g.player.bob;
    const moving = Math.hypot(g.player.vel[0], g.player.vel[2]) > 0.5 && g.player.grounded ? 1 : 0;
    m.position.copy(base.p);
    m.rotation.copy(base.r);
    m.position.x += this.sway[0] + Math.cos(bob * 0.5) * 0.012 * moving;
    m.position.y += this.sway[1] + Math.abs(Math.sin(bob * 0.5)) * 0.012 * moving - this.recoil * 0.03;
    m.position.z += this.recoil * 0.09;
    m.rotation.x += this.recoil * 0.25;
    const a = this.anim;
    if (this.tool === 'hammer' || this.tool === 'bomb') {
      // Wind-up then strike.
      const s = a > 0.6 ? (1 - a) / 0.4 : a / 0.6;
      m.rotation.x -= s * 1.3;
      m.position.y += s * 0.08;
    } else if (a > 0) {
      m.position.y -= a * a * 0.3;
    }
    if (this.tool === 'cutter') {
      const tip = m.userData.tip;
      tip.material.emissiveIntensity = input.fire && this.ammo.cutter > 0 ? 18 + Math.random() * 10 : 4;
    }
    if (this.carry) m.position.y -= 0.25;
  }

  clear() {
    for (const pr of this.projectiles) {
      this.g.renderer.scene.remove(pr.mesh);
      if (pr.rb) {
        this.g.physics.unregister(pr.col);
        this.g.physics.pw.removeRigidBody(pr.rb);
      }
    }
    this.projectiles = [];
    this.drop();
  }
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
