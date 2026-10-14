// Visual effects: fracturing pieces into physical shards, dust and ember bursts, spell bolts, impact flashes.
import * as THREE from '../vendor/three.module.js';
import { floorAt } from './scene.js';
import { softDotTexture } from './textures.js';

const GRAVITY = -14;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.shards = [];
    this.bursts = [];
    this.movers = [];
    this.dot = softDotTexture();
    this.flash = new THREE.PointLight(0xffffff, 0, 6, 2);
    scene.add(this.flash);
    this.flashLevel = 0;
    this.tasks = [];
    this.bodies = [];
  }

  // Runs fn(dt, age) every frame until it returns false.
  every(fn) {
    const task = { fn, age: 0 };
    this.tasks.push(task);
    return task;
  }

  // Expanding shockwave ring lying on the board (or any height).
  ring(at, color, { radius = 3, duration = 0.7, width = 0.25, y = 0.02 } = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 64).rotateX(-Math.PI / 2), mat);
    mesh.position.set(at.x, y, at.z);
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.every((dt, age) => {
      const t = age / duration;
      mesh.scale.setScalar(0.01 + radius * (1 - Math.pow(1 - Math.min(t, 1), 3)));
      mat.opacity = Math.max(0, 1 - t);
      if (t >= 1) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mat.dispose();
        return false;
      }
    });
  }

  // A burnt patch on the board that fades away.
  scorch(at, { radius = 1.2, duration = 8, color = 0x050302 } = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, map: this.dot, transparent: true, opacity: 0.9, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), mat);
    mesh.position.set(at.x, 0.012, at.z);
    this.scene.add(mesh);
    this.every((dt, age) => {
      mat.opacity = 0.9 * Math.max(0, 1 - Math.max(0, age - duration * 0.6) / (duration * 0.4));
      if (age >= duration) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mat.dispose();
        return false;
      }
    });
  }

  // Free rigid body: integrates position and spin, bounces off the floor, calls back on bounces and each step.
  body(obj, { v, w = new THREE.Vector3(), gravity = GRAVITY, collide = true, restitution = 0.45, friction = 0.75,
    radius = 0.3, life = 4, onBounce, onStep, onDone } = {}) {
    const b = { obj, v: v.clone(), w: w.clone(), gravity, collide, restitution, friction, radius, life, onBounce, onStep, onDone, age: 0, dead: false };
    this.bodies.push(b);
    return b;
  }

  // Falling blocks of stone (or any material) from a point.
  rubble(at, { count = 14, color = 0x55565f, size = 0.35, speed = 3, spread = 1, life = 4 } = {}) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    for (let i = 0; i < count; i++) {
      const s = size * (0.4 + Math.random() * 0.8);
      const geo = new THREE.BoxGeometry(s, s * (0.5 + Math.random()), s * (0.6 + Math.random() * 0.6));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      this.scene.add(mesh);
      this.shards.push({
        mesh, v: new THREE.Vector3().randomDirection().multiplyScalar(speed * Math.random()), w: new THREE.Vector3().randomDirection().multiplyScalar(6),
        r: geo.boundingSphere.radius, age: 0, life: life + Math.random(), resting: false,
      });
    }
  }

  // Coloured panes of stained glass bursting out of a window and raining down.
  glass(center, { width = 2, height = 6, normal = new THREE.Vector3(0, 0, 1), colors = [0x2a56c4, 0x1d3f9e, 0x9e1b2c, 0xb8862b], count = 70 } = {}) {
    const side = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
    const mats = colors.map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), side: THREE.DoubleSide }));
    for (let i = 0; i < count; i++) {
      const s = 0.12 + Math.random() * 0.28;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(s, Math.random() * s * 0.5, 0), new THREE.Vector3(Math.random() * s, s, 0),
      ]);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mats[i % mats.length]);
      mesh.position.copy(center).addScaledVector(side, (Math.random() - 0.5) * width).add(new THREE.Vector3(0, (Math.random() - 0.5) * height, 0));
      this.scene.add(mesh);
      this.shards.push({
        mesh, v: normal.clone().multiplyScalar(1 + Math.random() * 4).addScaledVector(side, (Math.random() - 0.5) * 4).add(new THREE.Vector3(0, Math.random() * 3, 0)),
        w: new THREE.Vector3().randomDirection().multiplyScalar(12), r: 0.05, age: 0, life: 3 + Math.random() * 2, resting: false,
      });
    }
  }

  // Splits every triangle of the piece into Voronoi-like chunks and throws them outward.
  shatter(piece, impactDir = new THREE.Vector3(), { pieces = 22, force = 1 } = {}) {
    piece.root.updateWorldMatrix(true, true);
    const tris = [];
    const bbox = new THREE.Box3();
    piece.body.traverse((m) => {
      if (!m.isMesh) return;
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
      const p = g.attributes.position.array;
      const n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i += 9) tris.push({ p: p.slice(i, i + 9), n: n.slice(i, i + 9) });
      g.computeBoundingBox();
      bbox.union(g.boundingBox);
      g.dispose();
    });
    const seeds = [];
    for (let i = 0; i < pieces; i++) {
      seeds.push(new THREE.Vector3(
        THREE.MathUtils.lerp(bbox.min.x, bbox.max.x, Math.random()),
        THREE.MathUtils.lerp(bbox.min.y, bbox.max.y, Math.pow(Math.random(), 0.8)),
        THREE.MathUtils.lerp(bbox.min.z, bbox.max.z, Math.random()),
      ));
    }
    const groups = seeds.map(() => ({ p: [], n: [] }));
    for (const t of tris) {
      const cx = (t.p[0] + t.p[3] + t.p[6]) / 3, cy = (t.p[1] + t.p[4] + t.p[7]) / 3, cz = (t.p[2] + t.p[5] + t.p[8]) / 3;
      let best = 0, bd = Infinity;
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        // Squash y so chunks come out as horizontal slabs and wedges, like stone breaking.
        const d = (s.x - cx) ** 2 + ((s.y - cy) * 1.6) ** 2 + (s.z - cz) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      groups[best].p.push(...t.p);
      groups[best].n.push(...t.n);
    }
    const center = bbox.getCenter(new THREE.Vector3());
    const mat = piece.material.clone();
    mat.side = THREE.DoubleSide;
    mat.emissive.setRGB(0, 0, 0);
    for (const g of groups) {
      if (!g.p.length) continue;
      const pos = new Float32Array(g.p);
      const c = new THREE.Vector3();
      for (let i = 0; i < pos.length; i += 3) c.add(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]));
      c.divideScalar(pos.length / 3);
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] -= c.x;
        pos[i + 1] -= c.y;
        pos[i + 2] -= c.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.n), 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(c);
      mesh.castShadow = true;
      this.scene.add(mesh);
      const out = c.clone().sub(center).setY(0).normalize();
      const v = out.multiplyScalar(1.2 + Math.random() * 2.2)
        .addScaledVector(impactDir, (2.2 + Math.random() * 2) * force)
        .add(new THREE.Vector3(0, 2.5 + Math.random() * 3.5 + (c.y - bbox.min.y) * 2, 0));
      this.shards.push({
        mesh, v, w: new THREE.Vector3().randomDirection().multiplyScalar(4 + Math.random() * 10),
        r: geo.boundingSphere.radius * 0.6, age: 0, life: 2.6 + Math.random() * 1.2, mat, resting: false,
      });
    }
    this.shardMat = mat;
    const dust = piece.color === 'w' ? 0xf3e8d4 : 0x8c6bff;
    this.burst(center, { count: 90, color: dust, speed: 3.2, size: piece.color === 'w' ? 0.16 : 0.09, life: 1.4, gravity: piece.color === 'w' ? -1 : -3, additive: piece.color !== 'w' });
    this.burst(center, { count: 40, color: 0xffffff, speed: 6, size: 0.05, life: 0.5, additive: true });
    this.pulse(center, piece.color === 'w' ? 0xffe7c4 : 0x9a7dff, 30);
  }

  burst(at, { count = 40, color = 0xffffff, speed = 2, size = 0.08, life = 1, gravity = -4, additive = false, up = 1 } = {}) {
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = at.x;
      pos[i * 3 + 1] = at.y;
      pos[i * 3 + 2] = at.z;
      const d = new THREE.Vector3().randomDirection();
      d.y = Math.abs(d.y) * up;
      vel.push(d.multiplyScalar(speed * (0.3 + Math.random() * 0.7)));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size, color, map: this.dot, transparent: true, opacity: 1, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.bursts.push({ pts, vel, age: 0, life, gravity });
  }

  // A small ring of dust when a piece lands.
  landPuff(at, color) {
    this.burst(at.clone().setY(0.03), { count: 26, color, speed: 1.4, size: 0.07, life: 0.7, gravity: 0.4, up: 0.15 });
  }

  pulse(at, color, intensity = 20) {
    this.flash.position.copy(at).add(new THREE.Vector3(0, 0.4, 0));
    this.flash.color.set(color);
    this.flashLevel = intensity;
  }

  // Spell bolt from `from` to `to`; resolves on arrival.
  bolt(from, to, color, duration = 0.32) {
    return new Promise((resolve) => {
      const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      orb.scale.setScalar(0.45);
      this.scene.add(orb);
      const ctrl = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.9, 0));
      const curve = new THREE.QuadraticBezierCurve3(from.clone(), ctrl, to.clone());
      this.movers.push({
        age: 0, duration,
        step: (t) => {
          curve.getPoint(t, orb.position);
          orb.material.rotation = t * 8;
          if (Math.random() < 0.9) this.burst(orb.position, { count: 3, color, speed: 0.4, size: 0.08, life: 0.35, gravity: 0, additive: true });
        },
        done: () => {
          this.scene.remove(orb);
          orb.material.dispose();
          this.burst(to, { count: 50, color, speed: 3, size: 0.09, life: 0.6, additive: true, gravity: 0 });
          this.pulse(to, color, 40);
          resolve();
        },
      });
    });
  }

  clearShards() {
    for (const s of this.shards) this.scene.remove(s.mesh);
    this.shards.length = 0;
  }

  update(dt) {
    this.flashLevel *= Math.exp(-dt * 7);
    this.flash.intensity = this.flashLevel;

    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i];
      task.age += dt;
      if (task.fn(dt, task.age) === false) this.tasks.splice(i, 1);
    }

    const axis = new THREE.Vector3();
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.age += dt;
      b.v.y += b.gravity * dt;
      b.obj.position.addScaledVector(b.v, dt);
      const spin = b.w.length();
      if (spin > 1e-4) b.obj.rotateOnWorldAxis(axis.copy(b.w).divideScalar(spin), spin * dt);
      if (b.collide) {
        const floor = floorAt(b.obj.position.x, b.obj.position.z) + b.radius;
        if (b.obj.position.y < floor && b.v.y < 0) {
          b.obj.position.y = floor;
          const impact = -b.v.y;
          b.v.y = impact > 1 ? impact * b.restitution : 0;
          b.v.x *= b.friction;
          b.v.z *= b.friction;
          b.w.multiplyScalar(0.7);
          if (impact > 1) b.onBounce?.(b, impact);
        }
      }
      if (b.onStep?.(b, dt) === false) b.dead = true;
      if (b.dead || b.age > b.life) {
        this.bodies.splice(i, 1);
        b.onDone?.(b);
      }
    }

    for (let i = this.movers.length - 1; i >= 0; i--) {
      const m = this.movers[i];
      m.age += dt;
      const t = Math.min(1, m.age / m.duration);
      m.step(t);
      if (t >= 1) {
        this.movers.splice(i, 1);
        m.done();
      }
    }

    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.age += dt;
      if (!s.resting) {
        s.v.y += GRAVITY * dt;
        s.mesh.position.addScaledVector(s.v, dt);
        s.mesh.rotation.x += s.w.x * dt;
        s.mesh.rotation.y += s.w.y * dt;
        s.mesh.rotation.z += s.w.z * dt;
        const floor = floorAt(s.mesh.position.x, s.mesh.position.z) + s.r * 0.5;
        if (s.mesh.position.y < floor) {
          s.mesh.position.y = floor;
          if (Math.abs(s.v.y) < 0.8) {
            s.resting = s.v.lengthSq() < 0.5;
            s.v.y = 0;
          } else {
            s.v.y = -s.v.y * 0.32;
          }
          s.v.x *= 0.6;
          s.v.z *= 0.6;
          s.w.multiplyScalar(0.55);
        }
      }
      const fadeStart = s.life - 0.8;
      if (s.age > fadeStart) {
        const k = 1 - (s.age - fadeStart) / 0.8;
        s.mesh.scale.setScalar(Math.max(0.001, k));
      }
      if (s.age > s.life) {
        this.scene.remove(s.mesh);
        s.mesh.geometry?.dispose();
        this.shards.splice(i, 1);
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      const a = b.pts.geometry.attributes.position.array;
      for (let k = 0; k < b.vel.length; k++) {
        const v = b.vel[k];
        v.y += b.gravity * dt;
        v.multiplyScalar(Math.exp(-dt * 1.8));
        a[k * 3] += v.x * dt;
        a[k * 3 + 1] = Math.max(0.01, a[k * 3 + 1] + v.y * dt);
        a[k * 3 + 2] += v.z * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.age / b.life);
      if (b.age >= b.life) {
        this.scene.remove(b.pts);
        b.pts.geometry.dispose();
        b.pts.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }
}
