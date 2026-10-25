import { EventType } from '../core/events.js';
import { PACK } from '../world/chunk-store.js';
import { isStructure, isVital, memoryEvent, salienceOf, tauOf } from './beliefs.js';
import { FORGOTTEN_SLOTS, Remembered, WATER_SUBJECT } from './memory.js';

/**
 * Perception radius of an agent right now (reduced at night, never below the minimum).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {boolean} dark
 * @returns {number}
 */
export function perceptionRadius(ctx, id, dark) {
  const a = ctx.balance.actions;
  const base = ctx.agents.perception[id];
  let r = Math.floor(dark ? base * a.nightPerceptionFactor : base);
  if (r < a.minPerception) r = a.minPerception;
  // From the top of a tower one sees farther.
  return ctx.agents.onTower[id] === 1 ? r + ctx.balance.fortress.towerSight : r;
}

/**
 * Stores a sighting and reports a rediscovery of a forgotten place.
 * Exported as {@link notice} for places the agent learns about by acting (building).
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @param {number} subject
 * @param {number} x
 * @param {number} y
 * @param {number} quantity
 * @returns {void}
 */
export function notice(state, ctx, id, subject, x, y, quantity) {
  const memory = ctx.agents.memory[id];
  const m = ctx.balance.memory;
  if (memory.count >= memory.capacity && memory.find(subject, x, y, m.sameRadius) < 0) {
    // About to push out the weakest place: report it if it was vital.
    const weakest = memory.weakest(state.tick);
    if (memory.strength(weakest, state.tick) < salienceOf(ctx, subject)) {
      const s = memory.subject[weakest];
      memoryEvent(state, ctx, id, EventType.FORGOT_PLACE, memory.x[weakest], memory.y[weakest], s);
    }
  }
  const result = memory.remember(
    subject,
    x,
    y,
    quantity,
    state.tick,
    salienceOf(ctx, subject),
    tauOf(ctx, subject),
    m.sameRadius,
  );
  if (result !== Remembered.ADDED && result !== Remembered.REPLACED) return;
  if (isVital(ctx, subject) && memory.takeLost(subject, x, y, m.sameRadius) >= 0) {
    memoryEvent(state, ctx, id, EventType.REDISCOVERED, x, y, subject);
  }
}

/**
 * Whether what the agent sees at `cell` confirms a memory of `subject`: 1 yes, 0 no, -1 cannot
 * tell (a danger is a moving animal: the memory only fades).
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} subject
 * @param {number} cell
 * @returns {number}
 */
function confirms(ctx, subject, cell) {
  const nav = ctx.nav;
  if (subject === WATER_SUBJECT) return nav.besideWater(cell) ? 1 : 0;
  if (subject === ctx.catalog.dangerSubject) return -1;
  if (isStructure(ctx, subject)) {
    return nav.structure[cell] === subject - ctx.catalog.resourceCount ? 1 : 0;
  }
  return nav.resource[cell] === subject && nav.quantity[cell] > 0 ? 1 : 0;
}

/**
 * Looks around: prepares the navigation window, marks the area as explored, remembers the
 * nearest reachable place of each subject (water and every resource), and corrects beliefs that
 * what it sees contradicts.
 * @param {import('../simulation.js').SimState} state
 * @param {import('../simulation.js').SimContext} ctx
 * @param {number} id
 * @returns {void}
 */
export function perceive(state, ctx, id) {
  const agents = ctx.agents;
  const nav = ctx.nav;
  const ax = agents.x[id];
  const ay = agents.y[id];
  const code = state.world.packedAt(ax, ay) >>> PACK.STRUCTURE_SHIFT;
  agents.onTower[id] = code !== 0 && code === ctx.towerCode ? 1 : 0;
  const radius = perceptionRadius(ctx, id, ctx.dark);
  nav.prepare(state.world, ax, ay, radius);
  agents.explored[id].markArea(ax - radius, ay - radius, ax + radius, ay + radius, state.tick);

  const water = nav.nearestWaterSide();
  if (water >= 0) notice(state, ctx, id, WATER_SUBJECT, nav.cellX(water), nav.cellY(water), 0);

  // Nearest reachable cell of each resource and each structure, in one pass over the window.
  const best = ctx.nearestBySubject;
  const R = ctx.catalog.resourceCount;
  best.fill(-1);
  const n = nav.side * nav.side;
  for (let i = 0; i < n; i++) {
    if (!nav.reachable(i)) continue;
    const st = nav.structure[i];
    if (st !== 0 && (best[R + st] < 0 || nav.dist[i] < nav.dist[best[R + st]])) best[R + st] = i;
    const r = nav.resource[i];
    if (r === 0 || nav.quantity[i] === 0) continue;
    if (best[r] < 0 || nav.dist[i] < nav.dist[best[r]]) best[r] = i;
  }
  for (let subject = 1; subject < best.length; subject++) {
    const c = best[subject];
    if (c < 0) continue;
    const quantity = subject <= R ? nav.quantity[c] : 0;
    notice(state, ctx, id, subject, nav.cellX(c), nav.cellY(c), quantity);
  }

  // Predators in sight: remembered as dangers where they are.
  const threats = state.threats;
  for (let p = 0; p < threats.highWater; p++) {
    if (threats.alive[p] !== 1) continue;
    const tx = threats.x[p];
    const ty = threats.y[p];
    if (Math.abs(tx - ax) > radius || Math.abs(ty - ay) > radius) continue;
    notice(state, ctx, id, ctx.catalog.dangerSubject, tx, ty, 0);
  }

  // Places it had forgotten and sees again, still valid: rediscovered.
  const memory = agents.memory[id];
  for (let k = 0; k < FORGOTTEN_SLOTS; k++) {
    if (!memory.isLost(k)) continue;
    const subject = memory.lostSubject[k];
    const cell = nav.innerCellAt(memory.lostX[k], memory.lostY[k]);
    if (cell < 0 || !nav.reachable(cell)) continue;
    const valid = confirms(ctx, subject, cell) === 1;
    memory.clearLost(k);
    if (!valid) continue;
    const x = memory.lostX[k];
    const y = memory.lostY[k];
    notice(state, ctx, id, subject, x, y, subject > 0 && subject <= R ? nav.quantity[cell] : 0);
    memoryEvent(state, ctx, id, EventType.REDISCOVERED, x, y, subject);
  }

  // Correct beliefs against what is fully visible now.
  for (let i = memory.count - 1; i >= 0; i--) {
    const cell = nav.innerCellAt(memory.x[i], memory.y[i]);
    if (cell < 0) continue;
    const subject = memory.subject[i];
    const valid = confirms(ctx, subject, cell);
    if (valid < 0) continue;
    if (valid === 1) {
      // Seeing a remembered place again keeps it alive, even if it is not the nearest.
      const quantity = subject > 0 && subject <= R ? nav.quantity[cell] : 0;
      memory.refresh(i, state.tick, salienceOf(ctx, subject), quantity);
      continue;
    }
    memoryEvent(state, ctx, id, EventType.WRONG_BELIEF, memory.x[i], memory.y[i], subject);
    memory.remove(i);
  }
}
