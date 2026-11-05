// Dev-only art lab: renders isolated subjects and levels for comparing against the key art.
import * as THREE from 'three';
import { Pipeline } from './render/pipeline.js';
import { THEMES, buildEnvironment, buildLights, buildSky, applyThemeToScene } from './render/sky.js';
import { setMaterialTier, toy } from './render/materials.js';
import { CharacterMesh, SKIN_IDS, BOT_SKINS } from './assets/characters.js';
import { Animator } from './assets/animator.js';
import { Batch, T, disc } from './render/geo.js';
import { LEVELS } from './levels/index.js';
import { RoundView } from './game/roundview.js';
import { InputManager } from './core/input.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const tierName = params.get('tier') || 'high';
const pipe = new Pipeline(canvas, tierName);
setMaterialTier(pipe.tier);
pipe.setSize(innerWidth, innerHeight);
const view = params.get('view') || 'all';
window.__pipe = pipe;

if (view === 'level') {
  const id = params.get('level') || 'pumpkinDash';
  const def = LEVELS[id];
  const racers = [{ isPlayer: true, name: 'You', skin: params.get('skin') || 'pumpkin' }];
  for (let i = 0; i < 15; i++) racers.push({ skin: BOT_SKINS[i % BOT_SKINS.length], skill: 0.3 + (i / 14) * 0.6 });
  // Player spawns in the middle of the back row, the crowd ahead of them.
  const app = { pipe, width: innerWidth, height: innerHeight, input: new InputManager(canvas), audio: null, settings: {} };
  const rv = new RoundView(app, def, { seed: 7, racers, quota: 12 });
  window.__rv = rv;
  const sim = rv.sim;
  const fastForward = +(params.get('t') || 0);
  sim.go();
  const px = params.get('px'), pz = params.get('pz');
  if (pz !== null) {
    sim.player.teleport(+(px || 0), +(params.get('py') || 0.1), +pz, Math.PI);
    rv.cam.snap(sim.player.x, sim.player.y, sim.player.z, Math.PI);
  }
  // Let the crowd run ahead of the player for the requested number of seconds.
  for (let i = 0; i < fastForward * 120; i++) {
    const hold = sim.player;
    const x = hold.x, y = hold.y, z = hold.z;
    sim.step();
    if (px !== null || pz !== null) { hold.x = x; hold.y = y; hold.z = z; hold.vx = hold.vy = hold.vz = 0; hold.grounded = true; }
    sim.world.events.length = 0;
  }
  if (pz !== null) rv.cam.snap(sim.player.x, sim.player.y, sim.player.z, Math.PI);
  const run = params.get('run') === '1';
  sim.player.input.mz = run ? -1 : 0;
  let last = performance.now(), frames = 0, tAcc = 0, fAcc = 0;
  const dtFixed = params.get('fixed') ? 1 / 60 : 0;
  function frame(now) {
    const dt = dtFixed || Math.min(0.05, (now - last) / 1000); last = now;
    if (run) { sim.player.input.mx = 0; sim.player.input.mz = -1; }
    rv.update(dt);
    rv.render();
    frames++; tAcc += (now - (frame.p || now)); fAcc++; frame.p = now;
    if (frames === 30) window.__ready = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} else {
  const theme = THEMES[params.get('theme') || 'violet'];
  const scene = new THREE.Scene();
  const env = buildEnvironment(pipe.renderer, theme);
  const sky = buildSky(theme);
  applyThemeToScene(scene, theme, env, sky);
  const lights = buildLights(theme, pipe.tier);
  scene.add(lights);
  lights.follow(new THREE.Vector3(0, 0, 0));
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 2000);
  const anims = [];
  const accMat = toy({ key: 'acc' });
  const gb = new Batch();
  gb.add(disc(40, 40, 1, 0.1, 64), { m: T(0, -0.5, 0), color: 0x7a42f0, rough: 0.5, clear: 0.2 });
  const ground = new THREE.Mesh(gb.build(), toy({ key: 'g' }));
  ground.receiveShadow = true;
  scene.add(ground);
  if (view === 'all') {
    SKIN_IDS.forEach((id, i) => {
      const row = i < 6 ? 0 : 1;
      const col = i < 6 ? i : i - 6;
      const c = new CharacterMesh(id, { detail: 1, tier: pipe.tier, accMaterial: accMat });
      c.root.position.set((col - 2.5) * 1.75, 0, row === 0 ? 0 : -2.2);
      scene.add(c.root);
      anims.push({ a: new Animator(c, i), s: { mode: i % 3 === 0 ? 'pose' : 'idle', speed: 0, fwdX: 0, fwdZ: 1 } });
    });
    camera.position.set(0, 2.2, 13);
    camera.lookAt(0, 0.95, -0.5);
  } else {
    const c = new CharacterMesh(view, { detail: 1, tier: pipe.tier, hat: params.get('hat') || 'none', glasses: params.get('glasses') || 'none', accMaterial: accMat });
    scene.add(c.root);
    c.root.rotation.y = parseFloat(params.get('yaw') || '0');
    anims.push({ a: new Animator(c, 2), s: { mode: params.get('mode') || 'pose', speed: parseFloat(params.get('speed') || '0'), fwdX: 0, fwdZ: 1, emote: params.get('emote') || 'wave' } });
    camera.position.set(0, 1.25, 4.6);
    camera.lookAt(0, 1.02, 0);
  }
  let last = performance.now(), frames = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const { a, s } of anims) a.update(dt, s);
    sky.onCameraMove(camera);
    pipe.render(scene, camera, { reflectY: pipe.tier.reflect ? 0 : null });
    if (++frames === 40) window.__ready = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
