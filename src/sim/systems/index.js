import { actionSystem } from './action-system.js';
import { decisionSystem } from './decision-system.js';
import { lifecycleSystem } from './lifecycle-system.js';
import { needsSystem } from './needs-system.js';
import { timeSystem } from './time-system.js';
import { worldSystem } from './world-system.js';

/**
 * Systems run once per tick, in this exact order (see docs/design/09-architecture.md).
 * Perception happens inside the decision system for now (J2). Changing the order requires a
 * decision record in docs/decisions/.
 * @type {ReadonlyArray<(state: import('../simulation.js').SimState,
 *   ctx: import('../simulation.js').SimContext) => void>}
 */
export const SYSTEMS = Object.freeze([
  timeSystem,
  worldSystem,
  needsSystem,
  decisionSystem,
  actionSystem,
  lifecycleSystem,
]);
