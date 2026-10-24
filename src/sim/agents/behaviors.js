import { EventType } from '../core/events.js';
import { Action } from './action-types.js';
import { memoryEvent, recall } from './beliefs.js';
import { PlanNote } from './journal.js';
import { WATER_SUBJECT } from './memory.js';
import { perceive } from './perception.js';

// Turns a chosen goal into a concrete action, using only what the agent perceives and remembers.
// Hand-written per goal in J2; the GOAP planner (J4) generalises this.

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
 * Heads for the nearest remembered place whose subject is flagged in `subjects`, as the agent
 * recalls it (weak memories are blurred). Drops places that cannot be approached from here, and
 * forgets those it cannot find where it believed they were.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {Uint8Array} subjects
 * @param {Plan} plan
 * @returns {boolean}
 */
function goToRemembered(state, ctx, id, subjects, plan) {
  const agents = ctx.agents;
  const memory = agents.memory[id];
  const target = ctx.recallTarget;
  for (;;) {
    const i = memory.nearest(subjects, agents.x[id], agents.y[id]);
    if (i < 0) return false;
    recall(ctx, id, i, state.tick, target);
    const tx = target[0];
    const ty = target[1];
    const gap = Math.max(Math.abs(tx - agents.x[id]), Math.abs(ty - agents.y[id]));
    if (gap <= EXPLORE_REACHED) {
      // Standing where it believed the place was, and it is not in sight: the memory failed.
      memoryEvent(state, ctx, id, EventType.NOT_FOUND, tx, ty, memory.subject[i]);
      memory.forget(i, state.tick);
      continue;
    }
    const cell = ctx.nav.toward(tx, ty);
    if (cell >= 0 && moveTo(ctx, id, cell, Action.NONE)) {
      plan.action = Action.MOVE;
      plan.x = tx;
      plan.y = ty;
      plan.note = PlanNote.REMEMBERED;
      return true;
    }
    // No way to get closer from here: the belief is useless, drop it.
    memory.remove(i);
  }
}

/**
 * Nothing known for this need: report the search (once in a while) and explore.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} subject - Representative subject of the need (water, or a food).
 * @param {Plan} plan
 * @returns {void}
 */
function search(state, ctx, id, subject, plan) {
  const a = ctx.agents;
  memoryEvent(state, ctx, id, EventType.SEARCHING, a.x[id], a.y[id], subject);
  explore(state, ctx, id, plan, ctx.balance.ai.searchLeg);
}

/**
 * Walks towards the current exploration target. A new target is chosen, when needed, on the
 * frontier of the agent's own exploration map: the least known direction, at a random distance.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {Plan} plan
 * @param {number[]} [legRange] - Distance range of a new target (default: curiosity legs).
 * @returns {boolean}
 */
function explore(state, ctx, id, plan, legRange = ctx.balance.ai.exploreLeg) {
  const agents = ctx.agents;
  const rng = agents.rng[id];
  const legMin = legRange[0];
  const legMax = legRange[1];
  for (let attempt = 0; attempt <= EXPLORE_ATTEMPTS; attempt++) {
    const gapX = Math.abs(agents.exploreX[id] - agents.x[id]);
    const gapY = Math.abs(agents.exploreY[id] - agents.y[id]);
    const reached = Math.max(gapX, gapY) <= EXPLORE_REACHED;
    if (agents.exploring[id] !== 1 || reached || attempt > 0) {
      const leg = rng.int(legMin, legMax);
      const out = ctx.exploreTarget;
      const map = agents.explored[id];
      map.frontier(agents.x[id], agents.y[id], leg, state.tick, ctx.staleTicks, rng, out);
      agents.exploreX[id] = out[0];
      agents.exploreY[id] = out[1];
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
      if (goToRemembered(state, ctx, id, ctx.waterSubjects, plan)) return;
      search(state, ctx, id, WATER_SUBJECT, plan);
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
      if (goToRemembered(state, ctx, id, ctx.edible, plan)) return;
      search(state, ctx, id, ctx.firstEdible, plan);
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
