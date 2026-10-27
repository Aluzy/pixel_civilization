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
  // Evening: the end of the day (`homeTicks` before dusk), dusk and night, when the people of a
  // town drink, eat and go home (decision 0030), before the dark rather than all at once in it.
  const ahead = phaseIndexAt(state.tick + state.balance.people.homeTicks, state.balance.time);
  ctx.evening = ctx.dark || ctx.duskPhase === phase || ctx.duskPhase === ahead;
}
