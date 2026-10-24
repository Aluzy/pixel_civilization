import { releaseTask } from '../colony/colony-logic.js';
import { EventType } from '../core/events.js';

/**
 * Removes agents whose health reached zero: their task is freed, their colony counts the loss, and
 * the others forget them.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function lifecycleSystem(state, ctx) {
  const a = ctx.agents;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1 || a.hp[id] > 0) continue;
    state.events.push(state.tick, EventType.DEATH, id, a.x[id], a.y[id]);
    releaseTask(state, ctx, id);
    if (a.colony[id] >= 0) {
      const colony = state.colonies[a.colony[id]];
      colony.deaths++;
      colony.members--;
    }
    a.kill(id);
    // The others forget the dead (its id may be reused).
    for (let other = 0; other < a.highWater; other++) {
      if (a.alive[other] === 1) a.social[other].remove(id);
    }
  }
}
