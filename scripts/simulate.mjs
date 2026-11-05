// Headless bot simulation: run whole rounds without rendering to check every level can be completed,
// and how long rounds really last. Usage: node scripts/simulate.mjs [levelId|all] [runs]
import { LEVELS } from '../src/levels/index.js';
import { Simulation, STEP } from '../src/game/simulation.js';

const which = process.argv[2] || 'all';
const runs = +(process.argv[3] || 6);
const ids = which === 'all' ? Object.keys(LEVELS) : [which];

for (const id of ids) {
  const def = LEVELS[id];
  const stats = { times: [], first: [], last: [], qualified: 0, falls: 0, hits: 0, dur: [], wall: 0, stuck: 0, n: 0 };
  for (let run = 0; run < runs; run++) {
    const racers = [];
    const N = def.playersDefault ?? 16;
    for (let i = 0; i < N; i++) racers.push({ name: `Bot${i}`, skill: 0.2 + (i / (N - 1)) * 0.75 });
    const t0 = performance.now();
    const sim = new Simulation(def.build, { headless: true, seed: 1000 + run * 31, racers, quota: def.quotaDefault ?? Math.round(N * 0.7) });
    sim.go();
    let safety = 0;
    while (!sim.ended && safety < 120 * 300) { sim.step(); sim.world.events.length = 0; safety++; }
    stats.wall += performance.now() - t0;
    stats.dur.push(sim.elapsed);
    stats.qualified += sim.qualified.length;
    stats.n += N;
    for (const r of sim.racers) { stats.falls += r.falls; stats.hits += r.hits; }
    if (sim.qualified.length) { stats.first.push(sim.qualified[0].finishTime); stats.last.push(sim.qualified[sim.qualified.length - 1].finishTime); }
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  console.log(`${id.padEnd(16)} rounds=${runs} avgDur=${avg(stats.dur).toFixed(1)}s first=${avg(stats.first).toFixed(1)}s last=${avg(stats.last).toFixed(1)}s qualified=${(stats.qualified / runs).toFixed(1)}/${stats.n / runs} falls/bot=${(stats.falls / stats.n).toFixed(2)} hits/bot=${(stats.hits / stats.n).toFixed(2)} sim=${(stats.wall / runs / 1000).toFixed(2)}s/round`);
}
void STEP;
