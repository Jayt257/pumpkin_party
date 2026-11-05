// Static scenery: a Scenery object collects every prop into a few merged meshes, one per material.
import * as THREE from 'three';
import {
  Batch, T, TAU, blob, box, capsule, disc, gradY, lathe, lerp, paramSurface, prism, pumpkinGeo, rawBox, rng, shapeGeo, sphere, stemGeo, torus, tube, uvPlanar, witchHatGeo, archShape, smooth,
} from '../render/geo.js';
import { toy } from '../render/materials.js';
import { bannerTexture, brickTextures, glowTexture, makeCanvas, paintJackFace, toTexture } from '../render/textures.js';
import { patchToy } from '../render/materials.js';

let jackCache = null;
/** Lit jack-o'-lantern look: dark carved edges, hot yellow candle inside. */
function jackTextures() {
  if (jackCache) return jackCache;
  const f = paintJackFace(512, { glow: 1, scary: true, eye: 'tri', mouth: 'zig', innerA: '#fff46a', innerB: '#ffc21e', dark: '#7a2606' });
  jackCache = { albedo: toTexture(f.albedo), emis: toTexture(f.emis), sampler: f.sampler };
  return jackCache;
}

function jackMaterial(tier) {
  const t = jackTextures();
  const Base = tier.clearcoat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const p = { vertexColors: true, map: t.albedo, emissive: new THREE.Color(1, 0.84, 0.36), emissiveMap: t.emis, emissiveIntensity: 1.45, roughness: 0.4, envMapIntensity: 0.7 };
  if (tier.clearcoat) { p.clearcoat = 1; p.clearcoatRoughness = 0.2; p.specularIntensity = 0.5; }
  const m = patchToy(new Base(p), { rim: 0.07, wrap: 0.05, key: 'jack' });
  m.fog = false; // the castle's pumpkins stay vivid however far away they are
  return m;
}

export class Scenery {
  constructor(tier) {
    this.tier = tier;
    this.solid = new Batch();     // toy plastic
    this.brick = new Batch();     // castle stone with brick texture
    this.jack = new Batch();      // glowing pumpkin faces
    this.two = new Batch();       // double sided (flags, leaves)
    this.bannerB = new Batch();   // printed pennants
    this.halos = [];              // additive glow sprites
    this.signs = [];              // lit text signs
    this.group = new THREE.Group();
    this.R = rng(4242);
    this.lodFar = tier.detail === 0;
  }

  halo(x, y, z, size, color = 0xffb84a, strength = 1) { this.halos.push([x, y, z, size, new THREE.Color(color).multiplyScalar(strength)]); }

  /** Compile everything into meshes. */
  build({ shadowSolid = true } = {}) {
    const add = (batch, material, opts = {}) => {
      if (!batch.tris) return null;
      const m = new THREE.Mesh(batch.build(), material);
      m.castShadow = !!opts.cast && this.tier.shadow > 0;
      m.receiveShadow = !!opts.receive && this.tier.shadow > 0;
      m.frustumCulled = opts.culled ?? false;
      if (opts.reflect) m.layers.enable(1);
      this.group.add(m);
      return m;
    };
    add(this.solid, toy({ key: 'world' }), { cast: shadowSolid, receive: true, reflect: true });
    const tex = brickTextures(this.tier.detail === 0 ? 512 : 1024);
    add(this.brick, toy({ key: 'brick', map: tex.albedo, normalMap: tex.normal, normalScale: 0.7, rim: 0.05, clearRough: 0.35 }), { cast: false, receive: true, reflect: true });
    add(this.jack, jackMaterial(this.tier), { cast: false, receive: false, reflect: true });
    add(this.two, toy({ key: 'two', side: THREE.DoubleSide }), { cast: false, receive: false, reflect: true });
    add(this.bannerB, toy({ key: 'banner', map: bannerTexture(), side: THREE.DoubleSide }), { cast: false, reflect: true });

    for (const sg of this.signs) {
      const c = makeCanvas(512, 128), x = c.getContext('2d');
      x.font = '92px "Lilita One", "Baloo 2", sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineJoin = 'round'; x.lineWidth = 14; x.strokeStyle = '#2a1680';
      x.strokeText(sg.text, 256, 68);
      const grad = x.createLinearGradient(0, 24, 0, 108);
      grad.addColorStop(0, '#fff27a'); grad.addColorStop(1, '#ff9a1e');
      x.fillStyle = grad;
      x.fillText(sg.text, 256, 68);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), new THREE.MeshBasicMaterial({ map: toTexture(c), transparent: true, depthWrite: false, fog: false, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }));
      m.position.set(sg.x, sg.y, sg.z);
      m.layers.enable(1);
      m.renderOrder = 4;
      this.group.add(m);
    }
    if (this.halos.length) {
      const g = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { tMap: { value: glowTexture() }, uFade: { value: 0.0022 } },
        vertexShader: `attribute vec4 aPosSize; attribute vec3 aColor; varying vec2 vUv; varying vec3 vC; uniform float uFade;
          void main(){ vUv=uv; vec4 mv=viewMatrix*vec4(aPosSize.xyz,1.0); mv.xy+=position.xy*aPosSize.w; float d=-mv.z;
            vC=aColor*exp(-d*uFade)*smoothstep(0.5,6.0,d); gl_Position=projectionMatrix*mv; }`,
        fragmentShader: `uniform sampler2D tMap; varying vec2 vUv; varying vec3 vC; void main(){ gl_FragColor=vec4(vC*texture2D(tMap,vUv).a,1.0); }`,
      });
      const ig = new THREE.InstancedBufferGeometry();
      ig.index = g.index; ig.setAttribute('position', g.attributes.position); ig.setAttribute('uv', g.attributes.uv);
      const n = this.halos.length;
      const a = new Float32Array(n * 4), c = new Float32Array(n * 3);
      this.halos.forEach((h, i) => { a[i * 4] = h[0]; a[i * 4 + 1] = h[1]; a[i * 4 + 2] = h[2]; a[i * 4 + 3] = h[3]; c[i * 3] = h[4].r; c[i * 3 + 1] = h[4].g; c[i * 3 + 2] = h[4].b; });
      ig.setAttribute('aPosSize', new THREE.InstancedBufferAttribute(a, 4));
      ig.setAttribute('aColor', new THREE.InstancedBufferAttribute(c, 3));
      ig.instanceCount = n;
      const m = new THREE.Mesh(ig, mat);
      m.frustumCulled = false;
      m.renderOrder = 5;
      this.group.add(m);
    }
    return this.group;
  }

  // ------------------------------------------------------------- props
  /** Glowing jack-o'-lantern. Faces +Z before ry. */
  jackO(x, y, z, R = 1, ry = 0, { stem = true, nu = 44, nv = 26 } = {}) {
    const t = jackTextures();
    const geo = pumpkinGeo({ R: 1, H: 0.84, ribs: 12, depth: 0.11, base: 0xff9012, groove: 0xc84c08, top: 0xffa82a, bottom: 0xe06a0c, nu, nv, faceUV: true, carve: t.sampler, carveDepth: 0.05, frontFlat: 0.6 });
    const m = T(x, y, z, 0, ry, 0, R);
    this.jack.add(geo, { m, rough: 0.38, clear: 0.5, emis: 0.1, sealFace: true });
    if (stem) {
      this.solid.add(stemGeo(R * 1.1), { m: T(x, y + R * 0.58, z, 0, ry + 0.6, 0), color: gradY(0, 0x3f7a22, R * 0.4, 0x7fbf3a), rough: 0.5, clear: 0.4 });
    }
    this.halo(x + Math.sin(ry) * R * 0.3, y, z + Math.cos(ry) * R * 0.3, R * 4.2, 0xff8a1e, 0.4);
  }

  /** Lantern on a stone post, as in the key art. y is the ground level. */
  lanternPost(x, y, z, s = 1, ry = 0) {
    const stone = 0x5a44b8, iron = 0x2c1f4a, wood = 0x6a3a1c;
    const S = this.solid;
    const m = (ax, ay, az, rx = 0, rrz = 0, q = 1) => {
      const c = Math.cos(ry), n = Math.sin(ry);
      return T(x + (ax * c + az * n) * s, y + ay * s, z + (-ax * n + az * c) * s, rx, ry, rrz, s * q);
    };
    S.add(box(1.5, 0.5, 1.5, 0.1, 1), { m: m(0, 0.25, 0), color: gradY(-0.3, 0x3a2a88, 0.3, stone), rough: 0.5, clear: 0.3 });
    S.add(disc(0.34, 0.42, 2.2, 0.06, 12), { m: m(0, 1.5, 0), color: gradY(-1.1, 0x3a2a88, 1.1, stone), rough: 0.5, clear: 0.3 });
    S.add(box(0.95, 0.2, 0.95, 0.05, 1), { m: m(0, 2.68, 0), color: iron, rough: 0.35, clear: 0.6 });
    // Cage
    const h = 1.35, w = 0.42;
    S.add(box(w * 2 - 0.1, h, w * 2 - 0.1, 0.03, 1), { m: m(0, 3.45, 0), color: 0xffa81e, rough: 0.2, clear: 0.8, emis: 1.25 });
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      S.add(rawBox(0.1, h + 0.1, 0.1), { m: m(a * w, 3.45, b * w), color: iron, rough: 0.35, clear: 0.5 });
    }
    S.add(rawBox(w * 2 + 0.1, 0.09, 0.09), { m: m(0, 3.45, w), color: iron, rough: 0.35 });
    S.add(rawBox(w * 2 + 0.1, 0.09, 0.09), { m: m(0, 3.45, -w), color: iron, rough: 0.35 });
    S.add(rawBox(0.09, 0.09, w * 2 + 0.1), { m: m(w, 3.45, 0), color: iron, rough: 0.35 });
    S.add(rawBox(0.09, 0.09, w * 2 + 0.1), { m: m(-w, 3.45, 0), color: iron, rough: 0.35 });
    S.add(lathe([[0.72, 4.14], [0.62, 4.2], [0.22, 4.62], [0.06, 4.78], [0.001, 4.8]], 4, Math.PI / 4), { m: m(0, 0, 0), color: wood, rough: 0.42, clear: 0.5 });
    S.add(sphere(0.09, 8, 6), { m: m(0, 4.84, 0), color: 0xffc830, rough: 0.3, clear: 0.8, emis: 0.5 });
    this.halo(x, y + 3.45 * s, z, 7.5 * s, 0xffb030, 0.6);
  }

  /** Mushroom-shaped pedestal platform. y is the top of the cap. */
  mushroom(x, y, z, R, { cap = 0x7a3ae8, rim = 0xff8a18, stem = 0x4a2aa0, height = 2.6, lod = 32, foot = true } = {}) {
    const S = this.solid;
    S.add(disc(R, R * 0.96, 0.62, 0.2, lod), { m: T(x, y - 0.31, z), color: gradY(-0.31, new THREE.Color(cap).multiplyScalar(0.72), 0.31, cap), rough: 0.26, clear: 1 });
    S.add(torus(R * 0.82, 0.045, 6, lod), { m: T(x, y + 0.005, z, Math.PI / 2), color: new THREE.Color(cap).lerp(new THREE.Color(0xffffff), 0.3), rough: 0.3, clear: 1 });
    S.add(disc(R * 0.88, R * 0.74, 0.34, 0.1, lod), { m: T(x, y - 0.74, z), color: rim, rough: 0.28, clear: 1 });
    S.add(disc(R * 0.42, R * 0.32, height, 0.08, 16), { m: T(x, y - 0.8 - height / 2, z), color: gradY(-height / 2, new THREE.Color(stem).multiplyScalar(0.55), height / 2, stem), rough: 0.4, clear: 0.6 });
    if (foot) S.add(disc(R * 0.5, R * 0.6, 0.3, 0.08, 16), { m: T(x, y - 0.8 - height + 0.1, z), color: new THREE.Color(rim).multiplyScalar(0.8), rough: 0.35, clear: 0.6 });
  }

  /** A big glossy rounded block. y is the centre. */
  block(x, y, z, w, h, d, color = 0x8a2fd0, { r = 0.42, ry = 0, top = null, clear = 1, rough = 0.26 } = {}) {
    this.solid.add(box(w, h, d, r, 2), {
      m: T(x, y, z, 0, ry), rough, clear,
      color: gradY(-h / 2, new THREE.Color(color).multiplyScalar(0.55), h / 2, top ?? color),
    });
  }

  /** Mid-ground stone terrace with brick walls, a warm-lit trim and battlements. y is the top. */
  terrace(x, y, z, w, d, h = 10, { trim = 0xff9022, merlons = true } = {}) {
    const col = gradY(-h / 2, 0x2f2090, h / 2, 0x6248d8);
    this.brick.add(box(w, h, d, 0.25, 1), { m: T(x, y - h / 2, z), color: col, rough: 0.55, clear: 0.2, uv: uvPlanar(1 / 4.5) });
    this.solid.add(box(w + 0.7, 0.42, d + 0.7, 0.14, 1), { m: T(x, y + 0.08, z), color: trim, rough: 0.3, clear: 0.9, emis: 0.3 });
    if (merlons) {
      const nx = Math.max(1, Math.round(w / 3.1));
      for (const zz of [z + d / 2, z - d / 2]) {
        for (let i = 0; i <= nx; i++) this.solid.add(rawBox(1.3, 0.95, 0.75), { m: T(x - w / 2 + (i / nx) * w, y + 0.74, zz), color: 0x7f60f0, rough: 0.42, clear: 0.4 });
      }
    }
  }

  /** Rail fence along a line. Ground-level y. */
  fence(x0, z0, x1, z1, y = 0, { post = 0x3a2666, rail = 0x54348c, h = 1.5, spacing = 3.2 } = {}) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz);
    const n = Math.max(1, Math.round(len / spacing));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.solid.add(box(0.26, h, 0.26, 0.05, 1), { m: T(lerp(x0, x1, t), y + h / 2, lerp(z0, z1, t), 0, ry + (i % 2) * 0.1), color: post, rough: 0.6, clear: 0.15 });
    }
    for (const fy of [0.42, 0.86]) {
      this.solid.add(rawBox(0.12, 0.2, len), { m: T((x0 + x1) / 2, y + h * fy, (z0 + z1) / 2, 0, ry), color: rail, rough: 0.6, clear: 0.15 });
    }
  }

  /** Inflated side tube rail, from the second key art: orange tube with a purple core stripe. */
  tubeRail(x0, y0, z0, x1, y1, z1, { r = 0.34, color = 0xff9426, stripe = 0xffc05a } = {}) {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
    const len = a.distanceTo(b);
    const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
    m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    m.setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.solid.add(capsule(r, len, 4, 14), { m, color, rough: 0.28, clear: 1 });
    void stripe;
  }

  tombstone(x, y, z, s = 1, ry = 0, kind = 0) {
    const col = gradY(0, 0x3f5c8e, 2, 0x8eb4d8);
    const S = this.solid;
    if (kind === 0) {
      S.add(lathe([[0.75, 0], [0.7, 0.2], [0.72, 1.3], [0.55, 1.75], [0.28, 2.05], [0.001, 2.15]], 4, Math.PI / 4), { m: T(x, y, z, 0, ry, 0, s, s, s * 0.5), color: col, rough: 0.3, clear: 0.7 });
    } else if (kind === 1) {
      S.add(box(0.34, 2.1, 0.3, 0.05, 1), { m: T(x, y + 1.05 * s, z, 0, ry, 0, s), color: col, rough: 0.36, clear: 0.5 });
      S.add(box(1.25, 0.32, 0.3, 0.05, 1), { m: T(x, y + 1.42 * s, z, 0, ry, 0, s), color: 0x8eb4d8, rough: 0.36, clear: 0.5 });
    } else {
      S.add(lathe([[0.95, 0], [0.9, 0.3], [0.7, 1.6], [0.32, 2.6], [0.001, 2.9]], 6, 0.3), { m: T(x, y, z, 0, ry, 0, s, s, s * 0.65), color: gradY(0, 0x3f5c8e, 3, 0xa8cce8), rough: 0.14, clear: 1 });
    }
    S.add(box(1.7, 0.28, 1.1, 0.06, 1), { m: T(x, y + 0.1 * s, z, 0, ry, 0, s), color: 0x2f4475, rough: 0.5, clear: 0.2 });
  }

  /** Bare spooky tree with curling branches. */
  deadTree(x, y, z, s = 1, seed = 1, color = 0x6a1f3a) {
    const R = rng(seed + 77);
    const trunkTop = new THREE.Vector3(R.range(-0.3, 0.3), 3.4, R.range(-0.3, 0.3));
    const S = this.solid;
    const m = T(x, y, z, 0, R() * 6.28, 0, s);
    S.add(tube([[0, -0.3, 0], [0.1, 1.2, 0.05], [trunkTop.x * 0.6, 2.4, trunkTop.z * 0.6], [trunkTop.x, trunkTop.y, trunkTop.z]], (t) => lerp(0.5, 0.2, t), this.lodFar ? 6 : 10, 8), { m, color: gradY(0, new THREE.Color(color).multiplyScalar(0.55), 4, color), rough: 0.55, clear: 0.2 });
    const branch = (o, dir, len, r, depth) => {
      const pts = [o.clone()];
      const d = dir.clone();
      const p = o.clone();
      for (let i = 0; i < 4; i++) {
        d.x += R.range(-0.28, 0.28); d.z += R.range(-0.28, 0.28); d.y += R.range(-0.05, 0.3);
        d.normalize();
        p.addScaledVector(d, len / 4);
        pts.push(p.clone());
      }
      S.add(tube(pts, (t) => lerp(r, r * 0.25, t), this.lodFar ? 5 : 8, 6), { m, color, rough: 0.55, clear: 0.2 });
      if (depth > 0) {
        const n = depth > 1 ? 2 : 2;
        for (let k = 0; k < n; k++) {
          const q = pts[2 + k];
          const nd = new THREE.Vector3(R.range(-1, 1), R.range(0.1, 0.8), R.range(-1, 1)).normalize();
          branch(q, nd, len * 0.62, r * 0.55, depth - 1);
        }
      }
    };
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + R();
      branch(trunkTop.clone(), new THREE.Vector3(Math.cos(a), 0.65, Math.sin(a)).normalize(), 2.6, 0.17, this.lodFar ? 1 : 2);
    }
  }

  pine(x, y, z, s = 1, color = 0x2a8f9a, top = null) {
    const S = this.solid;
    S.add(disc(0.28, 0.36, 1.1, 0.03, 8), { m: T(x, y + 0.55 * s, z, 0, 0, 0, s), color: 0x4a2a3a, rough: 0.7 });
    const c = new THREE.Color(color);
    const t = new THREE.Color(top ?? c.clone().lerp(new THREE.Color(0xffffff), 0.25));
    for (let i = 0; i < 3; i++) {
      const k = 1 - i * 0.26;
      const yy = 1 + i * 1.25;
      S.add(lathe([[1.7 * k, 0], [1.72 * k, 0.1], [1.05 * k, 0.8], [0.3 * k, 1.8], [0.001, 2.1]], 9), { m: T(x, y + yy * s, z, 0, i, 0, s), color: gradY(0, c.clone().multiplyScalar(0.72), 2, t), rough: 0.5, clear: 0.3 });
    }
  }

  candle(x, y, z, s = 1) {
    const S = this.solid;
    const h = 0.9 * s;
    S.add(disc(0.11 * s, 0.13 * s, h, 0.02, 8), { m: T(x, y + h / 2, z), color: 0xfff0d0, rough: 0.5, clear: 0.2, emis: 0.2 });
    S.add(blob(0.05 * s, 0.11 * s, 0.05 * s, 8, 6), { m: T(x, y + h + 0.11 * s, z), color: 0xffd060, rough: 0.5, emis: 5 });
    this.halo(x, y + h + 0.1 * s, z, 1.5 * s, 0xffb040, 0.6);
  }

  /** Banner on a pole, with the pumpkin-face print. */
  bannerPole(x, y, z, s = 1, ry = 0, h = 8) {
    const S = this.solid;
    S.add(disc(0.13, 0.17, h, 0.02, 8), { m: T(x, y + h / 2, z, 0, 0, 0, s, 1, s), color: 0x3a2666, rough: 0.5, clear: 0.3 });
    S.add(sphere(0.24, 10, 8), { m: T(x, y + h + 0.1, z, 0, 0, 0, s), color: 0xffb82a, rough: 0.25, clear: 1, emis: 0.2 });
    S.add(capsule(0.07, 2.0, 2, 6), { m: T(x + Math.cos(ry) * 1.1 * s, y + h - 0.35, z - Math.sin(ry) * 1.1 * s, 0, ry, Math.PI / 2), color: 0x3a2666, rough: 0.5 });
    const w = 2 * s, f = 3 * s;
    const geo = paramSurface((u, v, p) => {
      const pointed = v > 0.82 ? (1 - Math.abs(u - 0.5) * 2) : 1;
      const yy = v > 0.82 ? 0.82 + (v - 0.82) * (0.3 + 0.7 * pointed) : v;
      p.set((u - 0.5) * w, -yy * f, Math.sin(u * 5 + v * 3) * 0.09 * s);
    }, 8, 8, { wrapU: false });
    this.bannerB.add(geo, { m: T(x + Math.cos(ry) * 1.1 * s, y + h - 0.4, z - Math.sin(ry) * 1.1 * s, 0, ry), color: 0xffffff, rough: 0.5, clear: 0.2 });
  }

  /** Pennant flag on top of a tower. */
  pennant(x, y, z, s = 1, color = 0xe83a4a, ry = 0.4) {
    this.solid.add(disc(0.09, 0.11, 4 * s, 0.01, 6), { m: T(x, y + 2 * s, z), color: 0x2a1f50, rough: 0.5 });
    const geo = paramSurface((u, v, p) => {
      const w = (1 - u) * 1.05;
      p.set(u * 3.2, (v - 0.5) * w * 1.6, Math.sin(u * 5) * 0.2);
    }, 8, 3, { wrapU: false });
    this.two.add(geo, { m: T(x, y + 3.3 * s, z, 0, ry, 0, s), color, rough: 0.5 });
  }

  /** The finish arch: curved purple gate with a pair of pumpkin sentries and glowing letters. */
  finishArch(x, y, z, width = 14, height = 9, { ry = 0, tex = null } = {}) {
    const S = this.solid;
    const R = width / 2;
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI;
      pts.push([Math.cos(a) * R, Math.sin(a) * (height) * 1.0, 0]);
    }
    const m = T(x, y, z, 0, ry);
    S.add(tube(pts, 0.82, 56, 14), { m, color: (p, n, o) => {
      const t = Math.abs(Math.sin(Math.atan2(p.y, p.x) * 14));
      const c = t > 0.5 ? new THREE.Color(0x8a3ae8) : new THREE.Color(0xff9022);
      o.r = c.r; o.g = c.g; o.b = c.b;
    }, rough: 0.24, clear: 1 });
    S.add(disc(1.4, 1.6, 0.9, 0.12, 18), { m: m.clone().multiply(T(-R, 0.45, 0)), color: 0x5e30c0, rough: 0.3, clear: 1 });
    S.add(disc(1.4, 1.6, 0.9, 0.12, 18), { m: m.clone().multiply(T(R, 0.45, 0)), color: 0x5e30c0, rough: 0.3, clear: 1 });
    // Sentry pumpkins with little hats at the top of each post, and a glowing sign in the middle.
    const a0 = Math.PI * 0.2;
    for (const sd of [1, -1]) {
      const px = x + sd * Math.cos(a0) * R, py = y + Math.sin(a0) * height;
      this.jackO(px, py + 1.3, z, 1.1, sd > 0 ? -0.25 : 0.25, { nu: 32, nv: 18 });
      const hat = witchHatGeo(0.62, 1.1, { nu: 16, nv: 9 });
      const hm = T(px, py + 2.1, z, -0.1, 0, sd * 0.14);
      S.add(hat.cone, { m: hm, color: 0x7a2be0, rough: 0.4, clear: 0.6 });
      S.add(hat.brim, { m: hm, color: 0x5a1cb8, rough: 0.4, clear: 0.6 });
    }
    S.add(box(width * 0.56, 2.3, 0.5, 0.42, 2), { m: T(x, y + height - 0.1, z), color: 0x2c1590, rough: 0.3, clear: 0.9 });
    this.signs.push({ x, y: y + height - 0.1, z: z + 0.29, w: width * 0.5, h: 1.9, text: tex || 'FINISH' });
    // Checkered strip across the line.
    const n = Math.max(6, Math.round(width * 1.6));
    const cell = (width * 1.1) / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2; j++) {
        S.add(rawBox(cell, 0.03, 0.8), { m: T(x + (i - (n - 1) / 2) * cell, y + 0.022, z + (j - 0.5) * 0.8), color: (i + j) % 2 ? 0xffffff : 0x2c1590, rough: 0.4, clear: 0.5 });
      }
    }
  }

  /** A big friendly ghost-shaped house, with horns and glowing eyes. y is ground level. */
  ghostHouse(x, y, z, s = 1, ry = 0, { eye = 0x6ae8ff } = {}) {
    const S = this.solid;
    const m = T(x, y, z, 0, ry, 0, s);
    const body = paramSurface((u, v, p) => {
      const th = u * TAU;
      const yy = lerp(9.5, 0, v);
      const r = v < 0.42 ? Math.sin((v / 0.42) * Math.PI / 2) ** 0.7 * 4.6 : 4.6 + (v - 0.42) * 2.2;
      const wave = smooth(0.8, 1, v);
      p.set(Math.sin(th) * (r + Math.sin(th * 8) * 0.2 * wave), yy, Math.cos(th) * (r + Math.sin(th * 8) * 0.2 * wave));
    }, 32, 18);
    S.add(body, { m, color: gradY(0, 0x8aa4e8, 9.5, 0xe2ecff), rough: 0.45, clear: 0.4, emis: 0.08 });
    for (const sd of [1, -1]) {
      S.add(tube([[sd * 2.4, 8.4, 0], [sd * 3.6, 10.3, 0], [sd * 3.3, 11.8, 0]], (t) => lerp(0.85, 0.08, t), 10, 8), { m, color: 0x4a5ad8, rough: 0.35, clear: 0.7 });
      S.add(blob(0.95, 1.25, 0.34, 12, 8), { m: m.clone().multiply(T(sd * 1.65, 6.4, 4.1, -0.14, sd * 0.38)), color: eye, rough: 0.4, emis: 1.9 });
    }
    S.add(blob(1.45, 1.75, 0.34, 14, 10), { m: m.clone().multiply(T(0, 3.3, 5.1, -0.05)), color: 0x162470, rough: 0.5 });
    for (const sd of [1, -1]) S.add(rawBox(0.5, 0.65, 0.25), { m: m.clone().multiply(T(sd * 0.48, 4.72, 5.28)), color: 0xffffff, rough: 0.4 });
    this.halo(x + Math.sin(ry) * 5 * s, y + 6.4 * s, z + Math.cos(ry) * 5 * s, 11 * s, eye, 0.18);
  }

  /** A cottage wearing a giant witch hat. y is ground level. */
  witchHouse(x, y, z, s = 1, ry = 0) {
    const S = this.solid;
    const m = T(x, y, z, 0, ry, 0, s);
    S.add(disc(3.6, 4.2, 5.4, 0.2, 18), { m: m.clone().multiply(T(0, 2.7, 0)), color: gradY(-2.7, 0x7a8ed8, 2.7, 0xd4dcf8), rough: 0.5, clear: 0.3 });
    const hat = witchHatGeo(4.2, 7.2, { nu: 22, nv: 12, brim: 1.45, bend: 0.3 });
    const hm = m.clone().multiply(T(0, 5.3, 0));
    S.add(hat.cone, { m: hm, color: gradY(0, 0x2f4ac8, 7, 0x5a78f0), rough: 0.36, clear: 0.7 });
    S.add(hat.brim, { m: hm, color: 0x2a3ca8, rough: 0.36, clear: 0.7 });
    S.add(lathe([[4.25, 0.2], [4.25, 0.5], [3.8, 1.3], [3.65, 1.5]], 22), { m: hm, color: 0x7a3a18, rough: 0.5, clear: 0.3 });
    S.add(box(1.5, 1.3, 0.3, 0.1, 1), { m: hm.clone().multiply(T(0, 0.85, 4.15, -0.3)), color: 0xffc830, rough: 0.3, clear: 1, emis: 0.3 });
    S.add(shapeGeo(archShape(1.5, 2.8)), { m: m.clone().multiply(T(0, 0.05, 4.1)), color: 0x3a2466, rough: 0.5 });
    for (const sd of [1, -1]) {
      S.add(shapeGeo(archShape(0.9, 1.5)), { m: m.clone().multiply(T(sd * 2.1, 2.6, 3.42, 0, sd * 0.55)), color: 0xffb830, rough: 0.5, emis: 1.5 });
    }
    S.add(blob(0.8, 0.8, 0.8, 12, 9), { m: hm.clone().multiply(T(1.9, 1.6, 3.2)), color: 0xd4dcf8, rough: 0.4, clear: 0.4 });
    for (const sd of [1, -1]) S.add(blob(0.2, 0.26, 0.08, 8, 6), { m: hm.clone().multiply(T(1.9 + sd * 0.27, 1.75, 3.92)), color: 0x162470, rough: 0.5 });
    this.halo(x, y + 3 * s, z + 4 * s, 7 * s, 0xffb830, 0.14);
  }

  /** Little pumpkin coach. y is ground level. */
  carriage(x, y, z, s = 1, ry = 0) {
    const S = this.solid;
    const m = T(x, y, z, 0, ry, 0, s);
    S.add(pumpkinGeo({ R: 1.5, H: 0.86, ribs: 10, depth: 0.1, base: 0xff9a22, groove: 0xc85a0a, nu: 28, nv: 16, frontFlat: 0 }), { m: m.clone().multiply(T(0, 1.9, 0)), rough: 0.35, clear: 0.6, emis: 0.1 });
    S.add(stemGeo(1.4), { m: m.clone().multiply(T(0, 3, 0)), color: 0x4f8f2a, rough: 0.5, clear: 0.4 });
    S.add(shapeGeo(archShape(1.1, 1.2)), { m: m.clone().multiply(T(0, 1.4, 1.48)), color: 0xffe07a, rough: 0.5, emis: 1.4 });
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const wm = m.clone().multiply(T(sx * 1.5, 0.62, sz * 1), new THREE.Matrix4()).multiply(T(0, 0, 0, 0, 0, Math.PI / 2));
        S.add(torus(0.5, 0.11, 6, 18), { m: m.clone().multiply(T(sx * 1.5, 0.62, sz * 1, 0, Math.PI / 2)), color: 0x8a4a22, rough: 0.5, clear: 0.3 });
        S.add(disc(0.14, 0.14, 0.3, 0.03, 8), { m: wm, color: 0xffc830, rough: 0.3, clear: 0.8 });
      }
    }
  }

  /** The great jack-o'-lantern house: a pumpkin with a tiled attic and a weathervane. y is ground level. */
  pumpkinHouse(x, y, z, s = 1, ry = 0) {
    const S = this.solid;
    const R = 9 * s;
    this.jackO(x, y + R * 0.8, z, R, ry, { nu: 72, nv: 44 });
    const m = T(x, y, z, 0, ry, 0, s);
    S.add(disc(4.3, 5.1, 3.6, 0.2, 16), { m: m.clone().multiply(T(0, 14.8, -0.5)), color: gradY(-1.8, 0x3f5ec8, 1.8, 0x7f9af0), rough: 0.5, clear: 0.3 });
    S.add(lathe([[6.4, 0], [6.1, 0.3], [4.2, 2.1], [2.1, 3.7], [0.7, 4.7], [0.001, 5]], 8, Math.PI / 8), { m: m.clone().multiply(T(0, 16.4, -0.5)), color: gradY(0, 0x7a2f4a, 5, 0xc04a5a), rough: 0.38, clear: 0.7 });
    S.add(disc(1.55, 1.55, 0.25, 0.05, 20), { m: m.clone().multiply(T(0, 15, 3.82, Math.PI / 2)), color: 0x6ae8ff, rough: 0.4, emis: 1.2 });
    S.add(torus(1.55, 0.2, 6, 22), { m: m.clone().multiply(T(0, 15, 3.92)), color: 0xffd060, rough: 0.3, clear: 0.9 });
    S.add(disc(0.14, 0.18, 3.4, 0.02, 8), { m: m.clone().multiply(T(0, 22.8, -0.5)), color: 0xc08a50, rough: 0.5 });
    S.add(rawBox(3.2, 0.38, 0.38), { m: m.clone().multiply(T(0, 23.2, -0.5)), color: 0xc08a50, rough: 0.5 });
    for (const sd of [1, -1]) {
      this.jackO(x + Math.cos(ry) * sd * (R + 2.6 * s), y + 1.8 * s, z - Math.sin(ry) * sd * (R + 2.6 * s) + 3 * s, 2.2 * s, ry + sd * -0.3, { nu: 32, nv: 18 });
    }
    this.halo(x, y + R * 0.8, z + R, R * 3, 0xff9020, 0.12);
  }

  /** Flat ring laid on the ground with a soft glow, used for menu and start pads. */
  ring(x, y, z, R, r = 0.1, color = 0x4ae8ff, emis = 2, seg = 48) {
    this.solid.add(torus(R, r, 6, seg), { m: T(x, y, z, Math.PI / 2), color, rough: 0.3, emis });
  }
}

/** A floating ghost that bobs around the skyline: returns a Mesh with toy material and vertex colours. */
export function makeFloatGhost(s = 1) {
  const b = new Batch();
  const body = paramSurface((u, v, p) => {
    const th = u * TAU;
    const y = lerp(1.6, -1.0, v);
    let r = v < 0.35 ? Math.sin((v / 0.35) * Math.PI / 2) ** 0.7 * 0.9 : 0.9 + (v - 0.35) * 0.35;
    const wave = smooth(0.55, 1, v);
    r += Math.sin(th * 6) * 0.07 * wave;
    p.set(Math.sin(th) * r, y + Math.cos(th * 6) * 0.1 * wave, Math.cos(th) * r);
  }, 36, 22);
  b.add(body, { color: 0xfafaff, rough: 0.35, clear: 0.5, emis: 0.42 });
  for (const sd of [1, -1]) {
    b.add(blob(0.19, 0.28, 0.08, 12, 8), { m: T(sd * 0.32, 0.68, 0.82, -0.1, sd * 0.35), color: 0x120a1e, rough: 0.12, clear: 1 });
    b.add(blob(0.2, 0.2, 0.2, 10, 8), { m: T(sd * 0.98, 0.2, 0.2), color: 0xfafaff, rough: 0.35, clear: 0.5, emis: 0.42 });
  }
  b.add(blob(0.13, 0.15, 0.06, 10, 8), { m: T(0, 0.15, 0.9), color: 0x2b1030, rough: 0.5 });
  const m = new THREE.Mesh(b.build(), toy({ key: 'world' }));
  m.scale.setScalar(s);
  m.layers.enable(1);
  return m;
}

/** Hot air balloon with a glowing pumpkin face and striped envelope. */
export function makeBalloon(s = 1, tier, { c1 = 0xff9022, c2 = 0x7a2be0, face = true } = {}) {
  const g = new THREE.Group();
  const b = new Batch();
  const cA = new THREE.Color(c1), cB = new THREE.Color(c2);
  const env = paramSurface((u, v, p) => {
    const th = u * TAU, ph = v * Math.PI;
    const r = Math.sin(ph) ** 0.8 * (1 - 0.22 * Math.max(0, v - 0.55) * 2.2) * 2.5;
    p.set(Math.sin(th) * r, Math.cos(ph) * 3 + 0.2, Math.cos(th) * r);
  }, 48, 28, {
    color: (u, v, p, out) => {
      const band = Math.floor(u * 12) % 2;
      const c = band ? cA : cB;
      const k = 0.78 + 0.22 * Math.cos(v * Math.PI);
      out.r = c.r * k; out.g = c.g * k; out.b = c.b * k;
    },
  });
  b.add(env, { rough: 0.3, clear: 0.9, emis: 0.1 });
  b.add(lathe([[0.42, -2.9], [0.6, -2.62], [0.9, -2.3]], 14), { color: 0x3a1c78, rough: 0.5 });
  b.add(disc(0.5, 0.42, 0.56, 0.08, 12), { m: T(0, -4.2, 0), color: gradY(-0.3, 0x5a3014, 0.3, 0xa06a30), rough: 0.6 });
  b.add(torus(0.5, 0.05, 6, 16), { m: T(0, -3.92, 0, Math.PI / 2), color: 0xff9022, rough: 0.5 });
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    b.add(tube([[dx * 0.34, -3.9, dz * 0.34], [dx * 0.5, -3.3, dz * 0.5], [dx * 0.72, -2.5, dz * 0.72]], 0.024, 4, 4), { color: 0x2a1a30, rough: 0.7 });
  }
  const m = new THREE.Mesh(b.build(), toy({ key: 'world' }));
  m.layers.enable(1);
  g.add(m);
  if (face) {
    const t = jackTextures();
    const fb = new Batch();
    const geo = paramSurface((u, v, p) => {
      const a = (u - 0.5) * 1.5, e = (0.5 - v) * 1.3;
      const r = 2.55;
      p.set(Math.sin(a) * Math.cos(e) * r, Math.sin(e) * 3 * 0.96 + 0.25, Math.cos(a) * Math.cos(e) * r);
    }, 18, 12, { wrapU: false, uv: (u, v, p, o) => { o.x = 0.08 + u * 0.84; o.y = 0.08 + (1 - v) * 0.84; } });
    fb.add(geo, { color: 0xffffff, rough: 0.4 });
    const mat = new THREE.MeshBasicMaterial({ map: t.emis, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: new THREE.Color(1, 0.8, 0.35).multiplyScalar(2.5), toneMapped: false, fog: false });
    const fm = new THREE.Mesh(fb.build(), mat);
    fm.layers.enable(1);
    g.add(fm);
  }
  g.scale.setScalar(s);
  void tier;
  return g;
}

export { makeCanvas, shapeGeo, archShape, witchHatGeo, uvPlanar, prism };
