import { atCamp, campOf, chooseTask, readyToBuild, releaseTask } from '../colony/colony-logic.js';
import { ProjectKind } from '../colony/colony-store.js';
import { chooseFieldSite } from '../colony/field.js';
import { FOOD_COST, fedEnough, missingCost, unhurt } from '../colony/replication.js';
import { Action } from './action-types.js';
import { PlanNote } from './journal.js';
import { explore, moveTo, startHere } from './movement.js';
import { discover, gather, pursue, useRecipe } from './work.js';
import { canHarvest } from './actions.js';
import { saleGood } from '../economy/jobs.js';
import { wallWork } from './wall-work.js';

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
  if (a.taskProject[id] < 0 && a.saleGood[id] === 0) {
    if (atCamp(ctx, colony, id)) {
      // Materials wait for a building nobody here knows how to make: one member at a time
      // tries to find out, the others keep working.
      if (research(state, ctx, colony, id)) {
        discover(state, ctx, id, 'structure', plan);
        plan.note = PlanNote.COLONY;
        return;
      }
      // No task: what its job gathers is sold at the counter.
      if (!chooseTask(state, ctx, colony, id) && !prepareSale(state, ctx, colony, id)) {
        startHere(ctx, id, Action.IDLE);
        return;
      }
    } else {
      if (!goToCamp(ctx, colony, id, Action.IDLE, plan)) explore(state, ctx, id, plan);
      return;
    }
  }
  if (a.taskProject[id] < 0) {
    saleWork(state, ctx, colony, id, plan);
    return;
  }
  const project = colony.projects[a.taskProject[id]];
  if (a.taskBuild[id] === 1 && project.kind === ProjectKind.FIELD) {
    plantField(state, ctx, colony, project, id, plan);
    return;
  }
  if (
    a.taskBuild[id] === 1 &&
    (project.kind === ProjectKind.ENCLOSURE ||
      project.kind === ProjectKind.TOWER ||
      project.kind === ProjectKind.CANAL)
  ) {
    wallWork(state, ctx, colony, project, id, plan);
    plan.note = PlanNote.COLONY;
    return;
  }
  if (a.taskBuild[id] === 1) {
    const r = project.recipe;
    // It found out it had the recipe wrong (or forgot it): someone else will build.
    if (!a.recipes[id].knows(r)) {
      releaseTask(state, ctx, id);
      startHere(ctx, id, Action.IDLE);
      return;
    }
    const holds = ctx.catalog.recipes[r].inputs.every((i) => a.carried(id, i.good) >= i.count);
    if (!holds) {
      if (!goToCamp(ctx, colony, id, Action.DEPOSIT, plan)) explore(state, ctx, id, plan);
      return;
    }
    // Build it at the camp: the site chooser anchors on the structures in sight (a house goes
    // where the town plan puts it).
    if (project.kind !== ProjectKind.SHELTER && !atCamp(ctx, colony, id)) {
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
 * A sale to prepare: the good of its job the counter pays best for its work, a load of it.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @returns {boolean} False if its job has nothing worth selling.
 */
function prepareSale(state, ctx, colony, id) {
  const a = ctx.agents;
  const g = saleGood(ctx, colony, id);
  if (g === 0) return false;
  a.saleGood[id] = g;
  a.saleAmount[id] = Math.max(1, Math.floor(ctx.capacity(id) - a.carriedTotal(id)));
  a.saleTick[id] = state.tick;
  return true;
}

/**
 * Gathers the good of its sale, then brings it to the counter.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function saleWork(state, ctx, colony, id, plan) {
  const a = ctx.agents;
  const good = a.saleGood[id];
  if (a.carried(id, good) >= a.saleAmount[id] || a.carriedTotal(id) >= ctx.capacity(id)) {
    if (a.carried(id, good) === 0) {
      a.saleGood[id] = 0;
      startHere(ctx, id, Action.IDLE);
      return;
    }
    if (!goToCamp(ctx, colony, id, Action.DEPOSIT, plan)) explore(state, ctx, id, plan);
    return;
  }
  // A pickaxe first, for coal or copper.
  if (!canHarvest(ctx, id, good))
    pursue(state, ctx, id, ctx.goodTargets[ctx.catalog.requiredTool[good]], plan);
  else gather(state, ctx, id, good, a.saleAmount[id], plan);
  plan.note = PlanNote.COLONY;
}

/**
 * The planter of a field takes its units at the camp, walks to the best site near the camp it
 * can see, and plants them there.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/colony-store.js').Project} project
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
function plantField(state, ctx, colony, project, id, plan) {
  const a = ctx.agents;
  let holds = true;
  for (let g = 1; g < project.needs.length; g++) {
    if (project.needs[g] > 0 && a.carried(id, g) < ctx.balance.harmony.plantCost) holds = false;
  }
  if (!holds) {
    if (!goToCamp(ctx, colony, id, Action.DEPOSIT, plan)) explore(state, ctx, id, plan);
    return;
  }
  if (!atCamp(ctx, colony, id)) {
    if (!goToCamp(ctx, colony, id, Action.NONE, plan)) explore(state, ctx, id, plan);
    return;
  }
  const cell = chooseFieldSite(state, ctx, colony, id);
  if (cell === ctx.nav.center) {
    startHere(ctx, id, Action.PLANT);
    plan.action = Action.PLANT;
    return;
  }
  if (cell < 0 || !moveTo(ctx, id, cell, Action.PLANT)) {
    releaseTask(state, ctx, id);
    startHere(ctx, id, Action.IDLE);
    return;
  }
  plan.action = Action.MOVE;
  plan.x = ctx.recallTarget[0];
  plan.y = ctx.recallTarget[1];
}

/**
 * Whether this agent is (or becomes) the one researching how to build a project whose materials
 * are ready and that it does not know how to build.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {number} id
 * @returns {boolean}
 */
function research(state, ctx, colony, id) {
  const a = ctx.agents;
  const book = a.recipes[id];
  const limit = ctx.balance.colony.researchTicks;
  for (const p of colony.projects) {
    if (p.kind === ProjectKind.FIELD || !readyToBuild(colony, p) || book.knows(p.recipe)) continue;
    if (p.researcher === id) return true;
    const free = p.researcher < 0 || a.alive[p.researcher] !== 1;
    // A researcher keeps the task for a while: it remembers what it already tried.
    if (free || state.tick - p.researcherTick > limit) {
      p.researcher = id;
      p.researcherTick = state.tick;
      return true;
    }
  }
  return false;
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
  const missing = missingCost(ctx, id, out);
  if (missing === FOOD_COST) {
    // Food for the newborn: from the pantry if it believes there is some to spare, else picked.
    if (a.pantrySeen[id] > out[1] && goToCamp(ctx, colony, id, Action.TAKE, plan)) {
      plan.note = PlanNote.REPLICATION;
      return;
    }
    const units = Math.ceil(
      (out[1] * ctx.balance.cooking.portion) / ctx.nutrition[ctx.firstEdible],
    );
    gather(state, ctx, id, ctx.firstEdible, units, plan);
    plan.note = PlanNote.REPLICATION;
    return;
  }
  if (missing > 0) {
    gather(state, ctx, id, out[0], out[1], plan);
    plan.note = PlanNote.REPLICATION;
    return;
  }
  const ready = fedEnough(state, ctx, id) && unhurt(state, ctx, id);
  if (!goToCamp(ctx, colony, id, ready ? Action.REPLICATE : Action.IDLE, plan)) {
    explore(state, ctx, id, plan);
  }
}
