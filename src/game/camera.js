// Third-person chase camera. Low and close behind the character, as in the key art, with mouse or touch
// orbit, gentle auto-follow when the player isn't steering it, and impact shake.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class ChaseCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(56, aspect, 0.18, 2400);
    this.yaw = Math.PI;      // looking toward -Z
    this.pitch = 0.25;       // radians above the horizontal
    this.distance = 6.1;
    this.tx = 0; this.ty = 1.3; this.tz = 0;
    this.groundY = 0;
    this.shake = 0;
    this.lookIdle = 10;
    this.autoYaw = null;
    this.sens = 1;
    this.invertY = false;
    this.fovBase = 56;
    this.kick = 0;
    this.mode = 'follow';
    this.onUpdate = null;
    this.reduced = false;
  }

  setAspect(a) {
    this.camera.aspect = a;
    // Keep the horizontal field of view playable on portrait phones.
    this.fovBase = a < 1 ? 74 : a < 1.5 ? 62 : 56;
    this.camera.updateProjectionMatrix();
  }

  look(dx, dy) {
    if (dx || dy) this.lookIdle = 0;
    this.yaw -= dx * this.sens;
    this.pitch += dy * this.sens * (this.invertY ? -1 : 1);
    this.pitch = Math.max(-0.2, Math.min(1.1, this.pitch));
  }

  /** Snap directly behind a position. */
  snap(x, y, z, yaw = this.yaw) {
    this.tx = x; this.ty = y + 1.3; this.tz = z; this.groundY = y; this.yaw = yaw;
  }

  addShake(a) { if (!this.reduced) this.shake = Math.min(1.2, this.shake + a); }

  /**
   * @param {number} dt
   * @param {object} t target {x, y, z, vx, vz, grounded, speed}
   * @param {number|null} routeYaw direction the course runs, used for auto-follow
   */
  update(dt, t, routeYaw = null) {
    const k = 1 - Math.exp(-12 * dt);
    this.tx += (t.x - this.tx) * k;
    this.tz += (t.z - this.tz) * k;
    // Vertical follows lazily, unless falling far, so jumps don't jolt the view.
    if (t.grounded) this.groundY += (t.y - this.groundY) * (1 - Math.exp(-7 * dt));
    else if (t.y < this.groundY - 1.3) this.groundY += (t.y - this.groundY) * (1 - Math.exp(-5 * dt));
    else if (t.y > this.groundY + 2.6) this.groundY += (t.y - 2.6 - this.groundY) * (1 - Math.exp(-5 * dt));
    this.ty = this.groundY + 1.28 + (t.y - this.groundY) * 0.26;

    this.lookIdle += dt;
    if (routeYaw !== null && this.lookIdle > 1.6) {
      // Ease behind the movement, weighted toward the course direction.
      let d = routeYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const sp = Math.hypot(t.vx || 0, t.vz || 0);
      this.yaw += d * (1 - Math.exp(-(0.5 + sp * 0.09) * dt));
      this.pitch += (0.25 - this.pitch) * (1 - Math.exp(-0.9 * dt));
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const px = this.tx - sy * cp * this.distance, py = this.ty + sp * this.distance, pz = this.tz - cy * cp * this.distance;
    const c = this.camera;
    c.position.set(px, py, pz);
    // Look past the character so it sits in the lower third, and the goal stays in view.
    _v.set(this.tx + sy * 4, this.ty + 0.28, this.tz + cy * 4);
    c.lookAt(_v);
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.28;
      const time = performance.now() * 0.05;
      c.rotateZ(Math.sin(time * 1.3) * s * 0.3);
      c.rotateX(Math.sin(time * 1.7) * s * 0.25);
      c.rotateY(Math.cos(time * 1.1) * s * 0.25);
      this.shake *= Math.exp(-5.5 * dt);
    }
    // FOV opens slightly at speed.
    const sp2 = Math.hypot(t.vx || 0, t.vz || 0);
    const target = this.fovBase + Math.min(5, Math.max(0, sp2 - 5) * 0.8);
    if (Math.abs(c.fov - target) > 0.02) {
      c.fov += (target - c.fov) * (1 - Math.exp(-3.5 * dt));
      c.updateProjectionMatrix();
    }
  }
}
