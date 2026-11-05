// Character art: skins, accessories and the skinned mesh they bake into.
//
// Each character shares a chibi rig (giant head, short body). Parts are authored in model space, facing
// +Z, and baked into one SkinnedMesh so sixteen racers cost sixteen draw calls. Faces are painted into a
// per-skin texture using an azimuthal projection, so the whole head has no UV seam.
import * as THREE from 'three';
import {
  Batch, T, TAU, blob, box, capsule, clamp, disc, faceMap, gradY, lathe, lerp, paramSurface, pumpkinGeo, shapeGeo, smooth, sphere, stemGeo, torus, tube, witchHatGeo, prism,
} from '../render/geo.js';
import { makeCanvas, maskSampler, paintHeroFace, paintJackFace, roundedPoly, toTexture } from '../render/textures.js';
import { patchToy } from '../render/materials.js';

export const BONE = { root: 0, hips: 1, chest: 2, head: 3, armL: 4, handL: 5, armR: 6, handR: 7, legL: 8, footL: 9, legR: 10, footR: 11 };
const PIVOT = [
  [0, 0, 0], [0, 0.42, 0], [0, 0.5, 0], [0, 0.84, 0],
  [0.25, 0.76, 0], [0.4, 0.46, 0.02], [-0.25, 0.76, 0], [-0.4, 0.46, 0.02],
  [0.13, 0.4, 0], [0.13, 0.13, 0], [-0.13, 0.4, 0], [-0.13, 0.13, 0],
];
const PARENT = [-1, 0, 1, 2, 2, 4, 2, 6, 1, 8, 1, 10];
const WHITE_UV = [0.035, 0.035];

/** Blank face texture: head base colour within the disc, white in the corners for untextured parts. */
function faceLayers(S, base = '#ffffff') {
  const albedo = makeCanvas(S), emis = makeCanvas(S);
  const a = albedo.getContext('2d'), e = emis.getContext('2d');
  a.fillStyle = '#ffffff'; a.fillRect(0, 0, S, S);
  a.fillStyle = base; a.beginPath(); a.arc(S / 2, S / 2, S * 0.505, 0, 7); a.fill();
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  a.save(); a.scale(S / 100, S / 100);
  e.save(); e.scale(S / 100, S / 100);
  return { albedo, emis, a, e, done() { a.restore(); e.restore(); } };
}

const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 7); };
function softSpot(c, x, y, r, color) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Maps a head-local position (relative to the ellipsoid centre) to the face texture. */
const uvFace = (rx, ry, rz) => (p, out) => {
  const q = faceMap(p.x / rx, p.y / ry, p.z / rz);
  out.x = q.x; out.y = q.y;
};

/** Glossy dome eye with catch-lights, placed on an ellipsoid head. */
function addEye(add, c, rx, ry, rz, az, el, w, h, { color = 0x120a1e, pupil = null, glint = 1, bone = BONE.head, detail = 1, depth = 0.34, glintSize = 0.26 } = {}) {
  const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
  const px = c[0] + dx * rx, py = c[1] + dy * ry, pz = c[2] + dz * rz;
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(dx * ry * rz, dy * rx * rz, dz * rx * ry), new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  m.setPosition(px, py, pz);
  const seg = detail ? 18 : 10;
  add(blob(w, h, w * depth, seg, Math.round(seg * 0.7)), { m, color, rough: 0.12, clear: 1, bone });
  if (pupil !== null) {
    const mp = m.clone().multiply(T(0, 0, w * depth * 0.72, 0, 0, 0, 1));
    add(blob(w * 0.52, h * 0.52, w * depth * 0.5, seg, Math.round(seg * 0.6)), { m: mp, color: pupil, rough: 0.1, clear: 1, bone });
  }
  if (glint) {
    const mg = m.clone().multiply(T(w * 0.26, h * 0.36, w * depth * (pupil !== null ? 1.05 : 0.86)));
    add(blob(w * glintSize, h * glintSize, w * 0.1, 10, 7), { m: mg, color: 0xffffff, rough: 0.3, emis: 1.2, bone });
    if (detail) {
      const mg2 = m.clone().multiply(T(-w * 0.28, -h * 0.3, w * depth * (pupil !== null ? 1.0 : 0.8)));
      add(blob(w * 0.09, h * 0.09, w * 0.05, 8, 6), { m: mg2, color: 0xffffff, rough: 0.3, emis: 0.6, bone });
    }
  }
}

/** Chunky mitten with stubby fingers. */
function addHand(add, side, color, boneHand, detail, { rough = 0.42, clear = 0.45 } = {}) {
  const cx = side * 0.42, cy = 0.42, cz = 0.02;
  const seg = detail ? 16 : 9;
  add(blob(0.1, 0.105, 0.105, seg, Math.round(seg * 0.7)), { m: T(cx, cy, cz), color, rough, clear, bone: boneHand });
  if (detail) {
    for (let i = -1; i <= 1; i++) {
      add(capsule(0.033, 0.045, 3, 8), { m: T(cx + side * 0.012 + i * 0.056, cy - 0.095, cz + 0.015, 0.1, 0, 0), color, rough, clear, bone: boneHand });
    }
    add(capsule(0.034, 0.04, 3, 8), { m: T(cx - side * 0.09, cy - 0.015, cz + 0.05, 0, 0, side * 0.9), color, rough, clear, bone: boneHand });
  }
}

function addBoot(add, side, color, soleColor, boneFoot, detail, { top = null, stripe = null } = {}) {
  const seg = detail ? 16 : 9;
  const x = side * 0.13;
  add(blob(0.118, 0.095, 0.165, seg, Math.round(seg * 0.65)), { m: T(x, 0.092, 0.042), color, rough: 0.42, clear: 0.5, bone: boneFoot });
  add(blob(0.118, 0.032, 0.17, seg, 6), { m: T(x, 0.028, 0.04), color: soleColor, rough: 0.6, clear: 0.2, bone: boneFoot });
  add(lathe([[0.095, 0.12], [0.112, 0.15], [0.11, 0.21], [0.092, 0.225]], seg), { m: T(x, 0, 0), color: top ?? color, rough: 0.42, clear: 0.4, bone: boneFoot });
  if (stripe !== null) add(torus(0.103, 0.012, 6, seg), { m: T(x, 0.195, 0, Math.PI / 2), color: stripe, rough: 0.5, clear: 0.2, bone: boneFoot });
}

/** Standard chibi body: torso, belt, arms, legs, boots. */
function addBody(add, o, detail) {
  const seg = detail ? 22 : 12;
  const {
    shirt = 0x35224a, shirtLow = null, pants = 0x2b1c3c, boots = 0x7a3a18, sole = 0x3a1a0a, gloves = 0xe2641a, sleeve = null, cuff = null, belt = null, collar = null, skip = {}, shirtRough = 0.62, shirtClear = 0.25, forearm = null, leg = null, buttons = null,
  } = o;
  const sl = sleeve ?? shirt;
  if (!skip.torso) {
    add(lathe([[0.17, 0.4], [0.25, 0.44], [0.3, 0.52], [0.31, 0.62], [0.285, 0.73], [0.22, 0.81], [0.13, 0.875], [0.06, 0.9]], seg), {
      color: gradY(0.36, shirtLow ?? new THREE.Color(shirt).multiplyScalar(0.55), 0.82, shirt), rough: shirtRough, clear: shirtClear, bone: BONE.chest,
    });
    if (belt !== null) {
      add(lathe([[0.27, 0.476], [0.3, 0.486], [0.312, 0.51], [0.314, 0.545], [0.296, 0.56]], seg), { color: belt, rough: 0.42, clear: 0.5, bone: BONE.chest });
    }
    if (collar !== null) add(torus(0.155, 0.04, 8, seg), { m: T(0, 0.835, 0, Math.PI / 2), color: collar, rough: 0.5, clear: 0.3, bone: BONE.chest });
    if (buttons !== null && detail) for (const y of [0.74, 0.64]) add(blob(0.024, 0.024, 0.012, 8, 6), { m: T(0, y, 0.307 - (y - 0.62) ** 2 * 1.6), color: buttons, rough: 0.3, clear: 0.9, bone: BONE.chest });
  }
  if (!skip.pants) {
    add(lathe([[0.1, 0.27], [0.21, 0.3], [0.26, 0.37], [0.262, 0.46], [0.22, 0.5]], seg), { color: gradY(0.27, new THREE.Color(pants).multiplyScalar(0.7), 0.5, pants), rough: 0.6, clear: 0.2, bone: BONE.hips });
  }
  if (!skip.legs) {
    for (const s of [1, -1]) {
      const bone = s > 0 ? BONE.legL : BONE.legR;
      add(capsule(0.1, 0.14, 4, detail ? 12 : 8), { m: T(s * 0.13, 0.27, 0), color: leg ?? pants, rough: leg !== null ? 0.42 : 0.6, clear: leg !== null ? 0.5 : 0.2, bone });
    }
  }
  if (!skip.boots) {
    addBoot(add, 1, boots, sole, BONE.footL, detail, { stripe: o.bootStripe ?? null });
    addBoot(add, -1, boots, sole, BONE.footR, detail, { stripe: o.bootStripe ?? null });
  }
  if (!skip.arms) {
    for (const s of [1, -1]) {
      const a = s > 0 ? BONE.armL : BONE.armR;
      const h = s > 0 ? BONE.handL : BONE.handR;
      add(capsule(0.076, 0.25, 4, detail ? 12 : 8), { m: T(s * 0.335, 0.62, 0.01, 0, 0, s * 0.42), color: forearm ?? sl, rough: forearm !== null ? 0.42 : shirtRough, clear: forearm !== null ? 0.5 : shirtClear, bone: a });
      if (forearm !== null) add(capsule(0.088, 0.1, 4, detail ? 12 : 8), { m: T(s * 0.285, 0.72, 0.01, 0, 0, s * 0.42), color: sl, rough: shirtRough, clear: shirtClear, bone: a });
      if (cuff !== null) add(torus(0.075, 0.024, 6, detail ? 14 : 9), { m: T(s * 0.385, 0.505, 0.015, Math.PI / 2 + 0.0, 0, s * 0.42), color: cuff, rough: 0.45, clear: 0.5, bone: a });
      if (!skip.hands) addHand(add, s, gloves, h, detail);
    }
  }
}

function addStem(add, cy, R, { color = 0x4f8f2a, tip = 0x7fbf3a, leaf = true, detail = 1 } = {}) {
  const top = cy + R * 0.61;
  add(stemGeo(R * 1.5), { m: T(0, top - R * 0.16, 0, 0, 0.7, 0), color: gradY(0, new THREE.Color(color).multiplyScalar(0.72), R * 0.36, tip), rough: 0.5, clear: 0.5, bone: BONE.head });
  // The dimple collar where the stem meets the pumpkin.
  add(lathe([[R * 0.28, top - R * 0.2], [R * 0.2, top - R * 0.1], [R * 0.13, top - R * 0.03], [0.001, top - R * 0.01]], detail ? 14 : 8), {
    color: new THREE.Color(color).multiplyScalar(0.8), rough: 0.6, clear: 0.3, bone: BONE.head,
  });
  if (leaf && detail) {
    const curl = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, a = t * 4.2;
      curl.push([R * (0.14 + 0.22 * t) * Math.cos(a), top + R * 0.03 + R * 0.1 * Math.sin(a * 0.7) - t * 0.02, R * (0.14 + 0.22 * t) * Math.sin(a)]);
    }
    add(tube(curl, (t) => lerp(R * 0.052, R * 0.016, t), 22, 6), { color: tip, rough: 0.5, clear: 0.4, bone: BONE.head });
  }
}

/** Pumpkin head, shared by Pumpkin / Ember / Gold skins. */
function pumpkinSkin({ base, groove, top, bottom, face = 'hero', faceOpts = {}, eye = 0x34130a, body, stem }) {
  return (add, detail) => {
    const S = detail ? 1024 : 384;
    const f = face === 'hero' ? paintHeroFace(S, faceOpts) : paintJackFace(S, faceOpts);
    const R = 0.6, H = 0.82, cy = 1.26;
    const geo = pumpkinGeo({ R, H, ribs: 12, depth: 0.1, base, groove, top, bottom, nu: detail ? 120 : 48, nv: detail ? 64 : 24, faceUV: true });
    add(geo, { m: T(0, cy, 0), rough: 0.38, clear: 0.3, emis: 0.12, bone: BONE.head, ownUV: true });
    if (face === 'hero') {
      const ey = [0, cy + 0.015, 0];
      addEye(add, ey, R * 0.93, R * H, R * 0.93, 0.37, 0.2, 0.112, 0.132, { detail, color: eye, depth: 0.3, glintSize: 0.2 });
      addEye(add, ey, R * 0.93, R * H, R * 0.93, -0.37, 0.2, 0.112, 0.132, { detail, color: eye, depth: 0.3, glintSize: 0.2 });
    }
    addStem(add, cy, R, { detail, ...stem });
    addBody(add, body, detail);
    return { albedo: f.albedo, emis: f.emis };
  };
}

export const SKINS = {
  pumpkin: {
    name: 'Pumpkin', price: 0, tier: 'common',
    hat: { y: 1.67, s: 0.76 }, glasses: { y: 1.385, z: 0.605, s: 1 },
    build: pumpkinSkin({
      base: 0xff9a16, groove: 0xe2680a, top: 0xffb83a, bottom: 0xf27e10,
      stem: {},
      body: { shirt: 0x4a2448, shirtLow: 0x2a1430, pants: 0x3a2040, boots: 0x7c3a16, sole: 0x3a1a0a, gloves: 0x70381a, sleeve: 0x4a2f6e, forearm: 0xff9a22, leg: 0xff9020, belt: 0xff8c16, collar: 0xffa82c, buttons: 0xe0a040 },
    }),
  },

  ghost: {
    name: 'Ghost', price: 300, tier: 'common',
    hat: { y: 1.7, s: 0.66 }, glasses: { y: 1.36, z: 0.54, s: 0.96 },
    build(add, detail) {
      const cy = 1.25, rh = 0.51;
      const f = faceLayers(detail ? 512 : 256, '#ffffff');
      const c = f.a;
      softSpot(c, 27, 60, 11, 'rgba(255,140,190,0.55)');
      softSpot(c, 73, 60, 11, 'rgba(255,140,190,0.55)');
      c.fillStyle = '#2b1030';
      c.beginPath(); c.moveTo(42, 60); c.quadraticCurveTo(50, 62, 58, 60); c.quadraticCurveTo(57, 71, 50, 72); c.quadraticCurveTo(43, 71, 42, 60); c.closePath(); c.fill();
      c.fillStyle = '#ff6f94'; ell(c, 50, 68.5, 5, 3); c.fill();
      f.done();
      const nu = detail ? 64 : 28, nv = detail ? 44 : 20;
      const surf = (u, v, p) => {
        const th = u * TAU;
        // Dome on top, gentle flare toward a wavy hem.
        const k = v;
        const y = lerp(1.76, 0.2, k);
        let r;
        if (k < 0.34) { const q = k / 0.34; r = rh * Math.sin(q * Math.PI / 2) ** 0.72; } else r = rh + (k - 0.34) * 0.26 + Math.pow(smooth(0.6, 1, k), 2) * 0.13;
        const wave = smooth(0.5, 1, k);
        r += Math.sin(th * 7 + 0.4) * 0.032 * wave + Math.sin(th * 13) * 0.008 * wave;
        const yy = y + Math.cos(th * 7 + 0.4) * 0.045 * wave;
        p.set(Math.sin(th) * r, yy, Math.cos(th) * r);
      };
      const light = new THREE.Color(0xffffff), shade = new THREE.Color(0xc6b6f0);
      const geo = paramSurface(surf, nu, nv, {
        uv: (u, v, p, out) => { const q = faceMap(p.x / rh, (p.y - cy) / rh, p.z / rh); out.x = q.x; out.y = q.y; },
        color: (u, v, p, out) => {
          const th = u * TAU;
          const wave = smooth(0.45, 1, v) * (0.5 + 0.5 * Math.cos(th * 7 + 0.4));
          const col = light.clone().lerp(shade, wave * 0.75 + smooth(0.6, 1, v) * 0.2);
          out.r = col.r; out.g = col.g; out.b = col.b;
        },
      });
      const skin = (p) => {
        if (p.y > 0.72) { const t = smooth(0.72, 1.12, p.y); return [BONE.head, t, BONE.chest, 1 - t]; }
        const t = smooth(0.3, 0.72, p.y); return [BONE.chest, t, BONE.hips, 1 - t];
      };
      add(geo, { rough: 0.34, clear: 0.55, emis: 0.1, skin, ownUV: true });
      // Inner lining closes the sheet from below.
      add(lathe([[0.001, 0.36], [0.5, 0.26], [0.62, 0.22]], detail ? 20 : 10), { color: 0x8d7ac8, rough: 0.9, bone: BONE.hips, m: T(0, 0, 0, Math.PI, 0, 0).multiply(T(0, -0.58, 0)) });
      addEye(add, [0, cy, 0], rh, rh, rh, 0.33, 0.14, 0.098, 0.145, { detail });
      addEye(add, [0, cy, 0], rh, rh, rh, -0.33, 0.14, 0.098, 0.145, { detail });
      // Stubby sheet arms.
      for (const s of [1, -1]) {
        const a = s > 0 ? BONE.armL : BONE.armR, h = s > 0 ? BONE.handL : BONE.handR;
        add(capsule(0.095, 0.22, 5, detail ? 12 : 8), { m: T(s * 0.5, 0.72, 0.02, 0, 0, s * 0.78), color: 0xf4efff, rough: 0.34, clear: 0.5, emis: 0.1, bone: a });
        add(blob(0.115, 0.115, 0.115, detail ? 12 : 8, 8), { m: T(s * 0.62, 0.6, 0.02), color: 0xffffff, rough: 0.34, clear: 0.5, emis: 0.1, bone: h });
      }
      addBoot(add, 1, 0x7a4220, 0x3a1a0a, BONE.footL, detail);
      addBoot(add, -1, 0x7a4220, 0x3a1a0a, BONE.footR, detail);
      return { albedo: f.albedo, emis: f.emis };
    },
  },

  skeleton: {
    name: 'Skeleton', price: 300, tier: 'common',
    hat: { y: 1.7, s: 0.68 }, glasses: { y: 1.36, z: 0.535, s: 1 },
    build(add, detail) {
      const cy = 1.26, rx = 0.52, ry = 0.47, rz = 0.5;
      const f = faceLayers(detail ? 768 : 320, '#14101c');
      const c = f.a;
      // White skull mask inside the black hood.
      c.fillStyle = '#f6f3e6';
      c.beginPath();
      c.moveTo(50, 19);
      c.bezierCurveTo(74, 19, 83, 36, 79, 52);
      c.bezierCurveTo(77, 60, 70, 62, 68, 68);
      c.bezierCurveTo(66, 79, 58, 83, 50, 83);
      c.bezierCurveTo(42, 83, 34, 79, 32, 68);
      c.bezierCurveTo(30, 62, 23, 60, 21, 52);
      c.bezierCurveTo(17, 36, 26, 19, 50, 19);
      c.closePath(); c.fill();
      c.fillStyle = '#100a12';
      ell(c, 36, 44, 10.5, 12.5, -0.16); c.fill();
      ell(c, 64, 44, 10.5, 12.5, 0.16); c.fill();
      c.beginPath(); c.moveTo(50, 56); c.bezierCurveTo(45, 62, 47, 65, 50, 62.5); c.bezierCurveTo(53, 65, 55, 62, 50, 56); c.fill();
      // Stitched teeth.
      c.lineWidth = 2; c.strokeStyle = '#100a12'; c.lineCap = 'round';
      c.beginPath(); c.moveTo(35, 70); c.quadraticCurveTo(50, 76, 65, 70); c.stroke();
      for (let i = 0; i < 5; i++) {
        const t = (i + 0.5) / 5, x = lerp(37, 63, t), y = 70 + 3.2 * Math.sin(t * Math.PI);
        c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y - 3); c.lineTo(x, y + 3); c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,0.95)';
      ell(c, 32.5, 39.5, 3, 4.2, -0.3); c.fill(); ell(c, 60.5, 39.5, 3, 4.2, -0.3); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.75)';
      ell(c, 39, 49, 1.5, 2); c.fill(); ell(c, 67, 49, 1.5, 2); c.fill();
      f.done();
      const seg = detail ? 44 : 20;
      const skull = paramSurface((u, v, p) => {
        const th = u * TAU, ph = v * Math.PI;
        const sp = Math.sin(ph), cp = Math.cos(ph);
        // Narrower jaw below the equator.
        const jaw = cp < 0 ? 1 - 0.18 * (-cp) : 1;
        p.set(Math.sin(th) * sp * rx * jaw, cp * ry, Math.cos(th) * sp * rz * jaw);
      }, seg, Math.round(seg * 0.7), { uv: (u, v, p, out) => { const q = faceMap(p.x / rx, p.y / ry, p.z / rz); out.x = q.x; out.y = q.y; } });
      add(skull, { m: T(0, cy, 0), color: 0xffffff, rough: 0.34, clear: 0.7, bone: BONE.head, ownUV: true });
      const black = 0x17121f;
      addBody(add, { shirt: black, shirtLow: 0x0c0912, pants: black, boots: 0x201a28, sole: 0x0c0912, gloves: 0xf4f0e2, sleeve: black, shirtRough: 0.55 }, detail);
      // Painted-on bones are modelled so they catch the light.
      const bone = 0xf6f3e6;
      for (let i = 0; i < 3; i++) {
        const y = 0.72 - i * 0.075, w = 0.2 - i * 0.012;
        const rib = [];
        for (let k = 0; k <= 10; k++) {
          const t = (k / 10) * 2 - 1;
          const ang = t * 1.0;
          rib.push([Math.sin(ang) * w * 1.46, y - Math.abs(t) * 0.022, Math.cos(ang) * 0.296 + 0.012]);
        }
        add(tube(rib, 0.017, detail ? 18 : 9, 6), { color: bone, rough: 0.4, clear: 0.5, bone: BONE.chest });
      }
      add(capsule(0.02, 0.19, 3, 6), { m: T(0, 0.65, 0.304), color: bone, rough: 0.4, clear: 0.5, bone: BONE.chest });
      for (const s of [1, -1]) {
        const a = s > 0 ? BONE.armL : BONE.armR, l = s > 0 ? BONE.legL : BONE.legR;
        add(capsule(0.03, 0.2, 3, 6), { m: T(s * 0.335, 0.62, 0.07, 0, 0, s * 0.42), color: bone, rough: 0.4, clear: 0.5, bone: a });
        add(capsule(0.032, 0.09, 3, 6), { m: T(s * 0.13, 0.27, 0.09), color: bone, rough: 0.4, clear: 0.5, bone: l });
        add(blob(0.05, 0.03, 0.05, 8, 6), { m: T(s * 0.13, 0.33, 0.092), color: bone, rough: 0.4, clear: 0.5, bone: l });
      }
      return { albedo: f.albedo, emis: f.emis };
    },
  },

  witch: {
    name: 'Witch', price: 500, tier: 'rare', noHat: true,
    hat: { y: 1.7, s: 0.7 }, glasses: { y: 1.27, z: 0.49, s: 0.92 },
    build(add, detail) {
      const cy = 1.2, rx = 0.46, ry = 0.43, rz = 0.45;
      const f = faceLayers(detail ? 512 : 256, '#7fd03f');
      const c = f.a;
      softSpot(c, 25, 62, 12, 'rgba(255,120,120,0.45)');
      softSpot(c, 75, 62, 12, 'rgba(255,120,120,0.45)');
      c.strokeStyle = '#1d3a10'; c.lineWidth = 2.4; c.lineCap = 'round'; c.fillStyle = '#25130f';
      c.beginPath(); c.moveTo(35, 66); c.quadraticCurveTo(50, 70, 65, 66); c.quadraticCurveTo(61, 82, 50, 83); c.quadraticCurveTo(39, 82, 35, 66); c.closePath(); c.fill();
      c.fillStyle = '#ffffff'; c.fillRect(41, 67, 7, 5);
      c.fillStyle = '#ff6f94'; ell(c, 50, 78, 7, 3.6); c.fill();
      f.done();
      const seg = detail ? 40 : 20;
      add(blob(rx, ry, rz, seg, Math.round(seg * 0.7)), { m: T(0, cy, 0), uv: uvFace(rx, ry, rz), color: 0xffffff, rough: 0.38, clear: 0.5, bone: BONE.head, ownUV: true });
      addEye(add, [0, cy, 0], rx, ry, rz, 0.4, 0.14, 0.074, 0.098, { detail });
      addEye(add, [0, cy, 0], rx, ry, rz, -0.4, 0.14, 0.074, 0.098, { detail });
      add(blob(0.055, 0.05, 0.1, 10, 8), { m: T(0, cy - 0.03, rz + 0.04), color: 0x6cc030, rough: 0.4, clear: 0.5, bone: BONE.head });
      // Hair: a dark bob around the back and sides.
      const hair = 0x2a1648;
      add(blob(rx * 1.09, ry * 0.98, rz * 1.04, seg, Math.round(seg * 0.6)), { m: T(0, cy + 0.03, -0.07), color: hair, rough: 0.5, clear: 0.4, bone: BONE.head });
      for (const s of [1, -1]) add(blob(0.11, 0.2, 0.14, 12, 9), { m: T(s * rx * 0.96, cy - 0.15, -0.05), color: hair, rough: 0.5, clear: 0.4, bone: BONE.head });
      // Big pointy hat.
      const hat = witchHatGeo(0.46, 0.86, { nu: detail ? 28 : 14, nv: detail ? 16 : 8, brim: 1.72 });
      const hm = T(0, cy + 0.28, -0.02, -0.08, 0, 0.05);
      add(hat.cone, { m: hm, color: gradY(0, 0x2b1a56, 0.9, 0x20123f), rough: 0.5, clear: 0.5, bone: BONE.head });
      add(hat.brim, { m: hm, color: 0x241446, rough: 0.5, clear: 0.5, bone: BONE.head });
      add(lathe([[0.462, 0.0], [0.474, 0.03], [0.436, 0.1], [0.404, 0.165], [0.388, 0.18]], detail ? 28 : 14), { m: hm, color: 0xb040e8, rough: 0.3, clear: 0.8, bone: BONE.head });
      add(box(0.16, 0.13, 0.03, 0.012, 2), { m: hm.clone().multiply(T(0, 0.09, 0.45, -0.32)), color: 0xffc830, rough: 0.28, clear: 1, emis: 0.2, bone: BONE.head });
      add(box(0.085, 0.064, 0.035, 0.01, 1), { m: hm.clone().multiply(T(0, 0.09, 0.457, -0.32)), color: 0x241446, rough: 0.5, bone: BONE.head });
      // Purple bell dress, then the standard limbs.
      addBody(add, { shirt: 0x5e2fb8, shirtLow: 0x3a1c78, pants: 0xff8a1e, boots: 0x2a1a30, sole: 0x120a18, gloves: 0x7fd03f, sleeve: 0x5e2fb8, cuff: 0xff8a1e, skip: { pants: true }, belt: 0xffb62e, bootStripe: 0xff8a1e }, detail);
      add(lathe([[0.1, 0.17], [0.27, 0.17], [0.36, 0.2], [0.34, 0.28], [0.29, 0.4], [0.25, 0.5]], detail ? 24 : 12), {
        color: gradY(0.17, 0x2c1468, 0.5, 0x5a2ab0), rough: 0.55, clear: 0.3, bone: BONE.hips,
      });
      add(torus(0.345, 0.024, 6, detail ? 24 : 12), { m: T(0, 0.205, 0, Math.PI / 2), color: 0xff8a1e, rough: 0.45, clear: 0.5, bone: BONE.hips });
      return { albedo: f.albedo, emis: f.emis };
    },
  },

  franky: {
    name: 'Franky', price: 400, tier: 'common',
    hat: { y: 1.74, s: 0.66 }, glasses: { y: 1.29, z: 0.475, s: 0.9 },
    build(add, detail) {
      const cy = 1.25;
      const f = faceLayers(detail ? 512 : 256, '#8ed35a');
      const c = f.a;
      c.fillStyle = '#1b2a12';
      c.beginPath(); c.moveTo(34, 67); c.quadraticCurveTo(50, 72, 66, 67); c.quadraticCurveTo(62, 80, 50, 80); c.quadraticCurveTo(38, 80, 34, 67); c.closePath(); c.fill();
      c.fillStyle = '#fffbe6'; c.fillRect(39, 68, 5, 4); c.fillRect(56, 68, 5, 4);
      c.strokeStyle = '#34521f'; c.lineWidth = 1.6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(62, 22); c.lineTo(78, 26); c.stroke();
      for (let i = 0; i < 4; i++) { const x = 64 + i * 4.4, y = 22.4 + i * 1.1; c.beginPath(); c.moveTo(x - 0.4, y - 2.6); c.lineTo(x + 0.4, y + 2.8); c.stroke(); }
      c.strokeStyle = '#1b2a12'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(25, 36); c.lineTo(42, 40); c.stroke();
      c.beginPath(); c.moveTo(75, 36); c.lineTo(58, 40); c.stroke();
      f.done();
      const hw = 0.47, hh = 0.42, hd = 0.44;
      const seg = detail ? 36 : 18;
      const sq = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
      const head = paramSurface((u, v, p) => {
        const th = u * TAU, ph = v * Math.PI, e = 0.55;
        const sp = sq(Math.sin(ph), e);
        p.set(sq(Math.sin(th), e) * sp * hw, sq(Math.cos(ph), e) * hh, sq(Math.cos(th), e) * sp * hd);
      }, seg * 2, seg, { uv: (u, v, p, out) => { const q = faceMap(p.x / hw, p.y / hh, p.z / hd); out.x = q.x; out.y = q.y; } });
      add(head, { m: T(0, cy, 0), color: 0xffffff, rough: 0.42, clear: 0.55, bone: BONE.head, ownUV: true });
      addEye(add, [0, cy, 0], hw, hh, hd, 0.34, 0.05, 0.076, 0.082, { detail, depth: 0.3 });
      addEye(add, [0, cy, 0], hw, hh, hd, -0.34, 0.05, 0.076, 0.082, { detail, depth: 0.3 });
      add(box(0.98, 0.15, 0.9, 0.06, 2), { m: T(0, cy + 0.42, -0.02), color: 0x15121e, rough: 0.46, clear: 0.6, bone: BONE.head });
      for (let i = 0; i < 7; i++) {
        const x = -0.4 + i * 0.133;
        add(box(0.115, 0.13 + (i % 2) * 0.04, 0.09, 0.03, 1), { m: T(x, cy + 0.33 - (i % 2) * 0.02, 0.4), color: 0x15121e, rough: 0.46, clear: 0.6, bone: BONE.head });
      }
      for (const s of [1, -1]) {
        add(disc(0.055, 0.055, 0.13, 0.02, 10), { m: T(s * (hw + 0.05), cy - 0.08, 0, 0, 0, Math.PI / 2), color: 0xa8acc0, rough: 0.3, clear: 1, bone: BONE.head });
        add(disc(0.08, 0.08, 0.05, 0.015, 6), { m: T(s * (hw + 0.13), cy - 0.08, 0, 0, 0, Math.PI / 2), color: 0xc8cce0, rough: 0.3, clear: 1, bone: BONE.head });
      }
      addBody(add, { shirt: 0x2f7f88, shirtLow: 0x1a4f58, pants: 0x241a38, boots: 0x2c2230, sole: 0x120a18, gloves: 0x8ed35a, sleeve: 0x2f7f88, cuff: 0x1a4f58, belt: 0x5a3a20, collar: 0x1a4f58 }, detail);
      return { albedo: f.albedo, emis: f.emis };
    },
  },

  mummy: {
    name: 'Mummy', price: 450, tier: 'rare',
    hat: { y: 1.7, s: 0.66 }, glasses: { y: 1.335, z: 0.53, s: 0.98 },
    build(add, detail) {
      const cy = 1.25, r = 0.5;
      const f = faceLayers(detail ? 512 : 256, '#f3e6c6');
      const c = f.a;
      // Dark gap between the bandages for the eyes.
      c.fillStyle = '#3a2418';
      c.save(); c.translate(50, 45); c.rotate(-0.06);
      c.beginPath(); c.roundRect ? c.roundRect(-29, -10, 58, 20, 8) : c.rect(-29, -10, 58, 20); c.fill(); c.restore();
      f.done();
      const seg = detail ? 44 : 20;
      add(blob(r, r * 0.93, r * 0.98, seg, Math.round(seg * 0.7)), { m: T(0, cy, 0), uv: uvFace(r, r * 0.93, r * 0.98), color: 0xffffff, rough: 0.55, clear: 0.2, bone: BONE.head, ownUV: true });
      addEye(add, [0, cy, 0], r, r * 0.93, r * 0.98, 0.3, 0.17, 0.085, 0.09, { detail, color: 0xfff6e2, pupil: 0x1a0f12, glint: 1, depth: 0.42 });
      addEye(add, [0, cy, 0], r, r * 0.93, r * 0.98, -0.3, 0.17, 0.085, 0.09, { detail, color: 0xfff6e2, pupil: 0x1a0f12, glint: 1, depth: 0.42 });
      const wrap = 0xf7ecd0, wrap2 = 0xe6d4ac;
      // Bandage bands overlap for real, so edges catch light and throw tiny shadows.
      const ring = (R, y, tilt, tw, col, bone, cx = 0, cz = 0, h = 0.05) => {
        add(lathe([[R * 0.96, -h], [R * 1.02, -h * 0.5], [R * 1.03, h * 0.5], [R * 0.96, h]], detail ? 24 : 10), { m: T(cx, y, cz, tilt, tw, tilt * 0.4), color: col, rough: 0.72, clear: 0.05, bone });
      };
      const hb = [[cy + 0.33, 0.1, 0.3, 0.4], [cy + 0.2, -0.12, 1.4, 0.49], [cy - 0.1, 0.13, 2.3, 0.5], [cy - 0.25, -0.1, 0.8, 0.42], [cy - 0.37, 0.14, 1.2, 0.27]];
      hb.forEach(([y, t, w, R], i) => ring(R, y, t, w, i % 2 ? wrap : wrap2, BONE.head));
      addBody(add, { shirt: 0xeadcb8, shirtLow: 0xc0ad86, pants: 0xdccba2, boots: 0x9a7a54, sole: 0x54402a, gloves: 0xf7ecd0, sleeve: 0xeadcb8, shirtRough: 0.74, shirtClear: 0.05 }, detail);
      for (let i = 0; i < 6; i++) ring(lerp(0.32, 0.24, Math.abs(i - 2.2) / 3), 0.45 + i * 0.07, (i % 2 ? 0.2 : -0.17), i * 1.3, i % 2 ? wrap : wrap2, BONE.chest);
      for (const s of [1, -1]) {
        const a = s > 0 ? BONE.armL : BONE.armR, l = s > 0 ? BONE.legL : BONE.legR;
        for (let i = 0; i < 4; i++) {
          const t = (i + 0.5) / 4;
          ring(0.082, lerp(0.73, 0.48, t), s * 0.22 + (i % 2 ? 0.14 : -0.14), i, i % 2 ? wrap : wrap2, a, s * lerp(0.28, 0.39, t), 0.01, 0.03);
        }
        for (let i = 0; i < 3; i++) ring(0.108, 0.35 - i * 0.075, i % 2 ? 0.2 : -0.2, i, i % 2 ? wrap : wrap2, l, s * 0.13, 0, 0.03);
      }
      return { albedo: f.albedo, emis: f.emis };
    },
  },

  vampire: {
    name: 'Vampire', price: 600, tier: 'rare',
    hat: { y: 1.66, s: 0.66 }, glasses: { y: 1.29, z: 0.49, s: 0.94 },
    build(add, detail) {
      const cy = 1.22, rx = 0.47, ry = 0.45, rz = 0.45;
      const f = faceLayers(detail ? 512 : 256, '#f2e6f8');
      const c = f.a;
      softSpot(c, 25, 62, 11, 'rgba(240,120,170,0.4)');
      softSpot(c, 75, 62, 11, 'rgba(240,120,170,0.4)');
      c.fillStyle = '#3a0c1f';
      c.beginPath(); c.moveTo(36, 66); c.quadraticCurveTo(50, 71, 64, 66); c.quadraticCurveTo(58, 78, 50, 78); c.quadraticCurveTo(42, 78, 36, 66); c.closePath(); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(39, 67); c.lineTo(45, 68.4); c.lineTo(41.8, 75); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(61, 67); c.lineTo(55, 68.4); c.lineTo(58.2, 75); c.closePath(); c.fill();
      f.done();
      const seg = detail ? 40 : 20;
      add(blob(rx, ry, rz, seg, Math.round(seg * 0.7)), { m: T(0, cy, 0), uv: uvFace(rx, ry, rz), color: 0xffffff, rough: 0.4, clear: 0.5, bone: BONE.head, ownUV: true });
      addEye(add, [0, cy, 0], rx, ry, rz, 0.36, 0.14, 0.08, 0.095, { detail, color: 0xa81030, pupil: 0x180208 });
      addEye(add, [0, cy, 0], rx, ry, rz, -0.36, 0.14, 0.08, 0.095, { detail, color: 0xa81030, pupil: 0x180208 });
      // Slick hair with a widow's peak.
      const hair = paramSurface((u, v, p) => {
        const th = u * TAU, ph = v * Math.PI * 0.62;
        const front = Math.pow(Math.max(0, Math.cos(th)), 2);
        const peak = Math.exp(-Math.pow(Math.sin(th) / 0.2, 2)) * front;
        const limit = lerp(1, 0.46 + 0.27 * peak, front);
        const sp = Math.sin(ph * limit), cp = Math.cos(ph * limit);
        p.set(Math.sin(th) * sp * rx * 1.05, cp * ry * 1.05, Math.cos(th) * sp * rz * 1.06);
      }, seg, Math.round(seg * 0.5));
      add(hair, { m: T(0, cy + 0.02, 0), color: 0x120a22, rough: 0.2, clear: 1, bone: BONE.head });
      addBody(add, { shirt: 0x1b1630, shirtLow: 0x100c20, pants: 0x14102a, boots: 0x14102a, sole: 0x08060f, gloves: 0xf2e6f8, sleeve: 0x1b1630, cuff: 0xc01840, belt: 0xc01840 }, detail);
      // High collar.
      add(paramSurface((u, v, p) => {
        const th = lerp(-2.3, 2.3, u) + Math.PI;
        const r = lerp(0.2, 0.34, v);
        p.set(Math.sin(th) * r, lerp(0.82, 1.02, v), Math.cos(th) * r - 0.02);
      }, 18, 4, { wrapU: false }), { color: 0xc01840, rough: 0.4, clear: 0.6, bone: BONE.chest, doubleSide: true });
      // Cape.
      const cape = paramSurface((u, v, p) => {
        const x = lerp(-1, 1, u);
        const w = lerp(0.2, 0.44, v);
        p.set(x * w, lerp(0.86, 0.22, v) + Math.cos(x * 7) * 0.02 * v, -0.27 - v * 0.15 - (1 - x * x) * 0.09 + Math.sin(x * 7) * 0.02 * v);
      }, 16, 10, { wrapU: false });
      add(cape, { color: gradY(0.2, 0x7a0f30, 0.86, 0x180a22), rough: 0.5, clear: 0.3, bone: BONE.chest, doubleSide: true });
      return { albedo: f.albedo, emis: f.emis };
    },
  },

  imp: {
    name: 'Blue Imp', price: 350, tier: 'common',
    hat: { y: 1.7, s: 0.68 }, glasses: { y: 1.325, z: 0.515, s: 0.98 },
    build(add, detail) {
      const cy = 1.24, r = 0.5;
      const f = faceLayers(detail ? 512 : 256, '#3f8df5');
      const c = f.a;
      c.fillStyle = '#10143a';
      c.beginPath(); c.moveTo(30, 63); c.quadraticCurveTo(50, 70, 70, 63); c.quadraticCurveTo(66, 80, 50, 81); c.quadraticCurveTo(34, 80, 30, 63); c.closePath(); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(35, 64.5); c.lineTo(43, 66.6); c.lineTo(39.2, 72.5); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(65, 64.5); c.lineTo(57, 66.6); c.lineTo(60.8, 72.5); c.closePath(); c.fill();
      c.fillStyle = '#ff6f94'; ell(c, 50, 76, 8, 3.4); c.fill();
      f.done();
      const seg = detail ? 44 : 20;
      add(blob(r, r * 0.92, r * 0.96, seg, Math.round(seg * 0.7)), { m: T(0, cy, 0), uv: uvFace(r, r * 0.92, r * 0.96), color: 0xffffff, rough: 0.33, clear: 0.8, bone: BONE.head, ownUV: true });
      addEye(add, [0, cy, 0], r, r * 0.92, r * 0.96, 0.36, 0.17, 0.092, 0.11, { detail, color: 0xfffef2, pupil: 0x10143a, depth: 0.42 });
      addEye(add, [0, cy, 0], r, r * 0.92, r * 0.96, -0.36, 0.17, 0.092, 0.11, { detail, color: 0xfffef2, pupil: 0x10143a, depth: 0.42 });
      for (const s of [1, -1]) {
        add(tube([[s * 0.28, cy + 0.34, 0], [s * 0.36, cy + 0.5, 0], [s * 0.3, cy + 0.65, 0]], (t) => lerp(0.08, 0.012, t), 10, 8), { color: 0xffc83a, rough: 0.35, clear: 0.8, bone: BONE.head });
      }
      addBody(add, { shirt: 0x1f2a70, shirtLow: 0x121a4a, pants: 0x161d52, boots: 0x3a2412, sole: 0x180e08, gloves: 0x3f8df5, sleeve: 0x1f2a70, cuff: 0xffc83a, belt: 0xffc83a }, detail);
      return { albedo: f.albedo, emis: f.emis };
    },
  },

  ember: {
    name: 'Ember', price: 800, tier: 'epic',
    hat: { y: 1.67, s: 0.76 }, glasses: { y: 1.385, z: 0.605, s: 1 },
    build: pumpkinSkin({
      base: 0xe2361a, groove: 0x7c0f0a, top: 0xff6a2a, bottom: 0xa8200f,
      face: 'jack', faceOpts: { glow: 1, scary: true, mouth: 'zig', innerA: '#fff27a', innerB: '#ffb020' },
      stem: { color: 0x2a2a30, tip: 0x4a4a54, leaf: false },
      body: { shirt: 0x2a1a24, shirtLow: 0x170e14, pants: 0x1c1218, boots: 0x201418, sole: 0x0c0608, gloves: 0xc42a18, sleeve: 0x2a1a24, cuff: 0xff6a2a, belt: 0xff6a2a, collar: 0xff6a2a },
    }),
  },

  scarecrow: {
    name: 'Scarecrow', price: 550, tier: 'rare', noHat: true,
    hat: { y: 1.68, s: 0.7 }, glasses: { y: 1.3, z: 0.49, s: 0.94 },
    build(add, detail) {
      const cy = 1.22, r = 0.48;
      const f = faceLayers(detail ? 512 : 256, '#d9b77a');
      const c = f.a;
      // Burlap weave.
      c.globalAlpha = 0.15; c.strokeStyle = '#6b4a20'; c.lineWidth = 0.4;
      for (let i = 0; i < 100; i += 2) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 100); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(100, i); c.stroke(); }
      c.globalAlpha = 1;
      c.strokeStyle = '#2a1608'; c.lineWidth = 3.6; c.lineCap = 'round';
      const X = (x, y, s) => { c.beginPath(); c.moveTo(x - s, y - s); c.lineTo(x + s, y + s); c.moveTo(x + s, y - s); c.lineTo(x - s, y + s); c.stroke(); };
      X(34, 44, 7); X(66, 44, 7);
      c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(25, 64); c.quadraticCurveTo(50, 80, 75, 64); c.stroke();
      for (let i = 0; i < 7; i++) { const t = (i + 0.5) / 7, x = lerp(27, 73, t), y = 64 + 8 * Math.sin(t * Math.PI); c.lineWidth = 1.8; c.beginPath(); c.moveTo(x, y - 3.5); c.lineTo(x, y + 3.5); c.stroke(); }
      c.fillStyle = '#ff8a1e'; c.beginPath(); c.moveTo(50, 50); c.lineTo(45, 60); c.lineTo(55, 60); c.closePath(); c.fill();
      f.done();
      const seg = detail ? 40 : 20;
      add(blob(r, r * 0.94, r * 0.96, seg, Math.round(seg * 0.7)), { m: T(0, cy, 0), uv: uvFace(r, r * 0.94, r * 0.96), color: 0xffffff, rough: 0.82, bone: BONE.head, ownUV: true });
      // Straw hat.
      const hm = T(0, cy + 0.27, -0.01, -0.06, 0, -0.05);
      const hat = witchHatGeo(0.4, 0.54, { nu: detail ? 24 : 12, nv: 10, brim: 2.1, bend: 0.25 });
      add(hat.cone, { m: hm, color: gradY(0, 0xd8a83a, 0.5, 0xb88a2a), rough: 0.72, bone: BONE.head });
      add(hat.brim, { m: hm, color: 0xe2b444, rough: 0.72, bone: BONE.head });
      add(lathe([[0.402, 0.0], [0.41, 0.03], [0.37, 0.1], [0.345, 0.135]], detail ? 24 : 12), { m: hm, color: 0xc42a18, rough: 0.5, clear: 0.3, bone: BONE.head });
      addBody(add, { shirt: 0x8a2a24, shirtLow: 0x5a1a18, pants: 0x3f5a8a, boots: 0x5a3414, sole: 0x24140a, gloves: 0xe2b444, sleeve: 0x8a2a24, cuff: 0xe2b444, belt: 0x5a3414, collar: 0xe2b444 }, detail);
      if (detail) for (const s of [1, -1]) {
        for (let i = 0; i < 4; i++) add(capsule(0.012, 0.11, 2, 5), { m: T(s * 0.455 + i * 0.012, 0.38, 0.03 + i * 0.012, 0.2 * i - 0.3, 0, s * 0.5), color: 0xe2b444, rough: 0.8, bone: s > 0 ? BONE.handL : BONE.handR });
      }
      return { albedo: f.albedo, emis: f.emis };
    },
  },

  cat: {
    name: 'Black Cat', price: 700, tier: 'epic',
    hat: { y: 1.63, s: 0.66 }, glasses: { y: 1.3, z: 0.515, s: 0.96 },
    build(add, detail) {
      const cy = 1.23, rx = 0.52, ry = 0.44, rz = 0.48;
      const f = faceLayers(detail ? 512 : 256, '#241a3c');
      const c = f.a;
      c.fillStyle = '#ff7fae'; c.beginPath(); c.moveTo(46, 59); c.lineTo(54, 59); c.lineTo(50, 64); c.closePath(); c.fill();
      c.strokeStyle = '#f4ecff'; c.lineWidth = 1.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(50, 64); c.quadraticCurveTo(44, 72, 37, 66); c.moveTo(50, 64); c.quadraticCurveTo(56, 72, 63, 66); c.stroke();
      c.lineWidth = 0.9; c.strokeStyle = '#f4ecff';
      for (const s of [1, -1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(50 + s * 18, 61 + i * 3); c.lineTo(50 + s * 38, 57 + i * 6); c.stroke(); }
      f.done();
      const seg = detail ? 40 : 20;
      add(blob(rx, ry, rz, seg, Math.round(seg * 0.7)), { m: T(0, cy, 0), uv: uvFace(rx, ry, rz), color: 0xffffff, rough: 0.46, clear: 0.5, bone: BONE.head, ownUV: true });
      addEye(add, [0, cy, 0], rx, ry, rz, 0.4, 0.13, 0.1, 0.112, { detail, color: 0xffd93a, pupil: 0x100a18, depth: 0.42 });
      addEye(add, [0, cy, 0], rx, ry, rz, -0.4, 0.13, 0.1, 0.112, { detail, color: 0xffd93a, pupil: 0x100a18, depth: 0.42 });
      for (const s of [1, -1]) {
        add(paramSurface((u, v, p) => {
          const th = u * TAU, r = v * 0.2, q = 1 - v;
          p.set(s * 0.32 + Math.sin(th) * r + s * q * 0.04, cy + 0.26 + q * 0.34, Math.cos(th) * r * 0.45);
        }, 12, 6), { color: 0x241a3c, rough: 0.46, clear: 0.5, bone: BONE.head });
        add(paramSurface((u, v, p) => {
          const th = u * TAU, r = v * 0.1, q = 1 - v;
          p.set(s * 0.32 + Math.sin(th) * r + s * q * 0.03, cy + 0.27 + q * 0.26, 0.055 + Math.cos(th) * r * 0.22);
        }, 12, 5), { color: 0xff7fae, rough: 0.46, clear: 0.3, bone: BONE.head });
      }
      addBody(add, { shirt: 0x241a3c, shirtLow: 0x140e24, pants: 0x1c142e, boots: 0x241a3c, sole: 0x0e0a18, gloves: 0x302650, sleeve: 0x241a3c, belt: 0xff7fae }, detail);
      add(tube([[0, 0.44, -0.2], [0, 0.34, -0.42], [0.04, 0.46, -0.58], [0.1, 0.72, -0.6], [0.04, 0.8, -0.5]], (t) => lerp(0.07, 0.035, t), detail ? 20 : 10, 8), { color: 0x241a3c, rough: 0.46, clear: 0.5, bone: BONE.hips });
      return { albedo: f.albedo, emis: f.emis };
    },
  },

  // Halloween Event exclusive: earned from the event track, never sold.
  goldking: {
    name: 'Golden Jack', price: -1, tier: 'legendary', event: true,
    hat: { y: 1.67, s: 0.76 }, glasses: { y: 1.385, z: 0.605, s: 1 },
    build: pumpkinSkin({
      base: 0xffc21a, groove: 0xa46206, top: 0xfff07a, bottom: 0xd88a0a,
      faceOpts: { dark: '#4a2a06', glow: '#fff0a0', lip: 'rgba(160,100,0,0.5)' }, eye: 0x4a2a06,
      stem: { color: 0xc48a10, tip: 0xffd24a },
      body: { shirt: 0x2b1a55, shirtLow: 0x170e30, pants: 0x1e1340, boots: 0xc48a10, sole: 0x6a4406, gloves: 0xffc21a, sleeve: 0x2b1a55, cuff: 0xffd24a, belt: 0xffd24a, collar: 0xffd24a },
    }),
  },
};

export const SKIN_IDS = Object.keys(SKINS);
/** Bots sample from these so lobbies look like the key art. */
export const BOT_SKINS = ['ghost', 'skeleton', 'witch', 'franky', 'mummy', 'imp', 'pumpkin', 'vampire', 'scarecrow', 'ember', 'cat'];

// ---------------------------------------------------------------------------------------------
// Accessories: hats and glasses are small batched meshes parented to the head bone.
// ---------------------------------------------------------------------------------------------
function pixelShades() {
  const b = new Batch();
  const P = 0.0465;
  const rows = [
    '11111111111111111',
    '12210001000122100',
    '12200111111122000',
    '10000110011100000',
    '01111100001111100',
    '00111000000111000',
  ];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      const isBlack = (c === '1') || (c === '0' && ((y === 1 || y === 2) && ((x > 0 && x < 7) || (x > 9 && x < 16))));
      const isGlint = c === '2';
      if (!isBlack && !isGlint) continue;
      const px = (x - (row.length - 1) / 2) * P;
      const py = -y * P + 0.1;
      const pz = -Math.pow(px * 1.7, 2) * 0.55; // follow the curve of the face
      b.add(box(P * 1.02, P * 1.02, 0.05, 0.002, 1), { m: T(px, py, pz, 0, -px * 1.3, 0), color: isGlint ? 0xffffff : 0x0a0a10, rough: isGlint ? 0.4 : 0.14, clear: 1, emis: isGlint ? 0.5 : 0 });
    }
  });
  return b;
}

function lens(b, x, shape, s, color, rim = null) {
  const g = shapeGeo(shape, { depth: 0.02, bevel: 0.012 });
  b.add(g, { m: T(x, 0, -0.028 - Math.abs(x) * 0.25, 0, x * 1.3, 0, s), color, rough: 0.12, clear: 1 });
  if (rim !== null) b.add(g, { m: T(x, 0, -0.05 - Math.abs(x) * 0.25, 0, x * 1.3, 0, s * 1.14), color: rim, rough: 0.22, clear: 1 });
}

function circlePts(n = 18) {
  const a = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * TAU; a.push([Math.cos(t), Math.sin(t)]); }
  return a;
}
const STAR = (() => { const a = []; for (let i = 0; i < 10; i++) { const t = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.48 : 1.08; a.push([Math.cos(t) * r, Math.sin(t) * r]); } return a; })();
const HEART = (() => { const a = []; for (let i = 0; i < 24; i++) { const t = (i / 24) * TAU; const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); a.push([x / 15, y / 15]); } return a; })();

function witchHatAcc(cone, band, buckle, brim = cone, deco = null) {
  const b = new Batch();
  const hat = witchHatGeo(0.46, 0.9, { nu: 26, nv: 14, brim: 1.75 });
  b.add(hat.cone, { color: gradY(0, new THREE.Color(cone), 0.9, new THREE.Color(cone).multiplyScalar(0.7)), rough: 0.5, clear: 0.5 });
  b.add(hat.brim, { color: brim, rough: 0.5, clear: 0.5 });
  b.add(lathe([[0.462, 0.0], [0.474, 0.03], [0.438, 0.1], [0.408, 0.17], [0.392, 0.185]], 26), { color: band, rough: 0.3, clear: 0.8 });
  b.add(box(0.16, 0.135, 0.03, 0.012, 2), { m: T(0, 0.092, 0.452, -0.32), color: buckle, rough: 0.26, clear: 1, emis: 0.18 });
  b.add(box(0.085, 0.066, 0.036, 0.01, 1), { m: T(0, 0.092, 0.459, -0.32), color: band, rough: 0.4 });
  if (deco) deco(b);
  return b;
}

export const HATS = {
  none: { name: 'No Hat', price: 0, build: null },
  witch: { name: 'Witch Hat', price: 220, rarity: 'common', build: () => witchHatAcc(0x2b1a56, 0xb040e8, 0xffc830) },
  sunset: { name: 'Sunset Hat', price: 260, rarity: 'common', build: () => witchHatAcc(0xd9471a, 0x3a1c78, 0xffc830, 0xb8340f) },
  rosy: { name: 'Rosy Witch', price: 260, rarity: 'common', build: () => witchHatAcc(0xb8247a, 0xffc830, 0xfff1b0, 0x8a1a5c) },
  midnight: { name: 'Midnight Hat', price: 340, rarity: 'rare', build: () => witchHatAcc(0x14104a, 0x38e8c8, 0xffffff, 0x0e0a34, (b) => {
    for (const [x, y, z] of [[0.14, 0.32, 0.28], [-0.16, 0.26, 0.31], [0.04, 0.52, 0.17], [-0.08, 0.66, 0.08]]) b.add(shapeGeo(STAR, { depth: 0.008, bevel: 0.004 }), { m: T(x, y, z, -0.34, x * 1.5, 0, 0.045), color: 0xfff1a0, rough: 0.3, emis: 1.4 });
  }) },
  top: {
    name: 'Top Hat', price: 300, rarity: 'common',
    build: () => {
      const b = new Batch();
      b.add(lathe([[0.001, 0], [0.56, 0], [0.56, 0.035], [0.31, 0.05], [0.3, 0.42], [0.33, 0.56], [0.001, 0.56]], 26), { color: 0x16121e, rough: 0.28, clear: 1 });
      b.add(lathe([[0.3, 0.05], [0.315, 0.07], [0.312, 0.16], [0.3, 0.17]], 26), { color: 0xff7a14, rough: 0.4, clear: 0.6 });
      return b;
    },
  },
  party: {
    name: 'Party Cone', price: 180, rarity: 'common',
    build: () => {
      const b = new Batch();
      const cone = paramSurface((u, v, p) => { const th = u * TAU; const r = v * 0.34; p.set(Math.sin(th) * r, (1 - v) * 0.72, Math.cos(th) * r); }, 28, 16);
      const c0 = new THREE.Color(0xff5ad0), c1 = new THREE.Color(0x4ae8ff);
      b.add(cone, { color: (p, n, o) => { const t = Math.sin(Math.atan2(p.x, p.z) * 3 + p.y * 16) > 0 ? c0 : c1; o.r = t.r; o.g = t.g; o.b = t.b; }, rough: 0.3, clear: 0.9 });
      b.add(blob(0.1, 0.1, 0.1, 12, 9), { m: T(0, 0.75, 0), color: 0xffd23a, rough: 0.5, clear: 0.2 });
      return b;
    },
  },
  crown: {
    name: 'Royal Crown', price: 1200, rarity: 'epic',
    build: () => {
      const b = new Batch();
      const c = paramSurface((u, v, p) => {
        const th = u * TAU;
        const spike = Math.pow(Math.abs(Math.cos(th * 2.5)), 2.5);
        const q = v < 0.5 ? 1 - v * 2 : (v - 0.5) * 2;  // outside down, then inside back up
        const y = q * (0.2 + 0.26 * spike);
        const r = (0.34 + q * 0.05) * (v < 0.5 ? 1 : 0.94);
        p.set(Math.sin(th) * r, y, Math.cos(th) * r);
      }, 60, 10);
      b.add(c, { color: gradY(0, 0xe89a10, 0.44, 0xffe04a), rough: 0.2, clear: 1, emis: 0.1 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        b.add(blob(0.05, 0.05, 0.05, 10, 8), { m: T(Math.sin(a) * 0.4, 0.47, Math.cos(a) * 0.4), color: i % 2 ? 0xff3a6a : 0x4ae8ff, rough: 0.12, clear: 1, emis: 0.35 });
      }
      return b;
    },
  },
  horns: {
    name: 'Devil Horns', price: 320, rarity: 'rare',
    build: () => {
      const b = new Batch();
      for (const s of [1, -1]) b.add(tube([[s * 0.3, -0.12, 0.05], [s * 0.42, 0.08, 0.05], [s * 0.4, 0.28, 0.02], [s * 0.3, 0.4, 0.0]], (t) => lerp(0.1, 0.012, t), 12, 8), { color: gradY(-0.1, 0xd42020, 0.4, 0xff5a3a), rough: 0.28, clear: 1 });
      return b;
    },
  },
  bat: {
    name: 'Bat Ears', price: 280, rarity: 'common',
    build: () => {
      const b = new Batch();
      for (const s of [1, -1]) {
        b.add(paramSurface((u, v, p) => {
          const th = u * TAU, r = v * 0.18, q = 1 - v;
          p.set(s * 0.26 + Math.sin(th) * r + s * q * 0.12, q * 0.48 - 0.1, Math.cos(th) * r * 0.32);
        }, 12, 7), { color: 0x241a3c, rough: 0.4, clear: 0.6 });
        b.add(paramSurface((u, v, p) => {
          const th = u * TAU, r = v * 0.1, q = 1 - v;
          p.set(s * 0.26 + Math.sin(th) * r + s * q * 0.1, q * 0.34 - 0.08, 0.045 + Math.cos(th) * r * 0.2);
        }, 12, 5), { color: 0xb040e8, rough: 0.4, clear: 0.5 });
      }
      return b;
    },
  },
};

export const GLASSES = {
  none: { name: 'No Glasses', price: 0, build: null },
  pixel: { name: 'Cool Shades', price: 200, rarity: 'common', build: pixelShades },
  aviator: {
    name: 'Night Shades', price: 240, rarity: 'common',
    build: () => {
      const b = new Batch();
      const c = circlePts();
      lens(b, 0.22, c.map(([x, y]) => [x * 1.15, y * 0.95 - Math.abs(x) * 0.05]), 0.15, 0x0a0a14);
      lens(b, -0.22, c.map(([x, y]) => [x * 1.15, y * 0.95 - Math.abs(x) * 0.05]), 0.15, 0x0a0a14);
      b.add(box(0.2, 0.04, 0.03, 0.012, 1), { m: T(0, 0.075, 0), color: 0x0a0a14, rough: 0.2, clear: 1 });
      return b;
    },
  },
  star: {
    name: 'Star Shades', price: 320, rarity: 'rare',
    build: () => {
      const b = new Batch();
      lens(b, 0.23, STAR, 0.17, 0xff3ac8);
      lens(b, -0.23, STAR, 0.17, 0xff3ac8);
      b.add(box(0.14, 0.03, 0.025, 0.01, 1), { m: T(0, 0.03, 0), color: 0xffd23a, rough: 0.3, clear: 1 });
      return b;
    },
  },
  heart: {
    name: 'Heart Shades', price: 320, rarity: 'rare',
    build: () => {
      const b = new Batch();
      lens(b, 0.23, HEART, 0.16, 0xff2a5a);
      lens(b, -0.23, HEART, 0.16, 0xff2a5a);
      b.add(box(0.14, 0.03, 0.025, 0.01, 1), { m: T(0, 0.04, 0), color: 0xfff1f4, rough: 0.3, clear: 1 });
      return b;
    },
  },
  monocle: {
    name: 'Fancy Monocle', price: 280, rarity: 'common',
    build: () => {
      const b = new Batch();
      b.add(torus(0.13, 0.018, 8, 26), { m: T(0.2, 0.01, -0.02, 0, 0.26, 0), color: 0xffc830, rough: 0.2, clear: 1, emis: 0.1 });
      b.add(disc(0.125, 0.125, 0.01, 0.003, 22), { m: T(0.2, 0.01, -0.02, Math.PI / 2, 0, -0.26), color: 0x9ae8ff, rough: 0.06, clear: 1, emis: 0.1 });
      return b;
    },
  },
  domino: {
    name: 'Masked Hero', price: 260, rarity: 'common',
    build: () => {
      const b = new Batch();
      const s = [];
      for (let i = 0; i <= 28; i++) {
        const t = (i / 28) * TAU;
        const x = Math.cos(t) * 0.5, y = Math.sin(t) * (0.15 + 0.08 * Math.cos(t * 2));
        s.push([x, y - Math.pow(Math.abs(x), 3) * 0.1 + Math.abs(x) * 0.14]);
      }
      b.add(shapeGeo(s, { depth: 0.01, bevel: 0.012 }), { m: T(0, -0.01, -0.05), color: 0x7a2be0, rough: 0.2, clear: 1 });
      for (const sd of [1, -1]) b.add(blob(0.095, 0.075, 0.018, 12, 8), { m: T(sd * 0.21, 0.02, 0.0), color: 0x12081e, rough: 0.6 });
      return b;
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------------------------
const bakedCache = new Map();
const matCache = new Map();

function bake(skinId, detail) {
  const key = `${skinId}:${detail}`;
  if (bakedCache.has(key)) return bakedCache.get(key);
  const skin = SKINS[skinId] || SKINS.pumpkin;
  const solid = new Batch(), two = new Batch();
  const add = (geo, o) => {
    const target = o.doubleSide ? two : solid;
    const opts = { ...o };
    if (!opts.ownUV && opts.uv === undefined) opts.uv = WHITE_UV;
    if (opts.ownUV) opts.sealFace = true;
    if (opts.ownUV && !opts.uv) delete opts.uv;
    if (opts.uv === null) delete opts.uv;
    target.add(geo, opts);
  };
  const tex = skin.build(add, detail) || {};
  const geo = solid.build();
  const geo2 = two.tris ? two.build() : null;
  const baked = { geo, geo2, albedo: tex.albedo, emis: tex.emis };
  bakedCache.set(key, baked);
  return baked;
}

function characterMaterial(skinId, detail, baked, side = THREE.FrontSide, tier = { clearcoat: true }) {
  const key = `${skinId}:${detail}:${side}:${tier.clearcoat}`;
  if (matCache.has(key)) return matCache.get(key);
  const Base = tier.clearcoat ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const params = {
    vertexColors: true, roughness: 0.5, metalness: 0, side, envMapIntensity: 0.62,
    map: baked.albedo ? toTexture(baked.albedo) : null,
  };
  if (tier.clearcoat) { params.clearcoat = 1; params.clearcoatRoughness = 0.22; params.specularIntensity = 0.5; }
  if (baked.emis) { params.emissive = new THREE.Color(0xffffff); params.emissiveIntensity = 1.8; params.emissiveMap = toTexture(baked.emis); }
  const m = patchToy(new Base(params), { rim: 0.09, rimColor: 0xc8a8ff, wrap: 0.05, key: 'char' });
  matCache.set(key, m);
  return m;
}

export function disposeCharacterCaches() {
  for (const b of bakedCache.values()) { b.geo.dispose(); b.geo2?.dispose(); }
  bakedCache.clear();
  for (const m of matCache.values()) { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }
  matCache.clear();
}

const accCache = new Map();
export function accGeo(kind, id) {
  const key = `${kind}:${id}`;
  if (accCache.has(key)) return accCache.get(key);
  const def = (kind === 'hat' ? HATS : GLASSES)[id];
  let geo = null;
  if (def && def.build) geo = def.build().build();
  accCache.set(key, geo);
  return geo;
}

/**
 * A character mesh instance: SkinnedMesh + bones. `pivot` is the node the animator tilts around the
 * centre of mass (for dives and tumbles); `root` sits at the feet and carries world position and yaw.
 */
export class CharacterMesh {
  constructor(skinId = 'pumpkin', { detail = 0, tier = { clearcoat: true }, hat = 'none', glasses = 'none', shadow = true, accMaterial = null } = {}) {
    this.skinId = skinId; this.detail = detail; this.tier = tier;
    const baked = bake(skinId, detail);
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.position.y = 0.85;
    this.root.add(this.pivot);
    this.inner = new THREE.Group();
    this.inner.position.y = -0.85;
    this.pivot.add(this.inner);

    this.bones = PIVOT.map(() => new THREE.Bone());
    PIVOT.forEach((p, i) => {
      const b = this.bones[i];
      const pa = PARENT[i];
      if (pa >= 0) {
        b.position.set(p[0] - PIVOT[pa][0], p[1] - PIVOT[pa][1], p[2] - PIVOT[pa][2]);
        this.bones[pa].add(b);
      } else b.position.set(p[0], p[1], p[2]);
    });
    this.skeleton = new THREE.Skeleton(this.bones);
    this.mesh = new THREE.SkinnedMesh(baked.geo, characterMaterial(skinId, detail, baked, THREE.FrontSide, tier));
    this.mesh.add(this.bones[0]);
    this.mesh.bind(this.skeleton);
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = true;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.9);
    this.mesh.layers.enable(1); // visible to the planar reflection pass
    this.inner.add(this.mesh);
    if (baked.geo2) {
      this.mesh2 = new THREE.SkinnedMesh(baked.geo2, characterMaterial(skinId, detail, baked, THREE.DoubleSide, tier));
      this.mesh2.add(new THREE.Group()); // no extra bones of its own
      this.mesh2.bind(this.skeleton);
      this.mesh2.castShadow = shadow;
      this.mesh2.frustumCulled = true;
      this.mesh2.boundingSphere = this.mesh.boundingSphere;
      this.mesh2.layers.enable(1);
      this.inner.add(this.mesh2);
    }
    this.accMat = accMaterial;
    this.acc = { hat: null, glasses: null };
    this.setAccessories(hat, glasses);
    for (const b of this.bones) b.updateMatrixWorld(true);
  }

  get head() { return this.bones[BONE.head]; }

  setAccessories(hat = 'none', glasses = 'none') {
    const skin = SKINS[this.skinId] || SKINS.pumpkin;
    this.hatId = hat; this.glassesId = glasses;
    const head = this.bones[BONE.head];
    for (const k of ['hat', 'glasses']) {
      if (this.acc[k]) { head.remove(this.acc[k]); this.acc[k] = null; }
    }
    const headY = PIVOT[BONE.head][1];
    if (hat !== 'none' && !skin.noHat) {
      const g = accGeo('hat', hat);
      if (g) {
        const m = new THREE.Mesh(g, this.accMat);
        const a = skin.hat;
        m.position.set(0, a.y - headY, 0);
        m.scale.setScalar(a.s);
        m.castShadow = true;
        m.layers.enable(1);
        head.add(m);
        this.acc.hat = m;
      }
    }
    if (glasses !== 'none') {
      const g = accGeo('glasses', glasses);
      if (g) {
        const m = new THREE.Mesh(g, this.accMat);
        const a = skin.glasses;
        m.position.set(0, a.y - headY, a.z);
        m.scale.setScalar(a.s);
        m.layers.enable(1);
        head.add(m);
        this.acc.glasses = m;
      }
    }
  }
}

export { box, sphere, prism, clamp };
void roundedPoly; void maskSampler;
