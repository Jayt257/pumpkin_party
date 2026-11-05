// Unified input: keyboard, mouse look, touch stick and buttons, and gamepad.
//
// Keys use KeyboardEvent.code (physical position), so WASD automatically lands on ZQSD for AZERTY
// players, as CrazyGames recommends. Arrow, space and wheel defaults are suppressed so the page never
// scrolls inside the iframe.
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.moveX = 0; this.moveY = 0;
    this.jumpHeld = false;
    this.jumpPressed = false;
    this.divePressed = false;
    this.lookDX = 0; this.lookDY = 0;
    this.locked = false;
    this.enabled = false;
    this.touch = { active: false, x: 0, y: 0 };
    this.touchLookId = null;
    this.pointerLockWanted = false;
    this.lastLook = { x: 0, y: 0 };
    this.dragLook = false;
    this.onPause = null;
    this.onEmote = null;
    this.paused = false;
    this.lockFailed = false;
    this.sens = 1;
    this._bind();
  }

  _bind() {
    const prevent = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'];
    window.addEventListener('keydown', (e) => {
      if (prevent.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if ((e.code === 'KeyP' || e.code === 'Escape') && this.paused) { this.onPause?.(); return; }
      if (!this.enabled) return;
      if (e.code === 'Space' || e.code === 'KeyK') { this.jumpPressed = true; }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyL' || e.code === 'KeyE') this.divePressed = true;
      if (e.code === 'KeyP' || e.code === 'Escape') this.onPause?.();
      if (e.code === 'Tab' && document.pointerLockElement) document.exitPointerLock();
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= 4) this.onEmote?.(n - 1);
      }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); });
    window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked && this.enabled) this.onUnlock?.();
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
      else if (this.dragLook) { this.lookDX += e.movementX * 1.4; this.lookDY += e.movementY * 1.4; }
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (this.pointerLockWanted && !this.locked && !this.lockFailed && e.button === 0) this.requestLock();
      else this.dragLook = true;
    });
    window.addEventListener('mouseup', () => { this.dragLook = false; });

    // Right half of the screen drags the camera on touch devices.
    const c = this.canvas;
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (this.touchLookId === null) {
          this.touchLookId = t.identifier;
          this.lastLook.x = t.clientX; this.lastLook.y = t.clientY;
        }
      }
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchLookId) {
          this.lookDX += (t.clientX - this.lastLook.x) * 2.3;
          this.lookDY += (t.clientY - this.lastLook.y) * 2.3;
          this.lastLook.x = t.clientX; this.lastLook.y = t.clientY;
        }
      }
    }, { passive: false });
    const endLook = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.touchLookId) this.touchLookId = null;
    };
    c.addEventListener('touchend', endLook);
    c.addEventListener('touchcancel', endLook);
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => { this.lockFailed = true; });
    } catch { this.lockFailed = true; }
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  /** Called from the on-screen stick. x and y are in -1..1, with y up meaning forward. */
  setStick(x, y) { this.touch.x = x; this.touch.y = y; this.touch.active = x !== 0 || y !== 0; }
  pressJump(down) { if (down) this.jumpPressed = true; this.touchJump = down; }
  pressDive() { this.divePressed = true; }

  /** Sample continuous state. Call once per frame before stepping. */
  poll() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (this.touch.active) { x = this.touch.x; y = this.touch.y; }
    this.jumpHeld = k.has('Space') || k.has('KeyK') || !!this.touchJump;

    // Gamepad, if connected. Same mapping idea as keyboard: stick moves, A jumps, X dives.
    // Iframes can be denied the gamepad feature, in which case this call throws.
    let pads = null;
    if (!this.padsDenied) {
      try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch { this.padsDenied = true; }
    }
    if (pads) {
      for (const p of pads) {
        if (!p) continue;
        const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
        const ax = dz(p.axes[0] ?? 0), ay = dz(p.axes[1] ?? 0);
        if (ax || ay) { x = ax; y = -ay; }
        const rx = dz(p.axes[2] ?? 0), ry = dz(p.axes[3] ?? 0);
        if (rx || ry) { this.lookDX += rx * 12; this.lookDY += ry * 8; }
        const a = p.buttons[0]?.pressed, b = p.buttons[2]?.pressed, start = p.buttons[9]?.pressed;
        if (a && !this._padA) this.jumpPressed = true;
        if (b && !this._padB) this.divePressed = true;
        if (start && !this._padS) this.onPause?.();
        this._padA = a; this._padB = b; this._padS = start;
        this.jumpHeld = this.jumpHeld || !!a;
        break;
      }
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.moveX = x; this.moveY = y;
  }

  /** Read then clear accumulated mouse look. */
  takeLook() {
    const dx = this.lookDX, dy = this.lookDY;
    this.lookDX = 0; this.lookDY = 0;
    return [dx * 0.0024 * this.sens, dy * 0.0024 * this.sens];
  }

  clearPresses() { this.jumpPressed = false; this.divePressed = false; }
  setEnabled(v) {
    this.enabled = v;
    if (!v) { this.clearPresses(); this.dragLook = false; this.setStick(0, 0); this.touchJump = false; this.exitLock(); }
  }
}
