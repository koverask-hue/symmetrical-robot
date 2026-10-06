import * as THREE from 'three';
import { meshVoxels, COLD } from '../mesher.js';
import { VOXEL } from '../materials.js';
import { CHUNK } from '../world.js';

const P = CHUNK + 2;

function makeGeometry(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(b.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(b.col, 3));
  g.setAttribute('surf', new THREE.BufferAttribute(b.surf, 3));
  g.setIndex(new THREE.BufferAttribute(b.idx, 1));
  return g;
}

/**
 * Static world meshes, one (opaque + glass) pair per 16^3 chunk, built on a
 * pool of module workers. Chunks nearest the camera are meshed first.
 */
export class ChunkMeshes {
  constructor(renderer, world) {
    this.renderer = renderer;
    this.world = world;
    this.group = new THREE.Group();
    renderer.scene.add(this.group);
    this.slots = new Map(); // key -> { opaque, glass }
    this.wanted = new Map(); // key -> latest version requested
    this.inflight = new Map(); // key -> version being meshed
    this.queue = new Set();
    this.version = 0;
    this.workers = [];
    this.idle = [];
    const cores = navigator.hardwareConcurrency || 4;
    const n = Math.max(1, Math.min(6, cores - 2));
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('../mesh-worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this.onResult(w, e.data);
        w.onerror = (e) => {
          console.warn('mesh worker failed, falling back to main thread', e.message);
          this.workers = [];
          this.idle = [];
        };
        this.workers.push(w);
        this.idle.push(w);
      }
    } catch (err) {
      console.warn('module workers unavailable; meshing on the main thread', err);
      this.workers = [];
      this.idle = [];
    }
    const r = (CHUNK * VOXEL * Math.sqrt(3)) / 2;
    this.radius = r;
  }

  get pending() {
    return this.queue.size + this.inflight.size;
  }

  requestAll() {
    this.world.markAllDirty();
  }

  extract(key) {
    const w = this.world;
    const [cx, cy, cz] = w.chunkCoords(key);
    const x0 = cx * CHUNK - 1, y0 = cy * CHUNK - 1, z0 = cz * CHUNK - 1;
    const vox = new Uint8Array(P * P * P);
    let any = false;
    for (let y = 0; y < P; y++)
      for (let z = 0; z < P; z++)
        for (let x = 0; x < P; x++) {
          const v = w.get(x0 + x, y0 + y, z0 + z);
          vox[x + P * (z + P * y)] = v;
          if (v && x > 0 && y > 0 && z > 0 && x < P - 1 && y < P - 1 && z < P - 1) any = true;
        }
    let heat = null;
    const hm = w.heat.get(key);
    if (hm && hm.size) {
      heat = new Float32Array(CHUNK * CHUNK * CHUNK).fill(COLD);
      for (const [i, t] of hm) {
        const [x, y, z] = w.coords(i);
        heat[(x - cx * CHUNK) + CHUNK * ((z - cz * CHUNK) + CHUNK * (y - cy * CHUNK))] = t;
      }
    }
    return { vox, heat, any, ox: cx * CHUNK, oy: cy * CHUNK, oz: cz * CHUNK };
  }

  update(camPos, budgetMs = 4) {
    const w = this.world;
    for (const key of w.dirty) {
      this.wanted.set(key, ++this.version);
      this.queue.add(key);
    }
    w.dirty.clear();
    if (!this.queue.size) return;
    // Nearest first.
    const keys = [...this.queue];
    if (camPos && keys.length > 1) {
      const d = (k) => {
        const [cx, cy, cz] = w.chunkCoords(k);
        const s = CHUNK * VOXEL;
        return ((cx + 0.5) * s - camPos.x) ** 2 + ((cy + 0.5) * s - camPos.y) ** 2 + ((cz + 0.5) * s - camPos.z) ** 2;
      };
      keys.sort((a, b) => d(a) - d(b));
    }
    const t0 = performance.now();
    for (const key of keys) {
      if (this.inflight.has(key)) continue; // re-queued when the current job lands
      const job = this.extract(key);
      const version = this.wanted.get(key);
      this.queue.delete(key);
      if (!job.any) {
        this.apply(key, version, null, null);
        continue;
      }
      if (this.workers.length) {
        const wk = this.idle.pop();
        if (!wk) {
          this.queue.add(key);
          break;
        }
        this.inflight.set(key, version);
        const transfer = [job.vox.buffer];
        if (job.heat) transfer.push(job.heat.buffer);
        wk.postMessage({ key, version, vox: job.vox, heat: job.heat, ox: job.ox, oy: job.oy, oz: job.oz }, transfer);
      } else {
        const get = (x, y, z) => job.vox[x + 1 + P * (z + 1 + P * (y + 1))];
        const heatOf = job.heat ? (x, y, z) => job.heat[x + CHUNK * (z + CHUNK * y)] : null;
        const { opaque, glass } = meshVoxels(get, 0, 0, 0, CHUNK, CHUNK, CHUNK, job.ox, job.oy, job.oz, heatOf);
        this.apply(key, version, opaque, glass);
        if (performance.now() - t0 > budgetMs) break;
      }
    }
  }

  onResult(worker, { key, version, opaque, glass }) {
    this.idle.push(worker);
    this.inflight.delete(key);
    if (version < (this.wanted.get(key) ?? 0)) {
      this.queue.add(key); // stale: something changed while meshing
      return;
    }
    this.apply(key, version, opaque, glass);
  }

  apply(key, version, opaque, glass) {
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { opaque: null, glass: null };
      this.slots.set(key, slot);
    }
    const [cx, cy, cz] = this.world.chunkCoords(key);
    const s = CHUNK * VOXEL;
    const centre = new THREE.Vector3((cx + 0.5) * s, (cy + 0.5) * s, (cz + 0.5) * s);
    const set = (which, buf, material, shadow) => {
      const old = slot[which];
      if (!buf || buf.idx.length === 0) {
        if (old) {
          this.group.remove(old);
          old.geometry.dispose();
          slot[which] = null;
        }
        return;
      }
      const g = makeGeometry(buf);
      g.boundingSphere = new THREE.Sphere(centre, this.radius);
      if (old) {
        old.geometry.dispose();
        old.geometry = g;
      } else {
        const m = new THREE.Mesh(g, material);
        m.castShadow = shadow;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        if (which === 'glass') m.renderOrder = 2;
        this.group.add(m);
        slot[which] = m;
      }
    };
    set('opaque', opaque, this.renderer.voxelMaterial, true);
    set('glass', glass, this.renderer.glassMaterial, false);
    this.renderer.markShadowsDirty();
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    for (const slot of this.slots.values())
      for (const m of [slot.opaque, slot.glass]) if (m) m.geometry.dispose();
    this.renderer.scene.remove(this.group);
  }
}

/**
 * Meshes for dynamic debris bodies. Physics runs at a fixed 60 Hz; poses are
 * interpolated between the last two steps so motion is smooth at 120 Hz.
 */
export class BodyMeshes {
  constructor(renderer, debris) {
    this.renderer = renderer;
    this.debris = debris;
    this.group = new THREE.Group();
    renderer.scene.add(this.group);
    this.items = new Map(); // body id -> { obj, version, prevP, prevQ }
    debris.onAdd = (b) => this.rebuild(b);
    debris.onChange = (b) => this.rebuild(b);
    debris.onRemove = (b) => this.drop(b);
  }

  rebuild(body) {
    let it = this.items.get(body.id);
    if (!it) {
      const obj = new THREE.Group();
      this.group.add(obj);
      const t = body.rb.translation(), q = body.rb.rotation();
      it = { obj, version: -1, prevP: new THREE.Vector3(t.x, t.y, t.z), prevQ: new THREE.Quaternion(q.x, q.y, q.z, q.w), body };
      this.items.set(body.id, it);
    }
    if (it.version === body.version) return;
    it.version = body.version;
    for (const c of [...it.obj.children]) {
      it.obj.remove(c);
      c.geometry.dispose();
    }
    const { opaque, glass } = meshVoxels((x, y, z) => body.get(x, y, z), 0, 0, 0, body.nx, body.ny, body.nz);
    if (opaque.idx.length) {
      const m = new THREE.Mesh(makeGeometry(opaque), this.renderer.voxelMaterial);
      m.castShadow = m.receiveShadow = true;
      m.geometry.computeBoundingSphere();
      it.obj.add(m);
    }
    if (glass.idx.length) {
      const m = new THREE.Mesh(makeGeometry(glass), this.renderer.glassMaterial);
      m.receiveShadow = true;
      m.renderOrder = 2;
      m.geometry.computeBoundingSphere();
      it.obj.add(m);
    }
    this.renderer.markShadowsDirty();
  }

  drop(body) {
    const it = this.items.get(body.id);
    if (!it) return;
    for (const c of it.obj.children) c.geometry.dispose();
    this.group.remove(it.obj);
    this.items.delete(body.id);
    this.renderer.markShadowsDirty();
  }

  // Call right before every physics step.
  capture() {
    for (const it of this.items.values()) {
      const rb = it.body.rb;
      if (!rb) continue;
      const t = rb.translation(), q = rb.rotation();
      it.prevP.set(t.x, t.y, t.z);
      it.prevQ.set(q.x, q.y, q.z, q.w);
    }
  }

  // alpha: fraction of a physics step elapsed since the last step.
  sync(alpha) {
    let moving = false;
    const q = new THREE.Quaternion();
    for (const it of this.items.values()) {
      const rb = it.body.rb;
      if (!rb) continue;
      const t = rb.translation(), r = rb.rotation();
      q.set(r.x, r.y, r.z, r.w);
      it.obj.position.set(t.x, t.y, t.z).lerp(it.prevP, 1 - alpha);
      it.obj.quaternion.copy(it.prevQ).slerp(q, alpha);
      if (!rb.isSleeping()) moving = true;
    }
    if (moving) this.renderer.markShadowsDirty();
  }

  clear() {
    for (const it of [...this.items.values()]) this.drop(it.body);
  }
}
