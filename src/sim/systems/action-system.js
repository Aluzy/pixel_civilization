import { stepAction } from '../agents/actions.js';

/**
 * Advances every agent's current action by one tick, in id order.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function actionSystem(state, ctx) {
  const a = ctx.agents;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] === 1) stepAction(state, ctx, id);
  }
}
