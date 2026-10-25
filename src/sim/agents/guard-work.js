import { atCamp, campOf } from '../colony/colony-logic.js';
import { Action } from './action-types.js';
import { PlanNote } from './journal.js';
import { explore, moveTo, startHere } from './movement.js';
import { carriesKind } from './equipment.js';
import { perceptionRadius } from './perception.js';
import { pursue } from './work.js';

// Behaviours of the safety goals (docs/design/16-guerre-et-forteresses.md): take cover when
// afraid, keep watch over the camp at night, hunt a known den by day.

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
function approach(ctx, id, x, y, then, plan) {
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

/**
 * Takes cover: into the nearest shelter of its colony, else among the others at the camp.
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
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < colony.shelterCount; i++) {
    const d = Math.max(
      Math.abs(colony.shelterX[i] - a.x[id]),
      Math.abs(colony.shelterY[i] - a.y[id]),
    );
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best >= 0) {
    const x = colony.shelterX[best];
    const y = colony.shelterY[best];
    if (a.x[id] === x && a.y[id] === y) {
      startHere(ctx, id, Action.IDLE);
      return;
    }
    const cell = ctx.nav.cellAt(x, y);
    if (cell >= 0 && ctx.nav.reachable(cell) && moveTo(ctx, id, cell, Action.IDLE)) {
      plan.action = Action.MOVE;
      plan.x = x;
      plan.y = y;
      return;
    }
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
  // A round: a point on a ring around the camp, drawn from the agent's own stream.
  const ring = ctx.balance.colony.campRadius + s.guardRing;
  const rng = a.rng[id];
  const x = colony.campX + rng.int(-ring, ring);
  const y = colony.campY + rng.int(-ring, ring);
  if (!approach(ctx, id, x, y, Action.IDLE, plan)) startHere(ctx, id, Action.IDLE);
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
