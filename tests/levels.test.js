import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_ORDER, matchPlan } from '../src/levels/index.js';
import { Simulation, STEP } from '../src/game/simulation.js';

const roster = (n, skill = 0.6) => Array.from({ length: n }, (_, i) => ({ name: `B${i}`, skill: skill + (i / n) * 0.2 }));
function play(id, n, quota, seed = 3, cap = 200) {
  const sim = new Simulation(LEVELS[id].build, { headless: true, seed, racers: roster(n), quota });
  sim.go();
  let t = 0;
  while (!sim.ended && t < cap * 120) { sim.step(); sim.world.events.length = 0; t++; }
  return sim;
}

describe('levels', () => {
  it('lists all six World 1 levels in the art\'s order', () => {
    expect(LEVEL_ORDER).toEqual(['pumpkinDash', 'ghostChase', 'hauntedFloor', 'witchsPlatform', 'pumpkinRoll', 'finalShowdown']);
  });

  for (const id of LEVEL_ORDER) {
    const def = LEVELS[id];
    it(`${id}: a round completes with a sensible length`, () => {
      const sim = play(id, def.playersDefault, def.quotaDefault);
      expect(sim.ended).toBe(true);
      expect(sim.qualified.length).toBeGreaterThan(0);
      expect(sim.elapsed).toBeGreaterThan(id === 'finalShowdown' ? 5 : 15);
      expect(sim.elapsed).toBeLessThan(def.build ? 155 : 999);
    });
  }

  it('races end when the quota fills, with the right count', () => {
    const sim = play('pumpkinDash', 16, 12);
    expect(sim.qualified.length).toBe(12);
    expect(sim.eliminated.length).toBe(4);
  });

  it('the same seed replays identically (deterministic, ready for future multiplayer)', () => {
    const a = play('ghostChase', 8, 6, 77, 25), b = play('ghostChase', 8, 6, 77, 25);
    expect(a.racers.map((r) => r.z)).toEqual(b.racers.map((r) => r.z));
  });

  it('a match plan has five rounds that shrink to one winner', () => {
    const plan = matchPlan(0, () => 0.3);
    expect(plan).toHaveLength(5);
    expect(plan[0].level).toBe('pumpkinDash');
    expect(plan[4].level).toBe('finalShowdown');
    expect(plan[4].quota).toBe(1);
    for (let i = 1; i < 5; i++) expect(plan[i].players).toBe(plan[i - 1].quota);
  });

  it('physics steps at a fixed 120 Hz, independent of display rate', () => {
    expect(STEP).toBeCloseTo(1 / 120);
  });
});
