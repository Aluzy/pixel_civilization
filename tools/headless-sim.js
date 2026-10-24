#!/usr/bin/env node
// Runs the simulation without rendering, as fast as possible, and prints a daily report.
// Usage: npm run sim -- --seed 42 --days 30 [--quiet] [--json]
import balance from '../data/balance.json' with { type: 'json' };
import { Simulation } from '../src/sim/simulation.js';

/**
 * @param {string[]} argv
 * @returns {{ seed: number | string, days: number, quiet: boolean, json: boolean }}
 */
function parseArgs(argv) {
  const options = { seed: 42, days: 10, quiet: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--seed') {
      const raw = argv[++i];
      options.seed = /^\d+$/.test(raw) ? Number(raw) : raw;
    } else if (arg === '--days') {
      options.days = Number(argv[++i]);
    } else if (arg === '--quiet') {
      options.quiet = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.days) || options.days <= 0) throw new Error('--days must be > 0');
  return options;
}

/**
 * @param {number} v
 * @returns {string}
 */
const pct = (v) => String(Math.round(v)).padStart(3);

const options = parseArgs(process.argv.slice(2));
const sim = new Simulation({ seed: options.seed, balance });
const ticksPerDay = balance.time.ticksPerDay;
const start = performance.now();
const days = [];

for (let day = 1; day <= options.days; day++) {
  sim.step(ticksPerDay);
  const agent = sim.describeAgent(0);
  const row = agent
    ? {
        day,
        alive: true,
        hp: agent.hp,
        hunger: agent.needs.hunger,
        thirst: agent.needs.thirst,
        fatigue: agent.needs.fatigue,
        x: agent.x,
        y: agent.y,
        goal: agent.goal,
        made: agent.made.map((m) => m.name),
      }
    : { day, alive: false };
  days.push(row);
  if (!options.quiet && !options.json) {
    const label = `jour ${String(day).padStart(3)}`;
    if (!row.alive) {
      console.log(`${label}  mort`);
    } else {
      const needs = `faim ${pct(row.hunger)}  soif ${pct(row.thirst)}  fatigue ${pct(row.fatigue)}`;
      const made = row.made.length > 0 ? `  [${row.made.join(', ')}]` : '';
      const where = `(${row.x}, ${row.y})`;
      console.log(`${label}  PV ${pct(row.hp)}  ${needs}  ${where}  ${row.goal}${made}`);
    }
  }
  if (!row.alive) break;
}

const elapsed = performance.now() - start;
const summary = {
  seed: options.seed,
  days: options.days,
  survived: days.at(-1).alive && days.length === options.days,
  events: sim.events.events.map((e) => ({
    day: Math.floor(e.tick / ticksPerDay) + 1,
    type: e.type,
  })),
  hash: sim.hash(),
  msPerDay: elapsed / days.length,
};
if (options.json) {
  console.log(JSON.stringify(summary));
} else {
  console.log(
    `\ngraine ${summary.seed} · ${summary.survived ? 'survit' : 'meurt'} · ` +
      `${summary.msPerDay.toFixed(1)} ms par jour simulé · état ${summary.hash}`,
  );
}
process.exitCode = summary.survived ? 0 : 1;
