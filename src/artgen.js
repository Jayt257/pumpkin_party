// Dev-only: paints the logo with the game's own fonts and hero render. Output is committed as public/art/logo.webp.
import '@fontsource/lilita-one/latin-400.css';
import * as THREE from 'three';
import { Pipeline } from './render/pipeline.js';
import { setMaterialTier } from './render/materials.js';
import { Thumbs } from './ui/thumbs.js';

const W = 1500, H = 1000;

function arcText(ctx, text, cx, cy, R, size, spacing, draw) {
  ctx.font = `${size}px "Lilita One"`;
  const widths = [...text].map((c) => ctx.measureText(c).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  let a = -total / 2;
  [...text].forEach((c, i) => {
    const w = widths[i] - spacing;
    const ang = (a + w / 2) / R;
    ctx.save();
    ctx.translate(cx + Math.sin(ang) * R, cy - Math.cos(ang) * R);
    ctx.rotate(ang);
    draw(c, -w / 2, i);
    ctx.restore();
    a += widths[i];
  });
}

/** One word with outlines, extruded depth, gradient face and a glossy top. */
function word(target, text, { cx, cy, R, size, spacing = 8, faces, outer, inner, depth = 26, gloss = 0.5 }) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.lineJoin = 'round'; x.lineCap = 'round'; x.textBaseline = 'alphabetic';

  // Dark outline and extrusion.
  for (let d = depth; d >= 0; d -= 3) {
    arcText(x, text, cx, cy + d, R, size, spacing, (ch, tx) => {
      x.font = `${size}px "Lilita One"`;
      x.lineWidth = size * 0.17;
      x.strokeStyle = outer;
      x.fillStyle = outer;
      x.strokeText(ch, tx, 0);
      x.fillText(ch, tx, 0);
    });
  }
  // Coloured rim.
  arcText(x, text, cx, cy, R, size, spacing, (ch, tx) => {
    x.font = `${size}px "Lilita One"`;
    x.lineWidth = size * 0.085;
    x.strokeStyle = inner;
    x.strokeText(ch, tx, 0);
  });
  target.drawImage(c, 0, 0);

  // Face: gradient, then gloss on the upper part of each letter.
  const f = document.createElement('canvas');
  f.width = W; f.height = H;
  const y = f.getContext('2d');
  arcText(y, text, cx, cy, R, size, spacing, (ch, tx) => {
    y.font = `${size}px "Lilita One"`;
    y.fillStyle = '#fff';
    y.fillText(ch, tx, 0);
  });
  y.globalCompositeOperation = 'source-atop';
  arcText(y, text, cx, cy, R, size, spacing, (ch, tx) => {
    const g = y.createLinearGradient(0, -size * 0.8, 0, 0);
    faces.forEach(([s, col]) => g.addColorStop(s, col));
    y.fillStyle = g;
    y.fillRect(tx - 12, -size * 1.1, size * 1.2, size * 1.4);
    y.fillStyle = `rgba(255,255,255,${gloss})`;
    y.beginPath();
    y.ellipse(tx + size * 0.28, -size * 0.66, size * 0.42, size * 0.13, 0, 0, 7);
    y.fill();
  });
  target.drawImage(f, 0, 0);
}

async function main() {
  await document.fonts.load('200px "Lilita One"');
  await document.fonts.ready;
  const gl = document.getElementById('gl');
  const pipe = new Pipeline(gl, 'high');
  pipe.setSize(16, 16);
  setMaterialTier(pipe.tier);
  const thumbs = new Thumbs(pipe);
  const hero = thumbs.character('pumpkin', { hat: 'witch', w: 640, h: 640, framing: 'head', mode: 'idle', yaw: 0 });
  thumbs.flush();

  const cv = document.createElement('canvas');
  cv.id = 'logo'; cv.width = W; cv.height = H;
  document.body.appendChild(cv);
  const x = cv.getContext('2d');

  // Purple clouds behind the wordmark.
  const blob = (bx, by, r, c1, c2) => {
    const g = x.createRadialGradient(bx - r * 0.3, by - r * 0.4, r * 0.1, bx, by, r);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    x.fillStyle = g;
    x.beginPath(); x.arc(bx, by, r, 0, 7); x.fill();
  };
  for (const [bx, by, r] of [[190, 500, 105], [1310, 500, 105], [310, 330, 85], [1190, 330, 85], [250, 680, 90], [1250, 680, 90], [430, 790, 70], [1070, 790, 70]]) {
    blob(bx, by + 10, r + 12, '#3a1450', '#2a0e3e');
    blob(bx, by, r, '#b05cf2', '#6a28c0');
  }
  // Vines.
  const curl = (sx, sy, dir) => {
    x.strokeStyle = '#2f6a1e'; x.lineWidth = 16; x.lineCap = 'round';
    x.beginPath(); x.moveTo(sx, sy);
    x.bezierCurveTo(sx + dir * 70, sy - 70, sx + dir * 150, sy - 40, sx + dir * 130, sy + 18);
    x.bezierCurveTo(sx + dir * 118, sy + 52, sx + dir * 76, sy + 34, sx + dir * 90, sy + 6);
    x.stroke();
    x.strokeStyle = '#6fbf3a'; x.lineWidth = 8; x.stroke();
  };
  curl(470, 196, -1); curl(1030, 196, 1);

  // Hero head on top, then the wordmark over its body.
  x.drawImage(document.querySelector('canvas[data-ready]') || hero, 0, 0, 0, 0);
  x.drawImage(hero, W / 2 - 300, -36, 600, 600);

  word(x, 'PUMPKIN', { cx: W / 2, cy: 2710, R: 2150, size: 290, spacing: 6, outer: '#3a1450', inner: '#a84a0c', faces: [[0, '#fff27a'], [0.5, '#ffc21e'], [1, '#ff8716']], depth: 30 });
  word(x, 'PARTY', { cx: W / 2, cy: 3640, R: 2800, size: 290, spacing: 10, outer: '#2a1060', inner: '#6a2fd8', faces: [[0, '#ffffff'], [0.5, '#e8d4ff'], [1, '#a878ff']], depth: 28, gloss: 0.6 });
  window.__logo = true;
}
main().catch((e) => { console.error(e); window.__logoErr = String(e); });
void THREE;
