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
import { Tier } from '../src/sim/agents/agent-store.js';
import { lifespanOf } from '../src/sim/colony/replication.js';
import { Colony } from '../src/sim/colony/colony-store.js';
import { figureQuota, planWell, townMap } from '../src/sim/colony/people.js';
import { houseFor, planHouse, raiseHouse, registerHouse } from '../src/sim/colony/house.js';
import { CATALOG, JOBS, Simulation } from '../src/sim/simulation.js';
import { PACK } from '../src/sim/world/chunk-store.js';
import { buildWorldTables } from '../src/sim/world/world-data.js';

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
const { state, ctx } = sim;
const world = state.world;
const a = state.agents;

/**
 * @param {number} x
 * @param {number} y
 * @returns {boolean} Passable, empty and free.
 */
function free(x, y) {
  const p = world.packedAt(x, y);
  return (
    ctx.biomeSpeed[p & PACK.MASK] > 0 &&
    p >>> PACK.STRUCTURE_SHIFT === 0 &&
    world.lastOccupant() < 0
  );
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @returns {boolean} Water within r tiles.
 */
function waterNear(x, y, r) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if ((world.packedAt(x + dx, y + dy) & PACK.MASK) === ctx.waterBiome) return true;
    }
  }
  return false;
}

/**
 * First tile on square rings around (cx, cy) that passes `test`.
 * @param {number} cx
 * @param {number} cy
 * @param {number} max
 * @param {(x: number, y: number) => boolean} test
 * @returns {number[] | null}
 */
function around(cx, cy, max, test) {
  for (let r = 0; r <= max; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (test(cx + dx, cy + dy)) return [cx + dx, cy + dy];
      }
    }
  }
  return null;
}

// The founder of the game makes way for the towns.
state.colonies[0].members = 0;
a.kill(0);
const known = ['workbench', 'shelter', 'spear', 'stone_axe', 'stone_pickaxe', 'campfire', 'plot'];
const side = Math.ceil(Math.sqrt(towns));
const berries = tables.resources.findIndex((r) => r.id === 'berries') + 1;
for (let t = 0; t < towns; t++) {
  const gx = state.spawn.x + (t % side) * spacing;
  const gy = state.spawn.y + Math.floor(t / side) * spacing;
  // Beside water, as a colony is founded.
  const site =
    around(gx, gy, 40, (x, y) => free(x, y) && waterNear(x, y, 1)) ?? around(gx, gy, 40, free);
  if (site === null) continue;
  const colony =
    t === 0
      ? state.colonies[0]
      : new Colony(
          state.colonies.length,
          CATALOG.goodCount,
          balance.colony,
          balance.harmony,
          JOBS.jobs.length,
        );
  if (t > 0) {
    colony.price.set(ctx.basePrices);
    state.colonies.push(colony);
  }
  colony.hasCamp = true;
  colony.campX = site[0];
  colony.campY = site[1];
  const out = ctx.siteOut;
  while (colony.bedCount < people * 1.1) {
    const code = houseFor(ctx, people);
    if (!planHouse(state, ctx, colony, out, code)) break;
    raiseHouse(state, ctx, out[0], out[1], out[2], code);
    registerHouse(ctx, colony, out[0], out[1]);
  }
  // Food in stock for the days of the bench: a town in its stride, not in a famine.
  colony.stock[berries] = people * 8 * days;
  for (let i = 0; i < people; i++) {
    // Everyone starts in a bed of the town (as at dawn), else near the camp.
    const bed = i < colony.bedCount && world.packedAt(colony.bedX[i], colony.bedY[i]) !== 0;
    if (bed && world.lastOccupant() >= 0) continue;
    const spot = bed ? [colony.bedX[i], colony.bedY[i]] : around(site[0], site[1], 60, free);
    if (spot === null) break;
    colony.members++;
    const figure = colony.figures < figureQuota(ctx, colony);
    const id = a.create({
      x: spot[0],
      y: spot[1],
      tick: 0,
      attributes: balance.agent.start,
      needs: balance.agent.startNeeds,
      rng: state.rng.ai.fork(`town-${t}-${i}`),
      colony: colony.id,
      lifespan: lifespanOf(balance, state.rng.lifecycle),
      tier: figure ? Tier.FIGURE : Tier.COMMONER,
    });
    a.coins[id] = balance.economy.startCoins;
    // A town in its stride: needs and ages spread out, not all thirsty at once.
    const rng = state.rng.lifecycle;
    a.hunger[id] = rng.next() * 50;
    a.thirst[id] = rng.next() * 50;
    a.fatigue[id] = rng.next() * 50;
    a.bornTick[id] = -Math.floor(rng.next() * a.lifespan[id] * 0.8);
    if (figure) {
      colony.figures++;
      for (const r of known) {
        const index = CATALOG.recipes.findIndex((rc) => rc.id === r);
        if (index >= 0) a.recipes[id].learn(index, 0, 1e9);
      }
    }
  }
  // Wells among the houses, as the town would have dug them for its people.
  const map = townMap(state, ctx, colony);
  for (let w = 0; w < people / 20 && map !== null && planWell(state, ctx, colony, map, out); w++) {
    world.setStructure(out[0], out[1], ctx.wellCode);
    map.build(state, ctx, colony.campX, colony.campY);
  }
}

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
