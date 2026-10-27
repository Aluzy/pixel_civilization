import { insideAny } from '../colony/fortress.js';
import { noteDelivery } from '../agents/experience.js';
import { EventType } from '../core/events.js';
import { buy, sell, take } from '../economy/market.js';
import { askOf } from '../economy/prices.js';
import { PACK } from '../world/chunk-store.js';
import { FALLOW } from './crop-store.js';

// Farm work of a colony (docs/design/13-agriculture-cuisine.md, « Ce que l'IA doit savoir
// faire »): the plots are on the blackboard, so a member at the camp who knows how to sow sees
// which ones need water, which are ripe and which are bare, and takes one job at a time.

/** Farm jobs; among plot jobs, a higher value is more urgent (a ripe crop, then water). */
export const FarmJob = Object.freeze({
  NONE: 0,
  SOW: 1,
  WATER: 2,
  HARVEST: 3,
  TILL: 4, // Make a new plot (sow a seed on bare ground).
  GLEAN: 5, // No seed to sow: gather wild grain for its seeds.
});

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {number} Today's day index.
 */
function today(state, ctx) {
  return Math.floor(state.tick / ctx.balance.time.ticksPerDay);
}

/**
 * The job a plot needs now, if any.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} p
 * @param {number} seeds - Seeds in the stock.
 * @returns {number} {@link FarmJob}.
 */
function jobOf(state, ctx, p, seeds) {
  const crops = state.crops;
  const stage = crops.stage[p];
  if (stage === FALLOW) return seeds > 0 ? FarmJob.SOW : FarmJob.NONE;
  const crop = ctx.crops[crops.crop[p]];
  if (stage >= crop.stages) {
    const r = (state.world.packedAt(crops.x[p], crops.y[p]) >> PACK.RESOURCE_SHIFT) & PACK.MASK;
    return r === crop.resource ? FarmJob.HARVEST : FarmJob.NONE;
  }
  return crops.watered[p] < today(state, ctx) ? FarmJob.WATER : FarmJob.NONE;
}

/**
 * Seeds the colony can sow: in the stock, of any crop.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @returns {number}
 */
function seedsInStock(ctx, colony) {
  let n = 0;
  for (const crop of ctx.crops) n += colony.stock[crop.seed];
  return n;
}

/**
 * Plots the colony wants: enough for its members.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @returns {number}
 */
function wantedPlots(ctx, colony) {
  const cfg = ctx.balance.agriculture;
  // A colony too small to spare hands keeps gathering.
  if (colony.members < cfg.farmMembers) return 0;
  return Math.ceil(colony.members * cfg.plotsPerMember);
}

/**
 * Counts the colony's plots and its free farm jobs (for the blackboard), and frees the claims of
 * the dead and of those who held them too long.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @returns {void}
 */
export function countFarmJobs(state, ctx, colony) {
  const crops = state.crops;
  const a = ctx.agents;
  const limit = ctx.balance.agriculture.claimTicks;
  const seeds = seedsInStock(ctx, colony);
  let plots = 0;
  let open = 0;
  for (let p = 0; p < crops.count; p++) {
    if (crops.colony[p] !== colony.id) continue;
    plots++;
    const claim = crops.claim[p];
    if (claim >= 0 && (a.alive[claim] !== 1 || state.tick - crops.claimTick[p] > limit)) {
      crops.claim[p] = -1;
      if (a.farmPlot[claim] === p) {
        a.farmPlot[claim] = -1;
        a.farmJob[claim] = FarmJob.NONE;
      }
    }
    if (crops.claim[p] < 0 && jobOf(state, ctx, p, seeds) !== FarmJob.NONE) open++;
  }
  colony.plots = plots;
  // A new plot to make, or seeds to glean for it (while few glean).
  const glean = colony.gleaning < ctx.balance.agriculture.gleaners;
  if (plots < wantedPlots(ctx, colony) && (seeds > 0 || glean)) open++;
  colony.farmOpen = open;
}

/**
 * Takes the most urgent free farm job (harvest, then water, then sow, the nearest first; else a
 * new plot if the colony wants more and has seeds). A sower takes its seed from the stock.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {boolean} [plotsOnly=false] - Only the jobs of existing plots (a commoner does not
 *   choose where to make a new one).
 * @returns {boolean}
 */
export function chooseFarmJob(state, ctx, colony, id, plotsOnly = false) {
  const crops = state.crops;
  const a = ctx.agents;
  const seeds = seedsInStock(ctx, colony) + carriedSeeds(ctx, id);
  let best = -1;
  let bestJob = FarmJob.NONE;
  let bestD = Infinity;
  let bare = 0;
  let plots = 0;
  for (let p = 0; p < crops.count; p++) {
    if (crops.colony[p] !== colony.id) continue;
    plots++;
    if (crops.stage[p] === FALLOW) bare++;
    if (crops.claim[p] >= 0) continue;
    const job = jobOf(state, ctx, p, seeds);
    if (job === FarmJob.NONE || job < bestJob) continue;
    const d = Math.max(Math.abs(crops.x[p] - a.x[id]), Math.abs(crops.y[p] - a.y[id]));
    if (job > bestJob || d < bestD) {
      best = p;
      bestJob = job;
      bestD = d;
    }
  }
  if (best < 0) {
    if (plotsOnly || plots >= wantedPlots(ctx, colony)) return false;
    bestJob = seeds > bare ? FarmJob.TILL : FarmJob.GLEAN;
    // Wild grain is rare: a few glean, the others keep feeding the colony.
    if (bestJob === FarmJob.GLEAN) {
      if (colony.gleaning >= ctx.balance.agriculture.gleaners) return false;
      colony.gleaning++;
    }
  } else {
    crops.claim[best] = id;
    crops.claimTick[best] = state.tick;
  }
  if ((bestJob === FarmJob.SOW || bestJob === FarmJob.TILL) && carriedSeeds(ctx, id) === 0) {
    takeSeed(ctx, colony, id, state.tick);
  }
  a.farmPlot[id] = best;
  a.farmJob[id] = bestJob;
  return true;
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number}
 */
export function carriedSeeds(ctx, id) {
  let n = 0;
  for (const crop of ctx.crops) n += ctx.agents.carried(id, crop.seed);
  return n;
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {number} tick
 * @returns {void}
 */
function takeSeed(ctx, colony, id, tick) {
  for (const crop of ctx.crops) {
    if (colony.stock[crop.seed] <= 0) continue;
    take(colony, crop.seed, 1);
    ctx.agents.addCarried(id, crop.seed, 1, tick);
    return;
  }
}

/**
 * Gives up the agent's farm job (done, or not possible any more).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function releaseFarm(state, ctx, id) {
  const a = ctx.agents;
  const p = a.farmPlot[id];
  if (p >= 0 && state.crops.claim[p] === id) state.crops.claim[p] = -1;
  a.farmPlot[id] = -1;
  a.farmJob[id] = FarmJob.NONE;
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if the agent stands on or beside its job's plot.
 */
function besidePlot(state, ctx, id) {
  const p = ctx.agents.farmPlot[id];
  if (p < 0) return false;
  const a = ctx.agents;
  return Math.abs(state.crops.x[p] - a.x[id]) <= 1 && Math.abs(state.crops.y[p] - a.y[id]) <= 1;
}

/**
 * End of the WATER action: the plot, and the colony's plots within `wateringRadius`, are watered
 * for today.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function waterPlot(state, ctx, id) {
  if (besidePlot(state, ctx, id)) {
    // The water carried reaches the plots around too (a field is watered row by row).
    const crops = state.crops;
    const p = ctx.agents.farmPlot[id];
    const day = today(state, ctx);
    const r = ctx.balance.agriculture.wateringRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const q = crops.at(crops.x[p] + dx, crops.y[p] + dy);
        if (q >= 0 && crops.colony[q] === crops.colony[p]) crops.watered[q] = day;
      }
    }
  }
  releaseFarm(state, ctx, id);
}

/**
 * End of the SOW action: a carried seed goes into the bare plot.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function sowPlot(state, ctx, id) {
  const p = ctx.agents.farmPlot[id];
  if (besidePlot(state, ctx, id) && state.crops.stage[p] === FALLOW) {
    for (let c = 0; c < ctx.crops.length; c++) {
      if (ctx.agents.carried(id, ctx.crops[c].seed) === 0) continue;
      ctx.agents.addCarried(id, ctx.crops[c].seed, -1);
      state.crops.sow(p, c);
      // Sowing again keeps the know-how fresh.
      const m = ctx.balance.memory;
      ctx.agents.recipes[id].use(ctx.plotRecipe, state.tick, m.consolidation, ctx.maxTau);
      break;
    }
  }
  releaseFarm(state, ctx, id);
}

/**
 * A plot was made (the sowing recipe): it joins the colony's farm, its seed in the ground.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @returns {void}
 */
export function tillDone(state, ctx, id, x, y) {
  const a = ctx.agents;
  const c = a.colony[id];
  const seed = ctx.catalog.recipes[ctx.plotRecipe].inputs[0].good;
  const crop = ctx.crops.findIndex((k) => k.seed === seed);
  state.crops.add(x, y, c < 0 ? -1 : c, crop);
  if (c >= 0) {
    const colony = state.colonies[c];
    if (colony.plots === 0) state.events.push(state.tick, EventType.FIRST_PLOT, id, x, y);
    colony.plots++;
  }
  if (a.farmJob[id] === FarmJob.TILL) releaseFarm(state, ctx, id);
}

/**
 * At the camp: puts what the farm and the kitchen produce (grain, seeds, flour, dishes) in the
 * stock, and ends a harvest job.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number} Units stored.
 */
export function stockProduce(state, ctx, id) {
  const a = ctx.agents;
  const c = a.colony[id];
  if (c < 0) return 0;
  const colony = state.colonies[c];
  const r = ctx.balance.colony.campRadius;
  if (Math.abs(a.x[id] - colony.campX) > r || Math.abs(a.y[id] - colony.campY) > r) return 0;
  let n = 0;
  const job = a.farmJob[id];
  const farming = job === FarmJob.HARVEST || job === FarmJob.GLEAN;
  for (let g = 1; g < ctx.produce.length; g++) {
    if (ctx.produce[g] !== 1) continue;
    const units = a.carried(id, g);
    if (units === 0) continue;
    // A harvest teaches what a unit of grain costs it, from the start of this stint in the fields.
    if (farming && ctx.cropOfResource[g] >= 0) {
      noteDelivery(ctx, id, g, units, state.tick - a.goalSince[id]);
    }
    sell(state, ctx, colony, id, g, units);
    n += units;
  }
  if (farming) releaseFarm(state, ctx, id);
  return n;
}

/**
 * At the camp: a cook takes from the stock what its recipe still lacks, for up to `batch` rounds
 * (as much as the stock and its load allow).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function fetchInputs(state, ctx, id) {
  const a = ctx.agents;
  const c = a.colony[id];
  const r = a.cookRecipe[id];
  if (c < 0 || r < 0) return;
  const colony = state.colonies[c];
  const inputs = ctx.catalog.recipes[r].inputs;
  // A miller or a baker buys the ingredients of its trade; a cook trying things for the colony
  // takes them.
  const pays = paysFor(ctx, id, r);
  const spread = ctx.balance.economy.spread;
  let rounds = ctx.balance.cooking.batch;
  let per = 0;
  let cost = 0;
  for (const input of inputs) {
    rounds = Math.min(
      rounds,
      Math.floor((colony.stock[input.good] + a.carried(id, input.good)) / input.count),
    );
    per += input.count;
    cost += askOf(colony.price[input.good], spread) * input.count;
  }
  const room = Math.floor(ctx.capacity(id) - a.carriedTotal(id));
  rounds = Math.max(1, Math.min(rounds, Math.floor(room / per)));
  if (pays) rounds = Math.min(rounds, Math.floor(a.coins[id] / cost));
  for (const input of inputs) {
    const n = Math.min(input.count * rounds - a.carried(id, input.good), colony.stock[input.good]);
    if (n <= 0) continue;
    if (pays) buy(state, ctx, colony, id, input.good, n, true);
    else {
      take(colony, input.good, n);
      a.addCarried(id, input.good, n, state.tick);
    }
  }
}

/**
 * True if the agent makes recipe `r` as its trade (its job), and so buys its ingredients.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} r
 * @returns {boolean}
 */
export function paysFor(ctx, id, r) {
  const j = ctx.agents.job[id];
  return j >= 0 && ctx.jobs.jobs[j].makes.includes(r);
}

/**
 * True if a tile can become a plot: plantable biome, nothing on it, outside any enclosure, water
 * within reach.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function tillable(state, ctx, x, y) {
  const p = state.world.packedAt(x, y);
  if (p >>> PACK.STRUCTURE_SHIFT !== 0) return false;
  if (((p >> PACK.RESOURCE_SHIFT) & PACK.MASK) !== 0) return false;
  if (ctx.plantBiome[p & PACK.MASK] !== 1) return false;
  // Fields lie outside the walls: inside is kept for the houses.
  if (insideAny(ctx.colonies, x, y)) return false;
  const reach = ctx.balance.agriculture.waterReach;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const p = state.world.packedAt(x + dx, y + dy);
      if ((p & PACK.MASK) === ctx.waterBiome) return true;
      if (ctx.wet[p >>> PACK.STRUCTURE_SHIFT] === 1) return true;
    }
  }
  return false;
}

/**
 * Where to make a new plot, among the tiles the agent sees within `farmRadius` of the camp (of the
 * walls, for a colony with an enclosure): next
 * to other plots if possible (a field), else the closest to the camp. Writes x, y in
 * `ctx.recallTarget`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @returns {number} Navigation cell, -1 if none.
 */
export function chooseTillSite(state, ctx, colony) {
  const nav = ctx.nav;
  const far = ctx.balance.agriculture.farmRadius;
  const keep = ctx.balance.colony.campRadius / 2;
  const n = nav.side * nav.side;
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!nav.reachable(i)) continue;
    const x = nav.cellX(i);
    const y = nav.cellY(i);
    const d = colony.fieldDistance(x, y);
    const core = Math.max(Math.abs(x - colony.campX), Math.abs(y - colony.campY));
    if (d > far || core < keep || !tillable(state, ctx, x, y)) continue;
    let plots = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const st = state.world.packedAt(x + dx, y + dy) >>> PACK.STRUCTURE_SHIFT;
        if (st === ctx.plotCode) plots++;
      }
    }
    const score = plots * 4 - d - nav.dist[i] / 4;
    if (score > bestScore) {
      bestScore = score;
      best = i;
      ctx.recallTarget[0] = x;
      ctx.recallTarget[1] = y;
    }
  }
  return best;
}
