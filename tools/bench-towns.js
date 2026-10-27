#!/usr/bin/env node
// Performance benchmark of a large population (decision 0030): towns laid out at once, each with
// its houses, a few figures and its commoners, in a world where food is plentiful
// (data/bench.json); run for N days. Reports the cost of a tick and whether the speed ×16 stays
// fluid (10 ticks per second at ×1, so 160 ticks per second).
// Usage: npm run bench:towns -- [--seed 3] [--towns 40] [--people 250] [--days 10]
import benchData from '../data/bench.json' with { type: 'json' };
import balance0 from '../data/balance.json' with { type: 'json' };
import resourceData from '../data/resources.json' with { type: 'json' };
import worldData from '../data/world.json' with { type: 'json' };
import { Simulation } from '../src/sim/simulation.js';
import { buildWorldTables } from '../src/sim/world/world-data.js';
import { settleTowns } from './towns.js';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const seed = option('seed', 3);
const towns = option('towns', 40);
const people = option('people', 250);
const days = option('days', 5);
const spacing = option('spacing', 150);

/**
 * Deep merge of plain objects (b wins).
 * @param {object} a
 * @param {object} b
 * @returns {object}
 */
function merge(a, b) {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(out[k] ?? {}, v) : v;
  }
  return out;
}

const balance = merge(balance0, benchData.balance);
balance.colony.maxPopulation = balance0.colony.maxPopulation;
const resources = structuredClone(resourceData);
for (const r of resources.resources) Object.assign(r, benchData.resources[r.id] ?? {});
const tables = buildWorldTables(worldData, resources);
const sim = new Simulation({ seed, balance, tables });
const { state } = sim;
const a = state.agents;

settleTowns(sim, { towns, people, days, spacing });

const ticksPerDay = balance.time.ticksPerDay;
const budget = 1000 / (balance.time.ticksPerSecond * benchData.speed);
console.log(
  `${state.colonies.length} villes, ${a.aliveCount} individus dont ${a.figureCount} figures`,
);
let worst = 0;
let total = 0;
for (let day = 1; day <= days; day++) {
  const t0 = performance.now();
  sim.step(ticksPerDay);
  const ms = (performance.now() - t0) / ticksPerDay;
  total += ms;
  worst = Math.max(worst, ms);
  console.log(
    `jour ${String(day).padStart(3)}  individus ${String(a.aliveCount).padStart(5)}  ` +
      `figures ${String(a.figureCount).padStart(4)}  ${ms.toFixed(3)} ms/cycle`,
  );
}
const mean = total / days;
console.log(
  `moyenne ${mean.toFixed(3)} ms/cycle, pire jour ${worst.toFixed(3)} ms/cycle ; ` +
    `×${benchData.speed} demande ${budget.toFixed(2)} ms/cycle au plus : ` +
    (worst <= budget ? 'fluide' : 'trop lent'),
);
