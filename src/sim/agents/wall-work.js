import { releaseTask } from '../colony/colony-logic.js';
import { nextSegment } from '../colony/fortress.js';
import { Action } from './action-types.js';
import { goToCamp } from './colony-work.js';
import { explore, moveTo, startHere } from './movement.js';

const DX = Int8Array.from([1, -1, 0, 0, 1, 1, -1, -1]);
const DY = Int8Array.from([0, 0, 1, -1, 1, -1, 1, -1]);

/**
 * The builder of a wall project (docs/design/16-guerre-et-forteresses.md): with the materials of
 * one segment in hand, it walks beside the next open tile of the ring (the gate first, the tower
 * last) and builds it from there; out of materials, it fetches the next batch at the camp.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {import('../colony/colony-store.js').Colony} colony
 * @param {import('../colony/colony-store.js').Project} project
 * @param {number} id
 * @param {import('./movement.js').Plan} plan
 * @returns {void}
 */
export function wallWork(state, ctx, colony, project, id, plan) {
  const a = ctx.agents;
  const r = project.recipe;
  if (r < 0 || !a.recipes[id].knows(r)) {
    releaseTask(state, ctx, id);
    startHere(ctx, id, Action.IDLE);
    return;
  }
  const holds = ctx.catalog.recipes[r].inputs.every((i) => a.carried(id, i.good) >= i.count);
  if (!holds) {
    if (!goToCamp(ctx, colony, id, Action.DEPOSIT, plan)) explore(state, ctx, id, plan);
    return;
  }
  const out = ctx.recallTarget;
  if (!nextSegment(state, ctx, colony, project, id, out)) {
    releaseTask(state, ctx, id);
    startHere(ctx, id, Action.IDLE);
    return;
  }
  const x = out[0];
  const y = out[1];
  a.siteX[id] = x;
  a.siteY[id] = y;
  a.craftRecipe[id] = r;
  plan.x = x;
  plan.y = y;
  const gap = Math.max(Math.abs(a.x[id] - x), Math.abs(a.y[id] - y));
  if (gap === 1) {
    startHere(ctx, id, Action.BUILD);
    plan.action = Action.BUILD;
    return;
  }
  // A free tile beside the segment, the cheapest to reach (never the segment itself).
  const nav = ctx.nav;
  let best = -1;
  for (let k = 0; k < 8; k++) {
    const cell = nav.cellAt(x + DX[k], y + DY[k]);
    if (cell < 0 || !nav.reachable(cell)) continue;
    if (best < 0 || nav.dist[cell] < nav.dist[best]) best = cell;
  }
  if (best >= 0 && moveTo(ctx, id, best, Action.BUILD)) {
    plan.action = Action.MOVE;
    return;
  }
  const cell = nav.toward(x, y);
  if (cell >= 0 && moveTo(ctx, id, cell, Action.NONE)) {
    plan.action = Action.MOVE;
    return;
  }
  // Nowhere to stand: the segment waits for another builder.
  releaseTask(state, ctx, id);
  startHere(ctx, id, Action.IDLE);
}
