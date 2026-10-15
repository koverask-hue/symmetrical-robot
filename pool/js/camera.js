// Camera rig with four views and collision against the table and the room.
//   aim        behind the cue ball along the shot; follows the balls once they roll
//   top        straight down, table filling the screen
//   broadcast  the TV angle from the long side
//   free       wherever you put it: orbit, zoom and pan freely
// Each view keeps its own orbit/zoom adjustments until you reset it.
import * as THREE from '../vendor/three.module.js';
import { HX, HZ } from './physics.js';
import { OUT_X, OUT_Z, RAIL_TOP, FLOOR_Y } from './models.js';

export const VIEWS = ['aim', 'top', 'broadcast', 'free'];

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.aspect = 1.6;
    this.mode = 'aim';
    this.target = new THREE.Vector3(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = 0.6;
    this.dist = 3;
    this.goal = { target: new THREE.Vector3(), yaw: Math.PI, pitch: 0.6, dist: 3 };
    this.offsets = Object.fromEntries(VIEWS.map((v) => [v, { yaw: 0, pitch: 0, zoom: 1 }]));
    this.free = { target: new THREE.Vector3(), yaw: Math.PI * 0.75, pitch: 0.7, dist: 3.2 };
    this.follow = new THREE.Vector3();
    this.snap = false;
    this.baseFov = camera.fov;
  }

  get narrow() {
    return this.aspect < 0.9;
  }

  setMode(mode) {
    if (!VIEWS.includes(mode)) return;
    if (mode === 'free' && this.mode !== 'free') {
      // Start free view from wherever the camera is now.
      this.free.target.copy(this.target);
      this.free.yaw = this.yaw;
      this.free.pitch = this.pitch;
      this.free.dist = this.dist;
    }
    this.mode = mode;
  }

  reset() {
    const o = this.offsets[this.mode];
    o.yaw = 0;
    o.pitch = 0;
    o.zoom = 1;
    if (this.mode === 'free') {
      this.free.target.set(0, 0, 0);
      this.free.yaw = Math.PI * 0.75;
      this.free.pitch = 0.7;
      this.free.dist = this.narrow ? 4.4 : 3.2;
    }
  }

  orbit(dx, dy) {
    this.cine = null;
    if (this.mode === 'free') {
      this.free.yaw += dx * 0.006;
      this.free.pitch = clamp(this.free.pitch - dy * 0.005, 0.05, 1.55);
      return;
    }
    const o = this.offsets[this.mode];
    if (this.mode !== 'top') o.yaw += dx * 0.006;
    o.pitch = clamp(o.pitch - dy * 0.004, -0.6, 1.1);
  }

  zoom(factor) {
    if (this.mode === 'free') this.free.dist = clamp(this.free.dist * factor, 0.35, 7);
    else {
      const o = this.offsets[this.mode];
      o.zoom = clamp(o.zoom * factor, 0.35, 2.6);
    }
  }

  // Pan in the table plane (free view only): dx, dy in pixels.
  pan(dx, dy) {
    if (this.mode !== 'free') this.setMode('free');
    const k = this.free.dist * 0.0012;
    const right = new THREE.Vector3(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const fwd = new THREE.Vector3(-Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.free.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
    this.free.target.x = clamp(this.free.target.x, -HX - 0.6, HX + 0.6);
    this.free.target.z = clamp(this.free.target.z, -HZ - 0.6, HZ + 0.6);
  }

  // Briefly frame something (a newly chosen cue), then return to the current view.
  showcase(target, yaw, pitch, dist, hold) {
    this.cine = { target: new THREE.Vector3(target.x, target.y, target.z), yaw, pitch, dist, hold };
  }

  // Called every frame with what is happening on the table.
  frame({ phase, cue, aim, balls }) {
    const g = this.goal;
    if (this.cine) {
      g.target.copy(this.cine.target);
      g.yaw = this.cine.yaw;
      g.pitch = this.cine.pitch;
      g.dist = this.cine.dist;
      return;
    }
    const o = this.offsets[this.mode];
    if (this.mode === 'free') {
      g.target.copy(this.free.target);
      g.yaw = this.free.yaw;
      g.pitch = this.free.pitch;
      g.dist = this.free.dist;
      return;
    }
    if (this.mode === 'top') {
      g.target.set(0, 0, 0);
      g.yaw = Math.PI / 2;
      g.pitch = clamp(1.53 + o.pitch, 0.6, 1.55);
      g.dist = 3.2 * o.zoom;
      return;
    }
    if (this.mode === 'broadcast') {
      g.target.set(0, -0.05, 0);
      g.yaw = Math.PI / 2 + o.yaw;
      g.pitch = clamp(0.62 + o.pitch, 0.1, 1.5);
      g.dist = (this.narrow ? 5 : 3.3) * o.zoom;
      return;
    }
    // aim view
    if (phase === 'rolling') {
      // Follow the action: the moving balls' centre, weighted towards the cue ball.
      let wx = 0, wz = 0, w = 0;
      for (const b of balls) {
        if (!b.on) continue;
        const s = Math.hypot(b.vx, b.vz);
        const k = s * (b.id === 0 ? 2 : 1);
        wx += b.x * k;
        wz += b.z * k;
        w += k;
      }
      if (w > 0.05) this.follow.set(wx / w, 0, wz / w);
      g.target.lerp(this.follow, 0.04);
      g.target.x = clamp(g.target.x, -HX * 0.6, HX * 0.6);
      g.target.z = clamp(g.target.z, -HZ * 0.5, HZ * 0.5);
      g.pitch = clamp(0.78 + o.pitch * 0.5, 0.3, 1.45);
      g.dist = (this.narrow ? 3.6 : 2.5) * o.zoom;
      return;
    }
    if (!cue) return;
    g.target.set(cue.x + Math.cos(aim) * 0.3, 0, cue.z + Math.sin(aim) * 0.3);
    this.follow.copy(g.target);
    g.yaw = aim + Math.PI + o.yaw;
    g.pitch = clamp((this.narrow ? 0.4 : 0.27) + o.pitch, 0.05, 1.5);
    g.dist = (this.narrow ? 1.8 : 1.25) * o.zoom;
  }

  update(dt) {
    if (this.cine && (this.cine.hold -= dt) <= 0) this.cine = null;
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 6);
    this.snap = false;
    this.target.lerp(this.goal.target, k);
    let dy = this.goal.yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * k;
    this.pitch += (this.goal.pitch - this.pitch) * k;
    this.dist += (this.goal.dist - this.dist) * k;
    const cp = Math.cos(this.pitch);
    const p = this.camera.position;
    p.set(
      this.target.x + Math.cos(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.sin(this.yaw) * cp * this.dist,
    );
    // Collision: stay above the rails over the table, above the floor, and inside the room.
    const overTable = Math.abs(p.x) < OUT_X + 0.12 && Math.abs(p.z) < OUT_Z + 0.12;
    const minY = overTable ? RAIL_TOP + 0.07 : FLOOR_Y + 0.35;
    if (p.y < minY) p.y = minY;
    p.x = clamp(p.x, -5.9, 5.9);
    p.z = clamp(p.z, -4.75, 4.75);
    p.y = Math.min(p.y, FLOOR_Y + 2.9); // stay under the ceiling beams
    this.camera.lookAt(this.target);
    // Overhead: the ceiling limits how high the camera can go, so widen the lens to fit the table.
    let fov = this.baseFov;
    if (this.mode === 'top') {
      const h = Math.max(0.3, p.y - RAIL_TOP);
      const half = Math.max(OUT_Z + 0.1, (OUT_X + 0.1) / this.aspect);
      fov = Math.max(fov, (2 * Math.atan(half / h) * 180) / Math.PI);
    }
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
  }
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
