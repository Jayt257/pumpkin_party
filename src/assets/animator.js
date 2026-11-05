// Procedural character animation. All motion comes from gameplay state plus damped springs, so a
// run blends naturally into a stumble and big heads wobble on landing. No clips are downloaded.
import * as THREE from 'three';
import { BONE } from './characters.js';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _axis = new THREE.Vector3();

class Spring {
  constructor(k = 80, c = 10) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  update(target, dt) {
    const a = this.k * (target - this.x) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(v) { this.v += v; }
}

const N = 12;
export class Animator {
  /** @param {import('./characters.js').CharacterMesh} char */
  constructor(char, seed = 0) {
    this.char = char;
    this.t = seed * 13.7;
    this.phase = seed * 5;
    this.cur = new Float32Array(N * 3); // current Euler per bone
    this.tgt = new Float32Array(N * 3);
    this.squash = new Spring(190, 13);
    this.headX = new Spring(95, 9);
    this.headZ = new Spring(95, 9);
    this.leanX = 0; this.leanZ = 0;
    this.prevVx = 0; this.prevVz = 0;
    this.tumble = new THREE.Quaternion();
    this.pivotBlend = 0;
    this.emoteT = 0;
    this.bob = 0;
    this.lookYaw = 0; this.lookTimer = 0; this.lookTarget = 0;
    this.prone = 0;
  }

  /** Called when the character lands; v is impact speed. */
  land(v) { this.squash.kick(-Math.min(v, 14) * 0.5); }
  /** Pop upward on jump. */
  jump() { this.squash.kick(3.6); }
  hit() { this.squash.kick(-5); this.headX.kick(9); }

  /**
   * @param {number} dt
   * @param {object} s  { mode, speed, vx, vz, vy, fwdX, fwdZ, grounded, stunSpin, emote, climb }
   *   mode: idle|run|air|dive|slide|stun|getup|climb|win|lose|emote|sit
   */
  update(dt, s) {
    dt = Math.max(1e-3, Math.min(dt, 0.05)); // a zero step would turn the acceleration springs into NaN
    const c = this.char, t = (this.t += dt);
    const T = this.tgt;
    const set = (b, x, y = 0, z = 0) => { T[b * 3] = x; T[b * 3 + 1] = y; T[b * 3 + 2] = z; };
    const mode = s.mode;
    const speed = s.speed || 0;
    let blendK = 16;
    let bob = 0;
    let lift = 0;
    let wantProne = 0;

    // Reset to neutral.
    for (let i = 0; i < N * 3; i++) T[i] = 0;
    set(BONE.armL, 0, 0, 0.1); set(BONE.armR, 0, 0, -0.1);

    if (mode === 'run' || (mode === 'idle' && speed > 0.6)) {
      const cadence = 2.5 + speed * 1.28;
      this.phase += dt * cadence;
      const p = this.phase;
      const amt = Math.min(1, speed / 6.5);
      const swing = Math.sin(p) * (0.5 + amt * 0.62);
      set(BONE.legL, -swing, 0, 0);
      set(BONE.legR, swing, 0, 0);
      set(BONE.footL, Math.max(0, swing) * 0.85 - 0.08, 0, 0);
      set(BONE.footR, Math.max(0, -swing) * 0.85 - 0.08, 0, 0);
      set(BONE.armL, swing * 1.0 - 0.1, 0, 0.26 + amt * 0.12);
      set(BONE.armR, -swing * 1.0 - 0.1, 0, -0.26 - amt * 0.12);
      set(BONE.handL, -0.45, 0, 0);
      set(BONE.handR, -0.45, 0, 0);
      set(BONE.chest, 0.08 + amt * 0.1, Math.sin(p) * 0.2 * amt, Math.cos(p) * 0.03 * amt);
      set(BONE.hips, 0.04, -Math.sin(p) * 0.12 * amt, Math.cos(p) * 0.04 * amt);
      set(BONE.head, -0.08 - amt * 0.08, -Math.sin(p) * 0.09 * amt, Math.sin(p * 2) * 0.03 * amt);
      bob = Math.abs(Math.sin(p)) * 0.075 * (0.4 + amt);
      blendK = 22;
    } else if (mode === 'idle') {
      const breath = Math.sin(t * 2.2);
      set(BONE.chest, 0.015 * breath, 0, 0);
      set(BONE.head, -0.03 * breath, 0, Math.sin(t * 0.9) * 0.02);
      set(BONE.armL, 0.05 * breath, 0, 0.14 + 0.035 * breath);
      set(BONE.armR, 0.05 * breath, 0, -0.14 - 0.035 * breath);
      bob = breath * 0.006;
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) { this.lookTarget = (Math.random() - 0.5) * 0.9; this.lookTimer = 1.4 + Math.random() * 2.6; }
      this.lookYaw = damp(this.lookYaw, this.lookTarget, 3, dt);
      T[BONE.head * 3 + 1] += this.lookYaw;
    } else if (mode === 'air') {
      const up = (s.vy || 0) > 0;
      const flail = Math.sin(t * 17) * 0.35;
      if (up) {
        set(BONE.armL, -2.5, 0, 0.4 + flail * 0.3);
        set(BONE.armR, -2.5, 0, -0.4 + flail * 0.3);
        set(BONE.legL, 0.5, 0, 0.04);
        set(BONE.legR, -0.9, 0, -0.04);
        set(BONE.footL, 0.9, 0, 0);
        set(BONE.footR, 0.3, 0, 0);
        set(BONE.chest, -0.06, 0, 0);
        set(BONE.head, -0.1, 0, 0);
      } else {
        set(BONE.armL, -2.2 + flail, 0, 0.82);
        set(BONE.armR, -2.2 - flail, 0, -0.82);
        set(BONE.legL, -0.42 + flail * 0.5, 0, 0.08);
        set(BONE.legR, -0.2 - flail * 0.5, 0, -0.08);
        set(BONE.footL, 0.5, 0, 0);
        set(BONE.footR, 0.5, 0, 0);
        set(BONE.head, 0.09, 0, 0);
      }
      blendK = 13;
    } else if (mode === 'dive' || mode === 'slide') {
      const wig = Math.sin(t * 22) * (mode === 'slide' ? 0.12 : 0.2);
      set(BONE.armL, -2.85, 0, 0.3 + wig);
      set(BONE.armR, -2.85, 0, -0.3 - wig);
      set(BONE.legL, 0.42 + wig, 0, 0.14);
      set(BONE.legR, 0.5 - wig, 0, -0.14);
      set(BONE.footL, 0.5, 0, 0);
      set(BONE.footR, 0.5, 0, 0);
      set(BONE.head, -0.62, 0, 0);
      wantProne = 1.42;
      blendK = 16;
    } else if (mode === 'stun') {
      const f = Math.sin(t * 19), g = Math.sin(t * 15 + 1);
      const a = s.grounded ? 0.25 : 1;
      set(BONE.armL, -1.7 + f * 0.9 * a, 0.4 * g, 1.1 + g * 0.5 * a);
      set(BONE.armR, -1.7 - f * 0.9 * a, -0.4 * g, -1.1 - g * 0.5 * a);
      set(BONE.legL, -0.7 + g * 0.8 * a, 0, 0.32);
      set(BONE.legR, -0.7 - g * 0.8 * a, 0, -0.32);
      set(BONE.head, 0.25 * f * a, 0.4 * g * a, 0.2 * f * a);
      blendK = 20;
    } else if (mode === 'getup') {
      set(BONE.armL, -0.3, 0, 0.75);
      set(BONE.armR, -0.3, 0, -0.75);
      set(BONE.chest, 0.28, 0, 0);
      set(BONE.head, -0.2, 0, 0);
      set(BONE.legL, -0.3, 0, 0.1);
      set(BONE.legR, 0.1, 0, -0.1);
      blendK = 12;
    } else if (mode === 'climb') {
      set(BONE.armL, -2.8, 0, 0.3);
      set(BONE.armR, -2.5, 0, -0.3);
      set(BONE.legL, -0.9, 0, 0.1);
      set(BONE.legR, -0.25, 0, -0.1);
      set(BONE.chest, 0.3, 0, 0);
      blendK = 20;
    } else if (mode === 'win') {
      const hop = Math.abs(Math.sin(t * 5.2));
      lift = hop * 0.34;
      const w = Math.sin(t * 10.4);
      set(BONE.armL, -2.9 + w * 0.22, 0, 0.38);
      set(BONE.armR, -2.9 - w * 0.22, 0, -0.38);
      set(BONE.legL, -0.3 * hop, 0, 0.12);
      set(BONE.legR, -0.3 * hop, 0, -0.12);
      set(BONE.footL, 0.35 * hop, 0, 0);
      set(BONE.footR, 0.35 * hop, 0, 0);
      set(BONE.head, -0.14, Math.sin(t * 5.2) * 0.2, Math.sin(t * 5.2) * 0.08);
      set(BONE.chest, -0.08, 0, Math.sin(t * 5.2) * 0.1);
      blendK = 20;
    } else if (mode === 'lose') {
      const sob = Math.sin(t * 8) * 0.03;
      set(BONE.chest, 0.16 + sob, 0, 0);
      set(BONE.head, 0.14 + sob, Math.sin(t * 1.3) * 0.2, Math.sin(t * 0.9) * 0.05);
      set(BONE.armL, 0.06, 0, 0.06);
      set(BONE.armR, 0.06, 0, -0.06);
      blendK = 8;
    } else if (mode === 'pose') {
      // Hero pose on the menu stage: one arm thrown up in a hello, mid-step, leaning toward the viewer.
      const b = Math.sin(t * 2.4);
      const w = Math.sin(t * 3.2);
      set(BONE.armL, -0.55, 0.1, 1.42 + w * 0.12);
      set(BONE.armR, 0.12 + b * 0.04, -0.1, -0.5 - b * 0.05);
      set(BONE.handL, -0.5, 0, 0.5 + w * 0.22);
      set(BONE.handR, -0.3, 0, 0);
      set(BONE.legL, -0.36, 0, 0.1);
      set(BONE.legR, 0.26, 0, -0.06);
      set(BONE.footL, 0.3, 0, 0);
      set(BONE.chest, 0.04 + b * 0.012, Math.sin(t * 1.2) * 0.05, 0.03);
      set(BONE.head, -0.05, Math.sin(t * 0.8) * 0.1, -0.05);
      bob = Math.abs(b) * 0.012;
      blendK = 12;
    } else if (mode === 'emote') {
      this.emote(s.emote, t, set);
      blendK = 18;
    }

    // Blend Euler pose. Small angles keep this cheap and stable.
    const a = 1 - Math.exp(-blendK * dt);
    for (let i = 0; i < N * 3; i++) this.cur[i] += (T[i] - this.cur[i]) * a;

    // Acceleration-driven lean and head lag: this is the wobble.
    const ax = ((s.vx || 0) - this.prevVx) / dt, az = ((s.vz || 0) - this.prevVz) / dt;
    this.prevVx = s.vx || 0; this.prevVz = s.vz || 0;
    const fx = s.fwdX ?? 0, fz = s.fwdZ ?? 1;
    const aFwd = ax * fx + az * fz, aSide = ax * fz - az * fx;
    const hx = this.headX.update(Math.max(-1, Math.min(1, -aFwd * 0.016)), dt);
    const hz = this.headZ.update(Math.max(-1, Math.min(1, aSide * 0.016)), dt);
    const groundish = mode === 'run' || mode === 'idle';
    this.leanX = damp(this.leanX, groundish ? Math.max(-0.2, Math.min(0.25, aFwd * 0.006)) : 0, 9, dt);
    this.leanZ = damp(this.leanZ, groundish ? Math.max(-0.28, Math.min(0.28, -aSide * 0.0075)) : 0, 9, dt);

    const bones = c.bones;
    for (let i = 1; i < N; i++) {
      bones[i].rotation.set(this.cur[i * 3], this.cur[i * 3 + 1], this.cur[i * 3 + 2]);
    }
    bones[BONE.head].rotation.x += hx * 0.55;
    bones[BONE.head].rotation.z += hz * 0.55;
    bones[BONE.chest].rotation.x += hx * 0.2;

    // Pivot: whole-body tilts about the centre of mass.
    if (mode === 'stun' && s.tumble) {
      _q.copy(s.tumble);
      c.pivot.quaternion.slerp(_q, 1 - Math.exp(-30 * dt));
    } else {
      this.prone = damp(this.prone, wantProne, mode === 'getup' ? 11 : 14, dt);
      _e.set(this.prone + this.leanX, 0, this.leanZ, 'YXZ');
      _q.setFromEuler(_e);
      c.pivot.quaternion.slerp(_q, 1 - Math.exp(-(mode === 'getup' ? 12 : 20) * dt));
    }

    // Squash and stretch on landing and jumping.
    const sq = this.squash.update(0, dt);
    const sy = 1 + Math.max(-0.28, Math.min(0.24, sq * 0.1));
    const sxz = 1 / Math.sqrt(sy);
    const rootB = bones[BONE.root];
    rootB.scale.set(sxz, sy, sxz);
    this.bob = damp(this.bob, bob + lift, mode === 'win' ? 40 : 28, dt);
    rootB.position.y = this.bob - (wantProne > 0 ? 0.3 * Math.min(1, this.prone) : 0);
  }

  emote(name, t, set) {
    switch (name) {
      case 'dance': {
        const b = Math.sin(t * 8);
        set(BONE.hips, 0, b * 0.3, b * 0.1);
        set(BONE.chest, 0, -b * 0.35, -b * 0.1);
        set(BONE.armL, -1.6 + b * 0.8, 0, 0.6);
        set(BONE.armR, -1.6 - b * 0.8, 0, -0.6);
        set(BONE.legL, -0.2 * Math.max(0, b), 0, 0.1);
        set(BONE.legR, -0.2 * Math.max(0, -b), 0, -0.1);
        set(BONE.head, 0.05, b * 0.2, b * 0.14);
        break;
      }
      case 'cheer': {
        const b = Math.abs(Math.sin(t * 7));
        set(BONE.armL, -3 + b * 0.25, 0, 0.3);
        set(BONE.armR, -3 + b * 0.25, 0, -0.3);
        set(BONE.head, -0.2, 0, 0);
        set(BONE.legL, -0.15 * b, 0, 0.1);
        set(BONE.legR, -0.15 * b, 0, -0.1);
        break;
      }
      case 'flex': {
        const b = Math.sin(t * 6) * 0.1;
        set(BONE.armL, -0.1, 0, 1.5);
        set(BONE.armR, -0.1, 0, -1.5);
        set(BONE.handL, -2.1 + b, 0, 0);
        set(BONE.handR, -2.1 - b, 0, 0);
        set(BONE.chest, -0.1, 0, 0);
        set(BONE.head, -0.15, Math.sin(t * 2) * 0.3, 0);
        break;
      }
      case 'boo': {
        const k = Math.min(1, ((t * 2.2) % 2.2));
        set(BONE.armL, -2.1 * k, 0, 0.45);
        set(BONE.armR, -2.1 * k, 0, -0.45);
        set(BONE.handL, -0.7 * k, 0, 0);
        set(BONE.handR, -0.7 * k, 0, 0);
        set(BONE.chest, 0.34 * k, 0, 0);
        set(BONE.head, -0.1 * k, 0, Math.sin(t * 16) * 0.05);
        break;
      }
      case 'spin': {
        set(BONE.armL, 0, 0, 1.4);
        set(BONE.armR, 0, 0, -1.4);
        set(BONE.hips, 0, (t * 9) % (Math.PI * 2) - Math.PI, 0);
        break;
      }
      case 'wave':
      default: {
        const w = Math.sin(t * 9);
        set(BONE.armR, -2.5, 0, -0.5 + w * 0.42);
        set(BONE.handR, -0.3, 0, w * 0.5);
        set(BONE.armL, 0, 0, 0.16);
        set(BONE.head, 0, -0.2, Math.sin(t * 4.5) * 0.08);
      }
    }
  }
}
void _axis;
