// The Halloween castle from the key art, assembled from primitives into merged geometry.
// Origin is the centre of the gate at ground level; the front faces +Z toward the players.
import * as THREE from 'three';
import { T, TAU, disc, gradY, lathe, lerp, rawBox, rng, shapeGeo, archShape, uvPlanar, box, paramSurface } from '../render/geo.js';

const STONE = 0x6048e0, STONE_DK = 0x3f2a9c, TRIM = 0x8468ff, ROOF_A = 0x3346e6, ROOF_B = 0x4f34dc, ROOF_C = 0x6a2fd0, WIN = 0xffb830;

/** Concave witch-hat roof with an optional lean. */
function roof(s, x, y, z, r, h, color = ROOF_A, lean = 0) {
  const geo = lathe([[r * 1.22, 0], [r * 1.2, 0.04 * h], [r * 0.92, 0.1 * h], [r * 0.62, 0.32 * h], [r * 0.34, 0.6 * h], [r * 0.14, 0.86 * h], [0.001, h]], s.lodFar ? 12 : 20);
  const c = new THREE.Color(color);
  s.solid.add(geo, { m: T(x, y, z, 0, 0, lean), color: gradY(0, c.clone().multiplyScalar(0.72), h, c.clone().lerp(new THREE.Color(0x9a86ff), 0.25)), rough: 0.3, clear: 0.9 });
}

function archWindow(s, x, y, z, ry, w, h, { lit = true, frame = true } = {}) {
  const fm = T(x, y, z, 0, ry);
  if (frame) s.solid.add(shapeGeo(archShape(w + 0.42, h + 0.32)), { m: fm.clone().multiply(T(0, -0.12, 0.03)), color: 0x2c1c6e, rough: 0.5 });
  s.solid.add(shapeGeo(archShape(w, h)), { m: fm.clone().multiply(T(0, 0, 0.08)), color: lit ? WIN : 0x241654, rough: 0.5, emis: lit ? 1.5 : 0 });
  if (lit && frame && w > 0.9) {
    s.solid.add(rawBox(0.07, h * 0.9, 0.05), { m: fm.clone().multiply(T(0, h * 0.45, 0.11)), color: 0x3a2466, rough: 0.5 });
    s.solid.add(rawBox(w, 0.07, 0.05), { m: fm.clone().multiply(T(0, h * 0.5, 0.11)), color: 0x3a2466, rough: 0.5 });
  }
}

/** Round tower with collar, battlements, window rows and a roof. */
function tower(s, x, z, r, h, opt = {}) {
  const { y = 0, roofH = r * 3.1, roofCol = ROOF_A, flag = false, windows = 3, lean = 0, wall = STONE, crown = true, winH = 0 } = opt;
  const R = s.R;
  const col = gradY(y, new THREE.Color(wall).multiplyScalar(0.62), y + h, new THREE.Color(wall).lerp(new THREE.Color(0xffffff), 0.05));
  const seg = s.lodFar ? 14 : 22;
  s.brick.add(disc(r, r * 1.04, h, 0.1, seg), { m: T(x, y + h / 2, z), color: (p, n, o) => {
    col({ y: p.y + y + h / 2 }, n, o);
  }, rough: 0.55, clear: 0.2, uvScale: [Math.max(2, Math.round((r * TAU) / 7)), h / 7] });
  // Corbel collar and battlements.
  const topY = y + h;
  s.solid.add(lathe([[r * 1.02, topY - 1.5], [r * 1.2, topY - 0.65], [r * 1.22, topY + 0.1], [r * 1.16, topY + 0.2], [0.01, topY + 0.2]], seg), { color: gradY(topY - 1.5, 0x3f2a9c, topY, TRIM), rough: 0.42, clear: 0.5, m: T(x, 0, z) });
  if (crown) {
    const n = Math.max(6, Math.round((r * TAU) / 2.1));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      s.solid.add(rawBox(1.15, 1.25, 0.7), { m: T(x + Math.sin(a) * r * 1.17, topY + 0.72, z + Math.cos(a) * r * 1.17, 0, a), color: TRIM, rough: 0.42, clear: 0.4 });
    }
  }
  if (roofH > 0) roof(s, x, topY + 0.15, z, r, roofH, roofCol, lean);
  if (flag && roofH > 0) s.pennant(x, topY + roofH - 0.5, z, 1.5, R() < 0.5 ? 0xe8334a : 0xff8a1e, R.range(-0.4, 0.8));
  // Window rows on the visible face only.
  for (let w = 0; w < windows; w++) {
    const wy = y + h * (0.38 + (w / Math.max(1, windows)) * 0.5) + winH;
    const count = r > 5 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const a = ((i - (count - 1) / 2) * (r > 5 ? 0.62 : 0.9)) + R.range(-0.04, 0.04);
      const ww = lerp(1.4, 2.1, Math.min(1, r / 8)), wh = ww * 2;
      archWindow(s, x + Math.sin(a) * (r + 0.02), wy, z + Math.cos(a) * (r + 0.02), a, ww, wh, { lit: R() > 0.1 });
      s.halo(x + Math.sin(a) * (r + 0.6), wy + wh / 2, z + Math.cos(a) * (r + 0.6), ww * 4.5, 0xffa030, 0.22);
    }
  }
}

/** Flat wall with bricks, a walkway lip and merlons along the top. */
function wall(s, x0, x1, z, h, d = 8, y = 0, opt = {}) {
  const { merlons = true, windows = 0 } = opt;
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const col = gradY(-h / 2, new THREE.Color(STONE).multiplyScalar(0.55), h / 2, STONE);
  s.brick.add(box(w, h, d, 0.2, 1), { m: T(cx, y + h / 2, z), color: col, rough: 0.55, clear: 0.2, uv: uvPlanar(1 / 7) });
  s.solid.add(rawBox(w + 0.8, 0.5, d + 0.9), { m: T(cx, y + h + 0.2, z), color: TRIM, rough: 0.42, clear: 0.4 });
  if (merlons) {
    const n = Math.round(w / 2.9);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      s.solid.add(rawBox(1.45, 1.3, 0.8), { m: T(lerp(x0 + 0.6, x1 - 0.6, t), y + h + 0.95, z + d / 2 + 0.05), color: TRIM, rough: 0.42, clear: 0.4 });
    }
  }
  for (let i = 0; i < windows; i++) {
    const t = (i + 0.5) / windows;
    const wx = lerp(x0, x1, t);
    archWindow(s, wx, y + h * 0.42, z + d / 2 + 0.03, 0, 1.7, 3.4);
    s.halo(wx, y + h * 0.42 + 1.8, z + d / 2 + 0.7, 7.5, 0xffa030, 0.24);
  }
}

/** The gate: stone arch, glowing interior, wooden doors thrown open. */
function gate(s, x, z, w, h) {
  const fm = T(x, 0, z);
  s.solid.add(shapeGeo(archShape(w + 3.4, h + 2.4, 14), { depth: 1.6, bevel: 0.26 }), { m: fm.clone().multiply(T(0, -0.1, 0)), color: 0x5a3fd0, rough: 0.4, clear: 0.5 });
  s.solid.add(shapeGeo(archShape(w, h, 14)), { m: fm.clone().multiply(T(0, 0, 2.0)), color: 0xff8a18, rough: 0.5, emis: 1.5 });
  s.solid.add(shapeGeo(archShape(w * 0.7, h * 0.78, 12)), { m: fm.clone().multiply(T(0, 0, 2.05)), color: 0xffc23a, rough: 0.5, emis: 1.8 });
  s.halo(x, h * 0.55, z + 4, w * 3.4, 0xff9a2a, 0.7);
  // Keystones around the arch.
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    const R = w / 2 + 0.9;
    s.solid.add(box(1.2, 1.5, 2.1, 0.12, 1), { m: T(x + Math.cos(a) * R, h - w / 2 + Math.sin(a) * R, z + 1.45, 0, 0, a - Math.PI / 2), color: i % 2 ? 0x7f65f2 : 0x9681ff, rough: 0.36, clear: 0.6 });
  }
}

export function buildCastle(s, { x = 0, y = 0, z = 0, scale = 1, seed = 8, giant = true } = {}) {
  void seed;
  const inner = { // scoped proxy so all castle pieces inherit the placement transform
    solid: wrap(s.solid), brick: wrap(s.brick), jack: wrap(s.jack), two: wrap(s.two), bannerB: wrap(s.bannerB),
    R: s.R, lodFar: s.lodFar,
    halo: (hx, hy, hz, size, c, k) => s.halo(x + hx * scale, y + hy * scale, z + hz * scale, size * scale, c, k),
    pennant: (px, py, pz, ps, c, ry) => {
      const prev = { solid: s.solid, two: s.two };
      s.solid = inner.solid; s.two = inner.two;
      s.pennant(px, py, pz, ps, c, ry);
      s.solid = prev.solid; s.two = prev.two;
    },
  };
  function wrap(b) {
    const base = T(x, y, z, 0, 0, 0, scale);
    return {
      add: (geo, o = {}) => {
        const q = { ...o };
        q.m = o.m ? base.clone().multiply(o.m) : base;
        b.add(geo, q);
      },
    };
  }
  const c = inner;

  // ---------- Main curtain wall and gate ----------
  wall(c, -46, -12, -2, 18, 10, 0, { windows: 3 });
  wall(c, 12, 46, -2, 18, 10, 0, { windows: 3 });
  wall(c, -12, 12, -5, 26, 8);
  gate(c, 0, 0, 13, 15);

  // Far wings, lower and pushed back.
  wall(c, -100, -46, -16, 13, 8, 0, { windows: 4 });
  wall(c, 46, 100, -16, 13, 8, 0, { windows: 4 });

  // ---------- Towers ----------
  tower(c, -21, 2, 7.2, 36, { roofCol: ROOF_A, flag: true, windows: 3 });
  tower(c, 21, 2, 7.2, 36, { roofCol: ROOF_A, flag: true, windows: 3 });
  tower(c, -46, 0, 6.2, 27, { roofCol: ROOF_B, windows: 2, roofH: 16 });
  tower(c, 46, 0, 6.2, 27, { roofCol: ROOF_B, windows: 2, roofH: 16, lean: 0.03 });
  tower(c, -72, -14, 5.2, 24, { roofCol: ROOF_A, windows: 2, flag: true, roofH: 15 });
  tower(c, 72, -14, 5.2, 24, { roofCol: ROOF_A, windows: 2, roofH: 15, lean: -0.04 });
  tower(c, -98, -14, 4.6, 20, { roofCol: ROOF_C, windows: 1, roofH: 12 });
  tower(c, 98, -14, 4.6, 20, { roofCol: ROOF_C, windows: 1, roofH: 12, flag: true });

  // The keep behind the giant pumpkin: tall spires reaching the top of the frame.
  c.brick.add(box(46, 46, 24, 0.3, 1), { m: T(0, 23, -30), color: gradY(-23, new THREE.Color(STONE).multiplyScalar(0.55), 23, STONE), rough: 0.55, clear: 0.2, uv: uvPlanar(1 / 7) });
  c.solid.add(rawBox(48, 0.8, 26), { m: T(0, 46.4, -30), color: TRIM, rough: 0.42, clear: 0.4 });
  tower(c, 0, -34, 9, 66, { roofCol: ROOF_A, roofH: 34, flag: true, windows: 3, winH: 8 });
  tower(c, -15, -24, 6, 56, { roofCol: ROOF_B, roofH: 22, windows: 3, winH: 5, flag: true });
  tower(c, 15, -24, 6, 56, { roofCol: ROOF_B, roofH: 22, windows: 3, winH: 5, flag: true });
  tower(c, -30, -26, 5.5, 48, { roofCol: ROOF_A, roofH: 20, windows: 3, winH: 3 });
  tower(c, 30, -26, 5.5, 48, { roofCol: ROOF_A, roofH: 20, windows: 3, winH: 3, flag: true });
  tower(c, 8, -44, 4.4, 72, { roofCol: ROOF_C, roofH: 18, windows: 1, winH: 22 });
  tower(c, -9, -46, 4.2, 68, { roofCol: ROOF_C, roofH: 18, windows: 1, winH: 20 });
  for (let i = 0; i < 3; i++) {
    const wx = -14 + i * 14;
    archWindow(c, wx, 34, -17.8, 0, 2.6, 5.2);
    c.halo(wx, 37, -17, 11, 0xffa030, 0.28);
  }

  // ---------- Giant jack-o'-lantern ----------
  if (giant) {
    const r = 19 * scale;
    s.jackO(x, y + 30 * scale, z + 3 * scale, r, 0, { nu: s.lodFar ? 64 : 110, nv: s.lodFar ? 40 : 64 });
    s.halo(x, y + 28 * scale, z + 22 * scale, 66 * scale, 0xff9020, 0.14);
  }
  // Side lanterns on the battlements.
  s.jackO(x - 34 * scale, y + 23 * scale, z + 1 * scale, 5.5 * scale, 0.1);
  s.jackO(x + 34 * scale, y + 23 * scale, z + 1 * scale, 5.5 * scale, -0.1);
  s.jackO(x - 61 * scale, y + 17 * scale, z - 12 * scale, 4 * scale, 0.05);
  s.jackO(x + 61 * scale, y + 17 * scale, z - 12 * scale, 4 * scale, -0.05);

  // Glowing orange balconies either side of the gate, as on the key art.
  for (const sd of [1, -1]) {
    c.solid.add(disc(4.2, 3.8, 0.7, 0.16, 18), { m: T(sd * 32, 12, 4.5), color: 0xff8e22, rough: 0.3, clear: 1, emis: 0.2 });
    c.solid.add(disc(2, 0.8, 2.6, 0.1, 12), { m: T(sd * 32, 10.4, 4.5), color: 0x4a2aa0, rough: 0.4, clear: 0.6 });
    c.solid.add(disc(4.6, 4.2, 0.5, 0.14, 18), { m: T(sd * 12.5, 6.5, 8), color: 0x7a3ae8, rough: 0.3, clear: 1 });
  }
}

void paramSurface;
