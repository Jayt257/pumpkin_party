// Final round: Final Showdown. Round pads around a bubbling cauldron, with spinning beams to jump.
// Pads collapse over time and the beams speed up. Last one standing takes the crown.
import * as THREE from 'three';
import { Level, ROUND_MODES, T, gradY, Batch, toy, makeCyl, makeCapsule } from './base.js';
import { makeBox } from '../physics/world.js';
import { S } from '../physics/racer.js';
import { TAU, bandCapsule, box, capsule, disc, rng, shapeGeo, torus, tube } from '../render/geo.js';
import { makeCauldron, makeSpinBar } from '../assets/obstacles.js';
import { buildCastle } from '../assets/castle.js';
import { addBubbles } from './witchsPlatform.js';
import { JUMP_LEAD_MAX, JUMP_LEAD_MIN } from '../game/bot.js';

/** The pad's printed jack-o'-lantern top, yellow-lit as on the key art. */
function padFace(b, R, y) {
  const eyeL = [[-0.48, 0.1], [-0.14, 0.1], [-0.32, 0.42]], eyeR = eyeL.map(([x, yy]) => [-x, yy]);
  const mouth = [[-0.58, -0.08], [-0.28, -0.14], [-0.2, -0.04], [-0.08, -0.14], [0.08, -0.14], [0.2, -0.04], [0.28, -0.14], [0.58, -0.08], [0.34, -0.46], [0, -0.56], [-0.34, -0.46]];
  const m = T(0, y + 0.016, 0, -Math.PI / 2);
  b.add(disc(R * 1.18, R * 1.18, 0.012, 0.002, 28), { m: T(0, y + 0.006, 0), color: 0xee7414, rough: 0.45, clear: 0.4 });
  for (const sh of [eyeL, eyeR, mouth]) {
    b.add(shapeGeo(sh.map(([x, q]) => [x * R * 1.12, q * R * 1.12]).reverse()), { m, color: 0x7a2606, rough: 0.5 });
    b.add(shapeGeo(sh.map(([x, q]) => [x * R * 0.96, q * R * 0.96 - 0.01]).reverse()), { m: T(0, y + 0.024, 0, -Math.PI / 2), color: 0xffd24a, rough: 0.45, emis: 0.9 });
  }
}

class Pad {
  constructor(L, { x, z, R, y = 0, kind = 0, spec }) {
    Object.assign(this, { L, x, z, R, y, spec });
    this.state = 0; this.timer = 0; this.dy = 0; this.vy = 0;
    this.c = L.addCol(makeCyl(x, y - 0.45, z, R, 0.9, { kinematic: true }));
    this.rnd = L.R();
    L.art((_, group) => {
      const b = new Batch();
      const orange = kind === 0;
      const top = orange ? 0xff8d1e : 0x8a3af0;
      const rim = orange ? 0x7a3ae8 : 0xff8d1e;
      b.add(disc(R, R * 0.92, 0.9, 0.26, 44), { m: T(0, -0.45, 0), color: gradY(-0.45, new THREE.Color(top).multiplyScalar(0.6), 0.45, top), rough: 0.3, clear: 0.5 });
      b.add(torus(R * 0.88, 0.07, 6, 48), { m: T(0, 0.0, 0, Math.PI / 2), color: rim, rough: 0.25, clear: 1 });
      if (orange) padFace(b, R * 0.56, 0.0);
      b.add(disc(R * 0.3, R * 0.36, 14, 0.1, 16), { m: T(0, -7.8, 0), color: gradY(-7, 0x241468, 7, 0x6a30c8), rough: 0.35, clear: 0.6 });
      b.add(disc(R * 0.5, R * 0.3, 0.7, 0.1, 16), { m: T(0, -1.2, 0), color: rim, rough: 0.28, clear: 0.9 });
      this.mesh = new THREE.Mesh(b.build(), toy({ key: 'world' }));
      this.mesh.position.set(x, y, z);
      this.mesh.receiveShadow = L.tier.shadow > 0;
      this.mesh.castShadow = true;
      this.mesh.layers.enable(1);
      this.mesh.frustumCulled = false;
      group.add(this.mesh);
    });
  }
  warn(t = 1.8) { if (this.state === 0) { this.state = 1; this.timer = t; this.L.world.emit('curse', null, this.x, this.y, this.z); } }
  step(time, dt) {
    if (this.state === 1) {
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 2; this.L.world.emit('tileFall', null, this.x, this.y, this.z); }
    } else if (this.state === 2) {
      this.vy += 30 * dt;
      this.dy += this.vy * dt;
      this.c.vy = -this.vy;
      this.c.setPos(this.x, this.y - 0.45 - this.dy, this.z);
      if (this.dy > 40) { this.state = 3; this.c.enabled = false; }
    }
  }
  sync(t) {
    if (!this.mesh) return;
    if (this.state === 3) { this.mesh.visible = false; return; }
    let ox = 0, oz = 0;
    if (this.state === 1) {
      const a = 0.03 + (1 - this.timer / 1.8) * 0.1;
      ox = Math.sin(t * 58 + this.rnd * 9) * a; oz = Math.cos(t * 51 + this.rnd * 3) * a;
    }
    this.mesh.position.set(this.x + ox, this.y - this.dy, this.z + oz);
    if (this.state === 2) this.mesh.rotation.set(this.dy * 0.05 * (this.rnd - 0.5), 0, this.dy * 0.05 * (0.5 - this.rnd));
  }
  get safe() { return this.state === 0; }
}

/** Tube walkway between two pads. It falls as soon as either end does. */
class Bridge {
  constructor(L, a, b, r = 0.62, color = 0x8a3af0, c2 = 0xff8d1e) {
    Object.assign(this, { L, a, b, r });
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    // Trim to run from rim to rim.
    const ax = a.x + ux * (a.R - 0.5), az = a.z + uz * (a.R - 0.5), bx = b.x - ux * (b.R - 0.5), bz = b.z - uz * (b.R - 0.5);
    const seg = Math.hypot(bx - ax, bz - az);
    this.x = (ax + bx) / 2; this.z = (az + bz) / 2; this.y = -r * 0.82; this.dy = 0; this.vy = 0;
    this.ry = Math.atan2(ux, uz);
    this.c = L.addCol(makeCapsule(this.x, this.y, this.z, r, seg, { kinematic: true, noClimb: true }));
    this.c.setEuler(Math.PI / 2, this.ry, 0);
    L.art((_, group) => {
      const g = new Batch();
      const A = new THREE.Color(color), B = new THREE.Color(c2);
      g.add(bandCapsule(r, seg, 12, 4), {
        color: (p, n, o) => { const c = Math.sin(p.y * 1.5) > 0 ? A : B; o.r = c.r; o.g = c.g; o.b = c.b; }, rough: 0.28, clear: 0.8,
      });
      this.mesh = new THREE.Mesh(g.build(), toy({ key: 'world' }));
      this.mesh.rotation.order = 'YXZ';
      this.mesh.rotation.set(Math.PI / 2, this.ry, 0);
      this.mesh.position.set(this.x, this.y, this.z);
      this.mesh.layers.enable(1);
      this.mesh.castShadow = true;
      this.mesh.frustumCulled = false;
      group.add(this.mesh);
    });
    this.falling = false;
  }
  step(time, dt) {
    if (!this.falling && (this.a.state >= 2 || this.b.state >= 2)) this.falling = true;
    if (this.falling && this.c.enabled) {
      this.vy += 30 * dt;
      this.dy += this.vy * dt;
      this.c.vy = -this.vy;
      this.c.setPos(this.x, this.y - this.dy, this.z);
      if (this.dy > 40) this.c.enabled = false;
    }
  }
  sync() {
    if (!this.mesh) return;
    if (!this.c.enabled) { this.mesh.visible = false; return; }
    this.mesh.position.y = this.y - this.dy;
  }
}

class Beams {
  constructor(L, { y = 0.84, radius = 22, r = 0.5, speed = 0.75, arms = 2 }) {
    Object.assign(this, { L, y, radius, r, arms });
    this.speed = speed; this.angle = 0;
    this.cols = [];
    for (let i = 0; i < arms; i++) {
      this.cols.push(L.addCol(new (makeCyl(0, 0, 0, 1, 1).constructor)(3, {
        x: 0, y, z: 0, hx: r, hy: (radius - 6) / 2, kinematic: true, noClimb: true,
        hazard: { knock: 4.6, up: 6.2, stun: 0.8, speedScale: 0.14, minClosing: 0.2 },
      })));
    }
    L.art((_, group) => {
      this.mesh = makeSpinBar({ len: radius - 5, r, arms, hub: 0.5, post: 0 });
      this.mesh.position.set(0, y, 0);
      group.add(this.mesh);
    });
    this.step(0, 0);
  }
  step(time, dt) {
    if (this.L.sim?.phase === 'play') this.angle += this.speed * dt;
    const a = this.angle;
    const inner = 6, mid = (this.radius + inner) / 2;
    for (let i = 0; i < this.arms; i++) {
      const b = a + (i / this.arms) * TAU;
      const c = this.cols[i];
      c.setPos(Math.cos(b) * mid, this.y, -Math.sin(b) * mid);
      c.setEuler(0, b, Math.PI / 2);
      c.wx = 0; c.wy = this.speed; c.wz = 0;
      c.vx = -Math.sin(b) * mid * this.speed; c.vy = 0; c.vz = -Math.cos(b) * mid * this.speed;
    }
  }
  sync() { if (this.mesh) this.mesh.rotation.y = this.angle; }
  /** Seconds until a beam next passes over this point. */
  timeToReach(x, z) {
    const d = Math.hypot(x, z);
    if (d < 5 || d > this.radius + 1) return Infinity;
    const ang = Math.atan2(-z, x);
    let best = Infinity;
    for (let i = 0; i < this.arms; i++) {
      const b = this.angle + (i / this.arms) * TAU;
      let diff = (ang - b) % TAU;
      if (diff < 0) diff += TAU;
      best = Math.min(best, diff / Math.abs(this.speed));
    }
    return best;
  }
}

class Director {
  constructor(L, pads, beams) {
    Object.assign(this, { L, pads, beams });
    this.next = 10;
    this.fallen = 0;
  }
  step(time, dt) {
    const sim = this.L.sim;
    if (!sim || sim.phase !== 'play') return;
    const e = sim.elapsed;
    // Beams accelerate steadily, then sharply once the clock runs long, so every final ends.
    this.beams.speed = 0.72 + Math.min(1, e / 40) * 0.5 + Math.max(0, e - 55) * 0.05;
    this.next -= dt;
    if (this.next <= 0) {
      const safe = this.pads.filter((p) => p.safe);
      if (safe.length > 3) {
        // Outer pads go first; the crowded ones are favoured.
        safe.sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z));
        const pool = safe.slice(0, Math.ceil(safe.length * 0.6));
        pool[Math.floor(this.L.R() * pool.length)].warn();
      }
      this.next = Math.max(3.2, 7 - e * 0.05);
    }
  }
}

function brain(L) {
  return function (bot) {
    const r = bot.r, skill = bot.skill, m = bot.memo;
    if (r.state !== S.RUN) return;
    const pads = L.pads, beams = L.beams;
    let here = null, hd = Infinity;
    for (const p of pads) {
      if (p.state >= 2) continue;
      const d = Math.hypot(p.x - r.x, p.z - r.z);
      if (d < hd) { hd = d; here = p; }
    }
    // Jump the beam: clearing it takes a head start. Skill decides how often the timing is right.
    const tta = beams.timeToReach(r.x + r.vx * 0.1, r.z + r.vz * 0.1);
    if (r.grounded && tta > JUMP_LEAD_MIN && tta < JUMP_LEAD_MAX) {
      if (m.beamMiss === undefined) m.beamMiss = bot.rand() > 0.92 + skill * 0.07;
      if (!m.beamMiss) bot.doJump();
    } else if (tta > 0.8) m.beamMiss = undefined;

    m.think = (m.think ?? bot.rand()) - 1 / 30;
    const threatened = here && !here.safe;
    if (!m.goal || !m.goal.safe || threatened || m.think <= 0) {
      m.think = 1.2 + bot.rand() * 2.4;
      let best = null, bs = -Infinity;
      for (const p of pads) {
        if (!p.safe) continue;
        const d = Math.hypot(p.x - r.x, p.z - r.z);
        const crowd = L.sim.racers.filter((o) => o !== r && o.active && Math.hypot(o.x - p.x, o.z - p.z) < p.R).length;
        const s = -d * 0.2 - crowd * 0.4 - Math.hypot(p.x, p.z) * 0.02 + (p === here && !threatened ? 2.6 : 0) + bot.rand() * (1.6 - skill);
        if (s > bs) { bs = s; best = p; }
      }
      m.goal = best;
    }
    const g = m.goal;
    if (!g) { bot.wx = 0; bot.wz = 0; return; }
    const dx = g.x - r.x, dz = g.z - r.z, d = Math.hypot(dx, dz) || 1;
    if (d < 1.1) { bot.wx = 0; bot.wz = 0; return; }
    const slow = d < 2 ? 0.45 : 1;
    bot.wx = (dx / d) * slow; bot.wz = (dz / d) * slow;
    if (r.grounded && g !== here) {
      const ahead = L.world.groundBelow(r.x + (dx / d) * 1.05, r.y + 0.3, r.z + (dz / d) * 1.05, 1.2, { y: 0, collider: null });
      if (!ahead) bot.doJump();
    } else if (!r.grounded && r.vy < -2 && d > 3 && bot.rand() < 0.2 + skill * 0.6) {
      bot.doDive();
    }
  };
}

export function build(ctx) {
  const L = new Level(ctx);
  L.title = 'Final Showdown';
  L.objective = 'Last one standing!';
  L.mode = ROUND_MODES.LAST;
  L.theme = 'final';
  const slimeY = -6;
  L.reflectY = slimeY;
  L.killY = slimeY - 0.6;
  L.timeLimit = 140;
  L.bloom = 0.45;
  L.addLiquid({ y: slimeY, kind: 'slime' });

  // Central cauldron is solid, so nobody can hide behind the beams' origin.
  const cR = 5.6;
  L.addCol(makeCyl(0, 1.2, 0, cR * 0.86, 16, {}));

  // Round pads joined by tube walkways, forming a wheel around the cauldron, per the key art.
  L.pads = [];
  const ringR = 17, n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.31;
    L.pads.push(L.addObstacle(new Pad(L, { x: Math.sin(a) * ringR, z: Math.cos(a) * ringR, R: 3.5, kind: i % 2 })));
  }
  const inner = 6;
  for (let i = 0; i < inner; i++) {
    const a = ((i + 0.5) / inner) * TAU + 0.31;
    L.pads.push(L.addObstacle(new Pad(L, { x: Math.sin(a) * 10.4, z: Math.cos(a) * 10.4, R: 2.5, kind: (i + 1) % 2 })));
  }
  for (let i = 0; i < n; i++) L.addObstacle(new Bridge(L, L.pads[i], L.pads[(i + 1) % n], 0.6, i % 2 ? 0x8a3af0 : 0xff8d1e, i % 2 ? 0xff8d1e : 0x8a3af0));
  for (let i = 0; i < inner; i++) {
    // Each inner pad connects outward to the nearest ring pad.
    const p = L.pads[n + i];
    let best = 0, bd = Infinity;
    for (let k = 0; k < n; k++) { const d = Math.hypot(L.pads[k].x - p.x, L.pads[k].z - p.z); if (d < bd) { bd = d; best = k; } }
    L.addObstacle(new Bridge(L, p, L.pads[best], 0.55, 0x8a3af0, 0xffb030));
  }
  L.beams = L.addObstacle(new Beams(L, { radius: 21.5, arms: 2, speed: 0.72 }));
  L.director = L.addObstacle(new Director(L, L.pads, L.beams));
  L.setupBot = (b) => { b.custom = brain(L); };
  L.spawns = L.pads.slice(0, 10).map((p) => ({ x: p.x, y: 0.1, z: p.z, yaw: Math.atan2(-p.x, -p.z) }));
  L.introPath = { from: [24, 18, 40], to: [0, 9, 27], lookFrom: [0, 4, 0], lookTo: [0, 1, 0] };

  L.art((s) => {
    const k = makeCauldron(s, 0, slimeY - 0.4, 0, cR);
    const S2 = s.solid;
    const R = rng(66);
    // The bubbling brew heaps up above the rim and glows into the bloom.
    S2.add(disc(k.R, k.R, 0.1, 0.01, 40), { m: T(0, k.rimY - 0.18, 0), color: 0x9cff3a, rough: 0.4, emis: 1.2 });
    for (let i = 0; i < 26; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * k.R * 0.86;
      const size = R.range(0.5, 1.25);
      const heap = (1 - d / k.R) * 2.1;
      S2.add(new THREE.SphereGeometry(size, 10, 8), { m: T(Math.cos(a) * d, k.rimY + heap + R.range(-0.2, 0.3), Math.sin(a) * d), color: 0xb0ff4a, rough: 0.3, clear: 0.4, emis: 1 });
    }
    // Drips that run over the rim and down the belly.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + R() * 0.2, len = R.range(0.8, 2.6);
      const pts = [];
      for (let q = 0; q <= 4; q++) {
        const yy = k.rimY + 0.3 - (q / 4) * len;
        const rad = k.profile(yy - (slimeY - 0.4)) + 0.06;
        pts.push([Math.cos(a) * rad, yy, Math.sin(a) * rad]);
      }
      S2.add(tube(pts, (t) => (t > 0.85 ? 0.32 : 0.21), 10, 7), { color: 0xa0ff3e, rough: 0.35, clear: 0.5, emis: 0.9 });
    }
    s.halo(0, k.rimY + 2, 0, 30, 0x8cff2e, 0.2);
    // Fire beneath the cauldron.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      S2.add(capsule(0.6, 1.5, 4, 8), { m: T(Math.cos(a) * 3.6, slimeY + 0.6, Math.sin(a) * 3.6), color: 0xff8a1e, rough: 0.5, emis: 1.8 });
    }
    s.halo(0, slimeY + 1.6, 0, 22, 0xff6a14, 0.24);
    buildCastle(s, { x: 0, y: slimeY - 2, z: -170, scale: 1.05 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU, d = 40 + R() * 16;
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (z < -30 && Math.abs(x) < 16) continue;
      if (i % 3 === 0) s.bannerPole(x, slimeY + 0.5, z, 1.4, a, 14);
      else if (i % 3 === 1) s.deadTree(x, slimeY, z, R.range(2, 3), i, 0x5a1a5a);
      else s.mushroom(x, R.range(-2, 2), z, R.range(2.6, 4.2), { cap: i % 2 ? 0xff8d1e : 0x8a3af0, rim: i % 2 ? 0x8a3af0 : 0xff8d1e, height: 8 });
    }
    for (const sd of [1, -1]) {
      s.terrace(sd * 66, 3, -60, 26, 90, 16);
      s.jackO(sd * 58, 5.4, -40, 3.2, sd > 0 ? -0.6 : 0.6);
      s.lanternPost(sd * 58, 3, -76, 1.8);
    }
  });
  addBubbles(L, slimeY, 44);
  L.addBalloon(-60, 34, -90, 5.4, { c1: 0xa52ce0, c2: 0xff9022 });
  L.addBalloon(70, 42, -80, 5.8, { c1: 0xff9022, c2: 0x7a2be0 });
  L.addFloatGhost(-36, 20, -40, 3);
  L.addFloatGhost(38, 22, -46, 3.2);
  L.addBackdrop({ dark: 0x3a1078, light: 0x8a2cc8, treeCol: 0x1c0848, ring: 520, seed: 61 });
  L.finishArt();
  void box; void makeBox;
  return L;
}
