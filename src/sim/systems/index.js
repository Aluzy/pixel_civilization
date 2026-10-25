import { actionSystem } from './action-system.js';
import { colonySystem } from './colony-system.js';
import { economySystem } from './economy-system.js';
import { farmSystem } from './farm-system.js';
import { decisionSystem } from './decision-system.js';
import { knowledgeSystem } from './knowledge-system.js';
import { lifecycleSystem } from './lifecycle-system.js';
import { memorySystem } from './memory-system.js';
import { needsSystem } from './needs-system.js';
import { socialSystem } from './social-system.js';
import { harmonySystem } from './harmony-system.js';
import { threatSystem } from './threat-system.js';
import { timeSystem } from './time-system.js';
import { worldSystem } from './world-system.js';

/**
 * Systems run once per tick, in this exact order (see docs/design/09-architecture.md).
 * Perception happens inside the decision system (an agent looks around when it decides).
 * Changing the order requires a
 * decision record in docs/decisions/.
 * @type {ReadonlyArray<(state: import('../simulation.js').SimState,
 *   ctx: import('../simulation.js').SimContext) => void>}
 */
export const SYSTEMS = Object.freeze([
  timeSystem,
  worldSystem,
  farmSystem,
  economySystem,
  needsSystem,
  memorySystem,
  decisionSystem,
  actionSystem,
  socialSystem,
  threatSystem,
  lifecycleSystem,
  colonySystem,
  knowledgeSystem,
  harmonySystem,
]);
