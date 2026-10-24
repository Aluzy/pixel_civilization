import { EventType } from '../core/events.js';

/**
 * Removes agents whose health reached zero.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function lifecycleSystem(state, ctx) {
  const a = ctx.agents;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1 || a.hp[id] > 0) continue;
    state.events.push(state.tick, EventType.DEATH, id, a.x[id], a.y[id]);
    a.kill(id);
  }
}
