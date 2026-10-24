import { PlanStatus, Step } from '../ai/planner.js';
import { BARE_HANDS } from '../crafting/catalog.js';
import { chooseTrial } from '../crafting/experiment.js';
import { canHarvest } from './actions.js';
import { Action } from './action-types.js';
import { besideStructure } from './equipment.js';
import { PlanNote } from './journal.js';
import { explore, goToRemembered, moveTo, search, startHere } from './movement.js';

// Behaviours of the crafting goals (shelter, weapon, tool): the GOAP plan says what to do next,
// these functions turn its first step into movement and an action. Without a plan (an unknown
// recipe), the agent experiments.

/**
 * Copies what the agent believes into the planner's inputs: goods carried, recipes known,
 * stations and resource places remembered.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {import('../ai/planner.js').Planner}
 */
export function fillBeliefs(ctx, id) {
  const planner = ctx.planner;
  const agents = ctx.agents;
  const R = ctx.catalog.resourceCount;
  for (let g = 1; g < planner.goods; g++) planner.inventory[g] = agents.carried(id, g);
  planner.stations.fill(0);
  planner.places.fill(0);
  const memory = agents.memory[id];
  for (let i = 0; i < memory.count; i++) {
    const s = memory.subject[i];
    if (s >= 1 && s <= R) planner.places[s] = 1;
    else if (s > R && s - R < planner.stations.length) planner.stations[s - R] = 1;
  }
  planner.recipeMask = agents.recipes[id].knownMask();
  return planner;
}

/**
 * Pursues a crafting goal: plans towards its target and starts the first step, or experiments
 * when no plan exists with what the agent knows.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('../ai/planner.js').PlanTarget} target
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function pursue(state, ctx, id, target, plan) {
  const result = fillBeliefs(ctx, id).plan(target);
  ctx.agents.lastPlan[id] = result;
  if (result.status === PlanStatus.OK) {
    runStep(state, ctx, id, result.steps[0], plan);
    return;
  }
  if (result.status === PlanStatus.DONE) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  // Looking for a structure or an item guides the trials.
  const wanted = target.structures.includes(1) ? 'structure' : 'item';
  discover(state, ctx, id, wanted, plan);
}

/**
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('../ai/planner.js').PlanStep} step
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function runStep(state, ctx, id, step, plan) {
  switch (step.kind) {
    case Step.EXPLORE:
      search(state, ctx, id, step.arg, plan);
      return;
    case Step.GATHER:
      gather(state, ctx, id, step.arg, step.count, plan);
      return;
    default:
      useRecipe(state, ctx, id, step.arg, plan);
  }
}

/**
 * Goes to the nearest visible (else remembered) place of `resource` and harvests it until it
 * carries `until` units; explores when it knows none.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} resource
 * @param {number} until
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function gather(state, ctx, id, resource, until, plan) {
  const agents = ctx.agents;
  const nav = ctx.nav;
  const mask = ctx.subjectMasks[resource];
  agents.harvestGood[id] = resource;
  agents.harvestUntil[id] = until;
  const cell = nav.nearestResource(mask);
  if (cell === nav.center) {
    startHere(ctx, id, Action.HARVEST);
    plan.action = Action.HARVEST;
    plan.note = PlanNote.PLAN;
    return;
  }
  if (cell >= 0 && moveTo(ctx, id, cell, Action.HARVEST)) {
    plan.action = Action.MOVE;
    plan.x = nav.cellX(cell);
    plan.y = nav.cellY(cell);
    plan.note = PlanNote.PLAN;
    return;
  }
  if (goToRemembered(state, ctx, id, mask, plan)) return;
  search(state, ctx, id, resource, plan);
}

/**
 * Starts `action` at a station: here if beside it, else on its tile (visible, then remembered).
 * Bare hands need no station.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} station
 * @param {number} action
 * @param {import('./movement.js').Plan} plan
 * @returns {boolean} False if the station cannot be reached.
 */
function atStation(state, ctx, id, station, action, plan) {
  if (station === BARE_HANDS || besideStructure(state, ctx, id, station)) {
    startHere(ctx, id, action);
    plan.action = action;
    return true;
  }
  const nav = ctx.nav;
  const cell = nav.nearestStructure(station);
  if (cell >= 0 && moveTo(ctx, id, cell, action)) {
    plan.action = Action.MOVE;
    plan.x = nav.cellX(cell);
    plan.y = nav.cellY(cell);
    return true;
  }
  const subjects = ctx.subjectMasks[ctx.catalog.resourceCount + station];
  return goToRemembered(state, ctx, id, subjects, plan);
}

/**
 * Makes a recipe: at its station for an item, on a chosen building site for a structure.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} r - Recipe index.
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function useRecipe(state, ctx, id, r, plan) {
  const recipe = ctx.catalog.recipes[r];
  const nav = ctx.nav;
  ctx.agents.craftRecipe[id] = r;
  plan.note = PlanNote.PLAN;
  if (recipe.outputKind === 'structure') {
    const cell = chooseSite(ctx);
    if (cell === nav.center) {
      startHere(ctx, id, Action.CRAFT);
      plan.action = Action.CRAFT;
      return;
    }
    if (cell >= 0 && moveTo(ctx, id, cell, Action.CRAFT)) {
      plan.action = Action.MOVE;
      plan.x = nav.cellX(cell);
      plan.y = nav.cellY(cell);
      return;
    }
    explore(state, ctx, id, plan);
    return;
  }
  if (!atStation(state, ctx, id, recipe.station, Action.CRAFT, plan)) explore(state, ctx, id, plan);
}

/**
 * Building site (docs/design/06-ia.md, couche 3, simplified): a free reachable tile about two
 * tiles from the camp — the nearest structure in sight, else the nearest water — so that the
 * shelter, the workbench and the water end up together.
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {number} Window cell, or -1.
 */
export function chooseSite(ctx) {
  const nav = ctx.nav;
  const n = nav.side * nav.side;
  let anchor = -1;
  for (let i = 0; i < n; i++) {
    if (nav.structure[i] === 0 || !nav.reachable(i)) continue;
    if (anchor < 0 || nav.dist[i] < nav.dist[anchor]) anchor = i;
  }
  if (anchor < 0) anchor = nav.nearestWaterSide();
  if (anchor < 0) anchor = nav.center;
  const ax = nav.cellX(anchor);
  const ay = nav.cellY(anchor);
  const anchorFree = nav.structure[anchor] === 0;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < n; i++) {
    if (!nav.buildable(i)) continue;
    const d = Math.max(Math.abs(nav.cellX(i) - ax), Math.abs(nav.cellY(i) - ay));
    if (d === 0 && !anchorFree) continue;
    const score = Math.abs(d - 2) * 10 + nav.dist[i];
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Experimenting to discover how to make things (docs/design/04-fabrication.md): builds a station
 * it knows how to make but has not built (it opens new combinations), else chooses the most
 * promising untried combination among the materials it carries or knows where to find, fetches
 * what it lacks and tries it. When nothing is left to try, it explores to find new materials.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {string | null} wanted - Output kind sought ("item", "structure"), or null.
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function discover(state, ctx, id, wanted, plan) {
  const agents = ctx.agents;
  const catalog = ctx.catalog;
  const book = agents.recipes[id];
  const planner = fillBeliefs(ctx, id);
  for (let c = 1; c < planner.stations.length; c++) {
    const r = catalog.recipeForStructure[c];
    if (planner.stations[c] === 1 || r < 0 || !book.knows(r)) continue;
    if (catalog.structures[c - 1].kind !== 'station') continue;
    const result = planner.plan(ctx.structureTargets[c]);
    if (result.status !== PlanStatus.OK) continue;
    agents.lastPlan[id] = result;
    runStep(state, ctx, id, result.steps[0], plan);
    return;
  }
  const stations = ctx.trialStations;
  stations.fill(0);
  for (let c = 1; c < stations.length; c++) stations[c] = planner.stations[c];
  const fetch = fetchCosts(ctx, id);
  const cost = stationCosts(state, ctx, id, stations);
  const weights = ctx.balance.crafting.trial;
  const out = ctx.trialOut;
  const rng = agents.rng[id];
  const tick = state.tick;
  ctx.trialAgent = id;
  const acquired = ctx.acquired;
  const types = ctx.trialTypes;
  const found = chooseTrial(
    catalog,
    book,
    fetch,
    acquired,
    stations,
    cost,
    tick,
    weights,
    rng,
    types,
    wanted,
    out,
  );
  if (!found) {
    // Nothing left to try with known materials: look further for new ones.
    explore(state, ctx, id, plan, ctx.balance.ai.searchLeg);
    return;
  }
  agents.trialStation[id] = out[0];
  agents.trialMask[id] = out[1];
  plan.note = PlanNote.TRIAL;
  // Fetch the nearest missing ingredient first.
  let missing = 0;
  for (let m = out[1]; m !== 0; m &= m - 1) {
    const g = 31 - Math.clz32(m & -m);
    if (fetch[g] > 0 && (missing === 0 || fetch[g] < fetch[missing])) missing = g;
  }
  if (missing > 0) {
    gather(state, ctx, id, missing, ctx.balance.crafting.sampleUnits, plan);
    plan.note = PlanNote.TRIAL;
    return;
  }
  if (!atStation(state, ctx, id, out[0], Action.EXPERIMENT, plan)) explore(state, ctx, id, plan);
}

/**
 * Cost of having each material for a trial: 0 if carried, else the walk to its nearest known
 * place (in sight, else remembered), Infinity if out of reach or unknown.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {Float64Array}
 */
function fetchCosts(ctx, id) {
  const agents = ctx.agents;
  const catalog = ctx.catalog;
  const nav = ctx.nav;
  const memory = agents.memory[id];
  const c = ctx.balance.crafting;
  const x = agents.x[id];
  const y = agents.y[id];
  const fetch = ctx.fetchCost;
  fetch.fill(Infinity);
  for (let g = 1; g <= catalog.resourceCount; g++) {
    if (catalog.material[g] !== 1) continue;
    if (agents.carried(id, g) > 0) {
      fetch[g] = 0;
      continue;
    }
    if (!canHarvest(ctx, id, g)) continue;
    let distance = -1;
    const cell = nav.nearestResource(ctx.subjectMasks[g]);
    if (cell >= 0) {
      distance = nav.dist[cell];
    } else {
      const i = memory.nearest(ctx.subjectMasks[g], x, y);
      if (i >= 0) distance = Math.max(Math.abs(memory.x[i] - x), Math.abs(memory.y[i] - y));
    }
    if (distance >= 0) fetch[g] = c.fetchBase + (c.fetchWalk * distance) / c.sampleDistance;
  }
  return fetch;
}

/**
 * Walking cost of each usable station, as a trial score malus: 0 beside it (or bare hands), else
 * its distance (in sight, else remembered) scaled by `stationWalk` per `sampleDistance` tiles.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {Uint8Array} stations
 * @returns {Float64Array}
 */
function stationCosts(state, ctx, id, stations) {
  const cost = ctx.stationCost;
  const c = ctx.balance.crafting;
  const agents = ctx.agents;
  const memory = agents.memory[id];
  const x = agents.x[id];
  const y = agents.y[id];
  cost.fill(0);
  for (let s = 1; s < stations.length; s++) {
    if (stations[s] !== 1 || besideStructure(state, ctx, id, s)) continue;
    const cell = ctx.nav.nearestStructure(s);
    let d = cell >= 0 ? ctx.nav.dist[cell] : -1;
    if (d < 0) {
      const i = memory.nearest(ctx.subjectMasks[ctx.catalog.resourceCount + s], x, y);
      d = i < 0 ? 0 : Math.max(Math.abs(memory.x[i] - x), Math.abs(memory.y[i] - y));
    }
    cost[s] = (c.stationWalk * d) / c.sampleDistance;
  }
  return cost;
}
