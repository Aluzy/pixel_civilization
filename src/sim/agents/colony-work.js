import { atCamp, campOf, chooseTask, readyToBuild, releaseTask } from '../colony/colony-logic.js';
import { fedEnough, missingCost, unhurt } from '../colony/replication.js';
import { Action } from './action-types.js';
import { PlanNote } from './journal.js';
import { explore, moveTo, startHere } from './movement.js';
import { discover, gather, useRecipe } from './work.js';

// Behaviours of the colony goals: collective tasks and replication.

/**
 * Walks to the camp, then starts `then` there.
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {number} then
 * @param {import('./movement.js').Plan} plan
 * @returns {boolean} False if the camp cannot be approached from here.
 */
export function goToCamp(ctx, colony, id, then, plan) {
  if (atCamp(ctx, colony, id)) {
    startHere(ctx, id, then);
    plan.action = then;
    return true;
  }
  const cell = ctx.nav.toward(colony.campX, colony.campY);
  if (cell < 0 || !moveTo(ctx, id, cell, Action.NONE)) return false;
  plan.action = Action.MOVE;
  plan.x = colony.campX;
  plan.y = colony.campY;
  return true;
}

/**
 * Collective work (docs/design/06-ia.md, couche 4): without a task, go to the camp and take one
 * from the blackboard; with a task to bring goods, gather them, then deposit them at the camp;
 * with a shelter to build, take the materials at the camp and build it.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function colonyWork(state, ctx, id, plan) {
  const a = ctx.agents;
  const colony = campOf(state, ctx, id);
  plan.note = PlanNote.COLONY;
  if (!colony) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  if (a.taskProject[id] < 0) {
    if (atCamp(ctx, colony, id)) {
      if (!chooseTask(state, ctx, colony, id)) {
        // Materials are waiting and nobody knows how to build: try to find out.
        if (colony.projects.some((p) => readyToBuild(colony, p))) {
          discover(state, ctx, id, 'structure', plan);
          plan.note = PlanNote.COLONY;
          return;
        }
        startHere(ctx, id, Action.IDLE);
        return;
      }
    } else {
      if (!goToCamp(ctx, colony, id, Action.IDLE, plan)) explore(state, ctx, id, plan);
      return;
    }
  }
  const project = colony.projects[a.taskProject[id]];
  if (a.taskBuild[id] === 1) {
    const r = project.recipe;
    const holds = ctx.catalog.recipes[r].inputs.every((i) => a.carried(id, i.good) >= i.count);
    if (!holds) {
      if (!goToCamp(ctx, colony, id, Action.DEPOSIT, plan)) explore(state, ctx, id, plan);
      return;
    }
    // Build it at the camp: the site chooser anchors on the structures in sight.
    if (!atCamp(ctx, colony, id)) {
      if (!goToCamp(ctx, colony, id, Action.NONE, plan)) explore(state, ctx, id, plan);
      return;
    }
    useRecipe(state, ctx, id, r, plan);
    plan.note = PlanNote.COLONY;
    return;
  }
  const good = a.taskGood[id];
  if (a.carried(id, good) >= a.taskAmount[id] || a.carriedTotal(id) >= ctx.capacity(id)) {
    if (a.carried(id, good) === 0) {
      releaseTask(state, ctx, id);
      startHere(ctx, id, Action.IDLE);
      return;
    }
    if (!goToCamp(ctx, colony, id, Action.DEPOSIT, plan)) explore(state, ctx, id, plan);
    return;
  }
  gather(state, ctx, id, good, a.taskAmount[id], plan);
  plan.note = PlanNote.COLONY;
}

/**
 * Preparing and doing a replication: carry the cost, stay fed (eat early), rest until unhurt,
 * then replicate in the camp.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @param {(state: object, ctx: object, id: number, plan: object) => void} eat - The eat behaviour.
 * @returns {void}
 */
export function prepareReplication(state, ctx, id, plan, eat) {
  const a = ctx.agents;
  const colony = campOf(state, ctx, id);
  plan.note = PlanNote.REPLICATION;
  if (!colony) {
    startHere(ctx, id, Action.IDLE);
    return;
  }
  const r = ctx.balance.replication;
  if (a.hunger[id] > r.eatAbove) {
    eat(state, ctx, id, plan);
    plan.note = PlanNote.REPLICATION;
    return;
  }
  const out = ctx.costOut;
  if (missingCost(ctx, id, out) > 0) {
    gather(state, ctx, id, out[0], out[1], plan);
    plan.note = PlanNote.REPLICATION;
    return;
  }
  const ready = fedEnough(state, ctx, id) && unhurt(state, ctx, id);
  if (!goToCamp(ctx, colony, id, ready ? Action.REPLICATE : Action.IDLE, plan)) {
    explore(state, ctx, id, plan);
  }
}
