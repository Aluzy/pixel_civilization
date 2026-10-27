// Towns laid out at once (decision 0030), for the benchmark of a large population and the tests
// of the people: each beside water, with its houses, its wells, a few figures who know the first
// recipes and its commoners, needs and ages spread out as in a town in its stride.
import { Tier } from '../src/sim/agents/agent-store.js';
import { Colony } from '../src/sim/colony/colony-store.js';
import { houseFor, planHouse, raiseHouse, registerHouse } from '../src/sim/colony/house.js';
import { figureQuota, planWell, townMap } from '../src/sim/colony/people.js';
import { lifespanOf } from '../src/sim/colony/replication.js';
import { CATALOG, JOBS } from '../src/sim/simulation.js';
import { PACK } from '../src/sim/world/chunk-store.js';

/**
 * @param {import('../src/sim/simulation.js').Simulation} sim
 * @param {number} x
 * @param {number} y
 * @returns {boolean} Passable, empty and free.
 */
function free(sim, x, y) {
  const { ctx, world } = sim;
  const p = world.packedAt(x, y);
  return (
    ctx.biomeSpeed[p & PACK.MASK] > 0 &&
    p >>> PACK.STRUCTURE_SHIFT === 0 &&
    world.lastOccupant() < 0
  );
}

/**
 * @param {import('../src/sim/simulation.js').Simulation} sim
 * @param {number} x
 * @param {number} y
 * @param {number} r
 * @returns {boolean} Water within r tiles.
 */
function waterNear(sim, x, y, r) {
  const { ctx, world } = sim;
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

/**
 * Lays out `towns` towns of `people` on a grid of `spacing` tiles from the spawn, with food in
 * stock for `days` days. The founder of the game makes way for them.
 * @param {import('../src/sim/simulation.js').Simulation} sim
 * @param {{ towns: number, people: number, days: number, spacing: number }} options
 * @returns {void}
 */
export function settleTowns(sim, { towns, people, days, spacing }) {
  const { state, ctx, world } = sim;
  const a = state.agents;
  const balance = state.balance;
  const tables = sim.tables;
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
      around(gx, gy, 40, (x, y) => free(sim, x, y) && waterNear(sim, x, y, 1)) ??
      around(gx, gy, 40, (x, y) => free(sim, x, y));
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
      const spot = bed
        ? [colony.bedX[i], colony.bedY[i]]
        : around(site[0], site[1], 60, (x, y) => free(sim, x, y));
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
    for (
      let w = 0;
      w < people / 20 && map !== null && planWell(state, ctx, colony, map, out);
      w++
    ) {
      world.setStructure(out[0], out[1], ctx.wellCode);
      map.build(state, ctx, colony.campX, colony.campY);
    }
  }
}
