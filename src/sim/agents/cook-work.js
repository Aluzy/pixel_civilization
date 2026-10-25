import { atCamp, campOf } from '../colony/colony-logic.js';
import { MAX_COOKS } from '../colony/colony-store.js';
import { Action } from './action-types.js';
import { goToCamp } from './colony-work.js';
import { PlanNote } from './journal.js';
import { explore, startHere } from './movement.js';
import { besideStructure } from './equipment.js';
import { discover, gather, pursue, useRecipe } from './work.js';

// The kitchen of a colony (docs/design/13-agriculture-cuisine.md, « Transformer et cuisiner »):
// a few cooks turn what the stock holds (grain, berries, meat) into flour and dishes, which
// nourish more than their ingredients, and put them back in the stock.

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} good
 * @returns {boolean} True for an ingredient the kitchen takes from the stock (food, produce).
 */
function fromStock(ctx, good) {
  return ctx.produce[good] === 1 || ctx.foodTables.food[good] === 1;
}

/**
 * Rounds of recipe `r` the stock ingredients it carries allow (at least those from the stock).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} r
 * @returns {number}
 */
function rounds(ctx, id, r) {
  let n = ctx.balance.cooking.batch;
  for (const input of ctx.catalog.recipes[r].inputs) {
    if (fromStock(ctx, input.good))
      n = Math.min(n, Math.floor(ctx.agents.carried(id, input.good) / input.count));
  }
  return n;
}

/**
 * True if the agent could make recipe `r` with what it carries and what the stock holds.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {number} r
 * @returns {boolean}
 */
function feasible(ctx, colony, id, r) {
  for (const input of ctx.catalog.recipes[r].inputs) {
    // Foods and farm produce come from the stock; a stone to grind with is picked up anywhere.
    if (!fromStock(ctx, input.good)) continue;
    if (ctx.agents.carried(id, input.good) + colony.stock[input.good] < input.count) return false;
  }
  return true;
}

/**
 * The batch worth making: among the cooking recipes it knows and can make now, the one that adds
 * the most food worth (a dish), else one that prepares an ingredient (flour).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @returns {number} Recipe index, -1 if none.
 */
export function chooseBatch(ctx, colony, id) {
  const book = ctx.agents.recipes[id];
  const value = ctx.foodTables.value;
  let best = -1;
  let bestGain = -Infinity;
  for (let k = 0; k < ctx.cookRecipes.length; k++) {
    const r = ctx.cookRecipes[k];
    if (!book.knows(r) || !feasible(ctx, colony, id, r)) continue;
    const recipe = ctx.catalog.recipes[r];
    let gain = value[recipe.output];
    for (const input of recipe.inputs) gain -= value[input.good] * input.count;
    if (gain > bestGain) {
      bestGain = gain;
      best = r;
    }
  }
  return best;
}

/**
 * Food or farm produce waiting in the stock (grain, flour, berries) that no recipe the agent knows
 * makes use of: worth finding out what can be done with it.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @returns {number} Good to experiment with, 0 if none.
 */
export function researchGood(ctx, colony, id) {
  const a = ctx.agents;
  const book = a.recipes[id];
  const recipes = ctx.catalog.recipes;
  const bit = ctx.catalog.ingredientBit;
  for (let g = 1; g < ctx.produce.length; g++) {
    // Ingredients (grain, flour, berries…), not finished dishes.
    if (bit[g] < 0 || (g > ctx.catalog.resourceCount && ctx.foodTables.food[g] === 1)) continue;
    if (ctx.produce[g] !== 1 && ctx.foodTables.food[g] !== 1) continue;
    if (colony.stock[g] + a.carried(id, g) === 0) continue;
    let used = false;
    for (let r = 0; r < recipes.length && !used; r++) {
      if (!book.knows(r)) continue;
      for (const input of recipes[r].inputs) if (input.good === g) used = true;
    }
    if (!used) return g;
  }
  return 0;
}

/**
 * Cook posts (one per `membersPerCook` members), taken at the camp by members who know a cooking
 * recipe they can make with the stock, for `cookTicks`. Returns whether the agent cooks now.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('../colony/colony-store.js').Colony | null} home
 * @returns {boolean}
 */
export function senseCooking(state, ctx, id, home) {
  const a = ctx.agents;
  if (home === null) return false;
  const cfg = ctx.balance.cooking;
  const wanted =
    home.members < cfg.kitchenMembers
      ? 0
      : Math.min(MAX_COOKS, Math.ceil(home.members / cfg.membersPerCook));
  let slot = -1;
  let cooks = 0;
  for (let k = 0; k < MAX_COOKS; k++) {
    const c = home.cooks[k];
    if (c >= 0 && a.alive[c] !== 1) home.cooks[k] = -1;
    if (home.cooks[k] >= 0) cooks++;
    if (home.cooks[k] === id) slot = k;
  }
  const busy = a.cookRecipe[id] >= 0;
  if (slot >= 0 && !busy && state.tick - home.cookTick[slot] > cfg.cookTicks) {
    home.cooks[slot] = -1;
    return false;
  }
  if (slot < 0) {
    const work = chooseBatch(ctx, home, id) >= 0 || researchGood(ctx, home, id) > 0;
    if (cooks >= wanted || !atCamp(ctx, home, id) || !work) return false;
    if (home.scribe === id || home.inventor === id || home.guards.includes(id)) return false;
    slot = home.cooks.indexOf(-1);
    home.cooks[slot] = id;
    home.cookTick[slot] = state.tick;
  }
  // A cook with nothing to make and nothing to bring back steps down.
  const idle = chooseBatch(ctx, home, id) < 0 && researchGood(ctx, home, id) === 0;
  if (!busy && !carriesKitchenWork(ctx, id) && idle) {
    home.cooks[slot] = -1;
    return false;
  }
  return true;
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if it carries flour or dishes to put in the stock.
 */
function carriesKitchenWork(ctx, id) {
  for (let k = 0; k < ctx.cookRecipes.length; k++) {
    const out = ctx.catalog.recipes[ctx.cookRecipes[k]].output;
    if (ctx.agents.carried(id, out) > 0) return true;
  }
  return false;
}

/**
 * Cooking: choose a batch at the camp, take its ingredients from the stock, make it (building the
 * station it needs if there is none), and put the result in the stock.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function cookBehaviour(state, ctx, id, plan) {
  const a = ctx.agents;
  plan.note = PlanNote.COOKING;
  const colony = campOf(state, ctx, id);
  if (!colony) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  let r = a.cookRecipe[id];
  // It found out it had the recipe wrong (or forgot it): another batch.
  if (r >= 0 && !a.recipes[id].knows(r)) {
    a.cookRecipe[id] = -1;
    r = -1;
  }
  // The batch is made (nothing left for another round): to the stock.
  const holdsAll = (k) =>
    ctx.catalog.recipes[k].inputs.every((i) => a.carried(id, i.good) >= i.count);
  if (r >= 0 && a.carried(id, ctx.catalog.recipes[r].output) > 0 && !holdsAll(r)) {
    a.cookRecipe[id] = -1;
    r = -1;
  }
  if (r < 0) {
    // Produce nobody here knows a use for: try what can be made with it (a sample from the stock).
    const trial = researchGood(ctx, colony, id);
    if (trial > 0) {
      const want = ctx.balance.crafting.sampleUnits;
      if (a.carried(id, trial) < want && colony.stock[trial] > 0 && atCamp(ctx, colony, id)) {
        const n = Math.min(want - a.carried(id, trial), colony.stock[trial]);
        colony.stock[trial] -= n;
        a.addCarried(id, trial, n, state.tick);
      }
      if (a.carried(id, trial) > 0) {
        // Part of the time it looks for a new station instead (a fire opens new recipes).
        if (a.rng[id].next() < ctx.balance.cooking.stationResearch) {
          discover(state, ctx, id, 'structure', plan);
        } else discover(state, ctx, id, null, plan, trial);
        plan.note = PlanNote.COOKING;
        return;
      }
    }
    if (carriesKitchenWork(ctx, id)) {
      if (!goToCamp(ctx, colony, id, Action.STOCK, plan)) explore(state, ctx, id, plan);
      return;
    }
    if (!atCamp(ctx, colony, id)) {
      if (!goToCamp(ctx, colony, id, Action.IDLE, plan)) explore(state, ctx, id, plan);
      return;
    }
    r = chooseBatch(ctx, colony, id);
    if (r < 0) {
      startHere(ctx, id, Action.IDLE);
      return;
    }
    a.cookRecipe[id] = r;
  }
  const recipe = ctx.catalog.recipes[r];
  if (!holdsAll(r)) {
    if (!feasible(ctx, colony, id, r)) {
      a.cookRecipe[id] = -1;
      startHere(ctx, id, Action.IDLE);
      return;
    }
    // Ingredients from the stock first, then what is picked up outside (a stone) for every round.
    const n = rounds(ctx, id, r);
    if (n === 0) {
      if (!goToCamp(ctx, colony, id, Action.FETCH, plan)) explore(state, ctx, id, plan);
      return;
    }
    for (const input of recipe.inputs) {
      if (fromStock(ctx, input.good) || a.carried(id, input.good) >= input.count * n) continue;
      gather(state, ctx, id, input.good, input.count * n, plan);
      plan.note = PlanNote.COOKING;
      return;
    }
  }
  // At a station in sight, round after round; else the plan finds or builds one.
  const st = recipe.station;
  if (st === 0 || besideStructure(state, ctx, id, st) || ctx.nav.nearestStructure(st) >= 0) {
    useRecipe(state, ctx, id, r, plan);
  } else {
    pursue(state, ctx, id, ctx.goodTargets[recipe.output], plan, false);
  }
  plan.note = PlanNote.COOKING;
}
