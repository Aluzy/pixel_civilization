/**
 * Advances simulation time by one tick. Always the first system of a tick.
 * @param {import('../simulation.js').SimState} state
 * @returns {void}
 */
export function timeSystem(state) {
  state.tick += 1;
}
