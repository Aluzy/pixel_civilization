import { Action, Place } from './action-types.js';
import { PlanNote } from './journal.js';
import { perceive } from './perception.js';
import { forgetPlace, nearestPlace, placeX, placeY } from './places.js';

// Turns a chosen goal into a concrete action, using only what the agent perceives and remembers.
// Hand-written per goal in J2; the GOAP planner (J4) generalises this.

const DIRS_X = Int8Array.from([1, 1, 0, -1, -1, -1, 0, 1]);
const DIRS_Y = Int8Array.from([0, 1, 1, 1, 0, -1, -1, -1]);
const EXPLORE_ATTEMPTS = 4;
/** An exploration target closer than this (Chebyshev, tiles) counts as reached. */
const EXPLORE_REACHED = 2;

/**
 * Result of planning, also written to the journal.
 * @typedef {object} Plan
 * @property {number} action
 * @property {number} x - Target x (or the agent's position).
 * @property {number} y
 * @property {number} note - {@link PlanNote}.
 */

/**
 * Starts moving along a path towards `cell`, then `then`.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} cell - Reachable cell of the navigation window.
 * @param {number} then - Action to start on arrival.
 * @returns {boolean} False if the agent is already there.
 */
function moveTo(ctx, id, cell, then) {
  const agents = ctx.agents;
  const steps = ctx.nav.writePath(cell, agents.path[id]);
  if (steps === 0) return false;
  agents.pathLength[id] = steps;
  agents.pathIndex[id] = 0;
  agents.action[id] = Action.MOVE;
  agents.thenAction[id] = then;
  agents.actionX[id] = ctx.nav.cellX(cell);
  agents.actionY[id] = ctx.nav.cellY(cell);
  agents.actionProgress[id] = 0;
  return true;
}

/**
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} action
 * @returns {void}
 */
function startHere(ctx, id, action) {
  const agents = ctx.agents;
  agents.action[id] = action;
  agents.thenAction[id] = Action.NONE;
  agents.actionX[id] = agents.x[id];
  agents.actionY[id] = agents.y[id];
  agents.actionProgress[id] = 0;
}

/**
 * Heads for a remembered place of `kind`. Forgets places that cannot be approached.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} kind
 * @param {Plan} plan
 * @returns {boolean}
 */
function goToRemembered(ctx, id, kind, plan) {
  for (;;) {
    const slot = nearestPlace(ctx.agents, id, kind);
    if (slot < 0) return false;
    const tx = placeX(ctx.agents, id, kind, slot);
    const ty = placeY(ctx.agents, id, kind, slot);
    const cell = ctx.nav.toward(tx, ty);
    if (cell >= 0 && moveTo(ctx, id, cell, Action.NONE)) {
      plan.action = Action.MOVE;
      plan.x = tx;
      plan.y = ty;
      plan.note = PlanNote.REMEMBERED;
      return true;
    }
    // No way to get closer from here: the belief is useless, drop it.
    forgetPlace(ctx.agents, id, kind, slot);
  }
}

/**
 * Walks towards the current exploration target, choosing a new random heading when needed.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {Plan} plan
 * @returns {boolean}
 */
function explore(state, ctx, id, plan) {
  const agents = ctx.agents;
  const rng = agents.rng[id];
  const [legMin, legMax] = ctx.balance.ai.exploreLeg;
  for (let attempt = 0; attempt <= EXPLORE_ATTEMPTS; attempt++) {
    const gapX = Math.abs(agents.exploreX[id] - agents.x[id]);
    const gapY = Math.abs(agents.exploreY[id] - agents.y[id]);
    const reached = Math.max(gapX, gapY) <= EXPLORE_REACHED;
    if (agents.exploring[id] !== 1 || reached || attempt > 0) {
      const d = rng.int(0, 7);
      const leg = rng.int(legMin, legMax);
      agents.exploreX[id] = agents.x[id] + DIRS_X[d] * leg;
      agents.exploreY[id] = agents.y[id] + DIRS_Y[d] * leg;
      agents.exploring[id] = 1;
    }
    const cell = ctx.nav.toward(agents.exploreX[id], agents.exploreY[id]);
    if (cell >= 0 && moveTo(ctx, id, cell, Action.NONE)) {
      plan.action = Action.MOVE;
      plan.x = agents.exploreX[id];
      plan.y = agents.exploreY[id];
      plan.note = PlanNote.SEARCHING;
      return true;
    }
  }
  agents.exploring[id] = 0;
  startHere(ctx, id, Action.IDLE);
  plan.action = Action.IDLE;
  return false;
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
 * @param {Plan} plan
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
      if (goToRemembered(ctx, id, Place.WATER, plan)) return;
      explore(state, ctx, id, plan);
      return;
    }
    case 'eat': {
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
      if (goToRemembered(ctx, id, Place.FOOD, plan)) return;
      explore(state, ctx, id, plan);
      return;
    }
    case 'sleep':
      startHere(ctx, id, Action.SLEEP);
      plan.action = Action.SLEEP;
      return;
    case 'explore':
      explore(state, ctx, id, plan);
      return;
    default:
      startHere(ctx, id, Action.IDLE);
  }
}
