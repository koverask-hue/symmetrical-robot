// Kill finishers: what happens to a captured piece. Each one owns the victim from the moment it starts,
// resolves its promise once the square is clear, and may keep playing (glass repair, rubble) afterwards.
import * as THREE from '../vendor/three.module.js';
import { PIECE_HEIGHT } from './pieces.js';

const ease = {
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};
const UP = new THREE.Vector3(0, 1, 0);
const MAGIC = { w: 0xffd27a, b: 0x9b7bff };
const DUST = { w: 0xe9dfcc, b: 0x7c6aa8 };

// Kill styles. Classic keeps every capture under a second; Insane adds slow motion, camera moves and callouts.
export const KILL_STYLES = [
  { id: 'classic', label: 'Classic' },
  { id: 'brutal', label: 'Brutal' },
  { id: 'insane', label: 'Insane' },
];

const POOLS = {
  brutal: {
    p: ['shatter', 'punt', 'freeze'],
    n: ['punt', 'slam', 'shatter'],
    b: ['disintegrate', 'freeze', 'shatter'],
    r: ['slam', 'punt', 'shatter'],
    q: ['disintegrate', 'freeze', 'tornado'],
    k: ['slam', 'punt', 'shatter'],
  },
  insane: {
    p: ['punt', 'orbit', 'defenestrate', 'freeze', 'shatter'],
    n: ['orbit', 'slam', 'defenestrate', 'punt', 'tornado'],
    b: ['smite', 'disintegrate', 'exorcism', 'freeze', 'blackhole'],
    r: ['slam', 'defenestrate', 'punt', 'meteor'],
    q: ['blackhole', 'meteor', 'smite', 'tornado', 'disintegrate', 'exorcism'],
    k: ['meteor', 'orbit', 'slam', 'smite'],
  },
};
// Taking a queen, or delivering mate, always earns one of the big ones.
const MARQUEE = ['meteor', 'blackhole', 'orbit', 'defenestrate', 'smite'];
const FINALE = ['meteor', 'smite', 'blackhole', 'orbit', 'exorcism', 'tornado', 'disintegrate'];

// kind: 'physical' kills are delivered by a strike (or a telekinetic bolt); 'magic' kills are cast.
const KILLS = {
  shatter: { kind: 'physical', callout: 'Shattered' },
  punt: { kind: 'physical', callout: 'Bowled over' },
  orbit: { kind: 'physical', callout: 'Sent to orbit' },
  defenestrate: { kind: 'physical', callout: 'Defenestrated' },
  slam: { kind: 'physical', callout: 'Banished' },
  freeze: { kind: 'magic', callout: 'Frozen solid' },
  smite: { kind: 'magic', callout: 'Smitten' },
  disintegrate: { kind: 'magic', callout: 'Erased' },
  exorcism: { kind: 'magic', callout: 'Exorcised' },
  tornado: { kind: 'magic', callout: 'Twisted' },
  blackhole: { kind: 'magic', callout: 'Spaghettified' },
  meteor: { kind: 'magic', callout: "Meteor'd" },
};

export function killInfo(id) {
  return KILLS[id];
}

export class Finishers {
  constructor(anim) {
    this.a = anim;
    this.recent = [];
    this.textures = {};
  }

  get fx() {
    return this.a.fx;
  }

  get stage() {
    return this.a.stage;
  }

  get scene() {
    return this.a.stage.scene;
  }

  pick(attacker, victim, { style = 'insane', finale = false, force = null } = {}) {
    if (force && KILLS[force]) return force;
    if (style === 'classic') return 'shatter';
    let pool;
    if (finale) pool = FINALE;
    else if (style === 'insane' && victim.type === 'q') pool = MARQUEE;
    else pool = POOLS[style]?.[attacker?.type ?? 'q'] ?? POOLS.insane.q;
    const avoid = this.recent.slice(0, Math.min(3, pool.length - 1));
    const fresh = pool.filter((k) => !avoid.includes(k));
    const choices = fresh.length ? fresh : pool;
    const id = choices[Math.floor(Math.random() * choices.length)];
    this.recent = [id, ...this.recent].slice(0, 3);
    return id;
  }

  // Plays a finisher. ctx: { victim, attacker, dir, style }. Resolves when the victim has left its square.
  run(id, ctx) {
    ctx.victim.token++; // stop the brace animation; the finisher owns the victim now
    ctx.at = ctx.victim.root.position.clone().setY(0);
    ctx.cine = ctx.style === 'insane';
    ctx.loud = ctx.style !== 'classic';
    if (!ctx.dir || ctx.dir.lengthSq() < 1e-6) ctx.dir = this.#awayFromCamera(ctx.at);
    if (ctx.loud) this.a.ui?.callout?.(KILLS[id].callout);
    return this[id](ctx);
  }

  // ---- shared helpers -----------------------------------------------------

  #awayFromCamera(at) {
    const cam = this.stage.camera.position;
    return new THREE.Vector3(at.x - cam.x, 0, at.z - cam.z).normalize();
  }

  #impact(ctx, { stop = 0.08, slow = 0, slowFor = 0, shake = 1, flash = null, flashStrength = 0.5 } = {}) {
    if (ctx.loud) this.a.slowmo(0.04, stop);
    if (ctx.cine && slow) this.a.slowmo(slow, slowFor);
    this.stage.rig.shake = Math.max(this.stage.rig.shake, shake);
    if (flash && ctx.loud) this.a.ui?.flash?.(flash, flashStrength);
  }

  #cam(ctx, target, opts) {
    if (ctx.cine) this.stage.rig.cinematic({ target, ...opts });
  }

  // Re-parents the victim under a pivot at its centre so it can tumble like a real object.
  #pivot(victim) {
    const h = PIECE_HEIGHT[victim.type] * 0.5;
    victim.root.updateWorldMatrix(true, false);
    const pivot = new THREE.Group();
    pivot.position.copy(victim.root.position).add(new THREE.Vector3(0, h, 0));
    this.scene.add(pivot);
    pivot.attach(victim.root);
    return pivot;
  }

  #discard(victim, holder = null) {
    this.scene.remove(holder ?? victim.root);
    if (holder) holder.remove(victim.root);
    victim.material.dispose();
  }

  #shatter(victim, dir, opts = {}, holder = null) {
    this.fx.shatter(victim, dir, opts);
    this.#discard(victim, holder);
    this.a.sound.play('shatter');
  }

  #trail(obj, color, { count = 2, size = 0.09, life = 0.5 } = {}) {
    const p = new THREE.Vector3();
    return () => {
      obj.getWorldPosition(p);
      this.fx.burst(p, { count, color, speed: 0.4, size, life, gravity: 0, additive: true });
    };
  }

  #neighbours(at, radius) {
    const out = [];
    for (const v of this.a.views.values()) {
      const d = Math.hypot(v.root.position.x - at.x, v.root.position.z - at.z);
      if (d > 0.1 && d < radius) out.push({ v, d, dir: new THREE.Vector3(v.root.position.x - at.x, 0, v.root.position.z - at.z).normalize() });
    }
    return out;
  }

  #texture(name, draw) {
    if (!this.textures[name]) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      draw(c.getContext('2d'), 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      this.textures[name] = t;
    }
    return this.textures[name];
  }

  #radial(name, stops) {
    return this.#texture(name, (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      for (const [o, c] of stops) grad.addColorStop(o, c);
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    });
  }

  // Simple spiralling particle field used by the tornado and the black hole.
  #swirl({ center, count = 220, color, size = 0.08, life = 2.5, radius = (h) => 0.4 + h * 0.3, height = 3, inward = 0, rise = 1.6, spin = 5 }) {
    const pos = new Float32Array(count * 3);
    const parts = Array.from({ length: count }, () => ({ a: Math.random() * Math.PI * 2, h: Math.random() * height, r: Math.random() }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size, color, map: this.fx.dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    const state = { intensity: 1, stop: false };
    this.fx.every((dt, age) => {
      const fade = Math.min(1, age / 0.3) * Math.max(0, 1 - Math.max(0, age - life + 0.5) / 0.5);
      mat.opacity = fade;
      parts.forEach((p, i) => {
        p.a += dt * spin * state.intensity * (1.5 - p.r * 0.5) * (inward ? 1 + (1 - p.r) * 3 : 1);
        if (inward) {
          p.r -= dt * inward * state.intensity;
          if (p.r < 0.03) p.r = 1;
        } else {
          p.h += dt * rise * state.intensity;
          if (p.h > height) p.h = 0;
        }
        const r = inward ? radius(p.r) : radius(p.h) * (0.7 + 0.3 * p.r);
        pos[i * 3] = center.x + Math.cos(p.a) * r;
        pos[i * 3 + 1] = center.y + (inward ? (Math.random() - 0.5) * 0.05 * r : p.h);
        pos[i * 3 + 2] = center.z + Math.sin(p.a) * r;
      });
      geo.attributes.position.needsUpdate = true;
      if (age >= life || state.stop) {
        this.scene.remove(pts);
        geo.dispose();
        mat.dispose();
        return false;
      }
    });
    return state;
  }

  // ---- the finishers ------------------------------------------------------

  async shatter({ victim, dir, loud }) {
    victim.material.emissive.set(0xffffff).multiplyScalar(1.6);
    await this.a.wait(0.05);
    this.#impact({ loud }, { stop: 0.06, shake: 1 });
    this.#shatter(victim, dir);
  }

  // Kicked across the board like a bowling pin, knocking into everything in its way.
  async punt(ctx) {
    const { victim, dir } = ctx;
    const pivot = this.#pivot(victim);
    this.#impact(ctx, { stop: 0.09, shake: 0.8 });
    this.a.sound.play('land', 1);
    this.a.sound.play('whoosh');
    const hit = new Set();
    const w = new THREE.Vector3().crossVectors(UP, dir).normalize().multiplyScalar(15).add(new THREE.Vector3().randomDirection().multiplyScalar(4));
    this.fx.body(pivot, {
      v: dir.clone().multiplyScalar(9.5).add(new THREE.Vector3(0, 4.2, 0)),
      w, radius: 0.3, restitution: 0.5, friction: 0.82, life: 4.5,
      onBounce: (b, imp) => {
        this.a.sound.play('land', Math.min(1, imp / 6));
        this.fx.landPuff(pivot.position, DUST[victim.color]);
      },
      onStep: (b) => {
        if (pivot.position.y < 1.6) {
          for (const v of this.a.views.values()) {
            if (hit.has(v)) continue;
            const dx = v.root.position.x - pivot.position.x, dz = v.root.position.z - pivot.position.z;
            if (dx * dx + dz * dz < 0.36) {
              hit.add(v);
              this.a.wobble(v, new THREE.Vector3(dx, 0, dz).normalize(), 0.9);
              this.a.sound.play('land', 0.8);
              b.v.multiplyScalar(0.8);
              b.v.y += 2;
            }
          }
        }
        if (Math.abs(pivot.position.x) > 24 || Math.abs(pivot.position.z) > 26) return false;
      },
      onDone: () => this.#discard(victim, pivot),
    });
    await this.a.wait(0.25);
  }

  // Launched straight up, through the vault. Rubble rains down and moonlight pours through the hole.
  async orbit(ctx) {
    const { victim, dir, at } = ctx;
    const pivot = this.#pivot(victim);
    this.#impact(ctx, { stop: 0.12, shake: 1.2, flash: '#ffffff', flashStrength: 0.35 });
    this.a.sound.play('whistle');
    this.#cam(ctx, new THREE.Vector3(at.x, 22, at.z), { radius: 22, polar: 2.0, hold: 2.6 });
    const trail = this.#trail(pivot, MAGIC[victim.color], { count: 3 });
    const ROOF = 35.5;
    this.fx.body(pivot, {
      v: dir.clone().multiplyScalar(2.2).add(new THREE.Vector3(0, 27, 0)),
      w: new THREE.Vector3().randomDirection().multiplyScalar(22), gravity: -2, collide: false, life: 5,
      onStep: () => {
        trail();
        if (pivot.position.y >= ROOF) {
          this.#roofBreak(pivot.position.clone().setY(ROOF));
          return false;
        }
      },
      onDone: () => this.#discard(victim, pivot),
    });
    await this.a.wait(0.3);
  }

  #roofBreak(p) {
    this.a.sound.play('rumble');
    this.a.sound.play('shatter');
    this.fx.rubble(p, { count: 24, size: 0.7, speed: 2.5, spread: 2, life: 5 });
    this.fx.burst(p, { count: 120, color: 0x8a8a92, speed: 4, size: 0.5, life: 2.5, gravity: -2 });
    this.fx.pulse(p.clone().setY(p.y - 2), 0xbfd0ff, 80);
    // Moonlight through the new hole.
    const len = p.y + 1.2;
    const geo = new THREE.CylinderGeometry(0.9, 1.8, len, 24, 1, true);
    geo.translate(0, -len / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.copy(p);
    this.scene.add(beam);
    this.fx.every((dt, age) => {
      mat.opacity = 0.16 * Math.min(1, age * 3) * Math.max(0, 1 - Math.max(0, age - 4) / 2);
      if (age > 6) {
        this.scene.remove(beam);
        geo.dispose();
        mat.dispose();
        return false;
      }
    });
    // A distant ping and a star where it left the atmosphere.
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.dot, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    star.position.copy(p).add(new THREE.Vector3(0, -1, 0));
    this.scene.add(star);
    this.fx.every((dt, age) => {
      const t = age - 0.9;
      if (t < 0) {
        star.scale.setScalar(0.001);
        return;
      }
      if (t < 0.05) this.a.sound.play('ping');
      const k = Math.max(0, 1 - t / 0.9);
      star.scale.setScalar(4 * Math.sin(Math.min(1, t * 6) * Math.PI * 0.5) * k + 0.001);
      star.material.rotation = t * 3;
      if (t > 0.9) {
        this.scene.remove(star);
        star.material.dispose();
        return false;
      }
    });
  }

  // Thrown clean through a stained-glass window. The window reassembles itself a few seconds later.
  async defenestrate(ctx) {
    const win = this.#pickWindow(ctx.at);
    if (!win) return this.punt(ctx);
    const { victim, at } = ctx;
    const pivot = this.#pivot(victim);
    const T = 1.25;
    const g = -9;
    const target = win.center.clone().addScaledVector(win.normal, -0.5);
    const v = target.clone().sub(pivot.position).divideScalar(T).add(new THREE.Vector3(0, -0.5 * g * T, 0));
    this.#impact(ctx, { stop: 0.1, shake: 0.9 });
    this.a.sound.play('whoosh');
    if (ctx.cine) {
      const mid = at.clone().lerp(win.center, 0.45);
      const az = Math.atan2(at.x - win.center.x, at.z - win.center.z);
      this.#cam(ctx, mid, { radius: Math.max(14, at.distanceTo(win.center) * 0.75), polar: 1.3, azimuth: az, hold: T + 1.4 });
    }
    const trail = this.#trail(pivot, MAGIC[victim.color]);
    let smashed = false;
    this.fx.body(pivot, {
      v, w: new THREE.Vector3().randomDirection().multiplyScalar(14), gravity: g, collide: false, life: T + 1,
      onStep: (b) => {
        trail();
        if (!smashed && b.age >= T) {
          smashed = true;
          this.#breakWindow(win);
          b.v.multiplyScalar(0.4);
        }
        if (smashed && b.age > T + 0.3) return false;
      },
      onDone: () => this.#discard(victim, pivot),
    });
    await this.a.wait(0.3);
  }

  #pickWindow(at) {
    const all = (this.stage.windows || []).filter((w) => !w.broken);
    if (!all.length) return null;
    const cam = this.stage.camera;
    cam.updateMatrixWorld();
    const visible = all.filter((w) => {
      const p = w.center.clone().project(cam);
      return p.z < 1 && Math.abs(p.x) < 0.95 && Math.abs(p.y) < 1.1;
    });
    const pool = visible.length ? visible : all;
    // Prefer something not absurdly far away.
    pool.sort((a, b) => a.center.distanceTo(at) - b.center.distanceTo(at));
    const near = pool.slice(0, Math.min(4, pool.length));
    return near[Math.floor(Math.random() * near.length)];
  }

  #breakWindow(win) {
    win.broken = true;
    const mat = win.mesh.material;
    const base = mat.color.clone();
    win.mesh.visible = false;
    this.fx.glass(win.center, { width: win.width, height: win.height, normal: win.normal, count: 90 });
    this.fx.pulse(win.center.clone().addScaledVector(win.normal, 1.5), 0x9fb4ff, 120);
    this.a.sound.play('glass');
    this.a.sound.play('shatter');
    this.stage.rig.shake = Math.max(this.stage.rig.shake, 0.7);
    // Mend it with a little magic once everyone has stopped looking.
    this.fx.every((dt, age) => {
      if (age < 7) return;
      if (!win.mesh.visible) {
        win.mesh.visible = true;
        this.fx.burst(win.center, { count: 60, color: 0xbfd0ff, speed: 1.5, size: 0.2, life: 1.2, gravity: 0, additive: true });
        this.a.sound.play('chime');
      }
      const k = Math.min(1, (age - 7) / 1.2);
      mat.color.copy(base).multiplyScalar(k);
      if (k >= 1) {
        win.broken = false;
        return false;
      }
    });
  }

  // Stamped through the board into a burning abyss.
  async slam(ctx) {
    const { victim, at } = ctx;
    const tex = this.#radial('abyss', [[0, '#000000'], [0.55, '#050000'], [0.72, '#ff3a10'], [0.85, '#ffb040'], [1, 'rgba(255,120,30,0)']]);
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.6) }),
    );
    disc.position.set(at.x, 0.01, at.z);
    disc.scale.setScalar(0.001);
    this.scene.add(disc);
    const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    victim.material.clippingPlanes = [clip];
    victim.material.needsUpdate = true;
    this.#impact(ctx, { stop: 0.09, shake: 1.3 });
    this.a.sound.play('rumble');
    this.#cam(ctx, at.clone().setY(0.5), { radius: 9, polar: 0.85, hold: 1.8 });
    const embers = this.fx.every((dt, age) => {
      if (age > 1.8) return false;
      this.fx.burst(at.clone().setY(0.05), { count: 4, color: 0xff7a30, speed: 0.8, size: 0.08, life: 0.9, gravity: 3, additive: true });
      if (Math.random() < 0.3) this.fx.pulse(at, 0xff4a20, 20 + Math.random() * 20);
    });
    await this.a.tween(0.25, (t) => disc.scale.setScalar(Math.max(0.001, ease.out(t))));
    this.a.sound.play('void');
    let spin = 0;
    await this.a.tween(1.0, (t) => {
      spin += 0.3 + t * 0.8;
      victim.root.position.y = -1.7 * ease.in(t);
      victim.pose.rotation.y = spin;
      victim.pose.position.x = Math.sin(this.a.time * 80) * 0.03 * (1 - t);
      victim.material.emissive.set(0xff4010).multiplyScalar(0.8 * t);
    });
    this.#discard(victim);
    embers.age = 99;
    await this.a.tween(0.3, (t) => disc.scale.setScalar(Math.max(0.001, 1 - ease.in(t))));
    this.scene.remove(disc);
    disc.geometry.dispose();
    disc.material.dispose();
    this.fx.ring(at, 0xff5a20, { radius: 2.2, duration: 0.6 });
    this.fx.scorch(at, { radius: 0.7, duration: 6 });
  }

  // Encased in ice, then tapped into a thousand pieces.
  async freeze(ctx) {
    const { victim, dir, at } = ctx;
    const m = victim.material;
    this.a.sound.play('freeze');
    this.fx.burst(at.clone().setY(0.5), { count: 80, color: 0xcfeaff, speed: 2, size: 0.07, life: 0.8, gravity: 0, additive: true });
    this.fx.burst(at.clone().setY(0.1), { count: 50, color: 0xffffff, speed: 0.6, size: 0.35, life: 1.6, gravity: 0.2, up: 0.2 });
    const from = m.color.clone();
    const to = new THREE.Color(0xcfeaff);
    m.map = null;
    m.roughnessMap = null;
    m.needsUpdate = true;
    await this.a.tween(0.55, (t) => {
      m.color.copy(from).lerp(to, t);
      m.roughness = 0.3 - 0.27 * t;
      m.metalness = 0;
      m.emissive.set(0x5aa8ff).multiplyScalar(0.35 * t);
      victim.pose.scale.set(1 + 0.04 * t, 1 + 0.02 * t, 1 + 0.04 * t);
    }, ease.out);
    await this.a.tween(0.35, () => {
      victim.pose.position.x = Math.sin(this.a.time * 90) * 0.01;
    });
    this.#impact(ctx, { stop: 0.1, slow: 0.35, slowFor: 0.35, shake: 1.1, flash: '#d8efff', flashStrength: 0.3 });
    this.fx.burst(at.clone().setY(0.6), { count: 90, color: 0xe6f6ff, speed: 4, size: 0.06, life: 0.9, gravity: -6, additive: true });
    this.a.sound.play('glass');
    this.#shatter(victim, dir, { pieces: 40, force: 1.3 });
  }

  // Lightning out of the vault, then the charred husk crumbles to ash.
  async smite(ctx) {
    const { victim, at } = ctx;
    const top = new THREE.Vector3(at.x, PIECE_HEIGHT[victim.type] + 0.05, at.z);
    this.#cam(ctx, at.clone().setY(2.5), { radius: 11, polar: 1.15, hold: 2.2 });
    for (let i = 0; i < 3; i++) {
      this.#bolt(new THREE.Vector3(at.x + (Math.random() - 0.5) * 3, 30, at.z + (Math.random() - 0.5) * 3), top);
      this.fx.pulse(top, 0xcfe0ff, 70);
      this.a.ui?.flash?.('#e8f0ff', i === 0 ? 0.4 : 0.2);
      if (i === 0) {
        this.a.sound.play('thunder');
        this.#impact(ctx, { stop: 0.12, shake: 1.6 });
        victim.material.map = null;
        victim.material.needsUpdate = true;
        victim.material.color.set(0x0c0c0c);
        victim.material.roughness = 1;
        victim.material.clearcoat = 0;
      }
      this.fx.burst(top, { count: 40, color: 0xcfe0ff, speed: 4, size: 0.06, life: 0.4, gravity: -5, additive: true });
      await this.a.wait(0.16);
    }
    this.fx.scorch(at, { radius: 1.1 });
    // Glowing cracks, then ash.
    await this.a.tween(0.5, (t) => {
      victim.material.emissive.set(0xff5010).multiplyScalar((0.6 + 0.4 * Math.sin(this.a.time * 40)) * (1 - t * 0.5));
    });
    await this.#dissolve(victim, { color: 0x2b2a2a, additive: false, ember: 0xff6a20, duration: 1.0 });
  }

  #bolt(from, to) {
    const n = 14;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = from.clone().lerp(to, t);
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6).multiplyScalar(Math.sin(Math.PI * t)));
      pts.push(p);
    }
    const path = new THREE.CurvePath();
    for (let i = 0; i < n; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.88, 1).multiplyScalar(3), fog: false });
    const meshes = [new THREE.Mesh(new THREE.TubeGeometry(path, n * 2, 0.06, 5, false), mat)];
    // A couple of forks.
    for (let k = 0; k < 2; k++) {
      const s = pts[3 + Math.floor(Math.random() * 6)];
      const e = s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, -3 - Math.random() * 4, (Math.random() - 0.5) * 6));
      meshes.push(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(s, e), 4, 0.03, 4, false), mat));
    }
    for (const m of meshes) this.scene.add(m);
    this.fx.every((dt, age) => {
      for (const m of meshes) m.visible = age < 0.05 || (age > 0.08 && age < 0.13);
      if (age > 0.16) {
        for (const m of meshes) {
          this.scene.remove(m);
          m.geometry.dispose();
        }
        mat.dispose();
        return false;
      }
    });
  }

  // Wiped out of existence from the top down, drifting away as dust.
  async disintegrate(ctx) {
    const { victim } = ctx;
    this.a.sound.play('dissolve');
    victim.material.emissive.set(MAGIC[victim.color]).multiplyScalar(0.6);
    await this.#dissolve(victim, { color: MAGIC[victim.color], additive: true, duration: 1.5 });
  }

  async #dissolve(victim, { color, additive, ember = null, duration = 1.4 }) {
    const top = PIECE_HEIGHT[victim.type] + 0.1;
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), top);
    victim.material.clippingPlanes = [plane];
    victim.material.needsUpdate = true;
    const base = victim.root.position.clone();
    const wind = new THREE.Vector3(0.6, 0.5, -0.3);
    await this.a.tween(duration, (t) => {
      const h = top * (1 - t);
      plane.constant = h + base.y;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.12 + Math.random() * 0.2;
        const p = new THREE.Vector3(base.x + Math.cos(a) * r, base.y + h, base.z + Math.sin(a) * r);
        this.fx.burst(p, { count: 3, color, speed: 0.5, size: additive ? 0.07 : 0.09, life: 1.4, gravity: 0.6, additive });
        if (ember && Math.random() < 0.4) this.fx.burst(p, { count: 1, color: ember, speed: 0.4, size: 0.06, life: 0.8, gravity: 1.2, additive: true });
      }
      // Drift the freshest dust downwind.
      const last = this.fx.bursts[this.fx.bursts.length - 1];
      if (last) for (const v of last.vel) v.add(wind);
    }, ease.inOut);
    this.#discard(victim);
  }

  // The soul is torn out and flies off; the stone body crumbles.
  async exorcism(ctx) {
    const { victim, at } = ctx;
    this.a.sound.play('wail');
    this.#cam(ctx, at.clone().setY(3), { radius: 11, polar: 1.25, hold: 2.4 });
    await this.a.tween(0.5, (t) => {
      victim.pose.position.x = Math.sin(this.a.time * 70) * 0.025 * t;
      victim.material.emissive.set(0xbfe8ff).multiplyScalar(0.8 * t);
    });
    victim.root.updateWorldMatrix(true, true);
    const ghost = victim.body.clone(true);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    ghost.traverse((m) => {
      if (m.isMesh) {
        m.material = ghostMat;
        m.castShadow = false;
      }
    });
    victim.body.matrixWorld.decompose(ghost.position, ghost.quaternion, ghost.scale);
    this.scene.add(ghost);
    const start = ghost.position.clone();
    // The husk turns to plain stone.
    const m = victim.material;
    m.map = null;
    m.needsUpdate = true;
    m.color.set(0x5d5d62);
    m.roughness = 1;
    m.clearcoat = 0;
    m.emissive.set(0x000000);
    const trail = this.#trail(ghost, 0x9fdcff, { count: 1, size: 0.12, life: 0.8 });
    this.fx.every((dt, age) => {
      const t = Math.min(1, age / 2.4);
      ghost.position.set(start.x + Math.sin(age * 5) * 0.3 * t, start.y + 8 * ease.out(t), start.z + Math.cos(age * 4) * 0.2 * t);
      ghost.scale.setScalar(1 + 0.6 * t);
      ghost.rotation.y += dt * 2;
      ghostMat.opacity = 0.55 * (1 - t);
      trail();
      if (t >= 1) {
        this.scene.remove(ghost);
        ghostMat.dispose();
        return false;
      }
    });
    await this.a.wait(0.7);
    this.#impact(ctx, { stop: 0.05, shake: 0.6 });
    this.#shatter(victim, new THREE.Vector3(), { pieces: 26, force: 0.25 });
  }

  // Sucked up into a whirlwind and blown apart at the top.
  async tornado(ctx) {
    const { victim, at } = ctx;
    this.a.sound.play('wind');
    this.#cam(ctx, at.clone().setY(2), { radius: 11, polar: 1.2, hold: 2.4 });
    this.#swirl({ center: at.clone(), count: 420, color: 0xe4e8f2, size: 0.14, life: 2.4, height: 4.6, spin: 7, rise: 2.4 });
    this.#swirl({ center: at.clone(), count: 260, color: MAGIC[victim.color], size: 0.1, life: 2.4, height: 4.6, spin: 9, rise: 3 });
    this.fx.every((dt, age) => {
      if (age > 1.7) return false;
      this.fx.burst(at.clone().setY(0.05), { count: 3, color: 0x8a8478, speed: 1.5, size: 0.3, life: 0.8, gravity: 0.5, up: 0.2 });
    });
    for (const n of this.#neighbours(at, 2.4)) this.a.wobble(n.v, n.dir.clone().negate(), 0.6);
    let spin = 0;
    await this.a.tween(1.6, (t) => {
      spin += 0.2 + t * 1.4;
      victim.root.position.y = 3.4 * ease.in(t);
      victim.pose.rotation.set(Math.sin(this.a.time * 7) * 0.5 * t, spin, Math.cos(this.a.time * 6) * 0.5 * t);
    });
    this.#impact(ctx, { stop: 0.1, slow: 0.3, slowFor: 0.4, shake: 1.2, flash: '#ffffff', flashStrength: 0.25 });
    const p = victim.root.position.clone().setY(victim.root.position.y + 0.5);
    this.#shatter(victim, new THREE.Vector3().randomDirection().setY(0).normalize(), { pieces: 30, force: 1.8 });
    for (const c of [0xffd27a, 0x9b7bff, 0x7fc4ff]) this.fx.burst(p, { count: 60, color: c, speed: 5, size: 0.1, life: 1.2, gravity: -3, additive: true });
  }

  // A black hole opens above the square, stretches the victim into spaghetti and swallows it.
  async blackhole(ctx) {
    const { victim, at } = ctx;
    const center = at.clone().setY(1.9);
    this.a.sound.play('void');
    this.#cam(ctx, center, { radius: 9.5, polar: 1.2, hold: 2.6 });
    const hole = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.dot, color: 0x8a5cff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const diskTex = this.#radial('disk', [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0)'], [0.5, '#ffd9a0'], [0.62, '#ff7a3a'], [0.8, '#7a3cff'], [1, 'rgba(60,20,160,0)']]);
    const disk = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: diskTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1.5, 1.5, 1.5) }));
    disk.rotation.x = -Math.PI / 2 + 0.35;
    const group = new THREE.Group();
    group.position.copy(center);
    group.add(hole, glow, disk);
    group.scale.setScalar(0.001);
    this.scene.add(group);
    const swirl = this.#swirl({ center, count: 260, color: 0xc7a6ff, size: 0.07, life: 2.6, inward: 0.9, radius: (r) => 0.35 + r * 2.4, spin: 3 });
    this.fx.every((dt, age) => {
      disk.rotateZ(dt * 3);
      glow.scale.setScalar(2.6 + 0.3 * Math.sin(age * 9));
      if (!group.parent) return false;
    });
    await this.a.tween(0.4, (t) => group.scale.setScalar(Math.max(0.001, ease.out(t))));
    for (const n of this.#neighbours(at, 3)) this.a.wobble(n.v, n.dir.clone().negate(), 0.8);
    const start = victim.root.position.clone();
    let spin = 0;
    await this.a.tween(1.3, (t) => {
      const e = ease.in(t);
      spin += 0.15 + t * 1.2;
      victim.root.position.lerpVectors(start, center.clone().setY(center.y - 0.4), e);
      const stretch = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
      victim.pose.scale.set((1 - 0.8 * t) * stretch + 0.001, (1 + 1.8 * t) * stretch + 0.001, (1 - 0.8 * t) * stretch + 0.001);
      victim.pose.rotation.y = spin;
      victim.material.emissive.set(0x8a5cff).multiplyScalar(t);
    });
    this.#discard(victim);
    swirl.intensity = 3;
    await this.a.tween(0.25, (t) => group.scale.setScalar(Math.max(0.001, 1 - ease.in(t))));
    this.scene.remove(group);
    swirl.stop = true;
    this.#impact(ctx, { stop: 0.12, slow: 0.35, slowFor: 0.4, shake: 1.6, flash: '#c9b0ff', flashStrength: 0.55 });
    this.a.sound.play('boom');
    this.fx.pulse(center, 0xb08cff, 140);
    this.fx.ring(at, 0xa07cff, { radius: 4.5, duration: 0.8 });
    this.fx.ring(center, 0xffffff, { radius: 3, duration: 0.5, y: center.y });
    this.fx.burst(center, { count: 160, color: 0xc7a6ff, speed: 7, size: 0.08, life: 1, gravity: 0, additive: true });
    for (const n of this.#neighbours(at, 3.2)) this.a.wobble(n.v, n.dir, 1 - n.d / 3.2);
  }

  // A burning meteor drops out of the sky onto the square.
  async meteor(ctx) {
    const { victim, at, dir } = ctx;
    const cam = this.stage.camera.position;
    const fwd = new THREE.Vector3(at.x - cam.x, 0, at.z - cam.z).normalize();
    const side = new THREE.Vector3().crossVectors(UP, fwd);
    // Comes in low over the far end of the nave so it is on screen the whole way down.
    const start = at.clone().addScaledVector(fwd, 20).addScaledVector(side, 4).setY(11);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.45, 0.15).multiplyScalar(3) }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.dot, color: 0xff8a30, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    glow.scale.setScalar(3);
    rock.add(glow);
    rock.position.copy(start);
    this.scene.add(rock);
    this.a.sound.play('incoming');
    this.#cam(ctx, at.clone().setY(2.5), { radius: 14, polar: 1.25, hold: 2.4 });
    // The victim looks up in horror.
    const lookUp = start.clone().sub(at).setY(0).normalize();
    this.a.tween(0.6, (t) => {
      this.a.lean(victim, lookUp, -0.35 * ease.out(t));
      victim.pose.position.x = Math.sin(this.a.time * 70) * 0.02 * t;
    });
    const end = at.clone().setY(0.4);
    await this.a.tween(0.9, (t) => {
      rock.position.lerpVectors(start, end, t);
      rock.rotation.x += 0.2;
      rock.rotation.y += 0.13;
      this.fx.burst(rock.position, { count: 6, color: 0xff7a20, speed: 0.6, size: 0.25, life: 0.6, gravity: 0, additive: true });
      if (Math.random() < 0.6) this.fx.burst(rock.position, { count: 2, color: 0x241e1c, speed: 0.3, size: 0.6, life: 1.6, gravity: 0.4 });
    }, ease.in);
    this.scene.remove(rock);
    rock.geometry.dispose();
    this.#impact(ctx, { stop: 0.14, slow: 0.3, slowFor: 0.5, shake: 2.2, flash: '#ffb070', flashStrength: 0.65 });
    this.a.sound.play('boom');
    this.a.sound.play('rumble');
    this.fx.pulse(at, 0xff7a30, 200);
    this.fx.ring(at, 0xff7a30, { radius: 5, duration: 0.8 });
    this.fx.ring(at, 0xffffff, { radius: 3, duration: 0.45, width: 0.12 });
    this.fx.scorch(at, { radius: 1.7, duration: 9 });
    this.fx.burst(at.clone().setY(0.3), { count: 180, color: 0xff8a30, speed: 7, size: 0.09, life: 1.4, gravity: -6, additive: true });
    this.fx.rubble(at.clone().setY(0.3), { count: 14, color: 0x2a2b33, size: 0.22, speed: 6, spread: 0.6, life: 3 });
    this.#shatter(victim, dir.clone().multiplyScalar(0.3), { pieces: 30, force: 2.2 });
    for (const n of this.#neighbours(at, 3.2)) this.a.wobble(n.v, n.dir, 1.2 * (1 - n.d / 3.2));
  }
}
