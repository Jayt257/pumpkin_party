// Pictures for cards and avatars, rendered from the same character meshes the game uses.
import * as THREE from 'three';
import { CharacterMesh, GLASSES, HATS, accGeo } from '../assets/characters.js';
import { Animator } from '../assets/animator.js';
import { THEMES, buildEnvironment } from '../render/sky.js';
import { toy } from '../render/materials.js';

export class Thumbs {
  constructor(pipe) {
    this.pipe = pipe;
    this.cache = new Map();
    this.queue = [];
    this.scene = new THREE.Scene();
    this.scene.environment = buildEnvironment(pipe.renderer, THEMES.violet);
    this.scene.environmentIntensity = 1;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb080ff, 1.3));
    const key = new THREE.DirectionalLight(0xfff4e8, 2.8);
    key.position.set(2, 5, 6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8a8ff, 0.8);
    fill.position.set(-4, 2, 3);
    this.scene.add(fill);
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    this.pending = 0;
  }

  /** Character portrait. */
  character(skin, { hat = 'none', glasses = 'none', mode = 'pose', w = 256, h = 320, emote = null, framing = 'full', yaw = 0.16 } = {}) {
    const key = `c:${skin}:${hat}:${glasses}:${mode}:${w}x${h}:${emote}:${framing}:${yaw}`;
    return this.cached(key, w, h, (canvas) => {
      const c = new CharacterMesh(skin, { detail: 1, tier: this.pipe.tier, hat, glasses, shadow: false, accMaterial: toy({ key: 'acc' }) });
      c.root.rotation.y = yaw;
      this.scene.add(c.root);
      const a = new Animator(c, 1.3);
      for (let i = 0; i < 16; i++) a.update(1 / 30, { mode: emote ? 'emote' : mode, emote, speed: 0, fwdX: 0, fwdZ: 1, grounded: true });
      c.root.updateMatrixWorld(true);
      const cam = this.camera;
      cam.aspect = w / h;
      if (framing === 'head') { cam.position.set(0, 1.45, 4.6); cam.lookAt(0, 1.32, 0); cam.fov = 23; }
      else if (framing === 'hat') { cam.position.set(0, 2.1, 3.5); cam.lookAt(0, 1.72, 0); cam.fov = 27; }
      else if (framing === 'face') { cam.position.set(0, 1.32, 3.2); cam.lookAt(0, 1.3, 0); cam.fov = 22; }
      else { cam.position.set(0, 1.35, 7); cam.lookAt(0, 1.0, 0); cam.fov = 18; }
      cam.updateProjectionMatrix();
      this.blit(canvas, this.pipe.snapshot(this.scene, cam, w, h));
      this.scene.remove(c.root);
      c.skeleton.dispose();
    });
  }

  /** The accessory on its own, for customise tiles. */
  accessory(kind, id, { w = 192, h = 192 } = {}) {
    const key = `a:${kind}:${id}:${w}x${h}`;
    return this.cached(key, w, h, (canvas) => {
      const geo = accGeo(kind, id);
      if (!geo) return;
      const m = new THREE.Mesh(geo, toy({ key: 'acc' }));
      geo.computeBoundingSphere();
      const bs = geo.boundingSphere;
      m.rotation.set(kind === 'hat' ? 0.3 : 0.1, kind === 'hat' ? 0.35 : 0.3, 0);
      this.scene.add(m);
      const cam = this.camera;
      cam.aspect = w / h; cam.fov = 26;
      const dist = (bs.radius * 1.08) / Math.tan((13 * Math.PI) / 180);
      cam.position.set(bs.center.x, bs.center.y, bs.center.z + dist);
      cam.lookAt(bs.center);
      cam.updateProjectionMatrix();
      m.position.copy(bs.center).multiplyScalar(0);
      this.blit(canvas, this.pipe.snapshot(this.scene, cam, w, h));
      this.scene.remove(m);
    });
  }

  cached(key, w, h, draw) {
    if (this.cache.has(key)) return this.clone(this.cache.get(key));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    this.cache.set(key, c);
    this.queue.push({ c, draw });
    return this.clone(c, true);
  }

  /** Each slot gets its own canvas element that mirrors the master once it's drawn. */
  clone(master, deferred = false) {
    const c = document.createElement('canvas');
    c.width = master.width; c.height = master.height;
    if (!deferred && master.dataset.ready) { c.getContext('2d').drawImage(master, 0, 0); return c; }
    (master._copies ||= []).push(c);
    return c;
  }

  blit(canvas, src) {
    canvas.getContext('2d').drawImage(src, 0, 0);
    canvas.dataset.ready = '1';
    for (const c of canvas._copies || []) c.getContext('2d').drawImage(canvas, 0, 0);
    canvas._copies = null;
  }

  /** Draw a few queued thumbnails per frame, so opening the shop never hitches. */
  pump(max = 2) {
    let n = 0;
    while (this.queue.length && n < max) {
      const q = this.queue.shift();
      q.draw(q.c);
      n++;
    }
  }

  flush() { this.pump(Infinity); }
}
void GLASSES; void HATS;
