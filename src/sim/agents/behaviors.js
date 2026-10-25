import { Action } from './action-types.js';
import { PlanNote } from './journal.js';
import { WATER_SUBJECT } from './memory.js';
import { inShelter } from './equipment.js';
import { explore, goToRemembered, moveTo, search, startHere } from './movement.js';
import { perceive } from './perception.js';
import { discover, pursue } from './work.js';
import { atCamp, campOf, shareBoard } from '../colony/colony-logic.js';
import { colonyWork, goToCamp, prepareReplication } from './colony-work.js';
import { readBehaviour, writeBehaviour } from './scribe-work.js';

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
  if (colony && atCamp(ctx, colony, id)) shareBoard(state, ctx, colony, id);
  for (let g = 1; g <= catalog.resourceCount; g++) {
    const tool = catalog.requiredTool[g];
    if (tool <= 0 || a.carried(id, tool) > 0) continue;
    const r = catalog.recipeForGood[tool];
    if (r < 0 || !a.recipes[id].knows(r)) continue;
    pursue(state, ctx, id, ctx.goodTargets[tool], plan);
    plan.note = PlanNote.TRIAL;
    return;
  }
  // Part of the time it goes looking for materials it has never seen; the rest, it experiments.
  if (a.rng[id].next() < ctx.balance.colony.inventorExplore) explore(state, ctx, id, plan);
  else discover(state, ctx, id, null, plan);
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {boolean} True if the agent carries something edible.
 */
function carriesFood(ctx, id) {
  for (let r = 1; r < ctx.edible.length; r++) {
    if (ctx.edible[r] === 1 && ctx.agents.carried(id, r) > 0) return true;
  }
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
    case 'explore': {
      // The colony's inventor spends its curiosity trying new combinations instead.
      const colony = campOf(state, ctx, id);
      if (colony && colony.inventor === id) invent(state, ctx, id, plan);
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
  // Home: the nearest shelter of its colony, which a member never forgets.
  const colony = campOf(state, ctx, id);
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
