// Dev helper: where do bots fall or get hit? node scripts/simdebug.mjs <level> [seconds]
import { LEVELS } from '../src/levels/index.js';
import { Simulation } from '../src/game/simulation.js';
const id = process.argv[2] || 'pumpkinDash';
const secs = +(process.argv[3] || 150);
const def = LEVELS[id];
const N = def.playersDefault ?? 16;
const racers = [];
for (let i = 0; i < N; i++) racers.push({ name: `Bot${i}`, skill: 0.2 + (i / (N - 1)) * 0.75 });
const sim = new Simulation(def.build, { headless: true, seed: 7, racers, quota: def.quotaDefault ?? 12 });
sim.go();
const falls = {}, hits = {};
const BUCKET = 10;
let ticks = 0;
while (!sim.ended && ticks < secs * 120) {
  sim.step(); ticks++;
  for (const e of sim.world.events) {
    const key = Math.round(e.z / BUCKET) * BUCKET;
    if (e.type === 'fall') falls[key] = (falls[key] || 0) + 1;
    if (e.type === 'hit') hits[key] = (hits[key] || 0) + 1;
  }
  sim.world.events.length = 0;
  if (ticks % (120 * 15) === 0) {
    const rows = sim.racers.map((r) => `${r.state}:${r.z.toFixed(0)}`).join(' ');
    console.log(`t=${(ticks / 120).toFixed(0)} q=${sim.qualified.length} ${rows}`);
  }
}
const fmt = (o) => Object.keys(o).map(Number).sort((a, b) => b - a).map((k) => `${k}:${o[k]}`).join(' ');
console.log('falls', fmt(falls));
console.log('hits ', fmt(hits));
console.log('finish', sim.qualified.map((r) => `${r.def.skill.toFixed(2)}@${r.finishTime.toFixed(1)}`).join(' '));
