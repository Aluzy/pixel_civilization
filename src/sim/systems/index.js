import { timeSystem } from './time-system.js';

/**
 * Systems run once per tick, in this exact order (see docs/design/09-architecture.md).
 * Changing the order requires a decision record in docs/decisions/.
 * @type {ReadonlyArray<(state: import('../simulation.js').SimState) => void>}
 */
export const SYSTEMS = Object.freeze([timeSystem]);
