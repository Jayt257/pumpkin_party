// One GPU-instanced billboard pool for every effect: dust, splashes, confetti, sparks, trails.
import * as THREE from 'three';
import { particleAtlas } from './textures.js';

export const CELL = { DOT: 0, STAR: 1, SPARK: 2, PUFF: 3, CONFETTI: 4, CANDY: 5, BAT: 6, RING: 7, DROP: 8, HEART: 9, GHOST: 10, BUBBLE: 11 };

export class Particles {
  constructor(capacity = 1400) {
    this.cap = capacity;
    this.n = 0;
    const c = capacity;
    this.px = new Float32Array(c); this.py = new Float32Array(c); this.pz = new Float32Array(c);
    this.vx = new Float32Array(c); this.vy = new Float32Array(c); this.vz = new Float32Array(c);
    this.life = new Float32Array(c); this.maxLife = new Float32Array(c);
    this.size0 = new Float32Array(c); this.size1 = new Float32Array(c);
    this.rot = new Float32Array(c); this.rotV = new Float32Array(c);
    this.grav = new Float32Array(c); this.drag = new Float32Array(c);
    this.cell = new Uint8Array(c);
    this.colR = new Float32Array(c); this.colG = new Float32Array(c); this.colB = new Float32Array(c);
    this.add = new Uint8Array(c);
    this.fadeIn = new Float32Array(c);

    const plane = new THREE.PlaneGeometry(1, 1);
    const makeLayer = (additive) => {
      const g = new THREE.InstancedBufferGeometry();
      g.index = plane.index;
      g.setAttribute('position', plane.attributes.position);
      g.setAttribute('uv', plane.attributes.uv);
      const a = {
        aPos: new THREE.InstancedBufferAttribute(new Float32Array(c * 4), 4).setUsage(THREE.DynamicDrawUsage), // xyz + size
        aColor: new THREE.InstancedBufferAttribute(new Float32Array(c * 4), 4).setUsage(THREE.DynamicDrawUsage), // rgb + alpha
        aMisc: new THREE.InstancedBufferAttribute(new Float32Array(c * 2), 2).setUsage(THREE.DynamicDrawUsage), // rot + cell
      };
      for (const k in a) g.setAttribute(k, a[k]);
      g.instanceCount = 0;
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { tAtlas: { value: particleAtlas() } },
        vertexShader: /* glsl */`
          attribute vec4 aPos; attribute vec4 aColor; attribute vec2 aMisc;
          varying vec2 vUv; varying vec4 vC;
          void main(){
            float c = aMisc.y;
            vec2 cellOrigin = vec2(mod(c,4.0), floor(c/4.0))*0.25;
            // Atlas row 0 is at the top of the canvas; flipY maps that to v near 1.
            vUv = vec2(cellOrigin.x + uv.x*0.25, 1.0 - cellOrigin.y - 0.25 + uv.y*0.25);
            vC = aColor;
            vec4 mv = viewMatrix*vec4(aPos.xyz,1.0);
            float s = sin(aMisc.x), co = cos(aMisc.x);
            vec2 p = position.xy*aPos.w;
            mv.xy += vec2(p.x*co - p.y*s, p.x*s + p.y*co);
            gl_Position = projectionMatrix*mv;
          }`,
        fragmentShader: /* glsl */`
          precision highp float;
          uniform sampler2D tAtlas; varying vec2 vUv; varying vec4 vC;
          void main(){
            vec4 t = texture2D(tAtlas, vUv);
            float a = t.a*vC.a;
            if (a < 0.004) discard;
            gl_FragColor = vec4(t.rgb*vC.rgb, a);
          }`,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 20;
      return { mesh, g, a };
    };
    this.normal = makeLayer(false);
    this.glow = makeLayer(true);
    this.group = new THREE.Group();
    this.group.add(this.normal.mesh, this.glow.mesh);
    this.color = new THREE.Color();
  }

  /** Spawn a single particle. Silently drops when the pool is full. */
  spawn(x, y, z, o = {}) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = o.vx ?? 0; this.vy[i] = o.vy ?? 0; this.vz[i] = o.vz ?? 0;
    this.life[i] = this.maxLife[i] = o.life ?? 0.7;
    this.size0[i] = o.size ?? 0.4; this.size1[i] = o.sizeEnd ?? this.size0[i];
    this.rot[i] = o.rot ?? Math.random() * 6.28; this.rotV[i] = o.spin ?? 0;
    this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 0;
    this.cell[i] = o.cell ?? CELL.DOT;
    this.add[i] = o.additive ? 1 : 0;
    this.fadeIn[i] = o.fadeIn ?? 0;
    const c = o.color ?? 0xffffff;
    this.color.set(c);
    const k = o.intensity ?? 1;
    this.colR[i] = this.color.r * k; this.colG[i] = this.color.g * k; this.colB[i] = this.color.b * k;
  }

  burst(x, y, z, n, f) { for (let i = 0; i < n; i++) f(i, x, y, z); }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._swap(i, --this.n); continue; }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= dr; this.vz[i] *= dr; this.vy[i] = this.vy[i] * dr - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rotV[i] * dt;
      i++;
    }
    let nN = 0, nG = 0;
    const N = this.normal.a, G = this.glow.a;
    const aN = N.aPos.array, cN = N.aColor.array, mN = N.aMisc.array;
    const aG = G.aPos.array, cG = G.aColor.array, mG = G.aMisc.array;
    for (let k = 0; k < this.n; k++) {
      const t = this.life[k] / this.maxLife[k]; // 1 -> 0
      const age = 1 - t;
      const size = this.size1[k] + (this.size0[k] - this.size1[k]) * t;
      let alpha = Math.min(1, t * 2.2);
      if (this.fadeIn[k] > 0) alpha *= Math.min(1, age / this.fadeIn[k]);
      const glow = this.add[k] === 1;
      const j = glow ? nG++ : nN++;
      const a = glow ? aG : aN, c = glow ? cG : cN, m = glow ? mG : mN;
      a[j * 4] = this.px[k]; a[j * 4 + 1] = this.py[k]; a[j * 4 + 2] = this.pz[k]; a[j * 4 + 3] = size;
      c[j * 4] = this.colR[k]; c[j * 4 + 1] = this.colG[k]; c[j * 4 + 2] = this.colB[k]; c[j * 4 + 3] = alpha;
      m[j * 2] = this.rot[k]; m[j * 2 + 1] = this.cell[k];
    }
    this.normal.g.instanceCount = nN;
    this.glow.g.instanceCount = nG;
    if (nN) { N.aPos.needsUpdate = true; N.aColor.needsUpdate = true; N.aMisc.needsUpdate = true; }
    if (nG) { G.aPos.needsUpdate = true; G.aColor.needsUpdate = true; G.aMisc.needsUpdate = true; }
  }

  _swap(i, j) {
    if (i === j) return;
    for (const arr of [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.maxLife, this.size0, this.size1, this.rot, this.rotV, this.grav, this.drag, this.cell, this.colR, this.colG, this.colB, this.add, this.fadeIn]) arr[i] = arr[j];
  }

  clear() { this.n = 0; this.normal.g.instanceCount = 0; this.glow.g.instanceCount = 0; }

  // ------------------------------------------------------------------ canned effects
  dust(x, y, z, n = 6, color = 0xe6d0ff) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 0.8 + Math.random() * 1.8;
      this.spawn(x + Math.cos(a) * 0.3, y + 0.12, z + Math.sin(a) * 0.3, { vx: Math.cos(a) * sp, vy: 0.6 + Math.random(), vz: Math.sin(a) * sp, life: 0.42 + Math.random() * 0.28, size: 0.35 + Math.random() * 0.25, sizeEnd: 0.9, drag: 3, cell: CELL.PUFF, color, spin: (Math.random() - 0.5) * 2 });
    }
  }

  ringPulse(x, y, z, size = 1.4, color = 0xffffff) {
    this.spawn(x, y, z, { life: 0.28, size: size * 0.3, sizeEnd: size, cell: CELL.RING, color, additive: true, intensity: 1.3 });
  }

  splash(x, y, z, kind = 'water') {
    const col = kind === 'slime' ? 0xa8ff46 : kind === 'moon' ? 0x8fc8ff : 0xb68aff;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 5;
      this.spawn(x, y + 0.2, z, { vx: Math.cos(a) * sp, vy: 6 + Math.random() * 8, vz: Math.sin(a) * sp, gravity: 24, life: 0.8 + Math.random() * 0.4, size: 0.24 + Math.random() * 0.3, sizeEnd: 0.1, cell: CELL.DROP, color: col, intensity: kind === 'slime' ? 1.6 : 1.1 });
    }
    this.spawn(x, y + 0.1, z, { life: 0.55, size: 1, sizeEnd: 7, cell: CELL.RING, color: col, additive: true, intensity: 1.2, rot: 0 });
    for (let i = 0; i < 6; i++) this.spawn(x + (Math.random() - 0.5) * 2, y + 0.3, z + (Math.random() - 0.5) * 2, { vy: 1 + Math.random() * 2, life: 0.8, size: 0.4, sizeEnd: 0.9, cell: CELL.BUBBLE, color: col, gravity: -1 });
  }

  impact(x, y, z, big = 1) {
    const cols = [0xffd23a, 0xffffff, 0xff8d14, 0xff5ad0];
    for (let i = 0; i < 14 * big; i++) {
      const a = Math.random() * 6.28, b = Math.random() * 3.14, sp = 4 + Math.random() * 6;
      this.spawn(x, y, z, { vx: Math.cos(a) * Math.sin(b) * sp, vy: Math.cos(b) * sp, vz: Math.sin(a) * Math.sin(b) * sp, gravity: 12, life: 0.42 + Math.random() * 0.3, size: 0.42 + Math.random() * 0.3, sizeEnd: 0.05, cell: i % 2 ? CELL.STAR : CELL.SPARK, color: cols[i % 4], additive: true, intensity: 1.5, spin: 6 });
    }
    this.spawn(x, y, z, { life: 0.2, size: 1, sizeEnd: 3.6, cell: CELL.SPARK, color: 0xffffff, additive: true, intensity: 1.8 });
  }

  confetti(x, y, z, n = 80, spread = 6) {
    const cols = [0xff8d14, 0x7a3ae8, 0xffd23a, 0x53f0ff, 0xff5ad0, 0x8cff3a];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, r = Math.random() * spread;
      this.spawn(x + Math.cos(a) * r, y + Math.random() * 2, z + Math.sin(a) * r, { vx: Math.cos(a) * (1 + Math.random() * 3), vy: 5 + Math.random() * 9, vz: Math.sin(a) * (1 + Math.random() * 3), gravity: 9, drag: 1.2, life: 1.6 + Math.random() * 1.4, size: 0.26 + Math.random() * 0.14, cell: i % 5 === 0 ? CELL.STAR : CELL.CONFETTI, color: cols[i % 6], spin: (Math.random() - 0.5) * 16 });
    }
  }

  sparkle(x, y, z, color = 0xffd23a, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 0.6 + Math.random() * 1.6;
      this.spawn(x, y + Math.random() * 1.4, z, { vx: Math.cos(a) * sp, vy: 0.8 + Math.random() * 2, vz: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.5, size: 0.2 + Math.random() * 0.2, sizeEnd: 0, cell: CELL.SPARK, color, additive: true, intensity: 1.6, spin: 3 });
    }
  }
}
