import { PlanStatus, Step } from '../ai/planner.js';
import { BARE_HANDS, lowestIngredient, matchRecipe } from '../crafting/catalog.js';
import { chooseTrial } from '../crafting/experiment.js';
import { canHarvest } from './actions.js';
import { Action } from './action-types.js';
import { besideStructure } from './equipment.js';
import { PlanNote } from './journal.js';
import { WATER_SUBJECT } from './memory.js';
import { explore, goToRemembered, moveTo, search, startHere } from './movement.js';
import { atCamp, campOf } from '../colony/colony-logic.js';
import { goToCamp } from './colony-work.js';
import { houseDir, planHouse } from '../colony/house.js';
import { Expedition } from '../colony/colony-store.js';

/** No building site chosen yet. */
export const NO_SITE = -0x80000000;
/** Distance of a lone builder's house from what it anchors on. */
const HOUSE_DISTANCE = 4;

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
 * @param {boolean} [mayDiscover=true] - False when called by the discovery itself (no loop).
 * @returns {void}
 */
export function pursue(state, ctx, id, target, plan, mayDiscover = true) {
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
  if (!mayDiscover) {
    explore(state, ctx, id, plan);
    return;
  }
  // Looking for a structure or an item guides the trials.
  const wanted = target.structures.includes(1) ? 'structure' : familyOf(ctx, target);
  discover(state, ctx, id, wanted, plan);
}

/**
 * Family of the items a target accepts ("item:weapon"…), for the trial heuristic.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../ai/planner.js').PlanTarget} target
 * @returns {string | null}
 */
function familyOf(ctx, target) {
  for (const item of ctx.catalog.items)
    if (target.goods[item.good] === 1) return `item:${item.kind}`;
  return null;
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
export function useRecipe(state, ctx, id, r, plan) {
  const recipe = ctx.catalog.recipes[r];
  const nav = ctx.nav;
  ctx.agents.craftRecipe[id] = r;
  plan.note = PlanNote.PLAN;
  if (recipe.outputKind === 'structure' && ctx.shelterCodes[recipe.output] === 1) {
    buildHouse(state, ctx, id, recipe.output, plan);
    return;
  }
  if (recipe.outputKind === 'structure') {
    // A colony's station is built at its camp, where everyone sees and uses it.
    const def = ctx.catalog.structures[recipe.output - 1];
    const kind = def.kind;
    // A shipyard goes up on the shore, wherever the water is nearest.
    if (def.shore) {
      const site = shoreSite(ctx);
      if (site === nav.center) {
        startHere(ctx, id, Action.CRAFT);
        plan.action = Action.CRAFT;
      } else if (site >= 0 && moveTo(ctx, id, site, Action.CRAFT)) {
        plan.action = Action.MOVE;
        plan.x = nav.cellX(site);
        plan.y = nav.cellY(site);
      } else {
        search(state, ctx, id, WATER_SUBJECT, plan);
      }
      return;
    }
    if (kind === 'station' || kind === 'treasury') {
      const colony = campOf(state, ctx, id);
      if (colony && !atCamp(ctx, colony, id) && goToCamp(ctx, colony, id, Action.NONE, plan))
        return;
    }
    const cell = chooseSite(ctx, null, kind === 'station' ? recipe.output : 0);
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
 * Cheapest reachable free tile beside water (nothing built, nothing growing), or -1.
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {number}
 */
function shoreSite(ctx) {
  const nav = ctx.nav;
  let best = -1;
  const n = nav.side * nav.side;
  for (let i = 0; i < n; i++) {
    if (!nav.reachable(i) || nav.structure[i] !== 0 || nav.resource[i] !== 0) continue;
    if (best >= 0 && nav.dist[i] >= nav.dist[best]) continue;
    if (nav.besideWater(i)) best = i;
  }
  return best;
}

/**
 * Builds a house (docs/design/03-individu.md, « Abri »): a colony member on the site of the
 * colony's town plan (near the camp, inside its enclosure if it has one); anyone else on a site
 * in sight, about three tiles from what it has built or from water. The builder stands on the
 * door tile.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} code - Kind of house.
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function buildHouse(state, ctx, id, code, plan) {
  const a = ctx.agents;
  const nav = ctx.nav;
  let colony = campOf(state, ctx, id);
  // On an expedition, the first house of the new colony goes up on the site, as it sees it.
  if (colony !== null && colony.expState === Expedition.TRAVELLING && colony.inExpedition(id)) {
    colony = null;
  }
  if (colony === null) {
    const cell = chooseSite(ctx, state);
    if (cell === nav.center) {
      startHere(ctx, id, Action.CRAFT);
      plan.action = Action.CRAFT;
    } else if (cell >= 0 && moveTo(ctx, id, cell, Action.CRAFT)) {
      plan.action = Action.MOVE;
      plan.x = nav.cellX(cell);
      plan.y = nav.cellY(cell);
    } else {
      explore(state, ctx, id, plan);
    }
    return;
  }
  // The site it was given, while it still fits; else the next one on the plan.
  const range =
    colony.encState !== 0 ? ctx.balance.colony.suburbRange : ctx.balance.colony.houseRange;
  const far =
    Math.max(Math.abs(a.siteX[id] - colony.campX), Math.abs(a.siteY[id] - colony.campY)) > range;
  if (far || houseDir(state, ctx, a.siteX[id], a.siteY[id], colony, code) < 0) {
    const out = ctx.siteOut;
    if (!planHouse(state, ctx, colony, out, code)) {
      explore(state, ctx, id, plan);
      return;
    }
    a.siteX[id] = out[0];
    a.siteY[id] = out[1];
  }
  const x = a.siteX[id];
  const y = a.siteY[id];
  if (a.x[id] === x && a.y[id] === y) {
    startHere(ctx, id, Action.CRAFT);
    plan.action = Action.CRAFT;
    return;
  }
  const cell = nav.cellAt(x, y);
  const onto = cell >= 0 && nav.reachable(cell);
  const step = onto ? cell : nav.toward(x, y);
  if (step >= 0 && moveTo(ctx, id, step, onto ? Action.CRAFT : Action.NONE)) {
    plan.action = Action.MOVE;
    plan.x = x;
    plan.y = y;
    return;
  }
  // No way there from here: another site next time.
  a.siteX[id] = NO_SITE;
  explore(state, ctx, id, plan);
}

/**
 * Building site (docs/design/06-ia.md, couche 3, simplified): a free reachable tile about two
 * tiles from the camp — the nearest structure in sight, else the nearest water — so that the
 * shelter, the workbench and the water end up together. With `state`, a door tile where a house
 * fits.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../simulation.js').SimState | null} [state=null] - Given for a house.
 * @param {number} [kin=0] - A station's code: its site goes beside one of its kind if in sight.
 * @returns {number} Window cell, or -1.
 */
export function chooseSite(ctx, state = null, kin = 0) {
  const nav = ctx.nav;
  const n = nav.side * nav.side;
  let anchor = -1;
  // A station goes beside one of its kind when one is in sight: the quarter grows (decision 0029).
  if (kin > 0) {
    for (let i = 0; i < n; i++) {
      if (nav.structure[i] !== kin || !nav.reachable(i)) continue;
      if (anchor < 0 || nav.dist[i] < nav.dist[anchor]) anchor = i;
    }
  }
  if (anchor < 0) {
    for (let i = 0; i < n; i++) {
      if (nav.structure[i] === 0 || !nav.reachable(i)) continue;
      if (anchor < 0 || nav.dist[i] < nav.dist[anchor]) anchor = i;
    }
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
    // A house keeps a little farther, its walls clear of the rest.
    const score = Math.abs(d - (state === null ? 2 : HOUSE_DISTANCE)) * 10 + nav.dist[i];
    if (score >= bestScore) continue;
    if (state !== null && houseDir(state, ctx, nav.cellX(i), nav.cellY(i), null) < 0) continue;
    bestScore = score;
    best = i;
  }
  return best;
}

/**
 * True if the agent searches for the colony (its inventor or a cook): it keeps the colony's trial
 * notebook.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean}
 */
export function researcher(state, ctx, id) {
  const c = ctx.agents.colony[id];
  if (c < 0) return false;
  const colony = state.colonies[c];
  return colony.inventor === id || colony.cooks.includes(id);
}

/**
 * Experimenting to discover how to make things (docs/design/04-fabrication.md): builds a station
 * it knows how to make but has not built (it opens new combinations), else chooses the most
 * promising untried combination among the materials it carries or knows where to find, fetches
 * what it lacks and tries it. When nothing is left to try, it explores to find new materials.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {string | null} wanted - Family sought ("structure", "item:weapon"…), or null.
 * @param {import('./movement.js').Plan} plan
 * @param {number} [focus=0] - Only combinations with this good (what can be done with it?).
 * @param {number} [focusStation=0] - Only trials at this station (what is it for?).
 * @returns {void}
 */
export function discover(state, ctx, id, wanted, plan, focus = 0, focusStation = 0) {
  const agents = ctx.agents;
  const catalog = ctx.catalog;
  const book = agents.recipes[id];
  const planner = fillBeliefs(ctx, id);
  // A station opens new item recipes: one it knows how to make is built when trying freely, or when
  // looking for an item without any station at hand (structures are made bare-handed: a station
  // does not help to find one).
  let anyStation = false;
  for (let c = 1; c < planner.stations.length; c++) {
    if (planner.stations[c] === 1 && catalog.structures[c - 1].kind === 'station')
      anyStation = true;
  }
  const buildOne = wanted === null || (wanted !== 'structure' && !anyStation);
  for (let c = 1; c < planner.stations.length && buildOne; c++) {
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
  // Only real stations transform things (not shelters nor libraries).
  for (let c = 1; c < stations.length; c++) {
    stations[c] = catalog.structures[c - 1].kind === 'station' ? planner.stations[c] : 0;
  }
  // Free invention also looks for by-products (seeds in grain) it has never held.
  const fetch = fetchCosts(ctx, id, wanted === null);
  const cost = stationCosts(state, ctx, id, stations);
  const weights = ctx.balance.crafting.trial;
  const out = ctx.trialOut;
  const rng = agents.rng[id];
  const tick = state.tick;
  ctx.trialAgent = id;
  const acquired = ctx.acquired;
  const types = ctx.trialTypes;
  // An idea it had turned out known by now (it learnt it otherwise), or left untried for days
  // (what it needs is out of reach): forgotten.
  if (agents.ideaStation[id] >= 0) {
    const r = matchRecipe(catalog, agents.ideaStation[id], agents.ideaMask[id]);
    const stale =
      state.tick - agents.ideaTick[id] >
      ctx.balance.crafting.ideaDays * ctx.balance.time.ticksPerDay;
    if (r < 0 || book.knows(r) || stale) {
      agents.ideaStation[id] = -1;
      agents.ideaMask[id] = 0;
    }
  }
  // The colony's researchers (its inventor, its cooks) keep a notebook of the trials that failed.
  const notebook = researcher(state, ctx, id) ? state.colonies[agents.colony[id]].notebook : null;
  let found = chooseTrial(
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
    agents.hint[id],
    focus,
    focusStation,
    notebook,
    agents.ideaStation[id],
    agents.ideaMask[id],
  );
  // Each material tried alone at the station of unknown use: back to trying freely.
  if (!found && focusStation > 0) {
    found = chooseTrial(
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
      agents.hint[id],
      focus,
      0,
      notebook,
      agents.ideaStation[id],
      agents.ideaMask[id],
    );
  }
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
    const g = lowestIngredient(catalog, m);
    if (fetch[g] > 0 && (missing === 0 || fetch[g] < fetch[missing])) missing = g;
  }
  if (missing > 0) {
    // A researcher also asks the counter for it: the price rises and those who gather it bring it.
    if (notebook !== null && missing <= catalog.resourceCount) {
      const colony = state.colonies[agents.colony[id]];
      const want = 2 * ctx.balance.crafting.sampleUnits;
      if (colony.demand[missing] < want) colony.demand[missing] = want;
    }
    // A crafted material (paper, ink) is made with its known recipe; a resource is gathered.
    const source = ctx.sourceOf[missing];
    const known = catalog.recipeForGood[missing] >= 0 && book.knows(catalog.recipeForGood[missing]);
    if (missing > catalog.resourceCount && !known && source > 0) {
      // The by-product comes with fresh harvest: grain already carried is laid aside.
      const sample = ctx.balance.crafting.sampleUnits;
      if (agents.carried(id, source) >= sample)
        agents.addCarried(id, source, -agents.carried(id, source));
      gather(state, ctx, id, source, sample, plan);
    } else if (missing > catalog.resourceCount) {
      pursue(state, ctx, id, ctx.goodTargets[missing], plan, false);
    } else gather(state, ctx, id, missing, ctx.balance.crafting.sampleUnits, plan);
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
 * @param {boolean} byProducts - Count by-products as fetchable through their source.
 * @returns {Float64Array}
 */
function fetchCosts(ctx, id, byProducts) {
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
    if (catalog.ingredientBit[g] < 0) continue;
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
  // Crafted materials: carried, or made with a recipe it knows, or found while gathering their
  // source (seeds in grain, a hide in a carcass).
  const book = agents.recipes[id];
  for (let g = catalog.resourceCount + 1; g < catalog.goodCount; g++) {
    if (catalog.ingredientBit[g] < 0) continue;
    const source = ctx.sourceOf[g];
    if (agents.carried(id, g) > 0) fetch[g] = 0;
    else if (catalog.recipeForGood[g] >= 0 && book.knows(catalog.recipeForGood[g])) {
      fetch[g] = c.fetchBase + c.fetchCraft;
    } else if (byProducts && source > 0 && fetch[source] < Infinity) {
      fetch[g] = fetch[source] + c.fetchBase;
    }
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
