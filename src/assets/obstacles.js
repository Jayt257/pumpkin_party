// Geometry for moving obstacles. Each returns a Mesh/Group whose origin matches its physics pivot.
import * as THREE from 'three';
import { Batch, T, TAU, bandCapsule, blob, box, capsule, disc, gradY, lathe, lerp, paramSurface, prism, pumpkinGeo, stemGeo, torus, smooth, shapeGeo } from '../render/geo.js';
import { toy } from '../render/materials.js';

const mesh = (batch, opts = {}) => {
  const m = new THREE.Mesh(batch.build(), toy({ key: 'world' }));
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = false;
  m.layers.enable(1);
  m.frustumCulled = false;
  return m;
};

/** Striped barrel: colours are painted per vertex in a helical band. Axis along X. */
function stripedBarrel(b, L, R, c1, c2, { bands = 3, helix = 2.4, m = null, seg = 72, rows = 14, end = 0x6a2fd8, endRim = 0x8a4cf0, star = false } = {}) {
  const A = new THREE.Color(c1), B = new THREE.Color(c2);
  const twist = (helix / bands) * TAU;
  const body = paramSurface((u, v, p) => {
    const th = u * TAU - v * twist;
    const x = lerp(-L / 2, L / 2, v);
    const k = Math.abs(x) / (L / 2);
    const bulge = 1 - 0.09 * k * k;
    p.set(x, Math.cos(th) * R * bulge, -Math.sin(th) * R * bulge);
  }, seg, rows, {
    color: (u, v, p, out) => {
      const c = Math.sin(u * TAU * bands) > 0 ? A : B;
      out.r = c.r; out.g = c.g; out.b = c.b;
    },
  });
  b.add(body, { m, rough: 0.24, clear: 1 });
  for (const sd of [1, -1]) {
    const cap = lathe([[R * 0.86, -0.08], [R * 1.1, 0.02], [R * 1.12, 0.3], [R * 0.96, 0.46], [R * 0.6, 0.5], [0.001, 0.52]], seg);
    const cm = T(sd * (L / 2 - 0.02), 0, 0, 0, 0, -sd * Math.PI / 2);
    b.add(cap, { m: m ? m.clone().multiply(cm) : cm, color: end, rough: 0.2, clear: 1 });
    b.add(torus(R * 0.72, R * 0.07, 8, seg), { m: (m ? m.clone() : new THREE.Matrix4()).multiply(T(sd * (L / 2 + 0.53), 0, 0, 0, Math.PI / 2)), color: endRim, rough: 0.25, clear: 1 });
    if (star) {
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + Math.PI / 2, q = i % 2 ? R * 0.34 : R * 0.76; pts.push([Math.cos(a) * q, Math.sin(a) * q]); }
      b.add(shapeGeo(pts, { depth: 0.1, bevel: 0.06 }), { m: (m ? m.clone() : new THREE.Matrix4()).multiply(T(sd * (L / 2 + 0.58), 0, 0, 0, sd * Math.PI / 2)), color: 0xffc830, rough: 0.2, clear: 1, emis: 0.2 });
    }
  }
}

/** Swinging hammer. Origin at the pivot; hangs along -Y; barrel across the swing's axis. */
export function makeHammer({ arm = 7, L = 4.6, R = 1.45, c1 = 0xff8d14, c2 = 0x7a2be0, star = false, end = 0x6a2fd8 } = {}) {
  const b = new Batch();
  const hm = T(0, -arm, 0);
  stripedBarrel(b, L, R, c1, c2, { m: hm, star, end, bands: 2, helix: 1.15 });
  // Arm: striped handle plus collar.
  b.add(disc(0.34, 0.34, arm - R * 0.8, 0.05, 14), { m: T(0, -(arm - R * 0.8) / 2, 0), color: (p, n, o) => {
    const c = Math.sin(p.y * 2.4) > 0 ? new THREE.Color(c1) : new THREE.Color(0xffc060);
    o.r = c.r; o.g = c.g; o.b = c.b;
  }, rough: 0.28, clear: 1 });
  b.add(disc(0.72, 0.62, 0.7, 0.14, 16), { m: T(0, -arm + R * 0.98, 0), color: end, rough: 0.22, clear: 1 });
  b.add(disc(0.62, 0.72, 0.7, 0.14, 16), { m: T(0, -0.1, 0), color: end, rough: 0.22, clear: 1 });
  // Glowing lantern-orb hub: reads as magic rather than demanding a gantry that would hide the castle.
  b.add(blob(0.62, 0.62, 0.62, 16, 12), { m: T(0, 0.15, 0), color: 0xffc030, rough: 0.2, clear: 1, emis: 0.9 });
  b.add(torus(0.74, 0.1, 8, 20), { m: T(0, 0.15, 0, 0, 0, 0), color: end, rough: 0.2, clear: 1 });
  return mesh(b);
}

/** Overhead gantry for hammers. Pieces merged into a Batch (static). */
export function addHammerFrame(s, x, y, z, span, h, { color = 0x5e30c0, trim = 0xff9022 } = {}) {
  const S = s.solid;
  for (const sd of [1, -1]) {
    S.add(disc(0.6, 0.8, h, 0.12, 14), { m: T(x + sd * span / 2, y + h / 2, z), color: gradY(-h / 2, new THREE.Color(color).multiplyScalar(0.6), h / 2, color), rough: 0.3, clear: 0.9 });
    S.add(disc(1.0, 1.15, 0.7, 0.14, 14), { m: T(x + sd * span / 2, y + 0.35, z), color: trim, rough: 0.28, clear: 1 });
  }
  S.add(capsule(0.5, span, 4, 14), { m: T(x, y + h, z, 0, 0, Math.PI / 2), color: (p, n, o) => {
    const c = Math.sin(p.y * 1.5) > 0 ? new THREE.Color(trim) : new THREE.Color(color);
    o.r = c.r; o.g = c.g; o.b = c.b;
  }, rough: 0.26, clear: 1 });
}

/** Spinning horizontal beam around a central post. Origin at the hub at beam height. */
export function makeSpinBar({ len = 12, r = 0.5, hub = 0.95, c1 = 0xff8d14, c2 = 0x8a3ae8, arms = 2, post = 0 } = {}) {
  const b = new Batch();
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * TAU;
    const A = new THREE.Color(c1), B = new THREE.Color(c2);
    b.add(bandCapsule(r, len, 16, 6), {
      m: T(Math.cos(a) * (len / 2 + hub * 0.2), 0, -Math.sin(a) * (len / 2 + hub * 0.2), 0, a, Math.PI / 2),
      color: (p, n, o) => { const c = Math.sin(p.y * 2.1) > 0 ? A : B; o.r = c.r; o.g = c.g; o.b = c.b; },
      rough: 0.24, clear: 1,
    });
  }
  b.add(disc(hub, hub, 1.2, 0.2, 22), { color: 0x6a2fd8, rough: 0.22, clear: 1 });
  b.add(blob(hub * 0.7, 0.5, hub * 0.7, 18, 10), { m: T(0, 0.6, 0), color: 0xffb030, rough: 0.2, clear: 1, emis: 0.2 });
  if (post > 0) b.add(disc(hub * 0.7, hub * 0.85, post, 0.1, 18), { m: T(0, -post / 2 - 0.5, 0), color: gradY(-post / 2, 0x3a2070, post / 2, 0x6a2fd8), rough: 0.3, clear: 0.8 });
  return mesh(b);
}

/** Walkable spinning disc. Origin at the centre of its top surface. */
export function makeSpinDisc({ R = 5, h = 0.7, c1 = 0xff9022, c2 = 0x7a3ae8, wedges = 8, face = false } = {}) {
  const b = new Batch();
  const A = new THREE.Color(c1), B = new THREE.Color(c2);
  const top = paramSurface((u, v, p) => {
    const a = u * TAU, r = v * R;
    p.set(Math.sin(a) * r, 0, Math.cos(a) * r);
  }, wedges * 8, 6, { color: (u, v, p, o) => { const c = Math.floor(u * wedges) % 2 ? A : B; o.r = c.r; o.g = c.g; o.b = c.b; } });
  const nor = top.attributes.normal;
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
  b.add(top, { rough: 0.22, clear: 1 });
  b.add(disc(R, R * 0.92, h, 0.18, 56), { m: T(0, -h / 2 - 0.01, 0), color: gradY(-h / 2, new THREE.Color(c2).multiplyScalar(0.55), h / 2, c2), rough: 0.28, clear: 1 });
  b.add(torus(R * 0.985, 0.13, 8, 56), { m: T(0, -0.03, 0, Math.PI / 2), color: 0xffc860, rough: 0.25, clear: 1 });
  b.add(disc(R * 0.3, R * 0.3, 0.12, 0.05, 24), { m: T(0, 0.05, 0), color: 0xffc860, rough: 0.22, clear: 1 });
  void face;
  return mesh(b);
}

/** Giant rolling pumpkin. Origin at centre. Returns mesh ready to rotate. */
export function makeBoulder(R = 2.6, tierFace = true) {
  const b = new Batch();
  const geo = pumpkinGeo({ R, H: 0.98, ribs: 12, depth: 0.08, dent: 0.14, base: 0xff9012, groove: 0xc84c08, top: 0xffa82a, bottom: 0xf07a10, nu: 72, nv: 42 });
  b.add(geo, { rough: 0.32, clear: 0.7, emis: 0.1 });
  b.add(stemGeo(R * 1.0), { m: T(0, R * 0.8, 0), color: gradY(0, 0x3f7a22, R * 0.4, 0x7fbf3a), rough: 0.5, clear: 0.4 });
  if (tierFace) {
    const dark = 0x3a1406, hot = 0xffd850;
    for (const sd of [1, -1]) {
      const m = T(sd * R * 0.38, R * 0.26, R * 0.84, -0.26, sd * 0.42);
      b.add(shapeGeo([[-0.34, -0.22], [0.34, -0.22], [sd * -0.12, 0.34]], { depth: 0.04, bevel: 0.03 }), { m: m.clone().multiply(T(0, 0, 0, 0, 0, 0, R)), color: dark, rough: 0.6 });
      b.add(shapeGeo([[-0.22, -0.15], [0.22, -0.15], [sd * -0.08, 0.2]], { depth: 0.02, bevel: 0.01 }), { m: m.clone().multiply(T(0, 0, 0.06 * R, 0, 0, 0, R)), color: hot, rough: 0.5, emis: 3 });
    }
    const mouth = [[-0.62, 0.05], [-0.3, -0.05], [-0.24, 0.05], [-0.1, 0.0], [0.1, 0.0], [0.24, 0.05], [0.3, -0.05], [0.62, 0.05], [0.4, -0.3], [0.1, -0.42], [-0.1, -0.42], [-0.4, -0.3]];
    const mm = T(0, -R * 0.2, R * 0.96, 0.24);
    b.add(shapeGeo(mouth, { depth: 0.03, bevel: 0.03 }), { m: mm.clone().multiply(T(0, 0, 0, 0, 0, 0, R)), color: dark, rough: 0.6 });
    b.add(shapeGeo(mouth.map(([x, y]) => [x * 0.84, y * 0.76 - 0.03]), { depth: 0.02 }), { m: mm.clone().multiply(T(0, 0, 0.06 * R, 0, 0, 0, R)), color: hot, rough: 0.5, emis: 3 });
  }
  const m = mesh(b);
  return m;
}

/** A patrol ghost obstacle; origin at the centre of its body. */
export function makePatrolGhost(s = 1.6) {
  const b = new Batch();
  const body = paramSurface((u, v, p) => {
    const th = u * TAU;
    const y = lerp(1.25, -1.15, v);
    let r = v < 0.38 ? Math.sin((v / 0.38) * Math.PI / 2) ** 0.72 * 0.98 : 0.98 + (v - 0.38) * 0.5;
    const wave = smooth(0.55, 1, v);
    r += Math.sin(th * 7) * 0.09 * wave;
    p.set(Math.sin(th) * r, y + Math.cos(th * 7) * 0.12 * wave, Math.cos(th) * r);
  }, 40, 26);
  b.add(body, { color: 0xfafaff, rough: 0.28, clear: 0.7, emis: 0.3 });
  for (const sd of [1, -1]) {
    b.add(blob(0.2, 0.3, 0.085, 14, 10), { m: T(sd * 0.34, 0.42, 0.87, -0.12, sd * 0.36), color: 0x120a1e, rough: 0.1, clear: 1 });
    b.add(blob(0.07, 0.08, 0.03, 8, 6), { m: T(sd * 0.3, 0.52, 0.95, -0.12, sd * 0.36), color: 0xffffff, emis: 1.5 });
    b.add(blob(0.22, 0.22, 0.22, 10, 8), { m: T(sd * 1.04, 0.05, 0.25), color: 0xfafaff, rough: 0.28, clear: 0.7, emis: 0.3 });
  }
  b.add(blob(0.2, 0.26, 0.08, 12, 8), { m: T(0, -0.12, 0.96), color: 0x2b1030, rough: 0.5 });
  b.add(blob(0.14, 0.1, 0.05, 10, 6), { m: T(0, -0.25, 1.0), color: 0xff6f94, rough: 0.4 });
  const m = mesh(b);
  m.scale.setScalar(s);
  return m;
}

/** Bouncy mushroom-shaped jump pad. Origin at ground centre. */
export function makeBouncePad(R = 2) {
  const b = new Batch();
  b.add(disc(R * 0.95, R, 0.3, 0.1, 28), { m: T(0, 0.15, 0), color: 0x4a2aa0, rough: 0.35, clear: 0.7 });
  const cap = paramSurface((u, v, p) => {
    const a = u * TAU, ph = v * Math.PI * 0.5;
    p.set(Math.sin(a) * Math.sin(ph) * R * 0.86, Math.cos(ph) * 0.46, Math.cos(a) * Math.sin(ph) * R * 0.86);
  }, 40, 12, {
    color: (u, v, p, o) => {
      const r = Math.hypot(p.x, p.z);
      const c = Math.sin(r * 5) > 0 ? new THREE.Color(0xff5ad0) : new THREE.Color(0xffc830);
      o.r = c.r; o.g = c.g; o.b = c.b;
    },
  });
  b.add(cap, { m: T(0, 0.28, 0), rough: 0.2, clear: 1, emis: 0.15 });
  return mesh(b, { cast: false });
}

/** Bubbling cauldron from the final round. Origin at the bottom. Returns the rim height and inner radius. */
export function makeCauldron(s, x, y, z, R = 6) {
  const S = s.solid;
  const iron = 0x2c2455;
  // Round belly, narrower neck. profile(h) gives the radius at height h, for dressing the surface.
  const control = [[0.34, 0], [0.72, 0.09], [0.96, 0.42], [1, 0.72], [0.93, 1.02], [0.78, 1.2], [0.74, 1.3]];
  const curve = new THREE.CatmullRomCurve3(control.map(([r, h]) => new THREE.Vector3(r * R, h * R, 0)));
  const pts = curve.getPoints(26).map((p) => [Math.max(p.x, 0.01), p.y]);
  S.add(lathe([[0.001, 0], ...pts], 48), { m: T(x, y, z), color: gradY(0, 0x151038, R * 1.3, 0x51409a), rough: 0.26, clear: 0.9 });
  const rimH = R * 1.3;
  const rimY = y + rimH;
  S.add(torus(R * 0.76, R * 0.085, 12, 48), { m: T(x, rimY, z, Math.PI / 2), color: 0x5a4aa8, rough: 0.22, clear: 1 });
  for (const sd of [1, -1]) {
    S.add(torus(R * 0.17, R * 0.045, 8, 18), { m: T(x + sd * R * 0.94, rimY - R * 0.14, z, 0, Math.PI / 2), color: iron, rough: 0.3, clear: 0.9 });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    S.add(disc(R * 0.1, R * 0.15, R * 0.42, 0.05, 10), { m: T(x + Math.sin(a) * R * 0.62, y + R * 0.12, z + Math.cos(a) * R * 0.62), color: iron, rough: 0.35, clear: 0.7 });
  }
  const profile = (h) => {
    let best = pts[pts.length - 1][0];
    for (let i = 0; i < pts.length - 1; i++) {
      if (h >= pts[i][1] && h <= pts[i + 1][1]) { const t = (h - pts[i][1]) / (pts[i + 1][1] - pts[i][1] || 1); best = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t; break; }
    }
    return best;
  };
  return { rimY, R: R * 0.72, profile };
}

export { Batch, box, prism, disc, torus, mesh, stripedBarrel };
void lathe; void blob;
