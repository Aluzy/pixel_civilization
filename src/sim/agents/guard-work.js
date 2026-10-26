import { atCamp, campOf } from '../colony/colony-logic.js';
import { Action } from './action-types.js';
import { PlanNote } from './journal.js';
import { approach, explore, moveTo, startHere } from './movement.js';
import { carriesKind, inShelter } from './equipment.js';
import { goHome, shelterInSight } from './behaviors.js';
import { perceptionRadius } from './perception.js';
import { pursue } from './work.js';

// Behaviours of the safety goals (docs/design/16-guerre-et-forteresses.md): take cover when
// afraid, keep watch over the camp at night, hunt a known den by day.

/**
 * Takes cover: into a free bed of a house, else among the others at the camp.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function hideBehaviour(state, ctx, id, plan) {
  const a = ctx.agents;
  plan.note = PlanNote.HIDING;
  const colony = campOf(state, ctx, id);
  if (!colony) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  if (inShelter(state, ctx, a.x[id], a.y[id])) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  // Into a free bed in sight, else towards one of the colony's beds.
  const cell = shelterInSight(ctx);
  if (cell >= 0 && moveTo(ctx, id, cell, Action.IDLE)) {
    plan.action = Action.MOVE;
    plan.x = ctx.nav.cellX(cell);
    plan.y = ctx.nav.cellY(cell);
    return;
  }
  if (goHome(state, ctx, colony, id, plan)) {
    plan.note = PlanNote.HIDING;
    return;
  }
  if (atCamp(ctx, colony, id)) startHere(ctx, id, Action.IDLE);
  else if (!approach(ctx, id, colony.campX, colony.campY, Action.IDLE, plan)) {
    explore(state, ctx, id, plan);
  }
}

/**
 * Night watch: a predator in sight near the camp is attacked; otherwise the guard walks a round
 * just outside the camp.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function guardBehaviour(state, ctx, id, plan) {
  const a = ctx.agents;
  const s = ctx.balance.safety;
  plan.note = PlanNote.GUARDING;
  const colony = campOf(state, ctx, id);
  if (!colony) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  const t = state.threats;
  const p = t.nearest(a.x[id], a.y[id], perceptionRadius(ctx, id, ctx.dark));
  // By day, a guard equips itself: a weapon first, then an armour.
  if (p < 0 && ctx.darkness <= s.watchDarkness) {
    const target = carriesKind(ctx, id, 'weapon') ? ctx.armorTarget : ctx.weaponTarget;
    pursue(state, ctx, id, target, plan);
    plan.note = PlanNote.GUARDING;
    return;
  }
  if (p >= 0) {
    const fromCamp = Math.max(Math.abs(t.x[p] - colony.campX), Math.abs(t.y[p] - colony.campY));
    if (fromCamp <= s.guardRadius) {
      a.attackTarget[id] = p;
      if (approach(ctx, id, t.x[p], t.y[p], Action.ATTACK, plan)) return;
    }
  }
  // With towers on the wall, the watch is kept from the top of the nearest free one.
  if (climbTower(ctx, colony, id, plan)) return;
  // A round: a point on a ring around the camp, drawn from the agent's own stream.
  const ring = ctx.balance.colony.campRadius + s.guardRing;
  const rng = a.rng[id];
  const x = colony.campX + rng.int(-ring, ring);
  const y = colony.campY + rng.int(-ring, ring);
  if (!approach(ctx, id, x, y, Action.IDLE, plan)) startHere(ctx, id, Action.IDLE);
}

/**
 * Up the nearest tower of the colony nobody stands on (in sight), or towards the nearest tower.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {boolean} False if the colony has no tower to climb.
 */
function climbTower(ctx, colony, id, plan) {
  const a = ctx.agents;
  const nav = ctx.nav;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < colony.towerCount; i++) {
    if ((colony.towersBuilt & (1 << i)) === 0) continue;
    const x = colony.towerX[i];
    const y = colony.towerY[i];
    if (a.x[id] === x && a.y[id] === y) {
      startHere(ctx, id, Action.IDLE);
      plan.action = Action.IDLE;
      return true;
    }
    const cell = nav.cellAt(x, y);
    // Another guard already up there: the next one.
    if (cell >= 0 && !nav.reachable(cell)) continue;
    const d = Math.max(Math.abs(x - a.x[id]), Math.abs(y - a.y[id]));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return false;
  const x = colony.towerX[best];
  const y = colony.towerY[best];
  const cell = nav.cellAt(x, y);
  if (cell >= 0 && moveTo(ctx, id, cell, Action.IDLE)) {
    plan.action = Action.MOVE;
    plan.x = x;
    plan.y = y;
    return true;
  }
  return approach(ctx, id, x, y, Action.IDLE, plan);
}

/**
 * Den hunt: to the den it knows (memory, else the blackboard), and strike it once there; the pack
 * defends it.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function huntBehaviour(state, ctx, id, plan) {
  const a = ctx.agents;
  plan.note = PlanNote.HUNTING;
  const out = ctx.recallTarget;
  if (!knownDen(state, ctx, id, out)) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  const t = state.threats;
  // A predator of the pack in the way is fought first.
  const p = t.nearest(a.x[id], a.y[id], 2);
  if (p >= 0) {
    a.attackTarget[id] = p;
    if (approach(ctx, id, t.x[p], t.y[p], Action.ATTACK, plan)) return;
  }
  const d = t.denAt(out[0], out[1]);
  a.attackTarget[id] = d >= 0 ? -2 - d : -1;
  if (!approach(ctx, id, out[0], out[1], d >= 0 ? Action.ATTACK : Action.IDLE, plan)) {
    explore(state, ctx, id, plan);
  }
}

/**
 * Where the agent believes a den is: its own memory, else its colony's blackboard (read at the
 * camp, like any place). Writes x, y in `out`.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {Int32Array} out
 * @returns {boolean}
 */
export function knownDen(state, ctx, id, out) {
  const a = ctx.agents;
  const subject = ctx.catalog.resourceCount + ctx.denCode;
  if (ctx.denCode === 0) return false;
  const memory = a.memory[id];
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < memory.count; i++) {
    if (memory.subject[i] !== subject) continue;
    const d = Math.max(Math.abs(memory.x[i] - a.x[id]), Math.abs(memory.y[i] - a.y[id]));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0) {
    out[0] = memory.x[best];
    out[1] = memory.y[best];
    return true;
  }
  return false;
}
