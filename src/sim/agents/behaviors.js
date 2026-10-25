import { Action } from './action-types.js';
import { PlanNote } from './journal.js';
import { WATER_SUBJECT } from './memory.js';
import { inShelter } from './equipment.js';
import { explore, goToRemembered, moveTo, search, startHere } from './movement.js';
import { perceive } from './perception.js';
import { discover, fillBeliefs, pursue } from './work.js';
import { atCamp, campOf, shareBoard } from '../colony/colony-logic.js';
import { colonyWork, goToCamp, prepareReplication } from './colony-work.js';
import { readBehaviour, writeBehaviour } from './scribe-work.js';
import { guardBehaviour, hideBehaviour, huntBehaviour } from './guard-work.js';
import { farmBehaviour } from './farm-work.js';
import { cookBehaviour } from './cook-work.js';
import { migrateBehaviour } from './migrate-work.js';
import { tradeBehaviour } from './trade-work.js';
import { Expedition } from '../colony/colony-store.js';
import { take } from '../economy/market.js';
import { canHarvest } from './actions.js';

// Turns a chosen goal into a concrete action, using only what the agent perceives and remembers.
// Survival goals are hand-written; crafting goals follow the GOAP planner (work.js).

/**
 * The inventor first makes the tools it knows how to make that open materials (a pickaxe for coal
 * or copper); then it tries combinations freely.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function invent(state, ctx, id, plan) {
  const a = ctx.agents;
  const catalog = ctx.catalog;
  // At the camp, it looks on the blackboard for materials it knows no place of.
  const colony = campOf(state, ctx, id);
  if (colony && atCamp(ctx, colony, id)) {
    shareBoard(state, ctx, colony, id);
    takeSamples(state, ctx, colony, id);
  }
  for (let g = 1; g <= catalog.resourceCount; g++) {
    const tool = catalog.requiredTool[g];
    if (tool <= 0 || a.carried(id, tool) > 0) continue;
    const r = catalog.recipeForGood[tool];
    if (r < 0 || !a.recipes[id].knows(r)) continue;
    pursue(state, ctx, id, ctx.goodTargets[tool], plan);
    plan.note = PlanNote.TRIAL;
    return;
  }
  // Part of the time it goes looking for materials it has never seen; the rest, it experiments:
  // each material alone at a station it never saw used (a new oven); else, half of the time, what
  // can be done with a material no recipe it knows uses (a brick: alone, then with one other…),
  // and freely otherwise.
  const cfg = ctx.balance.colony;
  if (a.rng[id].next() < cfg.inventorExplore) {
    explore(state, ctx, id, plan);
    return;
  }
  const station = unusedStation(ctx, id);
  const focus = station === 0 && a.rng[id].next() < cfg.inventorFocus ? unusedMaterial(ctx, id) : 0;
  discover(state, ctx, id, null, plan, focus, station);
}

/**
 * The material the agent can most easily have (carried, made with a recipe it knows, else the
 * nearest place it remembers) that no recipe it knows uses, or 0.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number} Good id.
 */
function unusedMaterial(ctx, id) {
  const a = ctx.agents;
  const catalog = ctx.catalog;
  const book = a.recipes[id];
  const memory = a.memory[id];
  let used = 0;
  for (let r = 0; r < catalog.recipes.length; r++)
    if (book.knows(r)) used |= catalog.recipes[r].mask;
  let best = 0;
  let bestCost = Infinity;
  for (let g = 1; g < catalog.goodCount; g++) {
    const bit = catalog.ingredientBit[g];
    if (catalog.material[g] !== 1 || bit < 0 || (used & (1 << bit)) !== 0) continue;
    let cost = Infinity;
    if (a.carried(id, g) > 0) cost = 0;
    else if (g > catalog.resourceCount) {
      const r = catalog.recipeForGood[g];
      if (r >= 0 && book.knows(r)) cost = 1;
    } else if (canHarvest(ctx, id, g)) {
      const i = memory.nearest(ctx.subjectMasks[g], a.x[id], a.y[id]);
      if (i >= 0)
        cost = 2 + Math.max(Math.abs(memory.x[i] - a.x[id]), Math.abs(memory.y[i] - a.y[id])) / 16;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = g;
    }
  }
  return best;
}

/**
 * At the camp, the inventor takes from the stock (what no building project waits for) what a station it knows how to make but has not
 * seen built needs (the colony's materials, for the colony's station), and a few units of each
 * material it lacks: what it tries next is then at hand.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @returns {void}
 */
function takeSamples(state, ctx, colony, id) {
  const a = ctx.agents;
  const catalog = ctx.catalog;
  const room = () => Math.floor(ctx.capacity(id) - a.carriedTotal(id));
  const takeUpTo = (g, units) => {
    const n = Math.min(units - a.carried(id, g), colony.freeStock(g), room());
    if (n <= 0) return;
    take(colony, g, n);
    a.addCarried(id, g, n, state.tick);
  };
  // What a recipe needs, from the stock; what the stock lacks and it can make, its ingredients.
  const gatherFor = (r, times, depth) => {
    for (const input of catalog.recipes[r].inputs) {
      const want = input.count * times;
      takeUpTo(input.good, want);
      const short = want - a.carried(id, input.good);
      const sub = catalog.recipeForGood[input.good];
      if (short > 0 && depth > 0 && sub >= 0 && a.recipes[id].knows(sub)) {
        gatherFor(sub, short, depth - 1);
      }
    }
  };
  const stations = fillBeliefs(ctx, id).stations;
  for (let c = 1; c < stations.length; c++) {
    const r = catalog.recipeForStructure[c];
    if (stations[c] === 1 || r < 0 || catalog.structures[c - 1].kind !== 'station') continue;
    if (a.recipes[id].knows(r)) gatherFor(r, 1, 2);
  }
  const want = ctx.balance.colony.inventorSample;
  for (let g = 1; g < catalog.goodCount; g++) {
    if (catalog.material[g] === 1 && a.carried(id, g) === 0) takeUpTo(g, want);
  }
}

/**
 * A station the agent remembers (or sees) and that it never saw used: it knows no recipe made
 * there, and saw nobody make one there (a new oven), or 0.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {number} Structure code.
 */
function unusedStation(ctx, id) {
  const catalog = ctx.catalog;
  const book = ctx.agents.recipes[id];
  const memory = ctx.agents.memory[id];
  const social = ctx.agents.social[id];
  let seen = 0;
  for (let k = 0; k < social.count; k++) seen |= social.skills[k];
  const R = catalog.resourceCount;
  for (let code = 1; code <= catalog.structures.length; code++) {
    if (catalog.structures[code - 1].kind !== 'station') continue;
    let used = false;
    for (let r = 0; r < catalog.recipes.length && !used; r++) {
      if (catalog.recipes[r].station !== code) continue;
      used = book.knows(r) || (seen & (1 << r)) !== 0;
    }
    if (used) continue;
    if (ctx.nav.nearestStructure(code) >= 0) return code;
    for (let i = 0; i < memory.count; i++) if (memory.subject[i] === R + code) return code;
  }
  return 0;
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if the agent carries something edible.
 */
function carriesFood(ctx, id) {
  const order = ctx.foodTables.order;
  for (let k = 0; k < order.length; k++) if (ctx.agents.carried(id, order[k]) > 0) return true;
  return false;
}

/**
 * Chooses and starts the action that serves `goal`. Fills `plan` for the journal.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} goal - Goal index.
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function planGoal(state, ctx, id, goal, plan) {
  const agents = ctx.agents;
  const nav = ctx.nav;
  plan.action = Action.IDLE;
  plan.x = agents.x[id];
  plan.y = agents.y[id];
  plan.note = PlanNote.HERE;
  agents.asleep[id] = 0;
  agents.lastPlan[id] = null;
  perceive(state, ctx, id);
  // The exploration heading is kept across goals: a thirsty agent searching for water keeps
  // walking the same way instead of turning at every replan.
  const kind = ctx.goalKinds[goal];

  switch (kind) {
    case 'drink': {
      if (nav.besideWater(nav.center)) {
        startHere(ctx, id, Action.DRINK);
        plan.action = Action.DRINK;
        return;
      }
      const cell = nav.nearestWaterSide();
      if (cell >= 0 && moveTo(ctx, id, cell, Action.DRINK)) {
        plan.action = Action.MOVE;
        plan.x = nav.cellX(cell);
        plan.y = nav.cellY(cell);
        plan.note = PlanNote.SEEN;
        return;
      }
      if (goToRemembered(state, ctx, id, ctx.waterSubjects, plan)) return;
      search(state, ctx, id, WATER_SUBJECT, plan);
      return;
    }
    case 'eat':
      eatBehaviour(state, ctx, id, plan);
      return;
    case 'sleep':
      goToSleep(state, ctx, id, plan);
      return;
    case 'flee':
      flee(state, ctx, id, plan);
      return;
    case 'colony':
      colonyWork(state, ctx, id, plan);
      return;
    case 'replicate':
      prepareReplication(state, ctx, id, plan, eatBehaviour);
      return;
    case 'write':
      writeBehaviour(state, ctx, id, plan);
      return;
    case 'read':
      readBehaviour(state, ctx, id, plan);
      return;
    case 'hide':
      hideBehaviour(state, ctx, id, plan);
      return;
    case 'guard':
      guardBehaviour(state, ctx, id, plan);
      return;
    case 'hunt':
      huntBehaviour(state, ctx, id, plan);
      return;
    case 'farm':
      farmBehaviour(state, ctx, id, plan);
      return;
    case 'cook':
      cookBehaviour(state, ctx, id, plan);
      return;
    case 'invent':
      invent(state, ctx, id, plan);
      return;
    case 'migrate':
      migrateBehaviour(state, ctx, id, plan);
      return;
    case 'trade':
      tradeBehaviour(state, ctx, id, plan);
      return;
    case 'explore': {
      // The colony's inventor spends its curiosity trying new combinations instead.
      const colony = campOf(state, ctx, id);
      const hint = agents.hint[id];
      if (colony && colony.inventor === id) invent(state, ctx, id, plan);
      // A guess to check (a seed it found): it tries it.
      else if (hint > 0 && agents.carried(id, hint) > 0) discover(state, ctx, id, null, plan);
      else explore(state, ctx, id, plan);
      return;
    }
    default: {
      const target = ctx.targets[goal];
      if (target) pursue(state, ctx, id, target, plan);
      else startHere(ctx, id, Action.IDLE);
    }
  }
}

/**
 * Eating: what it carries, else food in sight, else the colony's pantry if it believes there is
 * some and the camp is not far, else a remembered place, else searching.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function eatBehaviour(state, ctx, id, plan) {
  const nav = ctx.nav;
  const agents = ctx.agents;
  if (carriesFood(ctx, id)) {
    startHere(ctx, id, Action.EAT);
    plan.action = Action.EAT;
    plan.note = PlanNote.CARRIED;
    return;
  }
  const cell = nav.nearestResource(ctx.edible);
  if (cell === nav.center) {
    startHere(ctx, id, Action.FORAGE);
    plan.action = Action.FORAGE;
    return;
  }
  if (cell >= 0 && moveTo(ctx, id, cell, Action.FORAGE)) {
    plan.action = Action.MOVE;
    plan.x = nav.cellX(cell);
    plan.y = nav.cellY(cell);
    plan.note = PlanNote.SEEN;
    return;
  }
  const colony = campOf(state, ctx, id);
  if (colony && agents.pantrySeen[id] > 0) {
    const range = ctx.balance.ai.shelterRange;
    const far = Math.max(
      Math.abs(colony.campX - agents.x[id]),
      Math.abs(colony.campY - agents.y[id]),
    );
    if (far <= range && goToCamp(ctx, colony, id, Action.TAKE, plan)) {
      plan.note = PlanNote.PANTRY;
      return;
    }
  }
  if (goToRemembered(state, ctx, id, ctx.edible, plan)) return;
  search(state, ctx, id, ctx.firstEdible, plan);
}

/**
 * Cheapest reachable shelter tile in sight, or -1.
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {number}
 */
function shelterInSight(ctx) {
  let best = -1;
  for (let code = 1; code < ctx.shelterCodes.length; code++) {
    if (ctx.shelterCodes[code] !== 1) continue;
    const cell = ctx.nav.nearestStructure(code);
    if (cell >= 0 && (best < 0 || ctx.nav.dist[cell] < ctx.nav.dist[best])) best = cell;
  }
  return best;
}

/**
 * Sleeps in its shelter when it has one not too far, else where it stands. Exhaustion does not
 * wait: the body falls asleep on the spot.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function goToSleep(state, ctx, id, plan) {
  const agents = ctx.agents;
  plan.action = Action.SLEEP;
  const here = inShelter(state, ctx, agents.x[id], agents.y[id]);
  if (here || agents.fatigue[id] >= ctx.balance.needs.critical) {
    if (here) plan.note = PlanNote.SHELTER;
    startHere(ctx, id, Action.SLEEP);
    return;
  }
  const cell = shelterInSight(ctx);
  if (cell >= 0 && moveTo(ctx, id, cell, Action.SLEEP)) {
    plan.action = Action.MOVE;
    plan.x = ctx.nav.cellX(cell);
    plan.y = ctx.nav.cellY(cell);
    plan.note = PlanNote.SHELTER;
    return;
  }
  // Home: the nearest shelter of its colony, which a member never forgets (not on an expedition).
  const colony = campOf(state, ctx, id);
  const away =
    colony !== null &&
    (colony.scout === id ||
      agents.caravanTo[id] >= 0 ||
      (colony.expState === Expedition.TRAVELLING && colony.inExpedition(id)));
  if (away) {
    startHere(ctx, id, Action.SLEEP);
    return;
  }
  if (colony && colony.shelterCount > 0 && goHome(ctx, colony, id, plan)) return;
  const memory = agents.memory[id];
  const i = memory.nearest(ctx.shelterSubjects, agents.x[id], agents.y[id]);
  const range = ctx.balance.ai.shelterRange;
  const dx = i < 0 ? Infinity : Math.abs(memory.x[i] - agents.x[id]);
  const dy = i < 0 ? Infinity : Math.abs(memory.y[i] - agents.y[id]);
  if (Math.max(dx, dy) <= range && goToRemembered(state, ctx, id, ctx.shelterSubjects, plan)) {
    plan.note = PlanNote.SHELTER;
    return;
  }
  startHere(ctx, id, Action.SLEEP);
}

/**
 * Heads for the nearest shelter of the colony, if within `homeRange`, to sleep there.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {boolean}
 */
function goHome(ctx, colony, id, plan) {
  const a = ctx.agents;
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < colony.shelterCount; k++) {
    const d = Math.max(
      Math.abs(colony.shelterX[k] - a.x[id]),
      Math.abs(colony.shelterY[k] - a.y[id]),
    );
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  if (best < 0 || bestD > ctx.balance.colony.homeRange) return false;
  const cell = ctx.nav.toward(colony.shelterX[best], colony.shelterY[best]);
  if (cell < 0 || !moveTo(ctx, id, cell, bestD <= ctx.nav.radius ? Action.SLEEP : Action.NONE)) {
    return false;
  }
  plan.action = Action.MOVE;
  plan.x = colony.shelterX[best];
  plan.y = colony.shelterY[best];
  plan.note = PlanNote.SHELTER;
  return true;
}

/**
 * Runs from the nearest predator in sight: into a shelter in sight if there is one, else to the
 * reachable tile that puts the most distance between them for the least walking.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function flee(state, ctx, id, plan) {
  const agents = ctx.agents;
  const nav = ctx.nav;
  plan.note = PlanNote.FLEEING;
  if (inShelter(state, ctx, agents.x[id], agents.y[id])) {
    startHere(ctx, id, Action.IDLE);
    plan.note = PlanNote.SHELTER;
    return;
  }
  const threats = state.threats;
  const p = threats.nearest(agents.x[id], agents.y[id], nav.radius);
  if (p < 0) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  let cell = shelterInSight(ctx);
  if (cell < 0) {
    const px = threats.x[p];
    const py = threats.y[p];
    let bestScore = -Infinity;
    const n = nav.side * nav.side;
    for (let i = 0; i < n; i++) {
      if (!nav.reachable(i) || i === nav.center) continue;
      const d = Math.max(Math.abs(nav.cellX(i) - px), Math.abs(nav.cellY(i) - py));
      const score = 2 * d - 0.5 * nav.dist[i];
      if (score > bestScore) {
        bestScore = score;
        cell = i;
      }
    }
  }
  if (cell >= 0 && moveTo(ctx, id, cell, Action.NONE)) {
    plan.action = Action.MOVE;
    plan.x = nav.cellX(cell);
    plan.y = nav.cellY(cell);
    return;
  }
  startHere(ctx, id, Action.IDLE);
}
