#!/usr/bin/env node
// Performance benchmark (docs/design/11-feuille-de-route.md, J7): a colony of many founders in a
// world where food is plentiful (data/bench.json), run for N days; reports the cost of a tick and
// whether the speed ×16 would stay fluid (10 ticks per second at ×1, so 160 ticks per second).
// Usage: npm run bench -- [--seed 3] [--founders 500] [--days 100]
import benchData from '../data/bench.json' with { type: 'json' };
import balance0 from '../data/balance.json' with { type: 'json' };
import resourceData from '../data/resources.json' with { type: 'json' };
import worldData from '../data/world.json' with { type: 'json' };
import { Simulation } from '../src/sim/simulation.js';
import { buildWorldTables } from '../src/sim/world/world-data.js';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const seed = option('seed', 3);
const founders = option('founders', benchData.founders);
const days = option('days', benchData.days);

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
balance.agent.maxEntities = Math.max(balance.agent.maxEntities, benchData.maxEntities);
const resources = structuredClone(resourceData);
for (const r of resources.resources) Object.assign(r, benchData.resources[r.id] ?? {});
const tables = buildWorldTables(worldData, resources);
const sim = new Simulation({ seed, balance, tables, founders });
const ticksPerDay = balance.time.ticksPerDay;
const budget = 1000 / (balance.time.ticksPerSecond * benchData.speed);
let worst = 0;
let total = 0;
let minAlive = Infinity;
for (let day = 1; day <= days; day++) {
  const t0 = performance.now();
  sim.step(ticksPerDay);
  const ms = (performance.now() - t0) / ticksPerDay;
  total += ms;
  worst = Math.max(worst, ms);
  minAlive = Math.min(minAlive, sim.agents.aliveCount);
  if (day % 10 === 0 || day === 1) {
    console.log(
      `jour ${String(day).padStart(3)}  individus ${String(sim.agents.aliveCount).padStart(4)}  ` +
        `${ms.toFixed(3)} ms/cycle`,
    );
  }
}
const mean = total / days;
console.log(
  `moyenne ${mean.toFixed(3)} ms/cycle, pire jour ${worst.toFixed(3)} ms/cycle, ` +
    `au moins ${minAlive} individus ; ×${benchData.speed} demande ${budget.toFixed(2)} ms/cycle au plus : ` +
    (worst <= budget ? 'fluide' : 'trop lent'),
);
