// Owns the piece meshes on the board and choreographs idle, move, attack and shatter animations.
import * as THREE from '../vendor/three.module.js';
import { createPiece, PIECE_HEIGHT } from './pieces.js';
import { squareToXZ } from './scene.js';

const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  outBack: (t) => {
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
};

const GLOW = { w: new THREE.Color(0xffc670), b: new THREE.Color(0x8a6bff) };
const BOLT = { w: 0xffd27a, b: 0x9b7bff };
const DUST = { w: 0xd8cdb8, b: 0x6d6880 };

export class Animator {
  constructor(stage, fx, sound) {
    this.stage = stage;
    this.fx = fx;
    this.sound = sound;
    this.views = new Map(); // square -> view
    this.tweens = [];
    this.time = 0;
    this.nextFidget = 3;
    this.speed = matchMedia('(prefers-reduced-motion: reduce)').matches ? 2.2 : 1;
    this.calm = this.speed > 1;
  }

  // ---- tween primitives -------------------------------------------------

  tween(duration, fn, easing = ease.linear) {
    return new Promise((resolve) => {
      this.tweens.push({ age: 0, duration: Math.max(0.0001, duration / this.speed), fn, easing, resolve });
    });
  }

  wait(seconds) {
    return this.tween(seconds, () => {});
  }

  // ---- piece lifecycle ---------------------------------------------------

  #create(type, color, square) {
    const piece = createPiece(type, color);
    const view = { ...piece, square, phase: Math.random() * 100, busy: false, idleWeight: 1, sel: 0, selected: false, token: 0, flash: 0 };
    view.pose.rotation.order = 'ZXY';
    view.root.position.copy(squareToXZ(square));
    view.root.userData.square = square;
    this.stage.scene.add(view.root);
    this.views.set(square, view);
    return view;
  }

  #remove(view) {
    this.stage.scene.remove(view.root);
    view.material.dispose();
    if (this.views.get(view.square) === view) this.views.delete(view.square);
  }

  meshes() {
    const out = [];
    for (const v of this.views.values()) v.body.traverse((m) => m.isMesh && out.push(m));
    return out;
  }

  // Instantly match the board (used after undo or when loading a saved game), with a brief shimmer.
  rebuild(board) {
    for (const v of [...this.views.values()]) this.#remove(v);
    this.views.clear();
    this.fx.clearShards();
    for (const row of board) {
      for (const p of row) {
        if (!p) continue;
        this.#create(p.type, p.color, p.square).flash = 0.7;
      }
    }
  }

  // Conjure a full set: pieces grow out of rune light rank by rank.
  async spawn(board) {
    const jobs = [];
    for (const row of board) {
      for (const p of row) {
        if (!p) continue;
        const v = this.#create(p.type, p.color, p.square);
        v.busy = true;
        v.root.scale.setScalar(0.001);
        const rank = Number(p.square[1]);
        const order = p.color === 'w' ? rank - 1 : 8 - rank;
        const delay = order * 0.12 + (p.square.charCodeAt(0) - 97) * 0.03;
        jobs.push(this.wait(delay).then(async () => {
          this.fx.burst(v.root.position.clone().setY(0.05), { count: 14, color: BOLT[p.color], speed: 0.9, size: 0.07, life: 0.6, gravity: 1, additive: true });
          await this.tween(0.5, (t) => {
            v.root.scale.setScalar(Math.max(0.001, t));
            v.material.emissive.copy(GLOW[p.color]).multiplyScalar(0.8 * (1 - t));
          }, ease.outBack);
          v.busy = false;
        }));
      }
    }
    await Promise.all(jobs);
  }

  async despawn() {
    const views = [...this.views.values()];
    this.views.clear();
    await Promise.all(views.map((v, i) => {
      v.busy = true;
      return this.wait(i * 0.01).then(() => this.tween(0.35, (t) => {
        v.root.scale.setScalar(Math.max(0.001, 1 - t));
        v.root.position.y = -0.2 * t;
      }, ease.in)).then(() => {
        this.stage.scene.remove(v.root);
        v.material.dispose();
      });
    }));
  }

  // True when the meshes on the board match the given chess.js board.
  matches(board) {
    let count = 0;
    for (const row of board) {
      for (const p of row) {
        if (!p) continue;
        count++;
        const v = this.views.get(p.square);
        if (!v || v.type !== p.type || v.color !== p.color) return false;
      }
    }
    return count === this.views.size;
  }

  // ---- selection ---------------------------------------------------------

  select(square) {
    for (const v of this.views.values()) v.selected = v.square === square;
    if (square && this.views.has(square)) this.sound.play('select');
  }

  // ---- choreography ------------------------------------------------------

  #claim(view) {
    view.token++;
    view.busy = true;
    view.selected = false;
    view.pose.position.set(0, 0, 0);
    view.pose.rotation.set(0, 0, 0);
    view.pose.scale.set(1, 1, 1);
  }

  #lean(view, dir, angle) {
    view.pose.rotation.x = dir.z * angle;
    view.pose.rotation.z = -dir.x * angle;
  }

  #yawToward(view, dir) {
    const f = view.color === 'w' ? -1 : 1; // forward is -z for marble, +z for obsidian
    let a = Math.atan2(dir.x, dir.z) - Math.atan2(0, f);
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  #heavy(view) {
    return view.type === 'r' || view.type === 'k' || view.type === 'q';
  }

  // Glide (or leap, for knights) from the current position to a point on the board.
  async #travel(view, to, { jump = view.type === 'n', settle = true } = {}) {
    const from = view.root.position.clone();
    const delta = to.clone().sub(from).setY(0);
    const dist = delta.length();
    if (dist < 0.01) return;
    const dir = delta.clone().normalize();
    const height = jump ? 0.7 + dist * 0.12 : 0.1 + dist * 0.035;
    const duration = jump ? 0.6 + dist * 0.03 : 0.26 + dist * 0.075;
    const yaw = view.type === 'n' ? this.#yawToward(view, dir) : 0;

    // Anticipation: crouch and lean back.
    await this.tween(0.11, (t) => {
      view.pose.scale.set(1 + 0.08 * t, 1 - 0.13 * t, 1 + 0.08 * t);
      this.#lean(view, dir, -0.12 * t);
      view.pose.rotation.y = yaw * t * 0.6;
    }, ease.out);
    if (jump || dist > 2.5) this.sound.play('whoosh');

    await this.tween(duration, (t) => {
      const e = ease.inOut(t);
      view.root.position.lerpVectors(from, to, e);
      view.root.position.y = 4 * height * e * (1 - e);
      const s = Math.sin(Math.PI * t);
      view.pose.scale.set(1 - 0.04 * s, 1 + 0.1 * s, 1 - 0.04 * s);
      this.#lean(view, dir, (jump ? 0.28 : 0.18) * s - 0.12 * (1 - t) * (1 - t));
      view.pose.rotation.y = yaw * (0.6 + 0.4 * Math.min(1, t * 2)) * (t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
    });
    view.root.position.copy(to).setY(0);
    view.pose.rotation.y = 0;
    if (!settle) return;

    // Landing: squash, puff of dust and a stone thud that echoes.
    this.fx.landPuff(to, DUST[view.color]);
    this.sound.play('land', this.#heavy(view) || jump ? 1 : 0.7);
    if (this.#heavy(view) || jump) this.stage.rig.shake = Math.max(this.stage.rig.shake, 0.35);
    await this.tween(0.08, (t) => {
      view.pose.scale.set(1 + 0.1 * t, 1 - 0.14 * t, 1 + 0.1 * t);
      this.#lean(view, dir, 0.12 * (1 - t));
    }, ease.out);
    await this.tween(0.28, (t) => {
      const k = 1 - ease.outBack(t);
      view.pose.scale.set(1 + 0.1 * k, 1 - 0.14 * k, 1 + 0.1 * k);
    });
    view.pose.scale.set(1, 1, 1);
    view.pose.rotation.set(0, 0, 0);
  }

  #reassign(view, square) {
    if (this.views.get(view.square) === view) this.views.delete(view.square);
    view.square = square;
    view.root.userData.square = square;
    this.views.set(square, view);
  }

  async move(fromSq, toSq) {
    const view = this.views.get(fromSq);
    if (!view) return;
    this.#claim(view);
    this.#reassign(view, toSq);
    await this.#travel(view, squareToXZ(toSq));
    view.busy = false;
  }

  async castle(kingFrom, kingTo, rookFrom, rookTo) {
    const king = this.views.get(kingFrom);
    const rook = this.views.get(rookFrom);
    this.#claim(king);
    this.#claim(rook);
    this.#reassign(king, kingTo);
    this.#reassign(rook, rookTo);
    await Promise.all([
      this.#travel(king, squareToXZ(kingTo)),
      this.wait(0.14).then(() => this.#travel(rook, squareToXZ(rookTo), { jump: true })),
    ]);
    king.busy = rook.busy = false;
  }

  // The victim braces as the attacker closes in: it turns away and trembles.
  #brace(victim, dir, duration) {
    this.#claim(victim);
    const token = victim.token;
    return this.tween(duration, (t) => {
      if (victim.token !== token) return;
      const k = ease.out(Math.min(1, t * 1.5));
      this.#lean(victim, dir, 0.16 * k);
      victim.pose.position.x = Math.sin(this.time * 70) * 0.012 * k;
      victim.pose.scale.y = 1 - 0.05 * k;
    });
  }

  #hitFlash(view, color) {
    view.material.emissive.set(color).multiplyScalar(1.6);
  }

  #shatter(victim, dir) {
    this.#remove(victim);
    this.fx.shatter(victim, dir);
    this.sound.play('shatter');
    this.stage.rig.shake = 1;
  }

  async capture(fromSq, toSq, victimSq) {
    const attacker = this.views.get(fromSq);
    const victim = this.views.get(victimSq);
    if (!attacker) return;
    if (!victim) return this.move(fromSq, toSq);
    this.#claim(attacker);
    this.views.delete(victimSq);
    this.#reassign(attacker, toSq);
    const start = attacker.root.position.clone();
    const vpos = squareToXZ(victimSq);
    const dir = vpos.clone().sub(start).setY(0).normalize();
    const color = attacker.color;
    const ranged = attacker.type === 'b' || attacker.type === 'q';
    const braced = this.#brace(victim, dir, 1.2);

    if (ranged) {
      // Spellcasters stay put, gather light, and fire a bolt.
      await this.tween(0.42, (t) => {
        attacker.pose.position.y = 0.25 * ease.out(t);
        this.#lean(attacker, dir, -0.22 * t);
        attacker.material.emissive.copy(GLOW[color]).multiplyScalar(1.2 * t);
        attacker.pose.rotation.y = t * Math.PI * 2;
      }, ease.inOut);
      this.sound.play('zap');
      const tip = start.clone().setY(PIECE_HEIGHT[attacker.type] + 0.3);
      const boltDone = this.fx.bolt(tip, vpos.clone().setY(0.45), BOLT[color]);
      this.tween(0.12, (t) => this.#lean(attacker, dir, -0.22 + 0.5 * t));
      await boltDone;
      this.#hitFlash(victim, 0xffffff);
      await this.wait(0.06);
      this.#shatter(victim, dir);
      await this.tween(0.3, (t) => {
        attacker.material.emissive.copy(GLOW[color]).multiplyScalar(1.2 * (1 - t));
        attacker.pose.position.y = 0.25 * (1 - t);
        this.#lean(attacker, dir, 0.28 * (1 - t));
      }, ease.out);
      attacker.pose.rotation.set(0, 0, 0);
      await this.wait(0.15);
      await this.#travel(attacker, squareToXZ(toSq));
      attacker.busy = false;
      await braced;
      return;
    }

    // Melee: close the distance, wind up, strike.
    const gap = start.distanceTo(vpos);
    const reach = attacker.type === 'n' ? 0.95 : 0.72;
    if (gap > reach + 0.05) await this.#travel(attacker, vpos.clone().addScaledVector(dir, -reach), { settle: false });
    attacker.pose.scale.set(1, 1, 1);
    const base = attacker.root.position.clone();

    if (attacker.type === 'n') {
      // Rear up on the hind legs, then stamp down.
      await this.tween(0.3, (t) => {
        attacker.pose.position.y = 0.4 * ease.out(t);
        this.#lean(attacker, dir, -0.6 * ease.out(t));
      });
      await this.tween(0.12, (t) => {
        attacker.pose.position.y = 0.4 * (1 - t);
        this.#lean(attacker, dir, -0.6 + 1.1 * t);
        attacker.root.position.copy(base).addScaledVector(dir, 0.25 * t);
      }, ease.in);
    } else if (attacker.type === 'r') {
      // Back up, then ram.
      await this.tween(0.28, (t) => {
        attacker.root.position.copy(base).addScaledVector(dir, -0.3 * ease.out(t));
        this.#lean(attacker, dir, -0.1 * t);
      });
      await this.tween(0.1, (t) => {
        attacker.root.position.copy(base).addScaledVector(dir, -0.3 + 0.62 * t);
        this.#lean(attacker, dir, 0.2 * t);
      }, ease.in);
    } else {
      // King and pawn: wind up and swing the head forward.
      await this.tween(0.26, (t) => {
        this.#lean(attacker, dir, -0.35 * ease.out(t));
        attacker.pose.position.y = 0.08 * t;
      });
      await this.tween(0.1, (t) => {
        this.#lean(attacker, dir, -0.35 + 0.95 * t);
        attacker.root.position.copy(base).addScaledVector(dir, 0.3 * t);
      }, ease.in);
    }
    this.#hitFlash(victim, 0xffffff);
    this.fx.pulse(vpos, 0xffffff, 25);
    await this.wait(0.05);
    this.#shatter(victim, dir);
    // Recoil and recover.
    const struck = attacker.root.position.clone();
    await this.tween(0.22, (t) => {
      this.#lean(attacker, dir, 0.55 * (1 - ease.out(t)));
      attacker.pose.position.y *= 1 - t;
      attacker.root.position.copy(struck).addScaledVector(dir, -0.12 * Math.sin(Math.PI * t));
    });
    attacker.pose.rotation.set(0, 0, 0);
    attacker.pose.position.set(0, 0, 0);
    await this.wait(0.12);
    await this.#travel(attacker, squareToXZ(toSq), { jump: false });
    attacker.busy = false;
    await braced;
  }

  // The pawn dissolves into light and the new piece takes its place.
  async promote(square, type) {
    const pawn = this.views.get(square);
    if (!pawn) return;
    this.#claim(pawn);
    const color = pawn.color;
    await this.tween(0.5, (t) => {
      pawn.pose.rotation.y = t * Math.PI * 4;
      pawn.pose.position.y = 0.4 * t;
      pawn.root.scale.setScalar(Math.max(0.001, 1 - t));
      pawn.material.emissive.copy(GLOW[color]).multiplyScalar(2 * t);
    }, ease.in);
    this.#remove(pawn);
    const at = squareToXZ(square);
    this.fx.burst(at.clone().setY(0.4), { count: 70, color: BOLT[color], speed: 2.6, size: 0.1, life: 0.9, gravity: 0, additive: true });
    this.fx.pulse(at, BOLT[color], 40);
    this.sound.play('chime');
    const v = this.#create(type, color, square);
    v.busy = true;
    v.root.scale.setScalar(0.001);
    await this.tween(0.55, (t) => {
      v.root.scale.setScalar(Math.max(0.001, t));
      v.material.emissive.copy(GLOW[color]).multiplyScalar(1.5 * (1 - t));
    }, ease.outBack);
    v.busy = false;
  }

  // Checkmate: the fallen king cracks apart.
  async topple(square) {
    const king = this.views.get(square);
    if (!king) return;
    this.#claim(king);
    await this.tween(0.7, (t) => {
      king.pose.position.x = Math.sin(this.time * 60) * 0.02 * t;
      king.pose.rotation.z = 0.25 * ease.in(t);
      king.material.emissive.set(0xff3020).multiplyScalar(0.8 * t);
    });
    this.#remove(king);
    this.fx.shatter(king, new THREE.Vector3(0, 0, 0), { pieces: 30, force: 0.4 });
    this.sound.play('shatter');
    this.sound.play('toll', 1);
    this.stage.rig.shake = 1.2;
  }

  // ---- per-frame ---------------------------------------------------------

  update(dt) {
    this.time += dt;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.age += dt;
      const t = Math.min(1, tw.age / tw.duration);
      tw.fn(tw.easing(t));
      if (t >= 1) {
        this.tweens.splice(i, 1);
        tw.resolve();
      }
    }
    this.#idle(dt);
  }

  #idle(dt) {
    const T = this.time;
    const amp = this.calm ? 0.4 : 1;
    for (const v of this.views.values()) {
      v.idleWeight += ((v.busy ? 0 : 1) - v.idleWeight) * Math.min(1, dt * 4);
      v.sel += ((v.selected ? 1 : 0) - v.sel) * Math.min(1, dt * 8);
      const w = v.idleWeight * amp;
      const t = T + v.phase;
      const i = v.idle;
      // Every piece hovers a hair above the board and breathes: these are animated stones.
      i.position.set(0, w * (0.012 + 0.012 * Math.sin(t * 1.5)) + v.sel * (0.2 + 0.03 * Math.sin(t * 3)), 0);
      i.rotation.set(w * 0.02 * Math.sin(t * 1.1), 0, w * 0.02 * Math.sin(t * 0.9 + 1));
      const breath = w * 0.012 * Math.sin(t * 2.2);
      i.scale.set(1 - breath * 0.5, 1 + breath, 1 - breath * 0.5);
      switch (v.type) {
        case 'k':
          i.rotation.y = w * 0.2 * Math.sin(t * 0.33); // surveying the field
          break;
        case 'q':
          i.position.y += w * 0.025 * Math.sin(t * 0.8);
          i.rotation.y = w * 0.35 * Math.sin(t * 0.21);
          break;
        case 'n':
          v.body.rotation.z = w * 0.06 * Math.sin(t * 1.7) * Math.max(0, Math.sin(t * 0.37)); // restless nodding
          break;
        case 'b':
          i.rotation.y = w * 0.12 * Math.sin(t * 0.5);
          break;
        case 'p':
          i.position.x = w * 0.01 * Math.sin(t * 0.7);
          break;
        case 'r':
          i.position.y *= 0.5; // heavy, barely moves
          break;
      }
      v.flash = Math.max(0, v.flash - dt * 1.2);
      if (!v.busy) {
        const glow = v.sel * (0.35 + 0.1 * Math.sin(t * 4)) + v.flash;
        v.material.emissive.copy(GLOW[v.color]).multiplyScalar(glow);
      }
    }
    this.nextFidget -= dt;
    if (this.nextFidget <= 0) {
      this.nextFidget = (this.calm ? 9 : 2.5) + Math.random() * 4;
      this.#fidget();
    }
  }

  // Occasional personality: a hop, a glance around, or a knight tossing its head.
  #fidget() {
    const idle = [...this.views.values()].filter((v) => !v.busy && !v.selected);
    if (!idle.length || this.calm) return;
    const v = idle[Math.floor(Math.random() * idle.length)];
    const token = ++v.token;
    const alive = () => v.token === token && !v.busy;
    const kind = v.type === 'n' ? 'toss' : Math.random() < 0.5 ? 'hop' : 'look';
    if (kind === 'hop') {
      this.tween(0.5, (t) => {
        if (!alive()) return;
        const s = Math.sin(Math.PI * t);
        v.pose.position.y = 0.16 * s;
        v.pose.scale.set(1 - 0.04 * s, 1 + 0.06 * s, 1 - 0.04 * s);
      }).then(() => alive() && (v.pose.position.y = 0, v.pose.scale.set(1, 1, 1)));
    } else if (kind === 'look') {
      const a = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4);
      this.tween(1.6, (t) => {
        if (!alive()) return;
        v.pose.rotation.y = a * Math.sin(Math.PI * t);
      }).then(() => alive() && (v.pose.rotation.y = 0));
    } else {
      const forward = new THREE.Vector3(0, 0, v.color === 'w' ? -1 : 1);
      this.tween(0.8, (t) => {
        if (!alive()) return;
        this.#lean(v, forward, -0.22 * Math.sin(Math.PI * 2 * t) * (1 - t));
        v.pose.position.y = 0.06 * Math.sin(Math.PI * t);
      }).then(() => alive() && (v.pose.position.y = 0, v.pose.rotation.set(0, 0, 0)));
    }
  }
}
