import { describe, expect, it } from 'vitest';
import { World, makeBox, makeCyl, BOX, Collider, capsuleVs } from '../src/physics/world.js';
import { MOVE, Racer, S } from '../src/physics/racer.js';
import { STEP } from '../src/game/simulation.js';

const floorWorld = () => { const w = new World(); w.add(makeBox(0, -1, 0, 200, 2, 200)); return w; };
const run = (r, seconds, each) => { for (let i = 0; i < seconds / STEP; i++) { each?.(i); r.step(STEP); r.input.jumpPressed = false; r.input.divePressed = false; } };

describe('character controller', () => {
  it('stands on the floor and does not sink', () => {
    const w = floorWorld(), r = new Racer(0, w);
    r.teleport(0, 1, 0);
    run(r, 1);
    expect(r.grounded).toBe(true);
    expect(r.y).toBeCloseTo(0, 2);
  });

  it('reaches run speed and stops on no input', () => {
    const w = floorWorld(), r = new Racer(0, w);
    r.teleport(0, 0.05, 0);
    run(r, 1, () => { r.input.mz = -1; });
    expect(Math.abs(r.vz)).toBeCloseTo(MOVE.RUN_SPEED, 1);
    r.input.mz = 0;
    run(r, 1);
    expect(Math.hypot(r.vx, r.vz)).toBeLessThan(0.1);
  });

  it('jumps about 1.9 units high and lands within a second', () => {
    const w = floorWorld(), r = new Racer(0, w);
    r.teleport(0, 0.05, 0);
    run(r, 0.3);
    r.input.jump = true; r.input.jumpPressed = true;
    let peak = 0, airtime = 0;
    run(r, 1.2, () => { peak = Math.max(peak, r.y); if (!r.grounded) airtime += STEP; });
    expect(peak).toBeGreaterThan(1.6);
    expect(peak).toBeLessThan(2.2);
    expect(airtime).toBeLessThan(1);
    expect(r.grounded).toBe(true);
  });

  it('lets go early for a lower hop (variable jump height)', () => {
    const w = floorWorld(), a = new Racer(0, w);
    a.teleport(0, 0.05, 0); run(a, 0.3);
    a.input.jump = false; a.input.jumpPressed = true;
    let low = 0; run(a, 1, () => { low = Math.max(low, a.y); });
    expect(low).toBeLessThan(1.4);
    expect(low).toBeGreaterThan(0.5);
  });

  it('coyote time: can still jump just after leaving a ledge', () => {
    const w = new World(); w.add(makeBox(0, -1, 0, 4, 2, 4));
    const r = new Racer(0, w);
    r.teleport(1.9, 0.02, 0);
    run(r, 0.2);
    r.vx = 3; r.input.mx = 1;
    let left = 0;
    for (let i = 0; i < 240 && r.grounded; i++) { r.step(STEP); left = i; }
    expect(r.grounded).toBe(false);
    r.input.jump = true; r.input.jumpPressed = true;
    r.step(STEP);
    expect(r.vy).toBeGreaterThan(MOVE.JUMP_SPEED * 0.8);
    void left;
  });

  it('dive launches forward, slides, then recovers', () => {
    const w = floorWorld(), r = new Racer(0, w);
    r.teleport(0, 0.05, 0); run(r, 0.3);
    r.yaw = Math.PI;
    r.input.divePressed = true;
    r.step(STEP); r.input.divePressed = false;
    expect(r.state).toBe(S.DIVE);
    run(r, 0.5);
    expect([S.SLIDE, S.GETUP, S.RUN]).toContain(r.state);
    run(r, 1.5);
    expect(r.state).toBe(S.RUN);
    expect(r.z).toBeLessThan(-2);
  });

  it('a moving platform carries a character standing still', () => {
    const w = new World();
    const p = makeBox(0, -0.5, 0, 12, 1, 12, { kinematic: true });
    w.add(p);
    const r = new Racer(0, w);
    r.teleport(0, 0.02, 0);
    for (let i = 0; i < 120; i++) { p.vx = 2; p.px += 2 * STEP; r.step(STEP); }
    expect(r.x).toBeGreaterThan(1.5);
  });

  it('a rotating disc adds tangential speed', () => {
    const w = new World();
    const d = makeCyl(0, -0.5, 0, 10, 1, { kinematic: true });
    d.wy = 1.5;
    w.add(d);
    const r = new Racer(0, w);
    r.teleport(6, 0.02, 0);
    for (let i = 0; i < 40; i++) r.step(STEP);
    expect(Math.hypot(r.vx, r.vz)).toBeGreaterThan(6);
  });

  it('hazards knock the character down, then grant brief immunity', () => {
    const w = floorWorld();
    const hz = makeBox(0.6, 1, 0, 1, 2, 3, { kinematic: true, hazard: { knock: 10, up: 7, stun: 1 } });
    hz.vx = -8;
    w.add(hz);
    const r = new Racer(0, w);
    r.teleport(0, 0.02, 0);
    run(r, 0.2);
    expect(r.hits).toBe(1);
    expect(r.state).toBe(S.STUN);
    expect(r.invuln).toBeGreaterThan(0);
    expect(r.vx).toBeLessThan(-3);
    hz.enabled = false;
    run(r, 3);
    expect(r.state).toBe(S.RUN);
  });

  it('hops onto a low block', () => {
    const w = floorWorld();
    w.add(makeBox(0, 0.5, -8, 8, 1, 12));
    const r = new Racer(0, w);
    r.teleport(0, 0.02, 0);
    run(r, 0.2);
    r.input.jump = true; r.input.jumpPressed = true;
    run(r, 1.2, () => { r.input.mz = -1; });
    expect(r.y).toBeCloseTo(1, 1);
  });

  it('pulls itself up a ledge higher than a jump can clear', () => {
    const w = floorWorld();
    w.add(makeBox(0, 1.3, -8, 8, 2.6, 12)); // top at 2.6; a jump only peaks near 1.9
    const r = new Racer(0, w);
    r.teleport(0, 0.02, 0);
    run(r, 0.2);
    r.input.jump = true; r.input.jumpPressed = true;
    run(r, 1.3, () => { r.input.mz = -1; });
    expect(r.y).toBeGreaterThan(2.5);
  });

  it('capsule contact against a rotated box pushes out along the surface', () => {
    const c = new Collider(BOX, { x: 0, y: 0, z: 0, hx: 5, hy: 0.5, hz: 5, rx: 0.3 });
    const hit = capsuleVs(c, 0, 0.8, 0, 0, 2, 0, 0.5);
    expect(hit).toBeTruthy();
    expect(hit.ny).toBeGreaterThan(0.9);
  });
});
