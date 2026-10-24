import { phaseIndexAt } from '../core/clock.js';

/**
 * Advances simulation time by one tick and updates the light level. Always the first system.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @returns {void}
 */
export function timeSystem(state, ctx) {
  state.tick += 1;
  const phase = phaseIndexAt(state.tick, state.balance.time);
  ctx.phase = phase;
  ctx.darkness = ctx.darknessByPhase[phase];
  ctx.dark = ctx.nightPhase === phase;
}
