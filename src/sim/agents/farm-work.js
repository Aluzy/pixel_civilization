import { atCamp, campOf } from '../colony/colony-logic.js';
import {
  FarmJob,
  carriedSeeds,
  chooseFarmJob,
  chooseTillSite,
  releaseFarm,
} from '../farming/farm-jobs.js';
import { FALLOW } from '../farming/crop-store.js';
import { PACK } from '../world/chunk-store.js';
import { Action } from './action-types.js';
import { goToCamp } from './colony-work.js';
import { PlanNote } from './journal.js';
import { approach, explore, goToRemembered, moveTo, startHere } from './movement.js';
import { gather } from './work.js';

// Behaviour of the farming goal (docs/design/13-agriculture-cuisine.md): take a farm job at the
// camp, do it at the plot, bring the harvest back to the stock.

/**
 * True if the agent carries grain or seeds to put in the stock.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean}
 */
function carriesHarvest(ctx, id) {
  for (const crop of ctx.crops) {
    if (ctx.agents.carried(id, crop.resource) > 0) return true;
  }
  return carriedSeeds(ctx, id) > 0;
}

/**
 * Walks onto (x, y) and starts `then` there.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @param {number} then
 * @param {import('./movement.js').Plan} plan
 * @returns {boolean}
 */
function goOnto(ctx, id, x, y, then, plan) {
  const a = ctx.agents;
  if (a.x[id] === x && a.y[id] === y) {
    startHere(ctx, id, then);
    plan.action = then;
    return true;
  }
  const nav = ctx.nav;
  const cell = nav.cellAt(x, y);
  const onto = cell >= 0 && nav.reachable(cell);
  const step = onto ? cell : nav.toward(x, y);
  if (step < 0 || !moveTo(ctx, id, step, onto ? then : Action.NONE)) return false;
  plan.action = Action.MOVE;
  plan.x = x;
  plan.y = y;
  return true;
}

/**
 * Farming: without a job, go to the camp and take one from the blackboard (bringing back any
 * harvest first); with a job, walk to its plot and water it, harvest it or sow it, or find a spot
 * near water for a new plot.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @param {boolean} [fresh=false] - The job was just taken (no second choice this time).
 * @returns {void}
 */
export function farmBehaviour(state, ctx, id, plan, fresh = false) {
  const a = ctx.agents;
  plan.note = PlanNote.FARMING;
  const colony = campOf(state, ctx, id);
  if (!colony) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  const job = a.farmJob[id];
  const p = a.farmPlot[id];
  const crops = state.crops;
  if (job === FarmJob.NONE || (job === FarmJob.HARVEST && harvestDone(state, ctx, id))) {
    if (carriesHarvest(ctx, id)) {
      if (!goToCamp(ctx, colony, id, Action.STOCK, plan)) explore(state, ctx, id, plan);
      return;
    }
    if (job === FarmJob.HARVEST) releaseFarm(state, ctx, id);
    if (fresh) {
      startHere(ctx, id, Action.IDLE);
      return;
    }
    // The jobs are on the blackboard: read at the camp, or today, out in the fields.
    const far = Math.max(Math.abs(a.x[id] - colony.campX), Math.abs(a.y[id] - colony.campY));
    const readToday = state.tick - a.boardTick[id] < ctx.balance.time.ticksPerDay;
    const inFields = far <= ctx.balance.agriculture.farmRadius && readToday;
    if (!atCamp(ctx, colony, id) && !inFields) {
      if (!goToCamp(ctx, colony, id, Action.IDLE, plan)) explore(state, ctx, id, plan);
      return;
    }
    if (!chooseFarmJob(state, ctx, colony, id)) {
      startHere(ctx, id, Action.IDLE);
      return;
    }
    farmBehaviour(state, ctx, id, plan, true);
    return;
  }
  if (job === FarmJob.TILL) {
    till(state, ctx, colony, id, plan);
    return;
  }
  if (job === FarmJob.GLEAN) {
    // Wild grain until it carries a sample's worth (seeds come with it), then to the stock.
    const grain = ctx.crops[0].resource;
    const want = ctx.balance.agriculture.gleanUnits;
    if (a.carried(id, grain) >= want || a.carriedTotal(id) >= ctx.capacity(id)) {
      if (!goToCamp(ctx, colony, id, Action.STOCK, plan)) explore(state, ctx, id, plan);
    } else {
      gather(state, ctx, id, grain, want, plan);
      plan.note = PlanNote.FARMING;
    }
    return;
  }
  const x = crops.x[p];
  const y = crops.y[p];
  let ok;
  if (job === FarmJob.WATER) ok = approach(ctx, id, x, y, Action.WATER, plan);
  else if (job === FarmJob.SOW) {
    ok = crops.stage[p] === FALLOW && carriedSeeds(ctx, id) > 0;
    ok = ok && approach(ctx, id, x, y, Action.SOW, plan);
  } else {
    const crop = ctx.crops[crops.crop[p]];
    a.harvestGood[id] = crop.resource;
    a.harvestUntil[id] = ctx.capacity(id);
    ok = goOnto(ctx, id, x, y, Action.HARVEST, plan);
  }
  if (!ok) {
    releaseFarm(state, ctx, id);
    startHere(ctx, id, Action.IDLE);
  }
}

/**
 * A harvest is over when the plot has no crop left or the agent's load is full.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean}
 */
function harvestDone(state, ctx, id) {
  const a = ctx.agents;
  const p = a.farmPlot[id];
  if (p < 0) return true;
  if (a.carriedTotal(id) >= ctx.capacity(id)) return true;
  const crops = state.crops;
  const r = (state.world.packedAt(crops.x[p], crops.y[p]) >> PACK.RESOURCE_SHIFT) & PACK.MASK;
  return r !== ctx.crops[crops.crop[p]].resource;
}

/**
 * A new plot: the best free spot near water in sight (not far from the camp), else towards the
 * water it remembers nearest the camp.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function till(state, ctx, colony, id, plan) {
  const a = ctx.agents;
  if (carriedSeeds(ctx, id) === 0 || !a.recipes[id].knows(ctx.plotRecipe)) {
    releaseFarm(state, ctx, id);
    startHere(ctx, id, Action.IDLE);
    return;
  }
  a.craftRecipe[id] = ctx.plotRecipe;
  const cell = chooseTillSite(state, ctx, colony);
  if (cell === ctx.nav.center) {
    startHere(ctx, id, Action.CRAFT);
    plan.action = Action.CRAFT;
    return;
  }
  if (cell >= 0 && moveTo(ctx, id, cell, Action.CRAFT)) {
    plan.action = Action.MOVE;
    plan.x = ctx.recallTarget[0];
    plan.y = ctx.recallTarget[1];
    return;
  }
  // Nothing in sight: towards water near the camp (it remembers), within the farm's reach.
  const memory = a.memory[id];
  const w = memory.nearest(ctx.waterSubjects, colony.campX, colony.campY);
  const far = ctx.balance.agriculture.farmRadius;
  const near =
    w >= 0 &&
    Math.max(Math.abs(memory.x[w] - colony.campX), Math.abs(memory.y[w] - colony.campY)) <= far;
  const there =
    near && Math.abs(memory.x[w] - a.x[id]) <= 2 && Math.abs(memory.y[w] - a.y[id]) <= 2;
  if (near && !there && goToRemembered(state, ctx, id, ctx.waterSubjects, plan)) return;
  // No spot to farm here: give the seed back to the stock later.
  releaseFarm(state, ctx, id);
  startHere(ctx, id, Action.IDLE);
}
