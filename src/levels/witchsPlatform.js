// Round: Witch's Platform. Octagon pillars over glowing slime. The witch's curse sinks pillars and a
// giant pumpkin bounds across the field. Survive the clock.
import * as THREE from 'three';
import { Level, ROUND_MODES, T, gradY, Batch, toy, makeCyl, makeSphere } from './base.js';
import { S } from '../physics/racer.js';
import { box, disc, prism, rng, torus, blob, shapeGeo } from '../render/geo.js';
import { makeBoulder } from '../assets/obstacles.js';
import { buildCastle } from '../assets/castle.js';
import { spawnRing } from './hauntedFloor.js';

const TOP_ORANGE = 0xff8d1e, TOP_PURPLE = 0x7a3ae8;

class PillarField {
  constructor(L, { rows = 5, gap = 7.3, R = 3.05, topY = 0, intervalStart = 2.2, intervalEnd = 0.9, warn = 1.3, sunk = 4.2 }) {
    Object.assign(this, { L, R, topY, intervalStart, intervalEnd, warn, sunk });
    this.pillars = [];
    this.next = 6;
    // Staggered hex layout.
    for (let row = -rows + 1; row < rows; row++) {
      const cols = rows * 2 - 1 - Math.abs(row);
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * gap;
        const z = row * gap * 0.875;
        const orange = (c + row + 20) % 2 === 0;
        const col = makeCyl(x, topY - 0.5, z, R, 1, { kinematic: true, noClimb: false });
        const p = { x, z, col, h: 0, state: 0, timer: 0, orange, idx: this.pillars.length, phase: L.R() * 6.28, topY };
        L.addCol(col);
        this.pillars.push(p);
      }
    }
    L.art((_, group) => {
      const b = new Batch();
      const h = 14;
      b.add(prism(R + 0.05, 1.1, 8, 0.26), { m: T(0, -0.55, 0), color: 0xffffff, rough: 0.34, clear: 0.35 });
      b.add(prism(R * 0.95, h, 8, 0.1), { m: T(0, -1.1 - h / 2, 0), color: gradY(-h / 2, 0x241468, h / 2, 0x5e30c8), rough: 0.3, clear: 0.8 });
      b.add(prism(R * 0.74, 0.1, 8, 0.03), { m: T(0, 0.01, 0), color: 0xf0e4ff, rough: 0.34, clear: 0.35 });
      const geo = b.build();
      this.mesh = new THREE.InstancedMesh(geo, toy({ key: 'worldInst' }), this.pillars.length);
      this.mesh.castShadow = false;
      this.mesh.receiveShadow = L.tier.shadow > 0;
      this.mesh.frustumCulled = false;
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.dummy = new THREE.Object3D();
      this.color = new THREE.Color();
      for (const p of this.pillars) {
        this.paint(p, p.orange ? TOP_ORANGE : TOP_PURPLE);
        this.place(p, 0);
      }
      group.add(this.mesh);
      this.mesh.layers.enable(1);
      // Printed jack-o'-lantern on the orange tops, per the key art.
      const fb = new Batch();
      const dark = 0xb0450c;
      const eL = [[-0.46, 0.08], [-0.14, 0.08], [-0.3, 0.38]], eR = eL.map(([x, y]) => [-x, y]);
      const mouth = [[-0.56, -0.08], [-0.28, -0.14], [-0.2, -0.04], [-0.08, -0.14], [0.08, -0.14], [0.2, -0.04], [0.28, -0.14], [0.56, -0.08], [0.32, -0.42], [0, -0.52], [-0.32, -0.42]];
      for (const sh of [eL, eR, mouth]) fb.add(shapeGeo(sh.map(([x, y]) => [x * R * 0.72, y * R * 0.72]).reverse()), { m: T(0, 0.07, 0, -Math.PI / 2), color: dark, rough: 0.5 });
      const orange = this.pillars.filter((q) => q.orange);
      this.faces = new THREE.InstancedMesh(fb.build(), toy({ key: 'worldInst' }), orange.length);
      this.faces.frustumCulled = false;
      this.faces.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      orange.forEach((q, i) => { q.faceIdx = i; });
      group.add(this.faces);
    });
  }
  place(p, t) {
    if (!this.mesh) return;
    const d = this.dummy;
    d.position.set(p.x, p.topY + p.h, p.z);
    if (p.state === 1) {
      const k = 1 - p.timer / this.warn, a = 0.02 + 0.06 * k;
      d.position.x += Math.sin(t * 55 + p.phase) * a;
      d.position.z += Math.cos(t * 49 + p.phase) * a;
    }
    d.updateMatrix();
    this.mesh.setMatrixAt(p.idx, d.matrix);
    if (p.faceIdx !== undefined) this.faces.setMatrixAt(p.faceIdx, d.matrix);
  }
  paint(p, hex) { if (this.mesh) this.mesh.setColorAt(p.idx, this.color.set(hex)); }

  curse(p) {
    p.state = 1;
    p.timer = this.warn;
    this.L.world.emit('curse', null, p.x, this.topY, p.z);
  }

  step(time, dt) {
    const L = this.L, sim = L.sim;
    if (sim && sim.phase === 'play') {
      this.next -= dt;
      if (this.next <= 0) {
        const k = Math.min(1, sim.elapsed / (L.timeLimit || 60));
        this.next = this.intervalStart + (this.intervalEnd - this.intervalStart) * k;
        // Curses arrive in growing batches; prefer pillars someone's standing on, to keep things moving.
        const batch = 1 + Math.floor(k * 3);
        const free = this.pillars.filter((p) => p.state === 0);
        for (let i = 0; i < batch && free.length; i++) {
          let pick = null;
          if (L.R() < 0.55) {
            const candidates = free.filter((p) => sim.racers.some((r) => r.active && !r.eliminated && Math.hypot(r.x - p.x, r.z - p.z) < this.R));
            if (candidates.length) pick = candidates[Math.floor(L.R() * candidates.length)];
          }
          if (!pick) pick = free[Math.floor(L.R() * free.length)];
          free.splice(free.indexOf(pick), 1);
          this.curse(pick);
        }
      }
    }
    for (const p of this.pillars) {
      const c = p.col;
      let v = 0;
      if (p.state === 1) {
        p.timer -= dt;
        if (p.timer <= 0) { p.state = 2; }
      } else if (p.state === 2) {
        v = -6.5;
        p.h += v * dt;
        if (p.h <= -6) { p.h = -6; p.state = 3; p.timer = this.sunk; v = 0; }
      } else if (p.state === 3) {
        p.timer -= dt;
        if (p.timer <= 0) p.state = 4;
      } else if (p.state === 4) {
        v = 3.8;
        p.h += v * dt;
        if (p.h >= 0) { p.h = 0; p.state = 0; v = 0; }
      }
      c.setPos(p.x, this.topY + p.h - 0.5, p.z);
      c.vy = v;
    }
  }

  sync(t) {
    if (!this.mesh) return;
    for (const p of this.pillars) {
      this.place(p, t);
      let hex = p.orange ? TOP_ORANGE : TOP_PURPLE;
      if (p.state === 1 || p.state === 2) {
        hex = Math.sin(t * 22) > 0 ? 0x8cff2e : 0xe8ffb0;
      }
      this.paint(p, hex);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.faces.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  safe(p) { return p.state === 0 && Math.abs(p.h) < 0.02; }
}

/** A giant pumpkin that bounds across the field in big parabolic hops. */
class HoppingPumpkin {
  constructor(L, field, { R = 2.7, hopHeight = 6, hopTime = 0.95, restDelay = 4.6, delay = 11 }) {
    Object.assign(this, { L, field, R, hopHeight, hopTime, restDelay });
    this.next = delay;
    this.active = false;
    this.c = L.addCol(makeSphere(0, -60, 0, R * 0.92, { kinematic: true, noClimb: true, enabled: false, hazard: { knock: 9, up: 8, stun: 1.1, speedScale: 0.5, minClosing: -5 } }));
    this.rot = 0;
    L.art((_, group) => {
      this.mesh = makeBoulder(R);
      this.mesh.visible = false;
      group.add(this.mesh);
    });
  }
  launch(time) {
    const f = this.field;
    // Cross the field along a random diameter.
    const a = this.L.R() * Math.PI * 2;
    const dirX = Math.cos(a), dirZ = Math.sin(a);
    const pts = f.pillars.map((p) => ({ p, along: p.x * dirX + p.z * dirZ, off: Math.abs(-p.x * dirZ + p.z * dirX) })).filter((q) => q.off < 4.5).sort((q, w) => q.along - w.along);
    if (pts.length < 3) return;
    this.path = pts.filter((q, i) => i === 0 || q.along - pts[i - 1].along > 4).map((q) => q.p);
    this.i = 0; this.hopT = 0;
    this.from = { x: this.path[0].x - dirX * 16, z: this.path[0].z - dirZ * 16, y: 12 };
    this.to = this.path[0];
    this.active = true;
    this.c.enabled = true;
    this.heading = Math.atan2(dirX, dirZ);
    void time;
  }
  step(time, dt) {
    const sim = this.L.sim;
    if (!sim || sim.phase !== 'play') return;
    if (!this.active) {
      this.next -= dt;
      if (this.next <= 0) { this.next = this.restDelay; this.launch(time); }
      return;
    }
    this.hopT += dt / this.hopTime;
    const k = Math.min(1, this.hopT);
    const a = this.from, b = this.to;
    const by = (b.topY ?? 0) + (b.h ?? 0) + this.R * 0.82, ay = a.y ?? by;
    const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
    const y = ay + (by - ay) * k + Math.sin(k * Math.PI) * this.hopHeight;
    const c = this.c;
    const vx = (b.x - a.x) / this.hopTime, vz = (b.z - a.z) / this.hopTime;
    const vy = ((by - ay) + Math.cos(k * Math.PI) * Math.PI * this.hopHeight) / this.hopTime;
    c.setPos(x, y, z);
    c.vx = vx; c.vy = vy; c.vz = vz;
    this.rot += dt * 3.2;
    if (k >= 1) {
      this.L.world.emit('thud', null, x, by - this.R, z, 14);
      this.i++;
      this.hopT = 0;
      this.from = { x: b.x, z: b.z, y: by };
      if (this.i < this.path.length) this.to = this.path[this.i];
      else if (this.i === this.path.length) {
        const dx = b.x - this.path[this.i - 2]?.x || 0, dz = b.z - this.path[this.i - 2]?.z || 0, l = Math.hypot(dx, dz) || 1;
        this.to = { x: b.x + (dx / l) * 18, z: b.z + (dz / l) * 18, topY: -24, h: 0 };
      } else {
        this.active = false;
        c.enabled = false;
        c.setPos(0, -60, 0);
      }
    }
  }
  sync() {
    if (!this.mesh) return;
    this.mesh.visible = this.active;
    if (!this.active) return;
    const c = this.c;
    this.mesh.position.set(c.px, c.py, c.pz);
    this.mesh.rotation.set(this.rot * 0.9, this.heading, 0, 'YXZ');
    const sq = 1 + Math.sin(this.hopT * Math.PI) * 0.06;
    this.mesh.scale.set(1 / sq, sq, 1 / sq);
  }
  /** AI: which pillar is this heading for next? */
  danger(p) {
    if (!this.active || !this.to) return false;
    return this.to === p || (this.path && this.path[this.i + 1] === p);
  }
}

function brain(field, pumpkin) {
  return function (bot) {
    const r = bot.r, skill = bot.skill, m = bot.memo;
    if (r.state !== S.RUN) return;
    // Which pillar are we on (or nearest to)?
    let here = null, hd = Infinity;
    for (const p of field.pillars) {
      const d = Math.hypot(p.x - r.x, p.z - r.z);
      if (d < hd) { hd = d; here = p; }
    }
    m.think = (m.think ?? bot.rand()) - 1 / 30;
    const threatened = here && (!field.safe(here) || pumpkin.danger(here));
    const reactTime = 0.42 - skill * 0.34;
    if (threatened) m.alarm = (m.alarm ?? 0) + 1 / 30; else m.alarm = 0;
    const panic = threatened && m.alarm >= reactTime;

    if (!m.goal || panic || m.think <= 0 || !field.safe(m.goal) || pumpkin.danger(m.goal)) {
      m.think = 0.8 + bot.rand() * 1.8;
      let best = null, bs = -Infinity;
      for (const p of field.pillars) {
        if (!field.safe(p) || pumpkin.danger(p)) continue;
        const d = Math.hypot(p.x - r.x, p.z - r.z);
        if (d > 11) continue;
        const crowd = field.L.sim.racers.filter((o) => o !== r && o.active && Math.hypot(o.x - p.x, o.z - p.z) < 2.5).length;
        const s = -d * (panic ? 0.15 : 0.28) - crowd * 0.8 - Math.hypot(p.x, p.z) * 0.03 + bot.rand() * (1.5 - skill) + (p === here && !panic ? 2.6 : 0);
        if (s > bs) { bs = s; best = p; }
      }
      m.goal = best;
    }
    const g = m.goal;
    if (!g) { bot.wx = 0; bot.wz = 0; return; }
    const dx = g.x - r.x, dz = g.z - r.z, d = Math.hypot(dx, dz) || 1;
    if (d < 1.2) { bot.wx = 0; bot.wz = 0; return; }
    bot.wx = (dx / d) * (d < 2.2 ? 0.45 : 1); bot.wz = (dz / d) * (d < 2.2 ? 0.45 : 1);
    if (g !== here) {
      if (r.grounded) {
        // Run to the rim, then hop.
        const ahead = field.L.world.groundBelow(r.x + (dx / d) * 1.05, r.y + 0.3, r.z + (dz / d) * 1.05, 1.2, { y: 0, collider: null });
        if (!ahead) bot.doJump();
      } else if (r.vy < -2 && d > 3.4 && bot.rand() < 0.2 + skill * 0.5) {
        bot.doDive();
      }
    }
  };
}

export function build(ctx) {
  const L = new Level(ctx);
  L.title = "Witch's Platform";
  L.objective = 'Survive!';
  L.mode = ROUND_MODES.SURVIVE;
  L.theme = 'slime';
  const slimeY = -3.2;
  L.reflectY = slimeY;
  L.killY = slimeY - 0.6;
  L.timeLimit = 60;
  L.addLiquid({ y: slimeY, kind: 'slime' });
  L.bloom = 0.42;
  L.field = L.addObstacle(new PillarField(L, {}));
  L.pumpkin = L.addObstacle(new HoppingPumpkin(L, L.field, {}));
  L.setupBot = (b) => { b.custom = brain(L.field, L.pumpkin); };
  // Spawn players on every other pillar.
  const ps = L.field.pillars;
  L.spawns = ps.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, y: 0.1, z: p.z, yaw: Math.PI }));
  void spawnRing;
  L.introPath = { from: [30, 18, 36], to: [0, 9, 24], lookFrom: [0, 0, 0], lookTo: [0, 0, -2] };

  L.art((s) => {
    buildCastle(s, { x: 0, y: -8, z: -160, scale: 1.05 });
    // Glowing slime collars at each pillar base.
    for (const p of L.field.pillars) s.halo(p.x, slimeY + 0.2, p.z, 9.5, 0xa8ff46, 0.1);
    const R = rng(44);
    for (let i = 0; i < 26; i++) {
      const a = R() * 6.28, d = R.range(34, 58);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (z < -30 && Math.abs(x) < 20) continue;
      const k = i % 3;
      if (k === 0) s.deadTree(x, slimeY, z, R.range(1.6, 2.6), i, 0x4a1a4e);
      else if (k === 1) s.mushroom(x, R.range(-1, 2.5), z, R.range(2.4, 4), { cap: i % 2 ? TOP_PURPLE : TOP_ORANGE, rim: i % 2 ? TOP_ORANGE : TOP_PURPLE, height: 7 });
      else s.jackO(x, slimeY + 1.6, z, R.range(1.8, 2.8), Math.atan2(-x, -z));
    }
    // Fence and lanterns at the far shore.
    for (const sd of [1, -1]) {
      s.terrace(sd * 62, 2, -60, 22, 80, 14);
      s.jackO(sd * 56, 4.5, -44, 3, sd > 0 ? -0.6 : 0.6);
      s.lanternPost(sd * 54, 2, -72, 1.6);
    }
    s.terrace(0, 1, -100, 90, 18, 11);
    s.fence(-40, -90, 40, -90, 1, {});
  });
  addBubbles(L, slimeY);
  L.addBalloon(-60, 30, -70, 4.6);
  L.addBalloon(66, 38, -90, 5.4);
  L.addFloatGhost(-30, 14, -46, 2.6);
  L.addBackdrop({ dark: 0x241a70, light: 0x5038b8, treeCol: 0x140e48, ring: 520, seed: 31 });
  L.finishArt();
  return L;
}

/** Bubbles rising and popping across the slime. */
export function addBubbles(L, y, radius = 32) {
  L.art((_, group) => {
    const n = L.tier.detail === 0 ? 14 : 34;
    const geo = new THREE.SphereGeometry(0.5, 12, 8);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xd4ff78, roughness: 0.12, transparent: true, opacity: 0.55, emissive: new THREE.Color(0x70e020), emissiveIntensity: 0.5, depthWrite: false, envMapIntensity: 1.2 });
    const inst = new THREE.InstancedMesh(geo, mat, n);
    inst.frustumCulled = false;
    const seeds = [];
    for (let i = 0; i < n; i++) {
      const a = L.R() * 6.28, d = 6 + L.R() * radius;
      seeds.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, s: 0.3 + L.R() * 0.9, sp: 0.35 + L.R() * 0.7, ph: L.R() });
    }
    const dummy = new THREE.Object3D();
    group.add(inst);
    L.animated.push((t) => {
      for (let i = 0; i < n; i++) {
        const q = seeds[i];
        const k = (t * q.sp + q.ph) % 1;
        const sc = q.s * (k < 0.85 ? k / 0.85 : (1 - k) / 0.15 * 1.35);
        dummy.position.set(q.x, y + k * 0.7 * q.s, q.z);
        dummy.scale.setScalar(Math.max(0.001, sc));
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
    });
  });
}

void box; void disc; void torus; void blob;
