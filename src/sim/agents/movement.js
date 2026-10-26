import { avoids } from './experience.js';
import { EventType } from '../core/events.js';
import { Action } from './action-types.js';
import { memoryEvent, recall } from './beliefs.js';
import { PlanNote } from './journal.js';
import { Expedition } from '../colony/colony-store.js';

// Getting somewhere with only what the agent perceives and remembers: shared by all behaviours.

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
export function moveTo(ctx, id, cell, then) {
  const agents = ctx.agents;
  const steps = ctx.nav.writePath(cell, agents.path[id]);
  if (steps === 0) return false;
  agents.pathLength[id] = steps;
  agents.pathIndex[id] = 0;
  agents.blocked[id] = 0;
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
export function startHere(ctx, id, action) {
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
export function goToRemembered(state, ctx, id, subjects, plan) {
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
    if (gap <= EXPLORE_REACHED && ctx.nav.lastHeld) {
      // There, but others stand on every spot: it waits its turn.
      startHere(ctx, id, Action.IDLE);
      plan.action = Action.IDLE;
      plan.x = tx;
      plan.y = ty;
      plan.note = PlanNote.REMEMBERED;
      return true;
    }
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
    // Shut in for now (a sleeper in the doorway), or held up by a crowd: it waits, the belief
    // still good.
    if (!ctx.nav.canMove() || ctx.nav.heldCount > 0) {
      startHere(ctx, id, Action.IDLE);
      plan.action = Action.IDLE;
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
export function search(state, ctx, id, subject, plan) {
  const a = ctx.agents;
  memoryEvent(state, ctx, id, EventType.SEARCHING, a.x[id], a.y[id], subject);
  explore(state, ctx, id, plan, ctx.balance.ai.searchLeg);
}

/**
 * A colony member explores around its camp: a target farther than `exploreLeash` from the camp
 * is brought back onto that circle, so that excursions come home.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {Int32Array} out - Target x, y, adjusted in place.
 * @returns {void}
 */
function leash(state, ctx, id, out) {
  const c = ctx.agents.colony[id];
  if (c < 0 || !state.colonies[c].hasCamp) return;
  const colony = state.colonies[c];
  // The scout, an expedition on its way and a caravan go beyond the colony's range.
  const away = colony.expState === Expedition.TRAVELLING && colony.inExpedition(id);
  if (colony.scout === id || away || ctx.agents.caravanTo[id] >= 0) return;
  const dx = out[0] - colony.campX;
  const dy = out[1] - colony.campY;
  const d = Math.sqrt(dx * dx + dy * dy);
  const max = ctx.balance.colony.exploreLeash;
  if (d <= max) return;
  out[0] = colony.campX + Math.round((dx * max) / d);
  out[1] = colony.campY + Math.round((dy * max) / d);
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
export function explore(state, ctx, id, plan, legRange = ctx.balance.ai.exploreLeg) {
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
      leash(state, ctx, id, out);
      // It learnt to fear that zone: look elsewhere while it has other tries.
      if (attempt < EXPLORE_ATTEMPTS && avoids(ctx, id, out[0], out[1])) continue;
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
 * Walks next to (x, y) and starts `then` there, or towards it if it is out of sight.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} x
 * @param {number} y
 * @param {number} then
 * @param {import('./movement.js').Plan} plan
 * @returns {boolean}
 */
export function approach(ctx, id, x, y, then, plan) {
  const a = ctx.agents;
  if (Math.max(Math.abs(a.x[id] - x), Math.abs(a.y[id] - y)) <= 1) {
    startHere(ctx, id, then);
    plan.action = then;
    return true;
  }
  const nav = ctx.nav;
  const near = nav.cellAt(x, y);
  const cell = near >= 0 && nav.reachable(near) ? near : nav.toward(x, y);
  if (cell < 0 || !moveTo(ctx, id, cell, cell === near ? then : Action.NONE)) return false;
  plan.action = Action.MOVE;
  plan.x = x;
  plan.y = y;
  return true;
}
