import { memoryEvent } from '../agents/beliefs.js';
import { EventType } from '../core/events.js';

/**
 * Forgetting: every `sweepInterval` ticks, places whose strength fell below the threshold are
 * forgotten (and remembered as lost, so that finding them again is noticed). Strength is
 * computed on demand from s0, t0 and τ, so nothing decays tick by tick.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function memorySystem(state, ctx) {
  const m = ctx.balance.memory;
  if (state.tick % m.sweepInterval !== 0) return;
  const a = ctx.agents;
  for (let id = 0; id < a.highWater; id++) {
    if (a.alive[id] !== 1) continue;
    const memory = a.memory[id];
    for (let i = memory.count - 1; i >= 0; i--) {
      if (memory.strength(i, state.tick) >= m.forgetThreshold) continue;
      const subject = memory.subject[i];
      memoryEvent(state, ctx, id, EventType.FORGOT_PLACE, memory.x[i], memory.y[i], subject);
      memory.forget(i, state.tick);
    }
  }
}
