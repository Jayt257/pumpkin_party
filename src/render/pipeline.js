// HDR render pipeline: scene -> half-res copy (refraction source) -> bloom chain -> composite.
//
// Quality tiers control MSAA, shadows, planar reflections and post. The low tier skips the whole HDR
// chain and renders straight to the canvas so it stays smooth on a 4 GB Chromebook.
import * as THREE from 'three';

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy,0.0,1.0); }`;

const COMPOSITE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene, tBloom;
uniform float uBloom, uVignette, uExposure, uSaturation, uContrast, uFlash, uTime;
uniform vec3 uFlashColor, uLift, uGain;

vec3 neutral(vec3 color){
  const float start = 0.76, desat = 0.12;
  float x = min(color.r, min(color.g, color.b));
  float off = x < 0.08 ? x - 6.25*x*x : 0.04;
  color -= off;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < start) return color;
  float d = 1.0 - start;
  float np = 1.0 - d*d/(peak + d - start);
  color *= np/peak;
  float g = 1.0 - 1.0/(desat*(peak-np)+1.0);
  return mix(color, vec3(np), g);
}
vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(max(c,vec3(0.0)), vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * uBloom;
  c *= uExposure;
  c = neutral(c);
  // Grade: gently lift the shadows toward violet, boost saturation, matching the art direction.
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = mix(c, c*c*(3.0-2.0*c), uContrast);
  c = c*uGain + uLift*(1.0-c);
  vec2 q = vUv-0.5;
  float v = 1.0 - dot(q,q)*uVignette;
  c *= clamp(v, 0.0, 1.0);
  c = mix(c, uFlashColor, uFlash);
  c = srgb(clamp(c,0.0,1.0));
  c += (hash(gl_FragCoord.xy + uTime)-0.5)/255.0; // dither prevents gradient banding in the sky
  gl_FragColor = vec4(c,1.0);
}`;

const DOWN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tMap; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee;
vec3 prefilter(vec3 c){
  float br = max(c.r,max(c.g,c.b));
  float soft = clamp(br-uThreshold+uKnee, 0.0, 2.0*uKnee);
  soft = soft*soft/(4.0*uKnee+1e-4);
  float contrib = max(soft, br-uThreshold)/max(br,1e-4);
  return c*contrib;
}
void main(){
  vec2 t = uTexel;
  vec3 c = texture2D(tMap,vUv).rgb*0.25;
  c += texture2D(tMap,vUv+vec2(-t.x,-t.y)).rgb*0.1875;
  c += texture2D(tMap,vUv+vec2( t.x,-t.y)).rgb*0.1875;
  c += texture2D(tMap,vUv+vec2(-t.x, t.y)).rgb*0.1875;
  c += texture2D(tMap,vUv+vec2( t.x, t.y)).rgb*0.1875;
  if (uThreshold > 0.0) c = prefilter(min(c, vec3(24.0)));
  gl_FragColor = vec4(c,1.0);
}`;

const UP_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tMap; uniform vec2 uTexel; uniform float uRadius;
void main(){
  vec2 t = uTexel*uRadius;
  vec3 c = texture2D(tMap,vUv).rgb*4.0;
  c += texture2D(tMap,vUv+vec2(-t.x,0.0)).rgb*2.0;
  c += texture2D(tMap,vUv+vec2( t.x,0.0)).rgb*2.0;
  c += texture2D(tMap,vUv+vec2(0.0,-t.y)).rgb*2.0;
  c += texture2D(tMap,vUv+vec2(0.0, t.y)).rgb*2.0;
  c += texture2D(tMap,vUv+vec2(-t.x,-t.y)).rgb;
  c += texture2D(tMap,vUv+vec2( t.x,-t.y)).rgb;
  c += texture2D(tMap,vUv+vec2(-t.x, t.y)).rgb;
  c += texture2D(tMap,vUv+vec2( t.x, t.y)).rgb;
  gl_FragColor = vec4(c/16.0,1.0);
}`;

const COPY_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv; uniform sampler2D tMap;
void main(){ gl_FragColor = vec4(texture2D(tMap,vUv).rgb,1.0); }`;

export const TIERS = {
  low: { name: 'low', post: false, msaa: 0, shadow: 0, reflect: false, refract: false, dpr: 1, clearcoat: false, bloomLevels: 0, particles: 0.45, detail: 0 },
  medium: { name: 'medium', post: true, msaa: 2, shadow: 1024, reflect: false, refract: true, dpr: 1.25, clearcoat: true, bloomLevels: 4, particles: 0.7, detail: 1 },
  high: { name: 'high', post: true, msaa: 4, shadow: 2048, reflect: true, refract: true, dpr: 1.75, clearcoat: true, bloomLevels: 5, particles: 1, detail: 2 },
};

/** Shared uniforms fed to every refractive or reflective material. */
export const SHARED = {
  tRefract: { value: null },
  uScreen: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  tReflect: { value: null },
  uReflectMatrix: { value: new THREE.Matrix4() },
  uReflectOn: { value: 0 },
  uRefractOn: { value: 0 },
};

export class Pipeline {
  constructor(canvas, tierName = 'high') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, stencil: false, depth: true,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    const r = this.renderer;
    r.setClearColor(0x1a0f40, 1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;

    this.scale = 1; // dynamic resolution
    this.width = 1; this.height = 1;
    this.flash = 0; this.flashColor = new THREE.Color(0xffffff);

    this.fsGeo = new THREE.BufferGeometry();
    this.fsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.fsMesh = new THREE.Mesh(this.fsGeo);
    this.fsMesh.frustumCulled = false;
    this.fsCam = new THREE.Camera();
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.fsMesh);

    const mk = (frag, uniforms) => new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.matDown = mk(DOWN_FRAG, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 }, uKnee: { value: 0.5 } });
    this.matUp = mk(UP_FRAG, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.matUp.blending = THREE.CustomBlending;
    this.matUp.blendEquation = THREE.AddEquation;
    this.matUp.blendSrc = THREE.OneFactor;
    this.matUp.blendDst = THREE.OneFactor;
    this.matUp.transparent = true;
    this.matCopy = mk(COPY_FRAG, { tMap: { value: null } });
    this.matComposite = mk(COMPOSITE_FRAG, {
      tScene: { value: null }, tBloom: { value: null },
      uBloom: { value: 0.75 }, uVignette: { value: 0.55 }, uExposure: { value: 1 }, uSaturation: { value: 1.08 }, uContrast: { value: 0.1 },
      uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) }, uTime: { value: 0 },
      uLift: { value: new THREE.Color(0.012, 0.004, 0.03) }, uGain: { value: new THREE.Color(1, 1, 1) },
    });

    this.reflect = null;
    this.setTier(tierName);
  }

  setTier(name) {
    this.tier = TIERS[name] || TIERS.high;
    const r = this.renderer, t = this.tier;
    r.shadowMap.enabled = t.shadow > 0;
    r.toneMapping = t.post ? THREE.NoToneMapping : THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    SHARED.uRefractOn.value = t.refract ? 1 : 0;
    this.scale = 1;
    this.allocate();
  }

  setSize(w, h) { this.width = w; this.height = h; this.allocate(); }

  /** Output scale from the resolution governor; RTs are reallocated only when it moves. */
  setScale(s) {
    const next = Math.round(Math.max(0.5, Math.min(1, s)) * 20) / 20;
    if (next === this.scale) return false;
    this.scale = next;
    this.allocate();
    return true;
  }

  pixelRatio() {
    const device = Math.min(window.devicePixelRatio || 1, this.tier.dpr);
    return device * this.scale;
  }

  allocate() {
    const r = this.renderer;
    const pr = this.pixelRatio();
    r.setPixelRatio(pr);
    r.setSize(this.width, this.height, false);
    const W = Math.max(2, Math.floor(this.width * pr)), H = Math.max(2, Math.floor(this.height * pr));
    this.W = W; this.H = H;
    SHARED.uScreen.value.set(W, H);
    for (const rt of this.bloomRTs || []) rt.dispose();
    this.bloomRTs = [];
    if (this.sceneRT) this.sceneRT.dispose();
    this.sceneRT = null;
    if (this.refractRT) this.refractRT.dispose();
    this.refractRT = null;
    if (this.reflectRT) this.reflectRT.dispose();
    this.reflectRT = null;
    const t = this.tier;
    if (t.post) {
      const hdr = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false };
      this.sceneRT = new THREE.WebGLRenderTarget(W, H, { ...hdr, depthBuffer: true, samples: t.msaa });
      let w = W, h = H;
      for (let i = 0; i < t.bloomLevels; i++) {
        w = Math.max(2, w >> 1); h = Math.max(2, h >> 1);
        this.bloomRTs.push(new THREE.WebGLRenderTarget(w, h, hdr));
      }
      this.refractRT = new THREE.WebGLRenderTarget(Math.max(2, W >> 1), Math.max(2, H >> 1), hdr);
      SHARED.tRefract.value = this.refractRT.texture;
      this.matComposite.uniforms.tScene.value = this.sceneRT.texture;
      this.matComposite.uniforms.tBloom.value = this.bloomRTs[0] ? this.bloomRTs[0].texture : null;
    }
    if (t.reflect) {
      this.reflectRT = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(W * 0.45)), Math.max(2, Math.floor(H * 0.45)), {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: true, stencilBuffer: false, samples: 0,
      });
      SHARED.tReflect.value = this.reflectRT.texture;
    } else {
      SHARED.tReflect.value = null;
      SHARED.uReflectOn.value = 0;
    }
  }

  _pass(material, target) {
    this.fsMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  /** Mirror the camera about a horizontal plane at y and render the reflection layer. */
  renderReflection(scene, camera, planeY, layer = 1) {
    if (!this.reflectRT) { SHARED.uReflectOn.value = 0; return; }
    if (planeY === null || planeY === undefined) { SHARED.uReflectOn.value = 0; return; }
    if (!this._mirror) {
      this._mirror = new THREE.PerspectiveCamera();
      this._clip = new THREE.Vector4();
      this._plane = new THREE.Plane();
      this._q = new THREE.Vector4();
      this._bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    }
    const cam = this._mirror;
    const cp = camera.getWorldPosition(new THREE.Vector3());
    if (cp.y < planeY + 0.02) { SHARED.uReflectOn.value = 0; return; }
    cam.fov = camera.fov; cam.aspect = camera.aspect; cam.near = camera.near; cam.far = camera.far;
    cam.projectionMatrix.copy(camera.projectionMatrix);
    // Reflect position + forward + up through the plane.
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const pos = cp.clone(); pos.y = 2 * planeY - pos.y;
    const fwd = forward.clone(); fwd.y = -fwd.y;
    cam.position.copy(pos);
    cam.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    cam.up.y = -cam.up.y;
    cam.lookAt(pos.clone().add(fwd));
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    // Oblique near plane so anything beneath the floor is clipped out of the reflection.
    this._plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, planeY, 0));
    this._plane.applyMatrix4(cam.matrixWorldInverse);
    const c = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = cam.projectionMatrix, q = this._q;
    q.x = (Math.sign(c.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(c.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1;
    q.w = (1 + pm.elements[10]) / pm.elements[14];
    c.multiplyScalar(2 / c.dot(q));
    pm.elements[2] = c.x; pm.elements[6] = c.y; pm.elements[10] = c.z + 1 - 0.003; pm.elements[14] = c.w;
    cam.projectionMatrixInverse.copy(pm).invert();
    SHARED.uReflectMatrix.value.copy(this._bias).multiply(pm).multiply(cam.matrixWorldInverse);
    cam.layers.set(layer);
    const r = this.renderer;
    const shadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    SHARED.uReflectOn.value = 0; // no feedback while drawing the reflection itself
    r.setRenderTarget(this.reflectRT);
    r.clear();
    r.render(scene, cam);
    r.shadowMap.autoUpdate = shadow;
    SHARED.uReflectOn.value = 1;
  }

  render(scene, camera, opts = {}) {
    const r = this.renderer, t = this.tier;
    r.info.reset();
    const shadowAuto = r.shadowMap.autoUpdate;
    if (opts.skipShadows) r.shadowMap.autoUpdate = false;
    if (t.reflect && opts.reflectY !== undefined && opts.reflectY !== null) {
      this.renderReflection(scene, camera, opts.reflectY);
    } else SHARED.uReflectOn.value = 0;
    if (!t.post) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      r.shadowMap.autoUpdate = shadowAuto;
      return;
    }
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    r.shadowMap.autoUpdate = shadowAuto;

    // Half-res copy: reused by refraction next frame (without touching MSAA buffers mid-frame).
    this.matCopy.uniforms.tMap.value = this.sceneRT.texture;
    this._pass(this.matCopy, this.refractRT);

    // Bloom down chain with a soft threshold on the first step.
    const rts = this.bloomRTs;
    let src = this.refractRT;
    for (let i = 0; i < rts.length; i++) {
      const u = this.matDown.uniforms;
      u.tMap.value = src.texture;
      u.uTexel.value.set(1 / src.width, 1 / src.height);
      u.uThreshold.value = i === 0 ? (opts.bloomThreshold ?? 1.15) : 0;
      this._pass(this.matDown, rts[i]);
      src = rts[i];
    }
    // Additive tent up chain.
    for (let i = rts.length - 1; i > 0; i--) {
      const u = this.matUp.uniforms;
      u.tMap.value = rts[i].texture;
      u.uTexel.value.set(1 / rts[i].width, 1 / rts[i].height);
      u.uRadius.value = 1;
      r.autoClear = false;
      this._pass(this.matUp, rts[i - 1]);
      r.autoClear = true;
    }
    const cu = this.matComposite.uniforms;
    cu.uBloom.value = opts.bloom ?? 0.3;
    cu.uFlash.value = this.flash;
    cu.uFlashColor.value.copy(this.flashColor);
    cu.uTime.value = SHARED.uTime.value % 10;
    if (opts.exposure !== undefined) cu.uExposure.value = opts.exposure;
    if (opts.vignette !== undefined) cu.uVignette.value = opts.vignette;
    if (opts.saturation !== undefined) cu.uSaturation.value = opts.saturation;
    this._pass(this.matComposite, null);
  }

  /**
   * Render a small offscreen picture (card thumbnails, avatars) and return it as a 2D canvas.
   * Render targets output linear colour, so this runs its own tone-map and sRGB pass, keeping alpha.
   */
  snapshot(scene, camera, w, h) {
    const r = this.renderer;
    if (!this._snapMat) {
      this._snapMat = new THREE.ShaderMaterial({
        vertexShader: FS_VERT, depthTest: false, depthWrite: false, toneMapped: false, uniforms: { tMap: { value: null } },
        fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tMap;
          vec3 neutral(vec3 color){ const float start=0.76, desat=0.12; float x=min(color.r,min(color.g,color.b)); float off=x<0.08?x-6.25*x*x:0.04; color-=off; float peak=max(color.r,max(color.g,color.b)); if(peak<start) return color; float d=1.0-start; float np=1.0-d*d/(peak+d-start); color*=np/peak; float g=1.0-1.0/(desat*(peak-np)+1.0); return mix(color,vec3(np),g); }
          vec3 srgb(vec3 c){ return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-0.055,step(0.0031308,c)); }
          void main(){ vec4 t=texture2D(tMap,vUv); vec3 c=t.a>0.001?t.rgb/t.a:vec3(0.0); gl_FragColor=vec4(srgb(clamp(neutral(c*1.05),0.0,1.0)),t.a); }`,
      });
    }
    const hdr = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace, samples: 4, depthBuffer: true });
    const ldr = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace, depthBuffer: false });
    const prevClear = r.getClearAlpha(), prevColor = r.getClearColor(new THREE.Color()), prevTone = r.toneMapping, shadow = r.shadowMap.autoUpdate;
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(0x000000, 0);
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(hdr);
    r.clear();
    r.render(scene, camera);
    this._snapMat.uniforms.tMap.value = hdr.texture;
    this._pass(this._snapMat, ldr);
    const px = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(ldr, 0, 0, w, h, px);
    r.setRenderTarget(null);
    r.toneMapping = prevTone;
    r.setClearColor(prevColor, prevClear);
    r.shadowMap.autoUpdate = shadow;
    hdr.dispose(); ldr.dispose();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const row = (h - 1 - y) * w * 4;
      img.data.set(px.subarray(row, row + w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  dispose() {
    for (const rt of this.bloomRTs || []) rt.dispose();
    this.sceneRT?.dispose(); this.refractRT?.dispose(); this.reflectRT?.dispose();
    this.renderer.dispose();
  }
}
