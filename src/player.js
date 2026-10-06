import { RAPIER } from './physics.js';
import { B, BLOCKS, VOXEL } from './materials.js';

const RADIUS = 0.3;
const HALF = 0.55; // capsule half-height (cylinder part): total 1.7 m
const CENTER = HALF + RADIUS; // feet -> capsule centre
const EYE = 1.58; // feet -> eyes
const WALK = 4.6, SPRINT = 7.4, CROUCH = 2.2;
const ACCEL_GROUND = 14, ACCEL_AIR = 3;
const GRAVITY = 21, JUMP = 7.0;
const COYOTE = 0.12, JUMP_BUFFER = 0.14;

/**
 * First-person character on Rapier's kinematic character controller:
 * autosteps one-voxel ledges (stairs, rubble), snaps to ground, slides
 * along walls and shoves light debris it walks into.
 */
export class Player {
  constructor(physics, spawn, yaw = 0) {
    this.physics = physics;
    const pw = physics.pw;
    this.body = pw.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn[0], spawn[1] + CENTER + 0.02, spawn[2]),
    );
    this.collider = pw.createCollider(RAPIER.ColliderDesc.capsule(HALF, RADIUS).setFriction(0), this.body);
    physics.register(this.collider, 'player', this);
    const kcc = pw.createCharacterController(0.02);
    kcc.enableAutostep(VOXEL + 0.06, 0.08, true);
    kcc.enableSnapToGround(VOXEL + 0.05);
    kcc.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    kcc.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    kcc.setApplyImpulsesToDynamicBodies(true);
    kcc.setCharacterMass(85);
    kcc.setSlideEnabled(true);
    this.kcc = kcc;
    this.yaw = yaw;
    this.pitch = 0;
    this.vel = [0, 0, 0];
    this.grounded = false;
    this.airTime = 0;
    this.jumpBuffered = 0;
    this.health = 100;
    this.alive = true;
    this.prev = this.feet();
    this.cur = this.feet();
    this.eyeOffset = 0; // smooths autostep pops
    this.landKick = 0;
    this.bob = 0;
    this.stepDist = 0;
    this.onLand = null; // (speed) => void
    this.onStep = null; // (material) => void
    this.ignoreCollider = null; // e.g. the object being carried
  }

  feet() {
    const t = this.body.translation();
    return [t.x, t.y - CENTER, t.z];
  }

  // Interpolated eye position for rendering.
  eye(alpha) {
    const p = this.prev, c = this.cur;
    return [
      p[0] + (c[0] - p[0]) * alpha,
      p[1] + (c[1] - p[1]) * alpha + EYE - this.eyeOffset - this.landKick + Math.sin(this.bob) * 0.035,
      p[2] + (c[2] - p[2]) * alpha,
    ];
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  look(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * sens));
  }

  teleport(p) {
    this.body.setTranslation({ x: p[0], y: p[1] + CENTER + 0.02, z: p[2] }, true);
    this.body.setNextKinematicTranslation({ x: p[0], y: p[1] + CENTER + 0.02, z: p[2] });
    this.vel = [0, 0, 0];
    this.prev = this.cur = this.feet();
  }

  damage(n) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - n);
    if (this.health <= 0) this.alive = false;
  }

  // One fixed physics step. input: {f, r, jump, sprint, crouch}
  step(dt, input) {
    this.prev = this.cur;
    const sp = input.sprint ? SPRINT : input.crouch ? CROUCH : WALK;
    let wx = 0, wz = 0;
    if (this.alive) {
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      wx = -s * input.f + c * input.r;
      wz = -c * input.f - s * input.r;
      const l = Math.hypot(wx, wz);
      if (l > 1) { wx /= l; wz /= l; }
    }
    const a = (this.grounded ? ACCEL_GROUND : ACCEL_AIR) * dt;
    this.vel[0] += (wx * sp - this.vel[0]) * Math.min(1, a);
    this.vel[2] += (wz * sp - this.vel[2]) * Math.min(1, a);
    if (input.jump) this.jumpBuffered = JUMP_BUFFER;
    else this.jumpBuffered -= dt;
    if (this.jumpBuffered > 0 && this.airTime < COYOTE && this.alive) {
      this.vel[1] = JUMP;
      this.jumpBuffered = 0;
      this.airTime = COYOTE; // no double jump
      this.grounded = false;
    }
    this.vel[1] -= GRAVITY * dt;
    const desired = { x: this.vel[0] * dt, y: this.vel[1] * dt, z: this.vel[2] * dt };
    const ignore = this.ignoreCollider;
    this.kcc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined,
      ignore ? (c) => c.handle !== ignore.handle : undefined);
    const mv = this.kcc.computedMovement();
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel[1];
    this.grounded = this.kcc.computedGrounded();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    // Autostep: the body jumped up a ledge this step; ease the camera instead.
    if (this.grounded && mv.y > 0.05 && mv.y < VOXEL * 1.5) this.eyeOffset += mv.y;
    this.eyeOffset *= Math.exp(-dt * 16);
    if (this.grounded) {
      if (!wasGrounded && fallSpeed > 3) {
        this.landKick = Math.min(0.25, fallSpeed * 0.015);
        this.onLand?.(fallSpeed);
        if (fallSpeed > 12) this.damage((fallSpeed - 12) * 9);
      }
      this.vel[1] = Math.max(this.vel[1], -1);
      this.airTime = 0;
    } else {
      this.airTime += dt;
      // Bonked a ceiling: lose upward speed.
      if (this.vel[1] > 0 && mv.y < desired.y * 0.5) this.vel[1] = 0;
    }
    this.landKick *= Math.exp(-dt * 10);
    // Head bob and footsteps from distance actually covered on the ground.
    const hs = Math.hypot(mv.x, mv.z);
    if (this.grounded && hs > 0.001) {
      this.bob += hs * 4.2;
      this.stepDist += hs;
      if (this.stepDist > (input.sprint ? 2.1 : 1.6)) {
        this.stepDist = 0;
        this.onStep?.(this.groundMaterial());
      }
    }
    this.cur = [t.x + mv.x, t.y + mv.y - CENTER, t.z + mv.z];
    // Fell out of the world.
    if (this.cur[1] < -15) this.damage(1000);
  }

  groundMaterial() {
    const w = this.physics.world;
    const id = w.get(Math.floor(this.cur[0] / VOXEL), Math.floor(this.cur[1] / VOXEL) - 1, Math.floor(this.cur[2] / VOXEL));
    return id ? BLOCKS[id].sound : 'stone';
  }

  // Unstick if world geometry (e.g. a baked debris body) ended up inside us.
  unstick() {
    const w = this.physics.world;
    const [x, y, z] = this.cur;
    const blocked = (yy) => {
      for (let dy = 0.05; dy < 1.7; dy += VOXEL)
        for (const dx of [-0.28, 0.28]) for (const dz of [-0.28, 0.28])
          if (w.get(Math.floor((x + dx) / VOXEL), Math.floor((yy + dy) / VOXEL), Math.floor((z + dz) / VOXEL)) !== B.AIR) return true;
      return false;
    };
    if (!blocked(y)) return false;
    for (let up = VOXEL; up < 6; up += VOXEL) {
      if (!blocked(y + up)) {
        this.teleport([x, y + up, z]);
        return true;
      }
    }
    return false;
  }
}
