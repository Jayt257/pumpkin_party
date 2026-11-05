// Procedural geometry toolkit.
//
// Everything in the game is generated from code, so there are no model files to download and the
// build stays small. Parts are authored with per-vertex colour and per-vertex PBR values (roughness,
// clearcoat, emissive) and merged into one mesh per object, which keeps draw calls low.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const TAU = Math.PI * 2;
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Build a transform from position, Euler rotation (radians) and scale. */
export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _p.set(x, y, z);
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Small deterministic RNG so decorations are identical between runs. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  const f = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

/** Vertical colour gradient helper for Batch.add({ color }). */
export function gradY(y0, c0, y1, c1) {
  const a = new THREE.Color(c0), b = new THREE.Color(c1);
  return (p, n, out) => {
    const t = clamp((p.y - y0) / (y1 - y0));
    out.r = lerp(a.r, b.r, t); out.g = lerp(a.g, b.g, t); out.b = lerp(a.b, b.b, t);
  };
}

/**
 * Accumulates parts into one merged, indexed BufferGeometry carrying
 * position / normal / uv / color / aPBR and, optionally, skin attributes.
 */
export class Batch {
  constructor() { this.parts = []; this.verts = 0; this.tris = 0; this.hasSkin = false; }

  /**
   * @param {THREE.BufferGeometry} geo
   * @param {object} o
   *   color: hex | Color | fn(localPos, localNormal, outColor, index)
   *   tint: multiplies existing geometry colours
   *   rough, clear, emis: PBR values
   *   m: Matrix4 applied to the part
   *   uv: fn(localPos, outUV) or fixed [u, v] — defaults to the geometry's uvs
   *   bone / skin: rigid bone index, or fn(pos) => [i0, w0, i1, w1]
   */
  add(geo, o = {}) {
    const pa = geo.attributes.position, na = geo.attributes.normal, ua = geo.attributes.uv, ca = geo.attributes.color;
    const n = pa.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uvs = new Float32Array(n * 2);
    const col = new Float32Array(n * 3), pbr = new Float32Array(n * 3);
    const m = o.m || null;
    if (m) _nm.getNormalMatrix(m);
    const rough = o.rough ?? 0.5, clear = o.clear ?? 0, emis = o.emis ?? 0;
    let base = null, fn = null;
    if (typeof o.color === 'function') fn = o.color;
    else if (o.color !== undefined) base = _c.set(o.color).clone();
    else if (!ca) base = new THREE.Color(0xffffff);
    const tint = o.tint !== undefined ? new THREE.Color(o.tint) : null;
    const lp = new THREE.Vector3(), ln = new THREE.Vector3(), out = { r: 1, g: 1, b: 1 };
    const uvOut = { x: 0, y: 0 };
    const skin = o.skin || null;
    let si = null, sw = null;
    if (o.bone !== undefined || skin) {
      si = new Uint16Array(n * 4); sw = new Float32Array(n * 4); this.hasSkin = true;
    }
    for (let i = 0; i < n; i++) {
      lp.fromBufferAttribute(pa, i);
      if (na) ln.fromBufferAttribute(na, i); else ln.set(0, 1, 0);
      if (fn) fn(lp, ln, out, i);
      else if (base) { out.r = base.r; out.g = base.g; out.b = base.b; }
      else { out.r = ca.getX(i); out.g = ca.getY(i); out.b = ca.getZ(i); }
      let r = out.r, g = out.g, b = out.b;
      if (tint) { r *= tint.r; g *= tint.g; b *= tint.b; }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      pbr[i * 3] = rough; pbr[i * 3 + 1] = clear; pbr[i * 3 + 2] = emis;
      if (o.uv) {
        if (typeof o.uv === 'function') { o.uv(lp, uvOut, ln); uvs[i * 2] = uvOut.x; uvs[i * 2 + 1] = uvOut.y; }
        else { uvs[i * 2] = o.uv[0]; uvs[i * 2 + 1] = o.uv[1]; }
      } else if (ua) {
        uvs[i * 2] = ua.getX(i) * (o.uvScale ? o.uvScale[0] : 1);
        uvs[i * 2 + 1] = ua.getY(i) * (o.uvScale ? o.uvScale[1] : 1);
      }
      _v.copy(lp); _n.copy(ln);
      if (m) { _v.applyMatrix4(m); _n.applyMatrix3(_nm).normalize(); }
      pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
      nor[i * 3] = _n.x; nor[i * 3 + 1] = _n.y; nor[i * 3 + 2] = _n.z;
      if (si) {
        if (skin) {
          const w = skin(_v);
          si[i * 4] = w[0]; sw[i * 4] = w[1]; si[i * 4 + 1] = w[2]; sw[i * 4 + 1] = w[3];
        } else { si[i * 4] = o.bone; sw[i * 4] = 1; }
      }
    }
    let idx;
    if (geo.index) idx = geo.index.array.slice();
    else { idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; }
    if (m && m.determinant() < 0) { // mirrored parts need their winding flipped
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    }
    const part = { pos, nor, uvs, col, pbr, idx, si, sw, n };
    if (o.sealFace) sealFace(part);
    this.parts.push(part);
    this.verts += part.n;
    this.tris += idx.length / 3;
    return this;
  }

  /** Merge everything into a single geometry. */
  build() {
    const V = this.verts, I = this.tris * 3;
    const pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), uv = new Float32Array(V * 2);
    const col = new Float32Array(V * 3), pbr = new Float32Array(V * 3), idx = new Uint32Array(I);
    const si = this.hasSkin ? new Uint16Array(V * 4) : null;
    const sw = this.hasSkin ? new Float32Array(V * 4) : null;
    let vo = 0, io = 0;
    for (const p of this.parts) {
      pos.set(p.pos, vo * 3); nor.set(p.nor, vo * 3); uv.set(p.uvs, vo * 2);
      col.set(p.col, vo * 3); pbr.set(p.pbr, vo * 3);
      if (si && p.si) { si.set(p.si, vo * 4); sw.set(p.sw, vo * 4); }
      for (let i = 0; i < p.idx.length; i++) idx[io + i] = p.idx[i] + vo;
      vo += p.n; io += p.idx.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPBR', new THREE.BufferAttribute(pbr, 3));
    if (si) {
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    }
    g.setIndex(new THREE.BufferAttribute(V > 65535 ? idx : new Uint16Array(idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.parts = [];
    return g;
  }
}

/**
 * Faces use an azimuthal UV projection, whose singular point is the centre of the back of the head.
 * Triangles there would interpolate straight across the painted face, so every triangle touching the
 * rim gets duplicate vertices with one constant UV. No geometry changes, only the UV seam moves.
 */
function sealFace(p) {
  const { uvs, idx } = p;
  const isBack = (i) => Math.hypot(uvs[i * 2] - 0.5, uvs[i * 2 + 1] - 0.5) >= 0.468;
  const dup = new Map();
  const extra = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (!(isBack(idx[t]) || isBack(idx[t + 1]) || isBack(idx[t + 2]))) continue;
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k];
      let d = dup.get(v);
      if (d === undefined) { d = p.n + extra.length; dup.set(v, d); extra.push(v); }
      idx[t + k] = d;
    }
  }
  if (!extra.length) return;
  const n = p.n + extra.length;
  const grow = (a, k) => { const b = new a.constructor(n * k); b.set(a); for (let i = 0; i < extra.length; i++) for (let c = 0; c < k; c++) b[(p.n + i) * k + c] = a[extra[i] * k + c]; return b; };
  p.pos = grow(p.pos, 3); p.nor = grow(p.nor, 3); p.col = grow(p.col, 3); p.pbr = grow(p.pbr, 3);
  p.uvs = grow(p.uvs, 2);
  if (p.si) { p.si = grow(p.si, 4); p.sw = grow(p.sw, 4); }
  for (let i = p.n; i < n; i++) { p.uvs[i * 2] = 0.5 + 0.49; p.uvs[i * 2 + 1] = 0.5; }
  p.n = n;
}

/** Parametric surface whose normals come from finite differences, so seams never show. */
export function paramSurface(fn, nu, nv, { wrapU = true, color = null, uv = null } = {}) {
  const count = (nu + 1) * (nv + 1);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const col = color ? new Float32Array(count * 3) : null;
  const p = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const du = new THREE.Vector3(), dv = new THREE.Vector3(), n = new THREE.Vector3();
  const e = 1e-3, out = { r: 1, g: 1, b: 1 }, uvOut = { x: 0, y: 0 };
  let k = 0;
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      fn(u, v, p);
      const u0 = wrapU ? u - e : Math.max(0, u - e), u1 = wrapU ? u + e : Math.min(1, u + e);
      const v0 = clamp(v - e), v1 = clamp(v + e);
      fn(u0, v, a); fn(u1, v, b); fn(u, v0, c); fn(u, v1, d);
      du.subVectors(b, a); dv.subVectors(d, c);
      n.crossVectors(dv, du);
      if (n.lengthSq() < 1e-14) { // pole: fall back to pointing away from the local centre line
        n.set(p.x, p.y, p.z);
        if (Math.abs(v) < 1e-3 || Math.abs(v - 1) < 1e-3) n.set(0, v < 0.5 ? 1 : -1, 0);
      }
      n.normalize();
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z;
      if (uv) { uv(u, v, p, uvOut); uvs[k * 2] = uvOut.x; uvs[k * 2 + 1] = uvOut.y; }
      else { uvs[k * 2] = u; uvs[k * 2 + 1] = 1 - v; }
      if (col) { color(u, v, p, out); col[k * 3] = out.r; col[k * 3 + 1] = out.g; col[k * 3 + 2] = out.b; }
      k++;
    }
  }
  const idx = new Uint32Array(nu * nv * 6);
  k = 0;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const A = j * (nu + 1) + i, B = A + 1, C = A + nu + 1, D = C + 1;
      idx[k++] = A; idx[k++] = C; idx[k++] = B;
      idx[k++] = B; idx[k++] = C; idx[k++] = D;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** Plain 12-triangle box for distant detail. */
export const rawBox = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** Planar UVs from local position, projected along the dominant normal axis. Good for walls. */
export const uvPlanar = (scale = 1) => (p, out, n) => {
  const ax = Math.abs(n.x), ay = Math.abs(n.y);
  if (ay > 0.6) { out.x = p.x * scale; out.y = p.z * scale; }
  else if (ax > 0.6) { out.x = p.z * scale; out.y = p.y * scale; }
  else { out.x = p.x * scale; out.y = p.y * scale; }
};

/** Rounded box. */
export function box(w, h, d, r = 0.06, seg = 2) {
  const rr = Math.min(r, Math.min(w, h, d) * 0.499);
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

/**
 * Surface of revolution through a [radius, y] profile, with an optional bevel-friendly hard edge when
 * a point is repeated. Runs bottom to top so outward normals face away from the axis.
 */
export function lathe(profile, seg = 24, phiStart = 0, phiLen = TAU) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(Math.max(x, 0.0001), y));
  return new THREE.LatheGeometry(pts, seg, phiStart, phiLen);
}

/** Cylinder/disc with a smooth rounded rim. Origin at the centre of its height. */
export function disc(rTop, rBot, h, bevel = 0.08, seg = 32) {
  const y0 = -h / 2, y1 = h / 2;
  const b = Math.min(bevel, h * 0.45);
  const pts = [[0, y0], [rBot - b, y0]];
  for (let i = 1; i <= 3; i++) {
    const a = (i / 3) * Math.PI / 2;
    pts.push([rBot - b + Math.sin(a) * b, y0 + b - Math.cos(a) * b]);
  }
  for (let i = 0; i <= 3; i++) {
    const a = (i / 3) * Math.PI / 2;
    pts.push([rTop - b + Math.cos(a) * b, y1 - b + Math.sin(a) * b]);
  }
  pts.push([0, y1]);
  return lathe(pts, seg);
}

/** A flat-sided prism with bevelled edges (hexagons, octagons). Origin at the centre of its height. */
export function prism(r, h, sides = 6, bevel = 0.1, rotation = Math.PI / sides) {
  const profile = [[0, -h / 2], [r - bevel, -h / 2], [r, -h / 2 + bevel], [r, h / 2 - bevel], [r - bevel, h / 2], [0, h / 2]];
  const bands = profile.length - 1;
  const pos = [], nor = [], uv = [];
  const corner = (k, rr) => {
    const a = rotation + (k / sides) * TAU;
    return [Math.sin(a) * rr, Math.cos(a) * rr];
  };
  const quad = (a, b, c, d, n) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]);
      uv.push(v[0] / (2 * r) + 0.5, v[2] / (2 * r) + 0.5);
    }
  };
  for (let s = 0; s < sides; s++) {
    for (let b = 0; b < bands; b++) {
      const [r0, y0] = profile[b], [r1, y1] = profile[b + 1];
      const [ax, az] = corner(s, r0), [bx, bz] = corner(s + 1, r0);
      const [cx, cz] = corner(s + 1, r1), [dx, dz] = corner(s, r1);
      const A = [ax, y0, az], B = [bx, y0, bz], C = [cx, y1, cz], D = [dx, y1, dz];
      const e1 = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      const e2 = new THREE.Vector3(D[0] - A[0], D[1] - A[1], D[2] - A[2]);
      let n = new THREE.Vector3().crossVectors(e1.lengthSq() > 1e-8 ? e1 : new THREE.Vector3(C[0] - D[0], 0, C[2] - D[2]), e2).normalize();
      if (n.lengthSq() < 0.5) n.set(0, y1 > 0 ? 1 : -1, 0);
      // Outward faces: make sure the normal points away from the axis or vertically outward.
      const mid = new THREE.Vector3((A[0] + C[0]) / 2, 0, (A[2] + C[2]) / 2);
      const flip = n.x * mid.x + n.z * mid.z + (Math.abs(n.y) > 0.9 ? n.y * (y0 + y1 > 0 ? 1 : -1) * 1 : 0) < 0;
      if (flip) { n.negate(); quad(A, D, C, B, [n.x, n.y, n.z]); }
      else quad(A, B, C, D, [n.x, n.y, n.z]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Capsule whose axis is Y. Origin at its centre. `len` is the straight section. */
export const capsule = (r, len, cap = 6, radial = 12) => new THREE.CapsuleGeometry(r, len, cap, radial);
/** Capsule with many rings along its length, for crisp painted bands. Axis Y, origin at its centre. */
export function bandCapsule(r, len, radial = 14, perUnit = 5) {
  const rows = Math.max(8, Math.round(len * perUnit));
  const capRows = 5;
  const total = rows + capRows * 2;
  return paramSurface((u, v, p) => {
    const th = u * TAU;
    const k = v * total;
    let y, rad;
    if (k < capRows) { const a = (k / capRows) * Math.PI / 2; y = len / 2 + Math.cos(a) * r; rad = Math.sin(a) * r; }
    else if (k > total - capRows) { const a = ((total - k) / capRows) * Math.PI / 2; y = -len / 2 - Math.cos(a) * r; rad = Math.sin(a) * r; }
    else { y = len / 2 - ((k - capRows) / rows) * len; rad = r; }
    p.set(Math.sin(th) * rad, y, Math.cos(th) * rad);
  }, radial, total);
}

export const sphere = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
export const torus = (R, r, radial = 10, tubular = 28, arc = TAU) => new THREE.TorusGeometry(R, r, radial, tubular, arc);

/** Sphere squashed/stretched per axis, with correct normals. */
export function blob(rx, ry = rx, rz = rx, w = 20, h = 14) {
  return paramSurface((u, v, p) => {
    const th = u * TAU, ph = v * Math.PI;
    p.set(Math.sin(th) * Math.sin(ph) * rx, Math.cos(ph) * ry, Math.cos(th) * Math.sin(ph) * rz);
  }, w, h);
}

/** Tube along a Catmull-Rom path with a variable radius. */
export function tube(points, radius = 0.1, tubular = 24, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))), false, 'centripetal');
  const frames = curve.computeFrenetFrames(tubular, false);
  const rad = typeof radius === 'function' ? radius : () => radius;
  const count = (tubular + 1) * (radial + 1);
  const pos = new Float32Array(count * 3 + 6), nor = new Float32Array(count * 3 + 6), uv = new Float32Array(count * 2 + 4);
  const P = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, P);
    const N = frames.normals[i], B = frames.binormals[i], r = rad(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, s = Math.sin(a), c = -Math.cos(a);
      const nx = c * N.x + s * B.x, ny = c * N.y + s * B.y, nz = c * N.z + s * B.z;
      pos[k * 3] = P.x + r * nx; pos[k * 3 + 1] = P.y + r * ny; pos[k * 3 + 2] = P.z + r * nz;
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
      uv[k * 2] = t; uv[k * 2 + 1] = j / radial;
      k++;
    }
  }
  const idx = [];
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1, c = b + 1, d = a + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  // Caps, so tapering tubes close neatly.
  const startCenter = k;
  curve.getPointAt(0, P);
  pos[k * 3] = P.x; pos[k * 3 + 1] = P.y; pos[k * 3 + 2] = P.z;
  const t0 = curve.getTangentAt(0);
  nor[k * 3] = -t0.x; nor[k * 3 + 1] = -t0.y; nor[k * 3 + 2] = -t0.z;
  k++;
  const endCenter = k;
  curve.getPointAt(1, P);
  pos[k * 3] = P.x; pos[k * 3 + 1] = P.y; pos[k * 3 + 2] = P.z;
  const t1 = curve.getTangentAt(1);
  nor[k * 3] = t1.x; nor[k * 3 + 1] = t1.y; nor[k * 3 + 2] = t1.z;
  k++;
  for (let j = 0; j < radial; j++) {
    idx.push(startCenter, j, j + 1);
    const base = tubular * (radial + 1);
    idx.push(endCenter, base + j + 1, base + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Flat, triangulated 2D shape in the XY plane (+Z normal), optionally extruded with a bevel. */
export function shapeGeo(pathPoints, { depth = 0, bevel = 0, curve = 6 } = {}) {
  const s = new THREE.Shape(pathPoints.map(([x, y]) => new THREE.Vector2(x, y)));
  if (!depth && !bevel) return new THREE.ShapeGeometry(s, curve);
  return new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve, steps: 1,
  });
}

/** Arch window outline in the XY plane, base at y = 0. */
export function archShape(w, h, seg = 8) {
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, h - w / 2]];
  for (let i = 1; i < seg; i++) {
    const a = (i / seg) * Math.PI;
    pts.push([Math.cos(a) * w / 2, h - w / 2 + Math.sin(a) * w / 2]);
  }
  pts.push([-w / 2, h - w / 2]);
  return pts;
}

/**
 * Ribbed pumpkin. Lobes run from the stem to the base, with soft top and bottom dimples and darker
 * grooves baked into the vertex colour. A lobe always faces +Z so faces land nicely.
 *
 * `faceUV` maps the front to a disc in texture space (azimuthal projection): everything beyond the
 * edge of the disc lands on the blank border of the face texture, so the back of the head has no seam.
 * `carve(u, v)` pushes the surface inward wherever a face feature is cut.
 */
export function pumpkinGeo({
  R = 1, H = 0.86, ribs = 12, depth = 0.1, nu = 96, nv = 56, dent = 0.26,
  base = 0xff8410, groove = 0xd9540a, top = 0xffa52c, bottom = 0xe8660c, faceUV = false, carve = null, carveDepth = 0.05, sharp = 0.72, frontFlat = 0.55,
} = {}) {
  const cBase = new THREE.Color(base), cGroove = new THREE.Color(groove), cTop = new THREE.Color(top), cBot = new THREE.Color(bottom);
  const lobeAt = (th) => Math.pow(Math.abs(Math.cos(th * ribs * 0.5)), sharp);
  const surf = (u, v, p) => {
    const th = u * TAU, ph = v * Math.PI;
    const sinp = Math.sin(ph), cosp = Math.cos(ph);
    const lobe = lobeAt(th);
    const front = Math.pow(Math.max(0, Math.cos(th)), 2) * Math.pow(Math.max(0, sinp), 2);
    const grooveAmt = 1 - depth * (1 - front * frontFlat) * (1 - lobe) * smooth(0, 0.55, sinp);
    const rr = R * Math.pow(Math.max(sinp, 0), 0.74) * grooveAmt;
    let y = H * R * cosp * (0.93 + 0.07 * lobe);
    y -= Math.sign(cosp) * dent * R * Math.exp(-((sinp / 0.34) ** 2));
    p.set(Math.sin(th) * rr, y, Math.cos(th) * rr);
    if (carve) {
      const q = faceMap(p.x / R, p.y / (H * R), p.z / R);
      const c = carve(q.x, q.y);
      if (c > 0) p.multiplyScalar(1 - c * carveDepth);
    }
  };
  const uvFn = faceUV ? (u, v, p, out) => {
    const q = faceMap(p.x / R, p.y / (H * R), p.z / R);
    out.x = q.x; out.y = q.y;
  } : null;
  return paramSurface(surf, nu, nv, {
    uv: uvFn,
    color: (u, v, p, out) => {
      const th = u * TAU, ph = v * Math.PI;
      const lobe = lobeAt(th);
      const yy = Math.cos(ph);
      const col = _c.copy(cBase);
      if (yy > 0) col.lerp(cTop, yy * 0.55); else col.lerp(cBot, -yy * 0.8);
      const g = Math.pow(1 - lobe, 1.7);
      col.lerp(cGroove, g * 0.9);
      // Soft ambient occlusion around the stem dimple and the underside.
      const sinp = Math.sin(ph);
      const ao = 0.66 + 0.34 * smooth(0.05, 0.4, sinp);
      out.r = col.r * ao; out.g = col.g * ao; out.b = col.b * ao;
    },
  });
}

const _fm = { x: 0, y: 0 };
const FACE_ALPHA = (Math.PI / 180) * 86;
/** Azimuthal projection of a unit-ish direction around +Z onto a UV disc centred at (0.5, 0.5). */
export function faceMap(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  const nx = x / len, ny = y / len, nz = z / len;
  const alpha = Math.acos(clamp(nz, -1, 1));
  const m = Math.hypot(nx, ny);
  const f = Math.min(alpha / FACE_ALPHA, 1.04) * 0.48;
  if (m < 1e-5) { _fm.x = nz > 0 ? 0.5 : 0.5 + 0.4992; _fm.y = 0.5; return _fm; }
  _fm.x = 0.5 + (nx / m) * f;
  _fm.y = 0.5 + (ny / m) * f;
  return _fm;
}

/** Curly pumpkin stem with a small ring at its base. */
export function stemGeo(R = 1) {
  const pts = [
    [0, 0, 0], [0.02 * R, 0.13 * R, -0.01 * R], [0.06 * R, 0.25 * R, -0.04 * R], [0.14 * R, 0.33 * R, -0.08 * R], [0.2 * R, 0.33 * R, -0.09 * R],
  ];
  return tube(pts, (t) => lerp(0.15 * R, 0.075 * R, Math.pow(t, 0.7)), 14, 10);
}

/** Pointed witch-hat cone with a sagging, slightly bent tip and a brim. Origin at the brim centre. */
export function witchHatGeo(R = 0.8, H = 1.2, { bend = 0.32, brim = 1.55, nu = 28, nv = 18 } = {}) {
  const cone = paramSurface((u, v, p) => {
    const th = u * TAU, h = v; // v=0 at the tip, v=1 at the base
    const r = R * Math.pow(h, 0.86) * (1 + 0.02 * Math.sin(th * 3 + h * 8));
    const b = bend * Math.pow(1 - h, 2.2) * H;
    p.set(Math.sin(th) * r, H * (1 - h) - b * 0.28, Math.cos(th) * r - b);
  }, nu, nv);
  const brimGeo = paramSurface((u, v, p) => {
    const th = u * TAU;
    // Top surface from the crown outward, then back in underneath: visible from both sides.
    const top = v < 0.5;
    const k = top ? v * 2 : (1 - v) * 2;
    const r = lerp(R * 0.82, R * brim, k);
    const wave = Math.sin(th * 3) * 0.03 * k * R - k * k * 0.13 * R;
    p.set(Math.sin(th) * r, wave - (top ? 0 : 0.018 * R), Math.cos(th) * r);
  }, nu, 8);
  return { cone, brim: brimGeo };
}
